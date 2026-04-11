// ----------------------------------------------------------------------------
// CRM Tool Implementation
// Supports HubSpot and Salesforce via their REST APIs
// ----------------------------------------------------------------------------

export type CrmProvider = "hubspot" | "salesforce";
export type CrmAction =
  | "create_contact"
  | "update_contact"
  | "create_deal"
  | "update_deal"
  | "create_note"
  | "search_contacts";

export interface CrmToolConfig {
  provider: CrmProvider;
  /** HubSpot private app token, or Salesforce access token */
  apiKey: string;
  /** Salesforce instance URL (e.g. https://yourorg.my.salesforce.com) — required for Salesforce */
  instanceUrl?: string;
}

export interface CrmResult {
  success: boolean;
  recordId?: string;
  data?: unknown;
  error?: string;
}

export class CrmTool {
  constructor(private readonly config: CrmToolConfig) {}

  async execute(action: CrmAction, payload: Record<string, unknown>, recordId?: string): Promise<CrmResult> {
    if (this.config.provider === "hubspot") {
      return this.executeHubSpot(action, payload, recordId);
    }
    return this.executeSalesforce(action, payload, recordId);
  }

  // ----------------------------------------------------------------------------
  // HubSpot
  // ----------------------------------------------------------------------------

  private async executeHubSpot(
    action: CrmAction,
    payload: Record<string, unknown>,
    recordId?: string
  ): Promise<CrmResult> {
    const baseUrl = "https://api.hubapi.com";
    const headers = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };

    switch (action) {
      case "create_contact": {
        const res = await fetch(`${baseUrl}/crm/v3/objects/contacts`, {
          method: "POST",
          headers,
          body: JSON.stringify({ properties: payload }),
        });
        return this.parseHubSpotResponse(res);
      }

      case "update_contact": {
        if (!recordId) return { success: false, error: "recordId required for update_contact" };
        const res = await fetch(`${baseUrl}/crm/v3/objects/contacts/${recordId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ properties: payload }),
        });
        return this.parseHubSpotResponse(res);
      }

      case "create_deal": {
        const res = await fetch(`${baseUrl}/crm/v3/objects/deals`, {
          method: "POST",
          headers,
          body: JSON.stringify({ properties: payload }),
        });
        return this.parseHubSpotResponse(res);
      }

      case "update_deal": {
        if (!recordId) return { success: false, error: "recordId required for update_deal" };
        const res = await fetch(`${baseUrl}/crm/v3/objects/deals/${recordId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ properties: payload }),
        });
        return this.parseHubSpotResponse(res);
      }

      case "create_note": {
        // HubSpot notes are engagements
        const res = await fetch(`${baseUrl}/crm/v3/objects/notes`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            properties: {
              hs_note_body: payload.body ?? payload.content,
              hs_timestamp: payload.timestamp ?? new Date().toISOString(),
              ...payload,
            },
          }),
        });
        return this.parseHubSpotResponse(res);
      }

      case "search_contacts": {
        const res = await fetch(`${baseUrl}/crm/v3/objects/contacts/search`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            filterGroups: payload.filterGroups ?? [
              {
                filters: [
                  {
                    propertyName: "email",
                    operator: "EQ",
                    value: payload.email,
                  },
                ],
              },
            ],
            properties: payload.properties ?? ["email", "firstname", "lastname", "phone", "company"],
            limit: payload.limit ?? 10,
          }),
        });
        return this.parseHubSpotResponse(res);
      }

      default:
        return { success: false, error: `Unknown HubSpot action: ${action}` };
    }
  }

  private async parseHubSpotResponse(res: Response): Promise<CrmResult> {
    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: `HubSpot API error ${res.status}: ${data.message ?? JSON.stringify(data)}`,
      };
    }
    return {
      success: true,
      recordId: (data as { id?: string }).id,
      data,
    };
  }

  // ----------------------------------------------------------------------------
  // Salesforce (REST API)
  // ----------------------------------------------------------------------------

  private async executeSalesforce(
    action: CrmAction,
    payload: Record<string, unknown>,
    recordId?: string
  ): Promise<CrmResult> {
    if (!this.config.instanceUrl) {
      return { success: false, error: "Salesforce instanceUrl is required" };
    }

    const baseUrl = `${this.config.instanceUrl}/services/data/v59.0`;
    const headers = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };

    switch (action) {
      case "create_contact": {
        const res = await fetch(`${baseUrl}/sobjects/Contact`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        return this.parseSalesforceResponse(res);
      }

      case "update_contact": {
        if (!recordId) return { success: false, error: "recordId required for update_contact" };
        const res = await fetch(`${baseUrl}/sobjects/Contact/${recordId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(payload),
        });
        if (res.status === 204) return { success: true, recordId };
        return this.parseSalesforceResponse(res);
      }

      case "create_deal": {
        const res = await fetch(`${baseUrl}/sobjects/Opportunity`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        return this.parseSalesforceResponse(res);
      }

      case "update_deal": {
        if (!recordId) return { success: false, error: "recordId required for update_deal" };
        const res = await fetch(`${baseUrl}/sobjects/Opportunity/${recordId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(payload),
        });
        if (res.status === 204) return { success: true, recordId };
        return this.parseSalesforceResponse(res);
      }

      case "create_note": {
        const res = await fetch(`${baseUrl}/sobjects/Note`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        return this.parseSalesforceResponse(res);
      }

      case "search_contacts": {
        const email = payload.email as string;
        const soql = encodeURIComponent(
          `SELECT Id, FirstName, LastName, Email, Phone, Account.Name FROM Contact WHERE Email = '${email}' LIMIT 10`
        );
        const res = await fetch(`${baseUrl}/query?q=${soql}`, { headers });
        return this.parseSalesforceResponse(res);
      }

      default:
        return { success: false, error: `Unknown Salesforce action: ${action}` };
    }
  }

  private async parseSalesforceResponse(res: Response): Promise<CrmResult> {
    if (res.status === 204) return { success: true };
    const data = await res.json();
    if (!res.ok) {
      const errMsg = Array.isArray(data)
        ? data.map((e: { message?: string }) => e.message).join("; ")
        : String(data);
      return { success: false, error: `Salesforce API error ${res.status}: ${errMsg}` };
    }
    return {
      success: true,
      recordId: (data as { id?: string }).id,
      data,
    };
  }
}
