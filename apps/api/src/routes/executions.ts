import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "@nexus/db";
import { WorkflowExecutor } from "@nexus/ai";
import { requireAuth, requireRole, requireActiveSubscription } from "../middleware/auth";

export const executionsRouter = Router();

executionsRouter.use(requireAuth);

// ----------------------------------------------------------------------------
// Executor singleton (initialized from env)
// ----------------------------------------------------------------------------

function getExecutor(): WorkflowExecutor {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }
  return new WorkflowExecutor({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    slackToken: process.env.SLACK_TOKEN,
    resendApiKey: process.env.RESEND_API_KEY,
    defaultModel: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
  });
}

// ----------------------------------------------------------------------------
// Validation schemas
// ----------------------------------------------------------------------------

const StartExecutionSchema = z.object({
  workflowId: z.string().min(1),
  input: z.record(z.unknown()).default({}),
});

const ApprovalResponseSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().max(2000).optional(),
  additionalData: z.record(z.unknown()).optional(),
});

// ----------------------------------------------------------------------------
// GET /api/executions - List executions for org
// ----------------------------------------------------------------------------

executionsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.nexusOrgId!;
    const page = Math.max(1, parseInt(req.query.page as string ?? "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string ?? "20")));
    const status = req.query.status as string | undefined;
    const workflowId = req.query.workflowId as string | undefined;

    const validStatuses = ["pending", "running", "waiting_approval", "completed", "failed", "canceled"];

    const where = {
      orgId,
      ...(status && validStatuses.includes(status) && { status: status as import("@prisma/client").ExecutionStatus }),
      ...(workflowId && { workflowId }),
    };

    const [executions, total] = await Promise.all([
      prisma.workflowExecution.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          workflow: { select: { name: true, id: true } },
          _count: { select: { stepExecutions: true, approvalRequests: true } },
        },
      }),
      prisma.workflowExecution.count({ where }),
    ]);

    res.json({
      data: executions,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// GET /api/executions/:id - Get execution detail with step executions
// ----------------------------------------------------------------------------

executionsRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const execution = await prisma.workflowExecution.findFirst({
      where: { id: req.params.id, orgId: req.nexusOrgId! },
      include: {
        workflow: { select: { name: true, id: true, definition: true } },
        stepExecutions: { orderBy: { createdAt: "asc" } },
        approvalRequests: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!execution) {
      res.status(404).json({ error: "NotFound", message: "Execution not found", statusCode: 404 });
      return;
    }

    res.json({ data: execution });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// POST /api/executions - Start a new execution
// ----------------------------------------------------------------------------

executionsRouter.post(
  "/",
  requireActiveSubscription,
  requireRole("owner", "admin", "member"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = StartExecutionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "ValidationError",
          message: "Invalid execution request",
          statusCode: 400,
          details: parsed.error.flatten(),
        });
        return;
      }

      const { workflowId, input } = parsed.data;
      const orgId = req.nexusOrgId!;

      // Verify workflow exists and belongs to org
      const workflow = await prisma.workflowDefinition.findFirst({
        where: { id: workflowId, orgId, isActive: true },
      });

      if (!workflow) {
        res.status(404).json({
          error: "NotFound",
          message: "Workflow not found or not active",
          statusCode: 404,
        });
        return;
      }

      const executor = getExecutor();

      // Run execution asynchronously and respond immediately with execution ID
      const executionRecord = await prisma.workflowExecution.create({
        data: {
          workflowId,
          orgId,
          status: "pending",
          input: input as unknown as import("@prisma/client").Prisma.InputJsonValue,
          context: { stepOutputs: {} },
        },
      });

      // Fire and forget - execution runs in background
      setImmediate(async () => {
        try {
          await executor.execute(workflowId, input, orgId, req.nexusUser!.id);
        } catch (err) {
          console.error(`Execution ${executionRecord.id} failed with unhandled error:`, err);
        }
      });

      res.status(202).json({
        data: {
          executionId: executionRecord.id,
          status: "pending",
          message: "Workflow execution started",
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /api/executions/:id/approve - Respond to a human approval request
// ----------------------------------------------------------------------------

executionsRouter.post(
  "/:id/approve",
  requireRole("owner", "admin", "member"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ApprovalResponseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "ValidationError",
          message: "Invalid approval response",
          statusCode: 400,
          details: parsed.error.flatten(),
        });
        return;
      }

      const execution = await prisma.workflowExecution.findFirst({
        where: { id: req.params.id, orgId: req.nexusOrgId!, status: "waiting_approval" },
      });

      if (!execution) {
        res.status(404).json({
          error: "NotFound",
          message: "Execution not found or not waiting for approval",
          statusCode: 404,
        });
        return;
      }

      // Verify the current user is the assigned approver
      const approvalRequest = await prisma.humanApprovalRequest.findFirst({
        where: { executionId: req.params.id, status: "pending" },
        orderBy: { createdAt: "desc" },
      });

      if (!approvalRequest) {
        res.status(404).json({
          error: "NotFound",
          message: "No pending approval request found",
          statusCode: 404,
        });
        return;
      }

      if (
        approvalRequest.assignedTo !== req.nexusUser!.email &&
        req.nexusUser!.role !== "owner" &&
        req.nexusUser!.role !== "admin"
      ) {
        res.status(403).json({
          error: "Forbidden",
          message: "You are not authorized to approve this request",
          statusCode: 403,
        });
        return;
      }

      const approvalResponse = {
        decision: parsed.data.decision,
        comment: parsed.data.comment,
        additionalData: parsed.data.additionalData,
        respondedBy: req.nexusUser!.email,
      };

      const executor = getExecutor();

      // Resume execution asynchronously
      setImmediate(async () => {
        try {
          await executor.resumeAfterApproval(
            req.params.id,
            approvalResponse,
            req.nexusOrgId!
          );
        } catch (err) {
          console.error(`Resumption of execution ${req.params.id} failed:`, err);
        }
      });

      res.json({
        data: {
          executionId: req.params.id,
          decision: parsed.data.decision,
          message: `Approval ${parsed.data.decision}. Workflow will ${parsed.data.decision === "approved" ? "continue" : "be stopped"}.`,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// DELETE /api/executions/:id - Cancel a running execution
// ----------------------------------------------------------------------------

executionsRouter.delete(
  "/:id",
  requireRole("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const execution = await prisma.workflowExecution.findFirst({
        where: {
          id: req.params.id,
          orgId: req.nexusOrgId!,
          status: { in: ["pending", "running", "waiting_approval"] },
        },
      });

      if (!execution) {
        res.status(404).json({
          error: "NotFound",
          message: "Execution not found or cannot be canceled in its current state",
          statusCode: 404,
        });
        return;
      }

      await prisma.workflowExecution.update({
        where: { id: req.params.id },
        data: {
          status: "canceled",
          completedAt: new Date(),
        },
      });

      // Also expire any pending approval requests
      await prisma.humanApprovalRequest.updateMany({
        where: { executionId: req.params.id, status: "pending" },
        data: { status: "expired" },
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// GET /api/executions/approvals/pending - Get pending approvals for current user
// ----------------------------------------------------------------------------

executionsRouter.get(
  "/approvals/pending",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = req.nexusUser!.email;
      const orgId = req.nexusOrgId!;

      const approvals = await prisma.humanApprovalRequest.findMany({
        where: {
          assignedTo: userEmail,
          status: "pending",
          execution: { orgId },
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        include: {
          execution: {
            select: {
              id: true,
              workflow: { select: { name: true } },
              status: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({ data: approvals });
    } catch (err) {
      next(err);
    }
  }
);
