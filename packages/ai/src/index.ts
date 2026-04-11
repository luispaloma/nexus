// ----------------------------------------------------------------------------
// @nexus/ai - Package Exports
// ----------------------------------------------------------------------------

// Core executor
export { WorkflowExecutor } from "./executor";
export type { ExecutionContext, ExecutorConfig, ExecutionResult } from "./executor";

// Tools
export { SlackToolImpl } from "./tools/slack";
export type { SendMessageParams, SendDmParams, MessageResult } from "./tools/slack";

export { EmailToolImpl } from "./tools/email";
export type { SendEmailParams, SendEmailResult, EmailAttachment } from "./tools/email";

export { HttpToolImpl } from "./tools/http";
export type { HttpRequestParams, HttpResponse } from "./tools/http";

export { GoogleWorkspaceTool } from "./tools/google-workspace";
export { CrmTool } from "./tools/crm";
export type { CrmToolConfig as CrmToolImplConfig, CrmProvider, CrmResult } from "./tools/crm";
export type {
  GoogleWorkspaceConfig,
  AppendSheetParams,
  ReadSheetParams,
  CreateDocParams,
  UpdateDocParams,
  UploadFileToDriveParams,
  GoogleWorkspaceResult,
} from "./tools/google-workspace";

// Workflow templates
export { invoiceApprovalTemplate } from "./templates/invoice-approval";
export { contractReviewTemplate } from "./templates/contract-review";
export { leadQualificationTemplate } from "./templates/lead-qualification";
export { expenseReportApprovalTemplate } from "./templates/expense-report-approval";
export { vendorPaymentApprovalTemplate } from "./templates/vendor-payment-approval";
export { budgetRequestApprovalTemplate } from "./templates/budget-request-approval";
export { monthEndCloseTemplate } from "./templates/month-end-close";
export { arFollowupTemplate } from "./templates/ar-followup";
export { outboundSdrTemplate } from "./templates/outbound-sdr";

// Template registry
export const WORKFLOW_TEMPLATES = {
  "invoice-approval": {
    name: "Invoice Approval",
    description: "AI-powered invoice review and approval workflow with risk assessment",
    category: "finance",
  },
  "contract-review": {
    name: "Contract Review",
    description: "Comprehensive AI contract analysis with legal counsel approval gate",
    category: "legal",
  },
  "lead-qualification": {
    name: "Lead Qualification",
    description: "BANT-based lead scoring and automated routing for sales teams",
    category: "sales",
  },
  "expense-report-approval": {
    name: "Expense Report Approval",
    description: "Policy-compliant AI expense review with manager approval and accounting notification",
    category: "finance",
  },
  "vendor-payment-approval": {
    name: "Vendor Payment Approval",
    description: "Fraud-detection AI validates payments, routes to CFO for large amounts, and triggers ERP",
    category: "finance",
  },
  "budget-request-approval": {
    name: "Budget Request Approval",
    description: "AI-scored budget requests with department head and CFO approval gates",
    category: "finance",
  },
  "month-end-close": {
    name: "Month-End Financial Close",
    description: "AI-generated close checklist, controller review, and CFO period lock workflow",
    category: "finance",
  },
  "ar-followup": {
    name: "Accounts Receivable Follow-Up",
    description: "AI-drafted collection emails with urgency-based tone, escalation routing, and legal referral",
    category: "finance",
  },
  "outbound-sdr": {
    name: "Outbound AI SDR Agent",
    description: "AI ICP scoring, personalised cold email drafting, CRM logging, and SDR qualification review",
    category: "sales",
  },
} as const;

export type TemplateKey = keyof typeof WORKFLOW_TEMPLATES;
