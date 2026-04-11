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

// Workflow templates
export { invoiceApprovalTemplate } from "./templates/invoice-approval";
export { contractReviewTemplate } from "./templates/contract-review";
export { leadQualificationTemplate } from "./templates/lead-qualification";

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
} as const;

export type TemplateKey = keyof typeof WORKFLOW_TEMPLATES;
