import Anthropic from "@anthropic-ai/sdk";
import Handlebars from "handlebars";
import { prisma } from "@nexus/db";
import type {
  WorkflowStep,
  WorkflowDefinitionBody,
  StepConfig,
  ClaudeTaskConfig,
  SlackToolConfig,
  EmailToolConfig,
  HttpToolConfig,
  HumanApprovalConfig,
  ConditionConfig,
  LoopConfig,
  ApprovalResponse,
  RetryConfig,
  FailurePolicy,
} from "@nexus/types";
import { SlackToolImpl } from "./tools/slack";
import { EmailToolImpl } from "./tools/email";
import { HttpToolImpl } from "./tools/http";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface ExecutionContext {
  input: Record<string, unknown>;
  stepOutputs: Record<string, unknown>;
  loopItem?: unknown;
  loopIndex?: number;
}

export interface ExecutorConfig {
  anthropicApiKey: string;
  slackToken?: string;
  resendApiKey?: string;
  defaultModel?: string;
}

export interface ExecutionResult {
  executionId: string;
  status: "completed" | "failed" | "waiting_approval";
  output?: Record<string, unknown>;
  error?: string;
}

// ----------------------------------------------------------------------------
// Retry utility
// ----------------------------------------------------------------------------

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < config.maxRetries) {
        const delayMs = Math.min(
          config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelayMs
        );
        onRetry?.(attempt + 1, lastError);
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30_000,
};

// ----------------------------------------------------------------------------
// Template rendering
// ----------------------------------------------------------------------------

function renderTemplate(template: string, context: ExecutionContext): string {
  try {
    const compiled = Handlebars.compile(template, { noEscape: true });
    return compiled({
      input: context.input,
      stepOutputs: context.stepOutputs,
      loopItem: context.loopItem,
      loopIndex: context.loopIndex,
    });
  } catch (err) {
    throw new Error(
      `Template rendering failed: ${err instanceof Error ? err.message : String(err)}\nTemplate: ${template}`
    );
  }
}

function resolveJsonPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ----------------------------------------------------------------------------
// WorkflowExecutor
// ----------------------------------------------------------------------------

export class WorkflowExecutor {
  private anthropic: Anthropic;
  private slack: SlackToolImpl | null;
  private email: EmailToolImpl | null;
  private http: HttpToolImpl;
  private defaultModel: string;

  constructor(config: ExecutorConfig) {
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    this.slack = config.slackToken
      ? new SlackToolImpl(config.slackToken)
      : null;
    this.email = config.resendApiKey
      ? new EmailToolImpl(config.resendApiKey)
      : null;
    this.http = new HttpToolImpl();
    this.defaultModel = config.defaultModel ?? "claude-sonnet-4-6";
  }

  // --------------------------------------------------------------------------
  // Public: Start a new execution
  // --------------------------------------------------------------------------

