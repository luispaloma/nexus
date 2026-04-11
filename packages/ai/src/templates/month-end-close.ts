import type { WorkflowDefinitionBody } from "@nexus/types";

// ----------------------------------------------------------------------------
// Month-End Financial Close Checklist Workflow Template
//
// Flow:
//   1. Claude generates a tailored close checklist based on company profile
//   2. Assign and track checklist items via Slack
//   3. Controller reviews checklist completion status
//   4. CFO final sign-off on month-end close
//   5. Notify stakeholders that period is closed
// ----------------------------------------------------------------------------

export const monthEndCloseTemplate: WorkflowDefinitionBody = {
  inputSchema: {
    type: "object",
    properties: {
      closingPeriod: { type: "string", description: "Period to close (e.g. March 2026)" },
      periodEndDate: { type: "string", description: "Last day of the period (ISO 8601)" },
      closingDeadline: { type: "string", description: "Target date to complete close (ISO 8601)" },
      controllerEmail: { type: "string", description: "Controller or Accounting Manager email", format: "email" },
      cfoEmail: { type: "string", description: "CFO email for final sign-off", format: "email" },
      financeTeamEmails: { type: "string", description: "Comma-separated list of finance team emails" },
      slackChannel: { type: "string", description: "Slack channel for close notifications (e.g. #month-end-close)" },
      companyProfile: { type: "string", description: "Brief description of company: industry, size, key systems (ERP, billing, payroll)" },
      openItemsFromLastClose: { type: "string", description: "Any carry-forward open items from prior period (optional)" },
      estimatedRevenue: { type: "number", description: "Estimated gross revenue for the period in EUR (for materiality)" },
    },
    required: ["closingPeriod", "periodEndDate", "closingDeadline", "controllerEmail", "cfoEmail", "companyProfile"],
  },
  steps: [
    {
      id: "generate_close_checklist",
      name: "AI Close Checklist Generation",
      type: "claude_task",
      description: "Claude generates a tailored month-end close checklist",
      config: {
        model: "claude-sonnet-4-6",
        systemPrompt: `You are an expert financial controller AI that helps companies close their books efficiently.
Generate a comprehensive, prioritized month-end close checklist tailored to the company profile.
Cover all standard close activities: revenue recognition, accruals, prepayments, fixed assets, bank reconciliation, intercompany eliminations, payroll, tax provisions, and reporting.
Sequence tasks by dependency and assign priority (P1=must complete, P2=high, P3=nice-to-have).

Respond strictly with JSON:
{
  "checklistItems": [
    {
      "id": string,
      "category": "Revenue" | "AP/AR" | "Payroll" | "Fixed Assets" | "Tax" | "Banking" | "Reporting" | "Compliance",
      "priority": "P1" | "P2" | "P3",
      "task": string,
      "estimatedHours": number,
      "responsibleRole": string,
      "dependency": string | null,
      "notes": string
    }
  ],
  "totalEstimatedHours": number,
  "criticalPath": string[],
  "riskAreas": string[],
  "closeSummary": string
}`,
        userPromptTemplate: `Generate a month-end close checklist for:

Period: {{input.closingPeriod}} (ends {{input.periodEndDate}})
Close Deadline: {{input.closingDeadline}}
Company Profile: {{input.companyProfile}}
Estimated Revenue: €{{input.estimatedRevenue}}

{{#if input.openItemsFromLastClose}}
Open items from last close:
{{input.openItemsFromLastClose}}
{{/if}}`,
        outputKey: "close_checklist",
      },
    },
    {
      id: "post_checklist_to_slack",
      name: "Post Close Checklist to Slack",
      type: "tool_call",
      description: "Post the prioritized checklist to the finance team Slack channel",
      dependsOn: ["generate_close_checklist"],
      config: {
        tool: "slack",
        action: "send_message",
        channel: "#month-end-close",
        messageTemplate: `📊 *Month-End Close Started: {{input.closingPeriod}}*

Target close date: *{{input.closingDeadline}}*
Estimated total effort: {{stepOutputs.close_checklist.totalEstimatedHours}} hours

*Critical Path Items:*
{{#each stepOutputs.close_checklist.criticalPath}}• {{this}}
{{/each}}

*Risk Areas:*
{{#each stepOutputs.close_checklist.riskAreas}}⚠️ {{this}}
{{/each}}

Full checklist sent to controller. Good luck team! 🚀`,
        outputKey: "slack_checklist_post",
      },
    },
    {
      id: "controller_review",
      name: "Controller Close Review",
      type: "human_approval",
      description: "Controller confirms all checklist items are complete and period is ready to close",
      dependsOn: ["generate_close_checklist"],
      config: {
        title: "Month-End Close Review: {{input.closingPeriod}}",
        descriptionTemplate: `**Month-End Close: {{input.closingPeriod}}**

Period End: {{input.periodEndDate}}
Close Deadline: {{input.closingDeadline}}
Estimated Revenue: €{{input.estimatedRevenue}}

---
**AI-Generated Close Checklist**

{{stepOutputs.close_checklist.closeSummary}}

**Critical Path:**
{{#each stepOutputs.close_checklist.criticalPath}}- {{this}}
{{/each}}

**Risk Areas to Watch:**
{{#each stepOutputs.close_checklist.riskAreas}}- {{this}}
{{/each}}

**Total Estimated Hours:** {{stepOutputs.close_checklist.totalEstimatedHours}}h

Please confirm all P1 and P2 checklist items are complete before approving.`,
        assignToTemplate: "{{input.controllerEmail}}",
        contextKeys: ["close_checklist"],
        expiresInHours: 96,
        outputKey: "controller_sign_off",
      },
    },
    {
      id: "cfo_final_close",
      name: "CFO Final Period Close",
      type: "human_approval",
      description: "CFO final sign-off to lock the period",
      dependsOn: ["controller_review"],
      config: {
        title: "[CFO Sign-Off] {{input.closingPeriod}} Period Close",
        descriptionTemplate: `**Final Period Close Approval: {{input.closingPeriod}}**

Controller has signed off. Please review and approve to lock the accounting period.

**Close Summary:**
{{stepOutputs.close_checklist.closeSummary}}

**Controller Notes:** {{stepOutputs.controller_sign_off.comment}}

**Estimated Revenue for Period:** €{{input.estimatedRevenue}}

Once approved, the period will be locked and financial statements will be generated.`,
        assignToTemplate: "{{input.cfoEmail}}",
        contextKeys: ["close_checklist", "controller_sign_off"],
        expiresInHours: 48,
        outputKey: "cfo_close_approval",
      },
    },
    {
      id: "notify_period_closed",
      name: "Notify Period Closed",
      type: "tool_call",
      description: "Send close confirmation to all stakeholders",
      dependsOn: ["cfo_final_close"],
      config: {
        tool: "email",
        from: "finance@nexus-workflows.com",
        toTemplate: "{{input.financeTeamEmails}}",
        subject: "✓ Period Closed: {{input.closingPeriod}}",
        bodyTemplate: `Hi Finance Team,

The {{input.closingPeriod}} accounting period has been officially closed and locked.

Period: {{input.closingPeriod}}
Close Date: {{input.periodEndDate}}
Completed by: {{input.closingDeadline}}

CFO approved and period is now locked. Financial statements are ready for distribution.

Close Summary:
{{stepOutputs.close_checklist.closeSummary}}

Thank you all for your work on this month-end close.

Finance Operations`,
        isHtml: false,
        outputKey: "close_notification",
      },
    },
  ],
  outputMapping: {
    period: "input.closingPeriod",
    totalHours: "stepOutputs.close_checklist.totalEstimatedHours",
    controllerDecision: "stepOutputs.controller_sign_off.decision",
    cfoDecision: "stepOutputs.cfo_close_approval.decision",
  },
  defaultFailurePolicy: "stop_all",
};
