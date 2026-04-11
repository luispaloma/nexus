// ----------------------------------------------------------------------------
// Google Workspace Tool Implementation
// Supports Google Sheets, Docs, and Drive via the REST API with service account auth
// ----------------------------------------------------------------------------

export interface GoogleWorkspaceConfig {
  /** Service account credentials JSON (stringified) or path to credentials file */
  serviceAccountCredentials: string;
  /** Optional: OAuth2 access token if using user-delegated access */
  accessToken?: string;
}

export interface AppendSheetParams {
  spreadsheetId: string;
  range: string; // e.g. "Sheet1!A:E"
  values: (string | number | boolean | null)[][];
  valueInputOption?: "RAW" | "USER_ENTERED";
}

export interface ReadSheetParams {
  spreadsheetId: string;
  range: string;
}

export interface CreateDocParams {
  title: string;
  content?: string; // Plain text to insert as initial content
}

export interface UpdateDocParams {
  documentId: string;
  content: string;
  mode?: "append" | "replace";
}

export interface UploadFileToDriveParams {
  name: string;
  content: string;
  mimeType: string;
  folderId?: string;
}

export interface GoogleWorkspaceResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ----------------------------------------------------------------------------
// GoogleWorkspaceTool
// Uses the Google APIs REST endpoints with Bearer token auth.
// Callers must provide either a service account JSON or a pre-issued access token.
// ----------------------------------------------------------------------------

export class GoogleWorkspaceTool {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private readonly credentials: {
    client_email: string;
    private_key: string;
    token_uri: string;
  } | null = null;