  async execute(
    workflowId: string,
    input: Record<string, unknown>,
    orgId: string,
    triggeredByUserId?: string
  ): Promise<ExecutionResult> {
    // Load workflow definition
    const workflow = await prisma.workflowDefinition.findFirst({
      where: { id: workflowId, orgId, isActive: true },
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found or not active`);
    }

    const definition = workflow.definition as unknown as WorkflowDefinitionBody;

    // Create execution record
    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId,
        orgId,
        status: "running",
        input,
        context: { stepOutputs: {} },
        startedAt: new Date(),
      },
    });

    // Audit log
    await this.createAuditLog(orgId, triggeredByUserId ?? null, execution.id, {
      action: "execution.started",
      resource: "WorkflowExecution",
      resourceId: execution.id,
      details: { workflowId, workflowName: workflow.name },
    });

    try {
      const result = await this.runSteps(
        execution.id,
        definition,
        input,
        orgId
      );
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: "failed",
          error,
          completedAt: new Date(),
        },
      });
      await this.createAuditLog(orgId, triggeredByUserId ?? null, execution.id, {
        action: "execution.failed",
        resource: "WorkflowExecution",
        resourceId: execution.id,
        details: { error },
      });
      return { executionId: execution.id, status: "failed", error };
    }
  }

  // --------------------------------------------------------------------------
  // Public: Resume after human approval
  // --------------------------------------------------------------------------

  async resumeAfterApproval(
    executionId: string,
    approvalResponse: ApprovalResponse,
    orgId: string
  ): Promise<ExecutionResult> {
    const execution = await prisma.workflowExecution.findFirst({
      where: { id: executionId, orgId, status: "waiting_approval" },
    });

    if (!execution) {
      throw new Error(`Execution ${executionId} not found or not waiting for approval`);
    }

    // Find the pending approval request
    const approvalRequest = await prisma.humanApprovalRequest.findFirst({
      where: { executionId, status: "pending" },
      orderBy: { createdAt: "desc" },
    });

    if (!approvalRequest) {
      throw new Error(`No pending approval request found for execution ${executionId}`);
    }

    // Check expiry
    if (approvalRequest.expiresAt && approvalRequest.expiresAt < new Date()) {
      await prisma.humanApprovalRequest.update({
        where: { id: approvalRequest.id },
        data: { status: "expired" },
      });
      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: { status: "failed", error: "Approval request expired", completedAt: new Date() },
      });
      return { executionId, status: "failed", error: "Approval request expired" };
    }

    // Record the approval response
    await prisma.humanApprovalRequest.update({
      where: { id: approvalRequest.id },
      data: {
        status: approvalResponse.decision === "approved" ? "approved" : "rejected",
        response: approvalResponse as unknown as import("@prisma/client").Prisma.InputJsonValue,
        respondedAt: new Date(),
      },
    });

    await this.createAuditLog(orgId, null, executionId, {
      action: "approval.responded",
      resource: "HumanApprovalRequest",
      resourceId: approvalRequest.id,
      details: { decision: approvalResponse.decision, stepId: approvalRequest.stepId },
    });

    if (approvalResponse.decision === "rejected") {
      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: { status: "failed", error: "Approval rejected", completedAt: new Date() },
      });
      return { executionId, status: "failed", error: "Approval rejected" };
    }

    // Resume execution from the step after the approval step
    const workflow = await prisma.workflowDefinition.findUnique({
      where: { id: execution.workflowId },
    });

    if (!workflow) {
      throw new Error("Workflow not found");
    }

    const definition = workflow.definition as unknown as WorkflowDefinitionBody;
    const context = execution.context as unknown as { stepOutputs: Record<string, unknown> };

    // Add approval response to context
    const approvalStep = definition.steps.find(
      (s) => s.id === approvalRequest.stepId
    );
    if (approvalStep) {
      const approvalConfig = approvalStep.config as HumanApprovalConfig;
      context.stepOutputs[approvalConfig.outputKey] = {
        approved: true,
        decision: approvalResponse.decision,
        comment: approvalResponse.comment,
        additionalData: approvalResponse.additionalData,
      };
    }

    // Update execution status back to running
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: "running",
        context: context as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });

    // Find where to resume (next step after the approval step)
    const approvalStepIndex = definition.steps.findIndex(
      (s) => s.id === approvalRequest.stepId
    );
    const remainingSteps = definition.steps.slice(approvalStepIndex + 1);

    return await this.runSteps(
      executionId,
      { ...definition, steps: remainingSteps },
      execution.input as Record<string, unknown>,
      orgId,
      context.stepOutputs
    );
  }

  // --------------------------------------------------------------------------
  // Internal: Run workflow steps
  // --------------------------------------------------------------------------

  private async runSteps(
    executionId: string,
    definition: WorkflowDefinitionBody,
    input: Record<string, unknown>,
    orgId: string,
    initialStepOutputs: Record<string, unknown> = {}
  ): Promise<ExecutionResult> {
    const context: ExecutionContext = {
      input,
      stepOutputs: { ...initialStepOutputs },
    };

    const failurePolicy =
      definition.defaultFailurePolicy ?? "stop_all";

    for (const step of definition.steps) {
      // Check if step has a condition
      if (step.condition) {
        const conditionResult = this.evaluateCondition(step.condition, context);
        if (!conditionResult) {
          await this.markStepSkipped(executionId, step);
          continue;
        }
      }

      // Check dependencies
      if (step.dependsOn && step.dependsOn.length > 0) {
        const missingDeps = step.dependsOn.filter(
          (depId) => !(depId in context.stepOutputs)
        );
        if (missingDeps.length > 0) {
          throw new Error(
            `Step ${step.id} depends on steps that have not completed: ${missingDeps.join(", ")}`
          );
        }
      }

      // Update current step in execution
      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: { currentStepId: step.id },
      });

      const stepResult = await this.executeStep(
        executionId,
        step,
        context,
        orgId
      );

      if (stepResult.status === "waiting_approval") {
        // Persist context so we can resume
        await prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            status: "waiting_approval",
            context: { stepOutputs: context.stepOutputs } as unknown as import("@prisma/client").Prisma.InputJsonValue,
          },
        });
        return { executionId, status: "waiting_approval" };
      }

      if (stepResult.status === "failed") {
        const stepFailurePolicy = step.failurePolicy ?? failurePolicy;
        if (stepFailurePolicy === "stop_all") {
          await prisma.workflowExecution.update({
            where: { id: executionId },
            data: {
              status: "failed",
              error: stepResult.error,
              completedAt: new Date(),
            },
          });
          return {
            executionId,
            status: "failed",
            error: stepResult.error,
          };
        }
        // continue or retry already handled inside executeStep
      }

      if (stepResult.output !== undefined) {
        // Merge step output into context under the outputKey
        Object.assign(context.stepOutputs, stepResult.output);
      }

      // Persist updated context
      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          context: { stepOutputs: context.stepOutputs } as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      });
    }

    // Build final output
    const finalOutput: Record<string, unknown> = {};
    if (definition.outputMapping) {
      for (const [key, path] of Object.entries(definition.outputMapping)) {
        finalOutput[key] = resolveJsonPath(
          { stepOutputs: context.stepOutputs, input },
          path
        );
      }
    } else {
      // Default: return all step outputs
      Object.assign(finalOutput, context.stepOutputs);
    }

    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: "completed",
        output: finalOutput as unknown as import("@prisma/client").Prisma.InputJsonValue,
        completedAt: new Date(),
        currentStepId: null,
      },
    });

    await this.createAuditLog(orgId, null, executionId, {
      action: "execution.completed",
      resource: "WorkflowExecution",
      resourceId: executionId,
      details: { outputKeys: Object.keys(finalOutput) },
    });

    return { executionId, status: "completed", output: finalOutput };
  }

  // --------------------------------------------------------------------------
  // Internal: Execute a single step with retry support
  // --------------------------------------------------------------------------

  private async executeStep(
    executionId: string,
    step: WorkflowStep,
    context: ExecutionContext,
    orgId: string
  ): Promise<{
    status: "completed" | "failed" | "waiting_approval";
    output?: Record<string, unknown>;
    error?: string;
  }> {
    const retryConfig = step.retryConfig ?? DEFAULT_RETRY_CONFIG;
    const stepPolicy: FailurePolicy = step.failurePolicy ?? "stop_all";

    // Create step execution record
    const stepExecution = await prisma.stepExecution.create({
      data: {
        executionId,
        stepId: step.id,
        stepName: step.name,
        status: "running",
        input: context as unknown as import("@prisma/client").Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });

    const maxAttempts =
      stepPolicy === "retry" ? retryConfig.maxRetries + 1 : 1;

    let lastError: string | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const delayMs = Math.min(
          retryConfig.initialDelayMs *
            Math.pow(retryConfig.backoffMultiplier, attempt - 1),
          retryConfig.maxDelayMs
        );
        await sleep(delayMs);
        await prisma.stepExecution.update({
          where: { id: stepExecution.id },
          data: { retryCount: attempt },
        });
      }

      try {
        const result = await this.dispatchStep(step, context, executionId, orgId);

        if (result.status === "waiting_approval") {
          await prisma.stepExecution.update({
            where: { id: stepExecution.id },
            data: { status: "waiting_approval" },
          });
          return result;
        }

        // Success
        await prisma.stepExecution.update({
          where: { id: stepExecution.id },
          data: {
            status: "completed",
            output: result.output as unknown as import("@prisma/client").Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);

        if (attempt < maxAttempts - 1) {
          // Will retry
          continue;
        }

        // Final failure
        await prisma.stepExecution.update({
          where: { id: stepExecution.id },
          data: {
            status: "failed",
            error: lastError,
            completedAt: new Date(),
          },
        });

        if (stepPolicy === "continue") {
          return { status: "completed", output: {} };
        }

        return { status: "failed", error: lastError };
      }
    }

    return { status: "failed", error: lastError };
  }

  // --------------------------------------------------------------------------
  // Internal: Dispatch to the right step handler
  // --------------------------------------------------------------------------

  private async dispatchStep(
    step: WorkflowStep,
    context: ExecutionContext,
    executionId: string,
    orgId: string
  ): Promise<{
    status: "completed" | "failed" | "waiting_approval";
    output?: Record<string, unknown>;
    error?: string;
  }> {
    switch (step.type) {
      case "claude_task":
        return this.executeClaudeTask(step, context);

      case "tool_call":
        return this.executeToolCall(step, context);

      case "human_approval":
        return this.executeHumanApproval(step, context, executionId, orgId);

      case "condition":
        return this.executeCondition(step, context);

      case "loop":
        return this.executeLoop(step, context, executionId, orgId);

      default:
        throw new Error(`Unknown step type: ${(step as WorkflowStep).type}`);
    }
  }

  // --------------------------------------------------------------------------
  // Claude Task
  // --------------------------------------------------------------------------

  private async executeClaudeTask(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<{ status: "completed"; output: Record<string, unknown> }> {
    const config = step.config as ClaudeTaskConfig;

    const systemPrompt = renderTemplate(config.systemPrompt, context);
    const userPrompt = renderTemplate(config.userPromptTemplate, context);

    // Build context summary of prior step outputs for Claude
    const priorOutputsSummary =
      Object.keys(context.stepOutputs).length > 0
        ? `\n\n## Prior Step Outputs\n${JSON.stringify(context.stepOutputs, null, 2)}`
        : "";

    const message = await this.anthropic.messages.create({
      model: config.model ?? this.defaultModel,
      max_tokens: config.maxTokens ?? 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `${userPrompt}${priorOutputsSummary}`,
        },
      ],
      ...(config.temperature !== undefined && {
        // temperature is not directly supported in all versions; use with caution
      }),
    });

    const textContent = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n");

    // Try to parse JSON output, fall back to plain text
    let parsedOutput: unknown;
    try {
      // Look for JSON in code blocks first
      const jsonMatch = textContent.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        parsedOutput = JSON.parse(jsonMatch[1]);
      } else {
        parsedOutput = JSON.parse(textContent);
      }
    } catch {
      parsedOutput = textContent;
    }

