import type { WorkflowDefinitionBody } from "@nexus/types";

// ----------------------------------------------------------------------------
// Vendor Payment Approval Workflow Template
//
// Flow:
//   1. Claude validates payment request against vendor master and payment policy
//   2. Slack alert to Treasury for payments above threshold
//   3. CFO/Finance Director human approval
//   4. On approval: trigger payment in ERP via HTTP webhook + notify AP
//   5. On rejection: notify requester with reason
// ----------------------------------------------------------------------------

export const vendorPaymentApprovalTemplate: WorkflowDefinitionBody = {
  inputSchema: {
    type: "object",
    properties: {
      paymentId: { type: "string", description: "Internal payment request ID" },
      vendorName: { type: "string", description: "Vendor legal name" },
      vendorId: { type: "string", description: "Vendor master data ID" },
      vendorEmail: { type: "string", description: "Vendor accounts receivable email", format: "email" },
      requesterEmail: { type: "string", description: "AP team member requesting payment", format: "email" },
      approverEmail: { type: "string", description: "CFO or Finance Director email", format: "email" },
      amount: { type: "number", description: "Payment amount" },
      currency: { type: "string", description: "Currency code (default: EUR)" },
      paymentMethod: { type: "string", description: "SEPA, SWIFT, domestic wire, etc." },
      bankAccount: { type: "string", description: "Last 4 digits of destination IBAN/account for verification" },
      invoiceReferences: { type: "string", description: "Invoice numbers this payment covers" },
      paymentDate: { type: "string", description: "Requested payment value date (ISO 8601)" },
      erpWebhookUrl: { type: "string", description: "ERP webhook URL to trigger payment on approval" },
      urgencyReason: { type: "string", description: "Reason if payment is urgent (optional)" },
      largPaymentThreshold: { type: "number", description: "Amount above which CFO approval is required (default: 10000)" },
    },
    required: ["paymentId", "vendorName", "vendorId", "requesterEmail", "approverEmail", "amount", "currency", "paymentMethod", "bankAccount", "invoiceReferences", "paymentDate"],
  },
  steps: [
    {
      id: "validate_payment",
      name: "AI Payment Validation",
      type: "claude_task",
      description: "Validate payment request against vendor master data and fraud indicators",
      config: {
        model: "claude-sonnet-4-6",
        systemPrompt: `You are a treasury and fraud prevention AI for accounts payable.
Analyze this payment request for:
1. Bank account change indicators (high-risk if new/changed)
2. Urgency manipulation patterns (pressure to bypass controls)
3. Round-number or unusual amounts
4. Vendor data consistency
5. Invoice reference completeness
6. Payment method appropriateness

Respond strictly with JSON:
{
  "fraudRisk": "low" | "medium" | "high" | "critical",
  "flags": string[],
  "bankAccountChangeDetected": boolean,
  "urgencyManipulation": boolean,
  "validationSummary": string,
  "recommendation": "proceed" | "verify_vendor" | "escalate" | "reject"
}`,
        userPromptTemplate: `Validate this vendor payment request:

Payment ID: {{input.paymentId}}
Vendor: {{input.vendorName}} (ID: {{input.vendorId}})
Amount: {{input.amount}} {{input.currency}}
Payment Method: {{input.paymentMethod}}
Destination Account (last 4): {{input.bankAccount}}
Invoice References: {{input.invoiceReferences}}
Payment Date: {{input.paymentDate}}
Requested by: {{input.requesterEmail}}
{{#if input.urgencyReason}}Urgency Reason: {{input.urgencyReason}}{{/if}}

Large payment threshold: {{input.largPaymentThreshold}} (default: €10,000)`,
        outputKey: "payment_validation",
      },
    },
    {
      id: "treasury_slack_alert",
      name: "Treasury Slack Alert",
      type: "tool_call",
      description: "Alert treasury team on Slack for high-value or flagged payments",
      condition: `input.amount >= (input.largPaymentThreshold || 10000) || stepOutputs.payment_validation.fraudRisk !== "low"`,
      config: {
        tool: "slack",
        action: "send_message",
        channel: "#treasury-approvals",
        messageTemplate: `*Vendor Payment Approval Required* 💳

*Vendor:* {{input.vendorName}} (ID: {{input.vendorId}})
*Payment ID:* {{input.paymentId}}
*Amount:* {{input.amount}} {{input.currency}} via {{input.paymentMethod}}
*Value Date:* {{input.paymentDate}}
*Fraud Risk:* {{stepOutputs.payment_validation.fraudRisk}}

{{#if stepOutputs.payment_validation.flags}}
⚠️ *Flags:*
{{#each stepOutputs.payment_validation.flags}}- {{this}}
{{/each}}
{{/if}}

*Summary:* {{stepOutputs.payment_validation.validationSummary}}

Check your approval inbox now.`,
        outputKey: "treasury_slack_alert",
      },
    },
    {
      id: "cfo_approval",
      name: "CFO/Finance Director Approval",
      type: "human_approval",
      description: "Request CFO approval for large or flagged payment",
      dependsOn: ["validate_payment"],
      config: {
        title: "Payment Approval: {{input.vendorName}} — {{input.amount}} {{input.currency}}",
        descriptionTemplate: `**Payment Request Details**

- Payment ID: {{input.paymentId}}
- Vendor: {{input.vendorName}} (ID: {{input.vendorId}})
- Amount: **{{input.amount}} {{input.currency}}**
- Method: {{input.paymentMethod}}
- Destination account (last 4): {{input.bankAccount}}
- Value date: {{input.paymentDate}}
- Invoices: {{input.invoiceReferences}}
- Requested by: {{input.requesterEmail}}

{{#if input.urgencyReason}}
⚡ **Urgency:** {{input.urgencyReason}}
{{/if}}

---
**AI Fraud Risk Assessment**
Risk Level: **{{stepOutputs.payment_validation.fraudRisk}}**
{{stepOutputs.payment_validation.validationSummary}}

{{#if stepOutputs.payment_validation.flags}}
**Flags:**
{{#each stepOutputs.payment_validation.flags}}- {{this}}
{{/each}}
{{/if}}

**AI Recommendation:** {{stepOutputs.payment_validation.recommendation}}`,
        assignToTemplate: "{{input.approverEmail}}",
        contextKeys: ["payment_validation"],
        expiresInHours: 24,
        outputKey: "cfo_approval_response",
      },
    },
    {
      id: "trigger_erp_payment",
      name: "Trigger ERP Payment",
      type: "tool_call",
      description: "POST to ERP webhook to initiate the payment",
      dependsOn: ["cfo_approval"],
      condition: `stepOutputs.cfo_approval_response.decision === "approved" && input.erpWebhookUrl`,
      config: {
        tool: "http",
        urlTemplate: "{{input.erpWebhookUrl}}",
        method: "POST",
        headersTemplate: {
          "Content-Type": "application/json",
          "X-Nexus-Payment-Id": "{{input.paymentId}}",
        },
        bodyTemplate: `{
  "paymentId": "{{input.paymentId}}",
  "vendorId": "{{input.vendorId}}",
  "amount": {{input.amount}},
  "currency": "{{input.currency}}",
  "paymentMethod": "{{input.paymentMethod}}",
  "valueDate": "{{input.paymentDate}}",
  "approvedBy": "{{input.approverEmail}}",
  "approvalComment": "{{stepOutputs.cfo_approval_response.comment}}",
  "invoiceReferences": "{{input.invoiceReferences}}"
}`,
        outputKey: "erp_trigger_response",
        expectedStatusCodes: [200, 201, 202],
      },
    },
    {
      id: "notify_ap_approved",
      name: "Notify AP Team — Payment Queued",
      type: "tool_call",
      description: "Email AP team confirming payment has been queued in ERP",
      dependsOn: ["trigger_erp_payment"],
      config: {
        tool: "email",
        from: "treasury@nexus-workflows.com",
        toTemplate: "{{input.requesterEmail}}",
        subject: "Payment Queued — {{input.paymentId}} ({{input.vendorName}})",
        bodyTemplate: `Hi,

Payment {{input.paymentId}} for {{input.vendorName}} has been approved and queued for processing.

Amount: {{input.amount}} {{input.currency}}
Value Date: {{input.paymentDate}}
Method: {{input.paymentMethod}}

Approved by: {{input.approverEmail}}
{{#if stepOutputs.cfo_approval_response.comment}}
Notes: {{stepOutputs.cfo_approval_response.comment}}
{{/if}}

This payment will appear in the ERP payment run for {{input.paymentDate}}.

Finance Operations`,
        isHtml: false,
        outputKey: "ap_notification",
      },
    },
  ],
  outputMapping: {
    paymentId: "input.paymentId",
    vendorName: "input.vendorName",
    amount: "input.amount",
    fraudRisk: "stepOutputs.payment_validation.fraudRisk",
    approvalDecision: "stepOutputs.cfo_approval_response.decision",
  },
  defaultFailurePolicy: "stop_all",
};
