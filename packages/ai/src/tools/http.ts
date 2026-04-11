// ----------------------------------------------------------------------------
// Generic HTTP Tool Implementation
// ----------------------------------------------------------------------------

export interface HttpRequestParams {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
  ok: boolean;
}

export class HttpToolImpl {
  private defaultTimeoutMs: number;

  constructor(defaultTimeoutMs = 30_000) {
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  async request(params: HttpRequestParams): Promise<HttpResponse> {
    const { url, method, headers = {}, body, timeoutMs = this.defaultTimeoutMs } = params;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const requestHeaders: Record<string, string> = {
      "User-Agent": "Nexus-Workflow/1.0",
      ...headers,
    };

    // Auto-set content-type for body requests
    if (body !== undefined && !requestHeaders["Content-Type"] && !requestHeaders["content-type"]) {
      requestHeaders["Content-Type"] = "application/json";
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`HTTP request to ${url} timed out after ${timeoutMs}ms`);
      }
      throw new Error(
        `HTTP request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // Parse response headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Parse response body
    const contentType = responseHeaders["content-type"] ?? "";
    let data: unknown;

    try {
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else if (contentType.includes("text/")) {
        data = await response.text();
      } else {
        // For binary or unknown content types, return base64
        const buffer = await response.arrayBuffer();
        data = Buffer.from(buffer).toString("base64");
      }
    } catch {
      data = null;
    }

    return {
      status: response.status,
      data,
      headers: responseHeaders,
      ok: response.ok,
    };
  }

  async get(url: string, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ url, method: "GET", headers });
  }

  async post(url: string, body: unknown, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ url, method: "POST", body, headers });
  }

  async put(url: string, body: unknown, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ url, method: "PUT", body, headers });
  }

  async patch(url: string, body: unknown, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ url, method: "PATCH", body, headers });
  }

  async delete(url: string, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ url, method: "DELETE", headers });
  }
}
