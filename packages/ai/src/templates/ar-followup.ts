import type { WorkflowDefinitionBody } from "@nexus/types";

// ----------------------------------------------------------------------------
// Accounts Receivable Follow-Up Workflow Template
//
// Flow:
//   1. Claude drafts a personalized, context-aware collection email
//   2. Send email to customer (first touch)
//   3. If no payment after 5 days, Slack alert to AR team
//   4. Human escalation decision for large or long-overdue invoices
//   5. On escalation: trigger collections process or legal notice
// ----------------------------------------------------------------------------

export const arFollowupTemplate: WorkflowDefinitionBody = {
  inputSchema: {
    type: "object",
    properties: {
      invoiceId: { type: "string", description: "Invoice ID / number" },
      customerName: { type: "string", description: "Customer company name" },
      customerEmail: { type: "string", description: "Customer AR/billing contact email", format: "email" },
      customerContactName: { type: "string", description: "Customer contact person name (optional)" },
      arManagerEmail: { type: "string", description: "AR manager email for escalation", format: "email" },
      amount: { type: "number", description: "Outstanding invoice amount" },
      currency: { type: "string", description: "Currency code (default: EUR)" },
      dueDate: { type: "string", description: "Original due date (ISO 8601)" },
      daysPastDue: { type: "number", description: "Number of days the invoice is past due" },
      totalOutstanding: { type: "number", description: "Total outstanding balance from this customer (may include multiple invoices)" },
      previousAttempts: { type: "number", description: "Number of previous collection attempts (0 = first contact)" },
      paymentHistory: { type: "string", description: "Brief description of customer payment history (optional)" },
      contractTerms: { type: "string", description: "Relevant contract terms (e.g. Net 30, late fee policy)" },
      escalationThreshold: { type: "number", description: "Amount above which AR manager approval is needed (default: 5000)" },
      paymentPortalUrl: { type: "string", description: "Self-serve payment portal URL (optional)" },
    },
    required: ["invoiceId", "customerName", "customerEmail", "arManagerEmail", "amount", "dueDate", "daysPastDue"],
  },
  steps: [
    {
      id: "draft_collection_email",
      name: "AI Draft Collection Email",
      type: "claude_task",
      description: "Claude drafts a personalized, firm but professional collection email",
      config: {
        model: "claude-sonnet-4-6",
        systemPrompt: `You are an expert accounts receivable specialist AI.
Draft a professional, firm but relationship-preserving collection email based on the urgency level.
Tone guidelines:
- 1-14 days past due: polite reminder, assume oversight
- 15-30 days: firmer, request specific payment date commitment
- 31-60 days: formal notice, mention late fees if applicable
- 60+ days: serious tone, reference potential escalation

Include payment instructions and a clear call to action.
Never be rude or threatening — preserve business relationships.

Respond strictly with JSON:
{
  "urgencyLevel": "low" | "medium" | "high" | "critical",
  "emailSubject": string,
  "emailBody": string,
  "recommendedAction": "send_reminder" | "request_payment_plan" | "escalate_to_manager" | "send_legal_notice",
  "toneRationale": string
}`,
        userPromptTemplate: `Draft a collection email for this overdue invoice:

Invoice: {{input.invoiceId}}
Customer: {{input.customerName}} ({{input.customerEmail}})
{{#if input.customerContactName}}Contact: {{input.customerContactName}}{{/if}}
Amount: €{{input.amount}} {{input.currency}}
Due Date: {{input.dueDate}}
Days Past Due: {{input.daysPastDue}}
Total Outstanding (all invoices): €{{input.totalOutstanding}}
Previous Attempts: {{input.previousAttempts}}
{{#if input.paymentHistory}}Payment History: {{input.paymentHistory}}{{/if}}
{{#if input.contractTerms}}Contract Terms: {{input.contractTerms}}{{/if}}
{{#if input.paymentPortalUrl}}Payment Portal: {{input.paymentPortalUrl}}{{/if}}`,
        outputKey: "collection_draft",
      },
    },
    {
      id: "send_collection_email",
      name: "Send Collection Email",
      type: "tool_call",
      description: "Send the AI-drafted collection email to the customer",
      dependsOn: ["draft_collection_email"],
      config: {
        tool: "email",
        from: "ar@nexus-workflows.com",
        toTemplate: "{{input.customerEmail}}",
        subject: "{{stepOutputs.collection_draft.emailSubject}}",
        bodyTemplate: "{{stepOutputs.collection_draft.emailBody}}",
        isHtml: false,
        outputKey: "collection_email_sent",
      },
    },
    {
      id: "ar_team_slack_alert",
      name: "AR Team Slack Alert",
      type: "tool_call",
      description: "Alert AR team for high-value or escalating situations",
      dependsOn: ["draft_collection_email"],
      condition: `input.amount >= (input.escalationThreshold || 5000) || input.daysPastDue >= 30 || stepOutputs.collection_draft.recommendedAction !== "send_reminder"`,
      config: {
        tool: "slack",
        action: "send_message",
        channel: "#ar-collections",
        messageTemplate: `📬 *AR Collection Alert*

*Customer:* {{input.customerName}}
*Invoice:* {{input.invoiceId}} | *Amount:* €{{input.amount}} {{input.currency}}
*Days Past Due:* {{input.daysPastDue}} | *Total Outstanding:* €{{input.totalOutstanding}}
*AI Recommendation:* {{stepOutputs.collection_draft.recommendedAction}}
*Urgency:* {{stepOutputs.collection_draft.urgencyLevel}}

Collection email sent. {{#if stepOutputs.collection_draft.recommendedAction !== "send_reminder"}}**Human review recommended.**{{/if}}`,
        outputKey: "ar_slack_alert",
      },
    },
    {
      id: "escalation_decision",
      name: "AR Manager Escalation Decision",
      type: "human_approval",
      description: "AR manager decides next step for large or persistent overdue invoices",
      dependsOn: ["send_collection_email"],
      condition: `input.amount >= (input.escalationThreshold || 5000) || input.daysPastDue >= 45 || input.previousAttempts >= 2`,
      config: {
        title: "AR Escalation: {{input.customerName}} — €{{input.amount}} ({{input.daysPastDue}} days overdue)",
        descriptionTemplate: `**Accounts Receivable Escalation**

| Field | Value |
|-------|-------|
| Customer | {{input.customerName}} |
| Invoice | {{input.invoiceId}} |
| Amount | €{{input.amount}} {{input.currency}} |
| Days Past Due | {{input.daysPastDue}} |
| Total Outstanding | €{{input.totalOutstanding}} |
| Previous Attempts | {{input.previousAttempts}} |

**AI Analysis:**
Urgency: {{stepOutputs.collection_draft.urgencyLevel}}
Recommendation: **{{stepOutputs.collection_draft.recommendedAction}}**
Rationale: {{stepOutputs.collection_draft.toneRationale}}

Collection email was sent today.

**Please decide:**
- **Approve** = Initiate formal escalation (legal/collections agency referral)
- **Reject** = Give more time / wait for customer response`,
        assignToTemplate: "{{input.arManagerEmail}}",
        contextKeys: ["collection_draft"],
        expiresInHours: 48,
        outputKey: "escalation_response",
      },
    },
    {
      id: "notify_legal_escalation",
      name: "Escalation Confirmation Email",
      type: "tool_call",
      description: "Send internal escalation notice if manager approved escalation",
      dependsOn: ["escalation_decision"],
      config: {
        tool: "email",
        from: "ar@nexus-workflows.com",
        toTemplate: "{{input.arManagerEmail}}",
        subject: "AR Escalation Initiated — {{input.customerName}} ({{input.invoiceId}})",
        bodyTemplate: `This email confirms that AR escalation has been initiated for:

Customer: {{input.customerName}}
Invoice: {{input.invoiceId}}
Amount: €{{input.amount}} {{input.currency}}
Days Past Due: {{input.daysPastDue}}

Decision: {{stepOutputs.escalation_response.decision}}
Notes: {{stepOutputs.escalation_response.comment}}

Next steps:
- If legal referral: send formal demand letter within 2 business days
- If collections agency: submit account details by end of week
- Update CRM with escalation status

AR Operations`,
        isHtml: false,
        outputKey: "escalation_confirmation",
      },
    },
  ],
  outputMapping: {
    invoiceId: "input.invoiceId",
    customerName: "input.customerName",
    amount: "input.amount",
    urgencyLevel: "stepOutputs.collection_draft.urgencyLevel",
    recommendedAction: "stepOutputs.collection_draft.recommendedAction",
    escalationDecision: "stepOutputs.escalation_response.decision",
  },
  defaultFailurePolicy: "continue",
};
