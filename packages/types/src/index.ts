// ============================================================================
// Nexus Platform - Shared TypeScript Types
// ============================================================================

// ----------------------------------------------------------------------------
// Organization & User
// ----------------------------------------------------------------------------

export type SubscriptionPlan = "free" | "starter" | "growth" | "enterprise";
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete";

export interface Organization {
  id: string;
  name: string;
  clerkOrgId: string;
  stripeCustomerId: string | null;
  stripePriceId: string | null;
  subscriptionStatus: SubscriptionStatus;
  plan: SubscriptionPlan;
  seats: number;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = "owner" | "admin" | "member" | "viewer";

export interface User {
  id: string;
  clerkUserId: string;
  email: string;
  name: string | null;
  organizationId: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

// ----------------------------------------------------------------------------
// Workflow Definition
// ----------------------------------------------------------------------------

export type StepType =
  | "claude_task"
  | "tool_call"
  | "human_approval"
  | "condition"
  | "loop";

export type FailurePolicy = "stop_all" | "continue" | "retry";

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: StepType;
  description?: string;
  dependsOn?: string[]; // IDs of steps that must complete before this one
  config: StepConfig;
  retryConfig?: RetryConfig;
  failurePolicy?: FailurePolicy;
  timeoutMs?: number;
  condition?: string; // JSONPath or JS expression to conditionally skip this step
}

// ----------------------------------------------------------------------------
// Step Configs
// ----------------------------------------------------------------------------

export interface ClaudeTaskConfig {
  model?: string; // defaults to claude-sonnet-4-6
  systemPrompt: string;
  userPromptTemplate: string; // Handlebars template with {{stepOutputs.stepId.field}} syntax
  maxTokens?: number;
  temperature?: number;
  outputKey: string; // Key under which to store the output in context
}

export type ToolCallConfig =
  | SlackToolConfig
  | EmailToolConfig
  | HttpToolConfig
  | GoogleWorkspaceToolConfig
  | CrmToolConfig;

export interface SlackToolConfig {
  tool: "slack";
  action: "send_message" | "send_dm" | "create_channel";
  channel?: string;
  userId?: string;
  messageTemplate: string;
  outputKey: string;
}

export interface EmailToolConfig {
  tool: "email";
  from: string;
  toTemplate: string; // template string, e.g., "{{input.requesterEmail}}"
  subject: string;
  bodyTemplate: string;
  isHtml?: boolean;
  outputKey: string;
}

export interface HttpToolConfig {
  tool: "http";
  urlTemplate: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headersTemplate?: Record<string, string>;
  bodyTemplate?: string;
  outputKey: string;
  expectedStatusCodes?: number[];
}

export type GoogleWorkspaceAction =
  | "sheets.append"
  | "sheets.read"
  | "docs.create"
  | "docs.append"
  | "drive.upload"
  | "drive.list";

export interface GoogleWorkspaceToolConfig {
  tool: "google_workspace";
  action: GoogleWorkspaceAction;
  spreadsheetId?: string;
  documentId?: string;
  folderId?: string;
  /** Sheet range, e.g. "Sheet1!A:E" */
  range?: string;
  /** Template for cell values (JSON array of arrays) */
  valuesTemplate?: string;
  /** Template for doc content */
  contentTemplate?: string;
  titleTemplate?: string;
  mimeType?: string;
  outputKey: string;
}

export type CrmAction =
  | "create_contact"
  | "update_contact"
  | "create_deal"
  | "update_deal"
  | "create_note"
  | "search_contacts";

export interface CrmToolConfig {
  tool: "crm";
  provider: "hubspot" | "salesforce";
  action: CrmAction;
  /** Handlebars template for the CRM record payload (JSON) */
  payloadTemplate: string;
  /** Optional: contact/deal ID template for update actions */
  recordIdTemplate?: string;
  outputKey: string;
}

export interface HumanApprovalConfig {
  title: string;
  descriptionTemplate: string;
  assignToTemplate: string; // email or user ID template
  contextKeys?: string[]; // which context keys to include in the approval request
  expiresInHours?: number;
  outputKey: string;
}

export interface ConditionConfig {
  expression: string; // JSONPath boolean expression
  trueBranch: string; // step ID to jump to if true
  falseBranch?: string; // step ID to jump to if false (or end)
}

export interface LoopConfig {
  iterateOver: string; // JSONPath to array in context
  itemKey: string; // key to use for each item in context during iteration
  steps: WorkflowStep[];
  maxIterations?: number;
  outputKey: string;
}

export type StepConfig =
  | ClaudeTaskConfig
  | ToolCallConfig
  | HumanApprovalConfig
  | ConditionConfig
  | LoopConfig;

// ----------------------------------------------------------------------------
// Workflow Definition
// ----------------------------------------------------------------------------

export interface WorkflowDefinition {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  definition: WorkflowDefinitionBody;
  isTemplate: boolean;
  isActive: boolean;
  version: number;
  createdBy: string; // User ID
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowDefinitionBody {
  steps: WorkflowStep[];
  inputSchema?: JsonSchema; // JSON Schema for the workflow's expected input
  outputMapping?: Record<string, string>; // Final output key -> step output path
  defaultFailurePolicy?: FailurePolicy;
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface JsonSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  format?: string;
}

// ----------------------------------------------------------------------------
// Workflow Execution
// ----------------------------------------------------------------------------

export type ExecutionStatus =
  | "pending"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "canceled";

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  orgId: string;
  status: ExecutionStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  currentStepId: string | null;
  context: Record<string, unknown>; // accumulated step outputs
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type StepExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "waiting_approval";

export interface StepExecution {
  id: string;
  executionId: string;
  stepId: string;
  stepName: string;
  status: StepExecutionStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  retryCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

// ----------------------------------------------------------------------------
// Human Approval
// ----------------------------------------------------------------------------

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export interface HumanApprovalRequest {
  id: string;
  executionId: string;
  stepId: string;
  assignedTo: string; // email
  title: string;
  description: string;
  context: Record<string, unknown>;
  status: ApprovalStatus;
  response: ApprovalResponse | null;
  respondedAt: Date | null;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface ApprovalResponse {
  decision: "approved" | "rejected";
  comment?: string;
  respondedBy: string; // user email or ID
  additionalData?: Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// Tools
// ----------------------------------------------------------------------------

export interface SlackTool {
  type: "slack";
  sendMessage(params: {
    channel: string;
    text: string;
    blocks?: unknown[];
  }): Promise<{ ts: string; channel: string }>;
  sendDm(params: {
    userId: string;
    text: string;
  }): Promise<{ ts: string; channel: string }>;
}

export interface EmailTool {
  type: "email";
  send(params: {
    from: string;
    to: string | string[];
    subject: string;
    body: string;
    isHtml?: boolean;
  }): Promise<{ messageId: string }>;
}

export interface HttpTool {
  type: "http";
  request(params: {
    url: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<{ status: number; data: unknown; headers: Record<string, string> }>;
}

export type Tool = SlackTool | EmailTool | HttpTool;

// ----------------------------------------------------------------------------
// Audit Log
// ----------------------------------------------------------------------------

export type AuditAction =
  | "workflow.created"
  | "workflow.updated"
  | "workflow.deleted"
  | "execution.started"
  | "execution.completed"
  | "execution.failed"
  | "execution.canceled"
  | "approval.requested"
  | "approval.responded"
  | "billing.subscription_created"
  | "billing.subscription_updated"
  | "billing.subscription_canceled";

export interface AuditLog {
  id: string;
  orgId: string;
  userId: string | null;
  executionId: string | null;
  action: AuditAction;
  resource: string;
  resourceId: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

// ----------------------------------------------------------------------------
// API Request/Response types
// ----------------------------------------------------------------------------

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  definition: WorkflowDefinitionBody;
  isTemplate?: boolean;
}

export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  definition?: WorkflowDefinitionBody;
  isTemplate?: boolean;
  isActive?: boolean;
}

export interface StartExecutionRequest {
  workflowId: string;
  input: Record<string, unknown>;
}

export interface ApprovalResponseRequest {
  decision: "approved" | "rejected";
  comment?: string;
  additionalData?: Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// Billing
// ----------------------------------------------------------------------------

export interface PlanLimits {
  workflowsPerMonth: number;      // -1 = unlimited
  executionsPerMonth: number;     // -1 = unlimited (workflow runs)
  aiStepsIncluded: number;        // AI workflow steps included; -1 = unlimited
  teamMembers: number;            // -1 = unlimited
  templates: number;              // max templates; -1 = all templates
  customIntegrations: boolean;
  prioritySupport: boolean;
  sso: boolean;
  soc2Pack: boolean;
  humanInLoop: boolean;
  dedicatedOnboarding: boolean;
  overagePriceCentsPerStep: number | null; // EUR cents per AI step above limit (null = no overage)
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  free: {
    workflowsPerMonth: 3,
    executionsPerMonth: 50,
    aiStepsIncluded: 100,
    teamMembers: 1,
    templates: 1,
    customIntegrations: false,
    prioritySupport: false,
    sso: false,
    soc2Pack: false,
    humanInLoop: false,
    dedicatedOnboarding: false,
    overagePriceCentsPerStep: null,
  },
  starter: {
    workflowsPerMonth: -1,        // unlimited workflows
    executionsPerMonth: 1000,     // 1,000 workflow runs/month
    aiStepsIncluded: 1000,        // included AI steps
    teamMembers: 5,
    templates: 3,                 // 3 templates
    customIntegrations: false,    // Google Workspace + email only
    prioritySupport: false,
    sso: false,
    soc2Pack: false,
    humanInLoop: false,
    dedicatedOnboarding: false,
    overagePriceCentsPerStep: 4,  // €0.04 per AI step above limit
  },
  growth: {
    // Displayed as "Professional" (€999/mo)
    workflowsPerMonth: -1,
    executionsPerMonth: -1,       // unlimited runs
    aiStepsIncluded: -1,          // unlimited AI steps
    teamMembers: 25,
    templates: -1,                // all templates
    customIntegrations: true,     // HubSpot + full integrations
    prioritySupport: true,
    sso: false,
    soc2Pack: false,
    humanInLoop: false,
    dedicatedOnboarding: false,
    overagePriceCentsPerStep: null,
  },
  enterprise: {
    workflowsPerMonth: -1,
    executionsPerMonth: -1,
    aiStepsIncluded: -1,
    teamMembers: -1,
    templates: -1,
    customIntegrations: true,
    prioritySupport: true,
    sso: true,
    soc2Pack: true,
    humanInLoop: true,
    dedicatedOnboarding: true,
    overagePriceCentsPerStep: null,
  },
};