  constructor(private readonly config: GoogleWorkspaceConfig) {
    if (config.accessToken) {
      this.accessToken = config.accessToken;
      this.tokenExpiry = Date.now() + 3600_000; // assume 1h
    } else if (config.serviceAccountCredentials) {
      try {
        const parsed = JSON.parse(config.serviceAccountCredentials);
        this.credentials = {
          client_email: parsed.client_email,
          private_key: parsed.private_key,
          token_uri: parsed.token_uri ?? "https://oauth2.googleapis.com/token",
        };
      } catch {
        throw new Error("GoogleWorkspaceTool: invalid serviceAccountCredentials JSON");
      }
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry - 60_000) {
      return this.accessToken;
    }

    if (!this.credentials) {
      throw new Error("GoogleWorkspaceTool: no credentials configured");
    }

    // Sign a JWT for service account auth
    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: this.credentials.client_email,
      scope: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/drive",
      ].join(" "),
      aud: this.credentials.token_uri,
      exp: now + 3600,
      iat: now,
    };

    const header = { alg: "RS256", typ: "JWT" };
    const toBase64Url = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj))
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

    const unsignedJwt = `${toBase64Url(header)}.${toBase64Url(claim)}`;

    // Sign using Node.js crypto
    const { createSign } = await import("crypto");
    const signer = createSign("RSA-SHA256");
    signer.update(unsignedJwt);
    const signature = signer
      .sign(this.credentials.private_key, "base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const jwt = `${unsignedJwt}.${signature}`;

    const tokenRes = await fetch(this.credentials.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`GoogleWorkspaceTool: token request failed: ${text}`);
    }

    const tokenData = (await tokenRes.json()) as { access_token: string; expires_in: number };
    this.accessToken = tokenData.access_token;
    this.tokenExpiry = Date.now() + tokenData.expires_in * 1000;
    return this.accessToken;
  }

  private async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    return fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
  }

  // ----------------------------------------------------------------------------
  // Google Sheets
  // ----------------------------------------------------------------------------

  async appendToSheet(params: AppendSheetParams): Promise<GoogleWorkspaceResult> {
    const { spreadsheetId, range, values, valueInputOption = "USER_ENTERED" } = params;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=${valueInputOption}&insertDataOption=INSERT_ROWS`;

    const res = await this.fetch(url, {
      method: "POST",
      body: JSON.stringify({ values }),
    });

    if (!res.ok) {
      const error = await res.text();
      return { success: false, error: `Sheets append failed: ${error}` };
    }

    return { success: true, data: await res.json() };
  }

  async readSheet(params: ReadSheetParams): Promise<GoogleWorkspaceResult> {
    const { spreadsheetId, range } = params;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;

    const res = await this.fetch(url);

    if (!res.ok) {
      const error = await res.text();
      return { success: false, error: `Sheets read failed: ${error}` };
    }

    const data = (await res.json()) as { values?: (string | number | null)[][] };
    return { success: true, data: data.values ?? [] };
  }

  // ----------------------------------------------------------------------------
  // Google Docs
  // ----------------------------------------------------------------------------

  async createDoc(params: CreateDocParams): Promise<GoogleWorkspaceResult> {
    const { title, content } = params;

    // Step 1: create the document
    const createRes = await this.fetch("https://docs.googleapis.com/v1/documents", {
      method: "POST",
      body: JSON.stringify({ title }),
    });

    if (!createRes.ok) {
      const error = await createRes.text();
      return { success: false, error: `Docs create failed: ${error}` };
    }

    const doc = (await createRes.json()) as { documentId: string; title: string };

    // Step 2: insert initial content if provided
    if (content) {
      const insertRes = await this.fetch(
        `https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`,
        {
          method: "POST",
          body: JSON.stringify({
            requests: [
              {
                insertText: {
                  location: { index: 1 },
                  text: content,
                },
              },
            ],
          }),
        }
      );

      if (!insertRes.ok) {
        const error = await insertRes.text();
        return {
          success: true,
          data: { documentId: doc.documentId, title: doc.title, contentInsertError: error },
        };
      }
    }

    return {
      success: true,
      data: {
        documentId: doc.documentId,
        title: doc.title,
        url: `https://docs.google.com/document/d/${doc.documentId}/edit`,
      },
    };
  }

  async appendToDoc(params: UpdateDocParams): Promise<GoogleWorkspaceResult> {
    const { documentId, content } = params;

    // Get current document to find end index
    const getRes = await this.fetch(`https://docs.googleapis.com/v1/documents/${documentId}`);
    if (!getRes.ok) {
      const error = await getRes.text();
      return { success: false, error: `Docs read failed: ${error}` };
    }

    const doc = (await getRes.json()) as { body: { content: { endIndex?: number }[] } };
    const endIndex = Math.max(
      1,
      (doc.body.content.at(-1)?.endIndex ?? 2) - 1
    );

    const updateRes = await this.fetch(
      `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
      {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              insertText: {
                location: { index: endIndex },
                text: `\n${content}`,
              },
            },
          ],
        }),
      }
    );

    if (!updateRes.ok) {
      const error = await updateRes.text();
      return { success: false, error: `Docs append failed: ${error}` };
    }

    return {
      success: true,
      data: {
        documentId,
        url: `https://docs.google.com/document/d/${documentId}/edit`,
      },
    };
  }

  // ----------------------------------------------------------------------------
  // Google Drive
  // ----------------------------------------------------------------------------

  async uploadFile(params: UploadFileToDriveParams): Promise<GoogleWorkspaceResult> {
    const { name, content, mimeType, folderId } = params;
    const metadata: Record<string, unknown> = { name, mimeType };
    if (folderId) metadata.parents = [folderId];

    const boundary = "nexus_boundary_" + Date.now();
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      "",
      content,
      `--${boundary}--`,
    ].join("\r\n");

    const token = await this.getAccessToken();
    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!res.ok) {
      const error = await res.text();
      return { success: false, error: `Drive upload failed: ${error}` };
    }

    const file = (await res.json()) as { id: string; name: string };
    return {
      success: true,
      data: {
        fileId: file.id,
        name: file.name,
        url: `https://drive.google.com/file/d/${file.id}/view`,
      },
    };
  }

  async listFiles(folderId?: string): Promise<GoogleWorkspaceResult> {
    const query = folderId ? `'${folderId}' in parents and trashed=false` : "trashed=false";
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,webViewLink)`;

    const res = await this.fetch(url);

    if (!res.ok) {
      const error = await res.text();
      return { success: false, error: `Drive list failed: ${error}` };
    }

    return { success: true, data: await res.json() };
  }
}
