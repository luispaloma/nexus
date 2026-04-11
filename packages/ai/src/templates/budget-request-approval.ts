import type { WorkflowDefinitionBody } from "@nexus/types";

// ----------------------------------------------------------------------------
// Budget Request Approval Workflow Template
//
// Flow:
//   1. Claude analyzes the budget request against YTD spend and headroom
//   2. Department head approval for standard requests
//   3. CFO approval gate for large or strategic requests
//   4. On full approval: confirm to requester and update budget system
//   5. On any rejection: notify requester with feedback
// ----------------------------------------------------------------------------

export const budgetRequestApprovalTemplate: WorkflowDefinitionBody = {
  inputSchema: {
    type: "object",
    properties: {
      requestId: { type: "string", description: "Budget request ID" },
      requesterName: { type: "string", description: "Requester full name" },
      requesterEmail: { type: "string", description: "Requester email", format: "email" },
      department: { type: "string", description: "Department name (e.g. Engineering, Marketing)" },
      departmentHeadEmail: { type: "string", description: "Department head email for first approval", format: "email" },
      cfoEmail: { type: "string", description: "CFO email for large request approval", format: "email" },
      budgetSystemWebhook: { type: "string", description: "Budget system webhook URL to record approval (optional)" },
      requestedAmount: { type: "number", description: "Requested budget amount in EUR" },
      currency: { type: "string", description: "Currency code (default: EUR)" },
      category: { type: "string", description: "Budget category (e.g. Software, Headcount, Travel, Marketing)" },
      businessCase: { type: "string", description: "Business justification and expected ROI" },
      quarterlyBudgetTotal: { type: "number", description: "Total approved quarterly budget for this department" },
      ytdSpend: { type: "number", description: "Year-to-date spend in this category" },
      remainingBudget: { type: "number", description: "Remaining approved budget in this category" },
      cfoApprovalThreshold: { type: "number", description: "Amount above which CFO approval is required (default: 25000)" },
      urgency: { type: "string", description: "low | medium | high" },
      requiredByDate: { type: "string", description: "Date funds are needed by (ISO 8601)" },
    },
    required: ["requestId", "requesterName", "requesterEmail", "department", "departmentHeadEmail", "cfoEmail", "requestedAmount", "category", "businessCase"],
  },
  steps: [
    {
      id: "analyze_budget_request",
      name: "AI Budget Analysis",
      type: "claude_task",
      description: "Claude evaluates business case strength and budget impact",
      config: {
        model: "claude-sonnet-4-6",
        systemPrompt: `You are a financial planning AI that evaluates budget requests.
Assess:
1. Business case clarity and ROI justification strength
2. Amount reasonableness relative to department budget
3. Whether this fits within remaining budget headroom
4. Urgency legitimacy
5. Strategic alignment (cost reduction, revenue growth, compliance, efficiency)
6. Risk if request is denied

Respond strictly with JSON:
{
  "businessCaseScore": number (1-10),
  "withinBudget": boolean,
  "budgetHeadroom": number,
  "strategicCategory": "cost_reduction" | "revenue_growth" | "compliance" | "efficiency" | "other",
  "urgencyAssessment": "justified" | "questionable" | "not_urgent",
  "recommendation": "approve" | "approve_partial" | "defer" | "reject",
  "suggestedApprovedAmount": number,
  "analysisNotes": string[],
  "executiveSummary": string
}`,
        userPromptTemplate: `Analyze this budget request:

Request ID: {{input.requestId}}
Requester: {{input.requesterName}} ({{input.requesterEmail}})
Department: {{input.department}}
Category: {{input.category}}
Requested Amount: €{{input.requestedAmount}} {{input.currency}}
Urgency: {{input.urgency}}
Required By: {{input.requiredByDate}}

Business Case:
{{input.businessCase}}

Financial Context:
- Quarterly department budget: €{{input.quarterlyBudgetTotal}}
- YTD spend in this category: €{{input.ytdSpend}}
- Remaining approved budget: €{{input.remainingBudget}}
- CFO approval threshold: €{{input.cfoApprovalThreshold}} (default: €25,000)`,
        outputKey: "budget_analysis",
      },
    },
    {
      id: "dept_head_approval",
      name: "Department Head Approval",
      type: "human_approval",
      description: "Request department head review and approval",
      dependsOn: ["analyze_budget_request"],
      config: {
        title: "Budget Request: {{input.department}} — €{{input.requestedAmount}} ({{input.category}})",
        descriptionTemplate: `**Budget Request: {{input.requestId}}**

| Field | Value |
|-------|-------|
| Requester | {{input.requesterName}} |
| Department | {{input.department}} |
| Category | {{input.category}} |
| Requested | €{{input.requestedAmount}} {{input.currency}} |
| Required by | {{input.requiredByDate}} |
| Urgency | {{input.urgency}} |

**Business Case:**
{{input.businessCase}}

---
**AI Analysis**
Business Case Score: {{stepOutputs.budget_analysis.businessCaseScore}}/10
Within Budget: {{stepOutputs.budget_analysis.withinBudget}} (headroom: €{{stepOutputs.budget_analysis.budgetHeadroom}})
Strategic Category: {{stepOutputs.budget_analysis.strategicCategory}}
AI Recommendation: **{{stepOutputs.budget_analysis.recommendation}}**
Suggested Approved Amount: €{{stepOutputs.budget_analysis.suggestedApprovedAmount}}

{{stepOutputs.budget_analysis.executiveSummary}}`,
        assignToTemplate: "{{input.departmentHeadEmail}}",
        contextKeys: ["budget_analysis"],
        expiresInHours: 72,
        outputKey: "dept_head_response",
      },
    },
    {
      id: "cfo_approval",
      name: "CFO Approval (Large Requests)",
      type: "human_approval",
      description: "CFO approval for requests above threshold",
      dependsOn: ["dept_head_approval"],
      condition: `input.requestedAmount >= (input.cfoApprovalThreshold || 25000) && stepOutputs.dept_head_response.decision === "approved"`,
      config: {
        title: "[CFO] Budget Approval Required: €{{input.requestedAmount}} — {{input.department}}/{{input.category}}",
        descriptionTemplate: `**Large Budget Request Escalated for CFO Review**

Department head has approved. CFO sign-off required per policy (threshold: €{{input.cfoApprovalThreshold}}).

| Field | Value |
|-------|-------|
| Department | {{input.department}} |
| Category | {{input.category}} |
| Amount | **€{{input.requestedAmount}}** |
| Requester | {{input.requesterName}} |
| Dept Head Approved | ✓ ({{input.departmentHeadEmail}}) |

**AI Executive Summary:**
{{stepOutputs.budget_analysis.executiveSummary}}

**Business Case Score:** {{stepOutputs.budget_analysis.businessCaseScore}}/10
**Strategic Category:** {{stepOutputs.budget_analysis.strategicCategory}}

**Dept Head Notes:** {{stepOutputs.dept_head_response.comment}}`,
        assignToTemplate: "{{input.cfoEmail}}",
        contextKeys: ["budget_analysis", "dept_head_response"],
        expiresInHours: 48,
        outputKey: "cfo_response",
      },
    },
    {
      id: "update_budget_system",
      name: "Update Budget System",
      type: "tool_call",
      description: "Notify budget system of the approval via webhook",
      dependsOn: ["dept_head_approval"],
      condition: `stepOutputs.dept_head_response.decision === "approved" && input.budgetSystemWebhook`,
      config: {
        tool: "http",
        urlTemplate: "{{input.budgetSystemWebhook}}",
        method: "POST",
        headersTemplate: { "Content-Type": "application/json" },
        bodyTemplate: `{
  "requestId": "{{input.requestId}}",
  "department": "{{input.department}}",
  "category": "{{input.category}}",
  "approvedAmount": {{input.requestedAmount}},
  "currency": "{{input.currency}}",
  "approvedBy": "{{input.departmentHeadEmail}}",
  "requester": "{{input.requesterEmail}}"
}`,
        outputKey: "budget_system_update",
        expectedStatusCodes: [200, 201, 202, 204],
      },
    },
    {
      id: "notify_requester",
      name: "Notify Requester of Decision",
      type: "tool_call",
      description: "Email requester the final approval decision",
      dependsOn: ["dept_head_approval"],
      config: {
        tool: "email",
        from: "budgets@nexus-workflows.com",
        toTemplate: "{{input.requesterEmail}}",
        subject: "Budget Request {{input.requestId}} — {{stepOutputs.dept_head_response.decision}}",
        bodyTemplate: `Hi {{input.requesterName}},

Your budget request {{input.requestId}} for {{input.category}} (€{{input.requestedAmount}}) has been reviewed.

Decision: {{stepOutputs.dept_head_response.decision}}
{{#if stepOutputs.dept_head_response.comment}}
Notes: {{stepOutputs.dept_head_response.comment}}
{{/if}}

AI Analysis Summary:
{{stepOutputs.budget_analysis.executiveSummary}}

If approved, funds will be reflected in your department budget within 1 business day.

Finance & Planning`,
        isHtml: false,
        outputKey: "requester_notification",
      },
    },
  ],
  outputMapping: {
    requestId: "input.requestId",
    requestedAmount: "input.requestedAmount",
    businessCaseScore: "stepOutputs.budget_analysis.businessCaseScore",
    recommendation: "stepOutputs.budget_analysis.recommendation",
    approvalDecision: "stepOutputs.dept_head_response.decision",
  },
  defaultFailurePolicy: "stop_all",
};
