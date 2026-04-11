import type { WorkflowDefinitionBody } from "@nexus/types";

// ----------------------------------------------------------------------------
// Expense Report Approval Workflow Template
//
// Flow:
//   1. Claude reviews expense report for policy compliance and receipt completeness
//   2. Slack notification to manager for high-value or flagged reports
//   3. Human manager approval (with AI-generated summary)
//   4. On approval: notify employee and accounting
//   5. On rejection: notify employee with explanation
// ----------------------------------------------------------------------------

export const expenseReportApprovalTemplate: WorkflowDefinitionBody = {
  inputSchema: {
    type: "object",
    properties: {
      employeeName: { type: "string", description: "Employee full name" },
      employeeEmail: { type: "string", description: "Employee email address", format: "email" },
      managerEmail: { type: "string", description: "Manager email for approval", format: "email" },
      accountingEmail: { type: "string", description: "Accounting team email", format: "email" },
      reportId: { type: "string", description: "Expense report ID or reference number" },
      submissionDate: { type: "string", description: "Report submission date (ISO 8601)" },
      expensePeriod: { type: "string", description: "Period covered (e.g. March 2026)" },
      totalAmount: { type: "number", description: "Total expense amount in EUR" },
      currency: { type: "string", description: "Currency code (default: EUR)" },
      expenses: { type: "string", description: "JSON array or description of expense line items with categories, amounts, and receipts attached" },
      businessPurpose: { type: "string", description: "Business justification for expenses" },
      policyLimitPerDiem: { type: "number", description: "Company per-diem limit per day (default: 100)" },
      autoApproveThreshold: { type: "number", description: "Amount below which auto-approval is allowed (default: 200)" },
    },
    required: ["employeeName", "employeeEmail", "managerEmail", "reportId", "totalAmount", "expenses", "businessPurpose"],
  },
  steps: [
    {
      id: "review_expenses",
      name: "AI Expense Policy Review",
      type: "claude_task",
      description: "Claude reviews the expense report against company policy",
      config: {
        model: "claude-sonnet-4-6",
        systemPrompt: `You are a financial compliance AI that reviews employee expense reports.
Analyze each expense for:
1. Policy compliance (per-diem limits, allowed categories, receipt requirements)
2. Business justification clarity
3. Potential duplicate or personal expenses
4. Missing receipts or documentation
5. Overall reasonableness given the business context

Respond strictly with a JSON object:
{
  "compliant": boolean,
  "riskLevel": "low" | "medium" | "high",
  "autoApprove": boolean,
  "issues": string[],
  "flaggedItems": { "description": string, "amount": number, "reason": string }[],
  "totalVerified": number,
  "summary": string,
  "recommendation": "approve" | "request_info" | "reject"
}`,
        userPromptTemplate: `Review this expense report:

Employee: {{input.employeeName}} ({{input.employeeEmail}})
Report ID: {{input.reportId}}
Period: {{input.expensePeriod}}
Total Amount: €{{input.totalAmount}} {{input.currency}}
Business Purpose: {{input.businessPurpose}}

Expenses:
{{input.expenses}}

Policy context:
- Per-diem limit: €{{input.policyLimitPerDiem}} per day (default: €100)
- Auto-approve threshold: €{{input.autoApproveThreshold}} (default: €200)`,
        outputKey: "expense_review",
      },
    },
    {
      id: "notify_manager_slack",
      name: "Alert Manager on Slack",
      type: "tool_call",
      description: "Notify manager on Slack if the report needs review",
      condition: `input.totalAmount > (input.autoApproveThreshold || 200) || stepOutputs.expense_review.riskLevel !== "low"`,
      config: {
        tool: "slack",
        action: "send_message",
        channel: "#expense-approvals",
        messageTemplate: `*Expense Report Awaiting Approval* 📋

*Employee:* {{input.employeeName}}
*Report:* {{input.reportId}} | *Period:* {{input.expensePeriod}}
*Total:* €{{input.totalAmount}} {{input.currency}}
*Risk Level:* {{stepOutputs.expense_review.riskLevel}}

*AI Summary:* {{stepOutputs.expense_review.summary}}

Please check your approval inbox.`,
        outputKey: "slack_alert",
      },
    },
    {
      id: "request_manager_approval",
      name: "Manager Approval Request",
      type: "human_approval",
      description: "Request manager review and approval",
      dependsOn: ["review_expenses"],
      config: {
        title: "Expense Report Approval: {{input.employeeName}} — {{input.reportId}}",
        descriptionTemplate: `**Employee:** {{input.employeeName}} ({{input.employeeEmail}})
**Period:** {{input.expensePeriod}} | **Report ID:** {{input.reportId}}
**Total Amount:** €{{input.totalAmount}} {{input.currency}}
**Business Purpose:** {{input.businessPurpose}}

---
**AI Review**
Risk Level: {{stepOutputs.expense_review.riskLevel}}
{{stepOutputs.expense_review.summary}}

{{#if stepOutputs.expense_review.issues}}
**Policy Issues:**
{{#each stepOutputs.expense_review.issues}}- {{this}}
{{/each}}
{{/if}}

{{#if stepOutputs.expense_review.flaggedItems}}
**Flagged Items:**
{{#each stepOutputs.expense_review.flaggedItems}}- {{this.description}} (€{{this.amount}}): {{this.reason}}
{{/each}}
{{/if}}

**AI Recommendation:** {{stepOutputs.expense_review.recommendation}}`,
        assignToTemplate: "{{input.managerEmail}}",
        contextKeys: ["expense_review"],
        expiresInHours: 48,
        outputKey: "approval_response",
      },
    },
    {
      id: "notify_employee_approved",
      name: "Notify Employee — Approved",
      type: "tool_call",
      description: "Email employee that their expense report was approved",
      dependsOn: ["request_manager_approval"],
      config: {
        tool: "email",
        from: "expenses@nexus-workflows.com",
        toTemplate: "{{input.employeeEmail}}",
        subject: "Expense Report {{input.reportId}} Approved ✓",
        bodyTemplate: `Hi {{input.employeeName}},

Your expense report {{input.reportId}} for the period {{input.expensePeriod}} has been approved.

Amount approved: €{{input.totalAmount}} {{input.currency}}

Reimbursement will be processed in the next payroll cycle.

{{#if stepOutputs.approval_response.comment}}
Manager notes: {{stepOutputs.approval_response.comment}}
{{/if}}

Best regards,
Finance Team`,
        isHtml: false,
        outputKey: "employee_approval_email",
      },
    },
    {
      id: "notify_accounting",
      name: "Notify Accounting Team",
      type: "tool_call",
      description: "Forward approved expense report to accounting for processing",
      dependsOn: ["notify_employee_approved"],
      config: {
        tool: "email",
        from: "expenses@nexus-workflows.com",
        toTemplate: "{{input.accountingEmail}}",
        subject: "Process Reimbursement — {{input.reportId}} ({{input.employeeName}})",
        bodyTemplate: `Hi Accounting Team,

Please process the following approved expense reimbursement:

Employee: {{input.employeeName}} ({{input.employeeEmail}})
Report ID: {{input.reportId}}
Period: {{input.expensePeriod}}
Amount: €{{input.totalAmount}} {{input.currency}}
Approved by: {{input.managerEmail}}

AI Risk Assessment: {{stepOutputs.expense_review.riskLevel}}

Please initiate the reimbursement in the next payroll run.`,
        isHtml: false,
        outputKey: "accounting_notification",
      },
    },
  ],
  outputMapping: {
    reportId: "input.reportId",
    employeeName: "input.employeeName",
    totalAmount: "input.totalAmount",
    riskLevel: "stepOutputs.expense_review.riskLevel",
    reviewSummary: "stepOutputs.expense_review.summary",
    approvalDecision: "stepOutputs.approval_response.decision",
  },
  defaultFailurePolicy: "stop_all",
};
