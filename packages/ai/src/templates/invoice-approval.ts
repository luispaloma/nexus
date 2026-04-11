import type { WorkflowDefinitionBody } from "@nexus/types";

// ----------------------------------------------------------------------------
// Invoice Approval Workflow Template
//
// Flow:
//   1. Claude reviews the invoice details for compliance and anomalies
//   2. If amount > threshold, send Slack notification to finance team
//   3. Request human approval from finance manager
//   4. On approval: send confirmation email to requester
//   5. On rejection: send rejection email with Claude's analysis
// ----------------------------------------------------------------------------

export const invoiceApprovalTemplate: WorkflowDefinitionBody = {
  inputSchema: {
    type: "object",
    properties: {
      invoiceNumber: { type: "string", description: "Invoice number/ID" },
      vendorName: { type: "string", description: "Vendor or supplier name" },
      vendorEmail: { type: "string", description: "Vendor contact email", format: "email" },
      amount: { type: "number", description: "Invoice amount in USD" },
      currency: { type: "string", description: "Currency code (default: USD)" },
      dueDate: { type: "string", description: "Payment due date (ISO 8601)" },
      lineItems: { type: "string", description: "JSON string or description of line items" },
      requesterEmail: { type: "string", description: "Email of the person submitting the invoice", format: "email" },
      approverEmail: { type: "string", description: "Finance manager email for approval", format: "email" },
      approvalThreshold: { type: "number", description: "Amount above which approval is required (default: 1000)" },
    },
    required: ["invoiceNumber", "vendorName", "vendorEmail", "amount", "requesterEmail", "approverEmail"],
  },
  steps: [
    {
      id: "review_invoice",
      name: "AI Invoice Review",
      type: "claude_task",
      description: "Claude reviews the invoice for accuracy, compliance, and red flags",
      config: {
        model: "claude-sonnet-4-6",
        systemPrompt: `You are a financial compliance AI assistant specializing in invoice review.
Your task is to analyze invoices for:
1. Mathematical accuracy (line items sum to total)
2. Completeness (all required fields present)
3. Policy compliance (reasonable amounts, known vendors, valid due dates)
4. Risk indicators (unusual amounts, new vendors, tight due dates)

Respond with a JSON object containing:
{
  "riskLevel": "low" | "medium" | "high",
  "approved_for_auto_payment": boolean,
  "issues": string[],
  "recommendations": string[],
  "summary": string
}`,
        userPromptTemplate: `Please review this invoice:

Invoice Number: {{input.invoiceNumber}}
Vendor: {{input.vendorName}} ({{input.vendorEmail}})
Amount: {{input.amount}} {{input.currency}}
Due Date: {{input.dueDate}}
Line Items: {{input.lineItems}}
Submitted by: {{input.requesterEmail}}`,
        outputKey: "invoice_review",
      },
    },
    {
      id: "notify_finance_slack",
      name: "Slack Notification to Finance",
      type: "tool_call",
      description: "Notify finance team on Slack when invoice amount exceeds threshold",
      condition: `input.amount >= (input.approvalThreshold || 1000)`,
      config: {
        tool: "slack",
        action: "send_message",
        channel: "#finance-approvals",
        messageTemplate: `*New Invoice Approval Required* :invoice:

*Invoice #{{input.invoiceNumber}}* from *{{input.vendorName}}*
- Amount: ${{input.amount}} {{input.currency}}
- Due: {{input.dueDate}}
- Submitted by: {{input.requesterEmail}}

*AI Risk Assessment:* {{stepOutputs.invoice_review.riskLevel}}
*Summary:* {{stepOutputs.invoice_review.summary}}

Please check your email for the approval request.`,
        outputKey: "slack_notification",
      },
    },
    {
      id: "request_approval",
      name: "Human Approval Request",
      type: "human_approval",
      description: "Request finance manager approval",
      dependsOn: ["review_invoice"],
      config: {
        title: "Invoice Approval Required: {{input.invoiceNumber}}",
        descriptionTemplate: `Please review and approve/reject the following invoice:

**Invoice Details**
- Number: {{input.invoiceNumber}}
- Vendor: {{input.vendorName}} ({{input.vendorEmail}})
- Amount: ${{input.amount}} {{input.currency}}
- Due Date: {{input.dueDate}}

**AI Review Summary**
Risk Level: {{stepOutputs.invoice_review.riskLevel}}
{{stepOutputs.invoice_review.summary}}

{{#if stepOutputs.invoice_review.issues}}
**Issues Found:**
{{#each stepOutputs.invoice_review.issues}}- {{this}}
{{/each}}
{{/if}}`,
        assignToTemplate: "{{input.approverEmail}}",
        contextKeys: ["invoice_review"],
        expiresInHours: 72,
        outputKey: "approval_response",
      },
    },
    {
      id: "send_approval_confirmation",
      name: "Send Approval Confirmation Email",
      type: "tool_call",
      description: "Notify requester that invoice was approved",
      dependsOn: ["request_approval"],
      config: {
        tool: "email",
        from: "notifications@nexus-workflows.com",
        toTemplate: "{{input.requesterEmail}}",
        subject: "Invoice {{input.invoiceNumber}} Approved",
        bodyTemplate: `Hello,

Your invoice #{{input.invoiceNumber}} from {{input.vendorName}} for ${{input.amount}} has been approved.

Payment will be processed according to the due date: {{input.dueDate}}.

Reviewer notes: {{stepOutputs.approval_response.comment}}

Thank you,
Finance Team`,
        isHtml: false,
        outputKey: "confirmation_email",
      },
    },
    {
      id: "send_vendor_notification",
      name: "Send Vendor Payment Notification",
      type: "tool_call",
      description: "Notify vendor that payment is scheduled",
      dependsOn: ["send_approval_confirmation"],
      config: {
        tool: "email",
        from: "ap@nexus-workflows.com",
        toTemplate: "{{input.vendorEmail}}",
        subject: "Payment Scheduled - Invoice {{input.invoiceNumber}}",
        bodyTemplate: `Dear {{input.vendorName}},

This is to confirm that your invoice #{{input.invoiceNumber}} for ${{input.amount}} has been approved and payment is scheduled for {{input.dueDate}}.

Thank you for your business.

Best regards,
Accounts Payable Team`,
        isHtml: false,
        outputKey: "vendor_notification",
      },
    },
  ],
  outputMapping: {
    invoiceNumber: "input.invoiceNumber",
    riskLevel: "stepOutputs.invoice_review.riskLevel",
    reviewSummary: "stepOutputs.invoice_review.summary",
    approvalDecision: "stepOutputs.approval_response.decision",
    approvedAt: "stepOutputs.approval_response.respondedAt",
  },
  defaultFailurePolicy: "stop_all",
};