    return {
      status: "completed",
      output: {
        [config.outputKey]: parsedOutput,
        [`${config.outputKey}_raw`]: textContent,
        [`${config.outputKey}_usage`]: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      },
    };
  }

  // --------------------------------------------------------------------------
  // Tool Call
  // --------------------------------------------------------------------------

  private async executeToolCall(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<{ status: "completed"; output: Record<string, unknown> }> {
    const config = step.config as SlackToolConfig | EmailToolConfig | HttpToolConfig;

    switch (config.tool) {
      case "slack": {
        if (!this.slack) {
          throw new Error("Slack tool not configured (missing SLACK_TOKEN)");
        }
        const slackConfig = config as SlackToolConfig;
        const message = renderTemplate(slackConfig.messageTemplate, context);

        let result: { ts: string; channel: string };
        if (slackConfig.action === "send_dm" && slackConfig.userId) {
          const userId = renderTemplate(slackConfig.userId, context);
          result = await this.slack.sendDm({ userId, text: message });
        } else {
          const channel = renderTemplate(slackConfig.channel ?? "", context);
          result = await this.slack.sendMessage({ channel, text: message });
        }

        return {
          status: "completed",
          output: { [slackConfig.outputKey]: result },
        };
      }

      case "email": {
        if (!this.email) {
          throw new Error("Email tool not configured (missing RESEND_API_KEY)");
        }
        const emailConfig = config as EmailToolConfig;
        const to = renderTemplate(emailConfig.toTemplate, context);
        const subject = renderTemplate(emailConfig.subject, context);
        const body = renderTemplate(emailConfig.bodyTemplate, context);

        const result = await this.email.send({
          from: emailConfig.from,
          to,
          subject,
          body,
          isHtml: emailConfig.isHtml,
        });

        return {
          status: "completed",
          output: { [emailConfig.outputKey]: result },
        };
      }

      case "http": {
        const httpConfig = config as HttpToolConfig;
        const url = renderTemplate(httpConfig.urlTemplate, context);
        const headers: Record<string, string> = {};
        if (httpConfig.headersTemplate) {
          for (const [k, v] of Object.entries(httpConfig.headersTemplate)) {
            headers[k] = renderTemplate(v, context);
          }
        }
        const body = httpConfig.bodyTemplate
          ? renderTemplate(httpConfig.bodyTemplate, context)
          : undefined;

        const result = await this.http.request({
          url,
          method: httpConfig.method,
          headers,
          body: body ? JSON.parse(body) : undefined,
        });

        const expectedStatuses = httpConfig.expectedStatusCodes ?? [200, 201, 204];
        if (!expectedStatuses.includes(result.status)) {
          throw new Error(
            `HTTP request to ${url} returned unexpected status ${result.status}`
          );
        }

        return {
          status: "completed",
          output: { [httpConfig.outputKey]: result },
        };
      }

      default:
        throw new Error(`Unknown tool: ${(config as { tool: string }).tool}`);
    }
  }

  // --------------------------------------------------------------------------
  // Human Approval
  // --------------------------------------------------------------------------

  private async executeHumanApproval(
    step: WorkflowStep,
    context: ExecutionContext,
    executionId: string,
    orgId: string
  ): Promise<{
    status: "waiting_approval";
    output?: Record<string, unknown>;
  }> {
    const config = step.config as HumanApprovalConfig;

    const description = renderTemplate(config.descriptionTemplate, context);
    const assignedTo = renderTemplate(config.assignToTemplate, context);

    // Build context subset for the approval request
    const approvalContext: Record<string, unknown> = { input: context.input };
    if (config.contextKeys) {
      for (const key of config.contextKeys) {
        if (key in context.stepOutputs) {
          approvalContext[key] = context.stepOutputs[key];
        }
      }
    }

    const expiresAt = config.expiresInHours
      ? new Date(Date.now() + config.expiresInHours * 3600 * 1000)
      : null;

    await prisma.humanApprovalRequest.create({
      data: {
        executionId,
        stepId: step.id,
        assignedTo,
        title: config.title,
        description,
        context: approvalContext as unknown as import("@prisma/client").Prisma.InputJsonValue,
        status: "pending",
        expiresAt,
      },
    });

    await this.createAuditLog(orgId, null, executionId, {
      action: "approval.requested",
      resource: "HumanApprovalRequest",
      resourceId: step.id,
      details: { assignedTo, title: config.title, stepId: step.id },
    });

    // Send email notification to the approver so they know action is needed
    if (this.email) {
      const appUrl = process.env.NEXTJS_URL ?? "http://localhost:3000";
      const approvalInboxUrl = `${appUrl}/approvals`;
      const emailBody = `Hi,

A workflow is waiting for your approval.

**${config.title}**

${description.slice(0, 500)}${description.length > 500 ? "\n\n[...truncated — view full details in Nexus]" : ""}

Please review and approve or reject this request in your Nexus approval inbox:
${approvalInboxUrl}

${expiresAt ? `This approval request expires on ${expiresAt.toLocaleString()}.` : ""}

—
Nexus Workflow Automation`;

      try {
        await this.email.send({
          from: process.env.EMAIL_FROM ?? "approvals@nexus-workflows.com",
          to: assignedTo,
          subject: `[Action Required] ${config.title}`,
          body: emailBody,
          isHtml: false,
        });
      } catch (emailErr) {
        // Non-fatal: log but don't fail the workflow step
        console.error("Failed to send approval notification email:", emailErr);
      }
    }

    return { status: "waiting_approval" };
  }

  // --------------------------------------------------------------------------
  // Condition
  // --------------------------------------------------------------------------

  private executeCondition(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<{ status: "completed"; output: Record<string, unknown> }> {
    const config = step.config as ConditionConfig;
    const result = this.evaluateCondition(config.expression, context);

    return Promise.resolve({
      status: "completed",
      output: {
        [`${step.id}_condition_result`]: result,
        [`${step.id}_branch`]: result ? config.trueBranch : config.falseBranch ?? null,
      },
    });
  }

  // --------------------------------------------------------------------------
  // Loop
  // --------------------------------------------------------------------------

  private async executeLoop(
    step: WorkflowStep,
    context: ExecutionContext,
    executionId: string,
    orgId: string
  ): Promise<{ status: "completed"; output: Record<string, unknown> }> {
    const config = step.config as LoopConfig;

    const items = resolveJsonPath(
      { stepOutputs: context.stepOutputs, input: context.input },
      config.iterateOver
    );

    if (!Array.isArray(items)) {
      throw new Error(
        `Loop iterateOver path "${config.iterateOver}" did not resolve to an array`
      );
    }

    const maxIter = config.maxIterations ?? 100;
    const results: unknown[] = [];

    for (let i = 0; i < Math.min(items.length, maxIter); i++) {
      const iterContext: ExecutionContext = {
        ...context,
        stepOutputs: { ...context.stepOutputs },
        loopItem: items[i],
        loopIndex: i,
      };

      // Create a sub-definition for the loop body
      const loopDefinition: WorkflowDefinitionBody = {
        steps: config.steps,
        defaultFailurePolicy: "stop_all",
      };

      // Run loop body steps inline (they share the same execution record)
      for (const loopStep of loopDefinition.steps) {
        const loopStepResult = await this.executeStep(
          executionId,
          loopStep,
          iterContext,
          orgId
        );
        if (loopStepResult.status === "failed") {
          throw new Error(
            `Loop step ${loopStep.id} failed on iteration ${i}: ${loopStepResult.error}`
          );
        }
        if (loopStepResult.output) {
          Object.assign(iterContext.stepOutputs, loopStepResult.output);
        }
      }

      results.push({ ...iterContext.stepOutputs });
    }

    return {
      status: "completed",
      output: { [config.outputKey]: results },
    };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private evaluateCondition(expression: string, context: ExecutionContext): boolean {
    try {
      // Simple JSONPath-like expression evaluation
      // Supports: stepOutputs.key.subkey > value, etc.
      // For production, consider using a proper expression evaluator like cel-js
      const fn = new Function(
        "input",
        "stepOutputs",
        "loopItem",
        "loopIndex",
        `"use strict"; return Boolean(${expression});`
      );
      return fn(
        context.input,
        context.stepOutputs,
        context.loopItem,
        context.loopIndex
      );
    } catch (err) {
      throw new Error(
        `Failed to evaluate condition "${expression}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async markStepSkipped(
    executionId: string,
    step: WorkflowStep
  ): Promise<void> {
    await prisma.stepExecution.create({
      data: {
        executionId,
        stepId: step.id,
        stepName: step.name,
        status: "skipped",
        input: {},
      },
    });
  }

  private async createAuditLog(
    orgId: string,
    userId: string | null,
    executionId: string | null,
    params: {
      action: string;
      resource: string;
      resourceId: string;
      details: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          orgId,
          userId,
          executionId,
          action: params.action,
          resource: params.resource,
          resourceId: params.resourceId,
          details: params.details as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      });
    } catch {
      // Audit log failures should not crash the workflow
      console.error("Failed to write audit log:", params);
    }
  }
}
