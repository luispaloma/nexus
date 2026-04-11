import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "@nexus/db";
import {
  invoiceApprovalTemplate,
  contractReviewTemplate,
  leadQualificationTemplate,
  expenseReportApprovalTemplate,
  vendorPaymentApprovalTemplate,
  budgetRequestApprovalTemplate,
  monthEndCloseTemplate,
  arFollowupTemplate,
  outboundSdrTemplate,
  WORKFLOW_TEMPLATES,
} from "@nexus/ai";
import { requireAuth, requireRole, requireActiveSubscription } from "../middleware/auth";
import type { WorkflowDefinitionBody } from "@nexus/types";

export const workflowsRouter = Router();

// All workflow routes require auth
workflowsRouter.use(requireAuth);

// ----------------------------------------------------------------------------
// Validation schemas
// ----------------------------------------------------------------------------

const WorkflowStepSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(["claude_task", "tool_call", "human_approval", "condition", "loop"]),
    description: z.string().optional(),
    dependsOn: z.array(z.string()).optional(),
    config: z.record(z.unknown()),
    retryConfig: z
      .object({
        maxRetries: z.number().int().min(0).max(10),
        initialDelayMs: z.number().min(100),
        backoffMultiplier: z.number().min(1),
        maxDelayMs: z.number().max(300_000),
      })
      .optional(),
    failurePolicy: z.enum(["stop_all", "continue", "retry"]).optional(),
    timeoutMs: z.number().positive().optional(),
    condition: z.string().optional(),
  })
);

const WorkflowDefinitionBodySchema = z.object({
  steps: z.array(WorkflowStepSchema).min(1, "Workflow must have at least one step"),
  inputSchema: z.record(z.unknown()).optional(),
  outputMapping: z.record(z.string()).optional(),
  defaultFailurePolicy: z.enum(["stop_all", "continue", "retry"]).optional(),
});

const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  definition: WorkflowDefinitionBodySchema,
  isTemplate: z.boolean().optional().default(false),
});

const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  definition: WorkflowDefinitionBodySchema.optional(),
  isTemplate: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// ----------------------------------------------------------------------------
// GET /api/workflows - List workflows for org
// ----------------------------------------------------------------------------

workflowsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.nexusOrgId!;
    const page = Math.max(1, parseInt(req.query.page as string ?? "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string ?? "20")));
    const isTemplate = req.query.isTemplate === "true" ? true : req.query.isTemplate === "false" ? false : undefined;
    const isActive = req.query.isActive !== "false";
    const search = req.query.search as string | undefined;

    const where = {
      orgId,
      ...(isTemplate !== undefined && { isTemplate }),
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [workflows, total] = await Promise.all([
      prisma.workflowDefinition.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          description: true,
          isTemplate: true,
          isActive: true,
          version: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { executions: true } },
        },
      }),
      prisma.workflowDefinition.count({ where }),
    ]);

    res.json({
      data: workflows,
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
// GET /api/workflows/templates - List built-in templates
// ----------------------------------------------------------------------------

workflowsRouter.get("/templates", (_req: Request, res: Response) => {
  const templates = Object.entries(WORKFLOW_TEMPLATES).map(([key, meta]) => ({
    key,
    ...meta,
  }));
  res.json({ data: templates });
});

// ----------------------------------------------------------------------------
// GET /api/workflows/templates/:key - Get a specific template definition
// ----------------------------------------------------------------------------

workflowsRouter.get("/templates/:key", (req: Request, res: Response) => {
  const { key } = req.params;
  const templateMap: Record<string, WorkflowDefinitionBody> = {
    "invoice-approval": invoiceApprovalTemplate,
    "contract-review": contractReviewTemplate,
    "lead-qualification": leadQualificationTemplate,
    "expense-report-approval": expenseReportApprovalTemplate,
    "vendor-payment-approval": vendorPaymentApprovalTemplate,
    "budget-request-approval": budgetRequestApprovalTemplate,
    "month-end-close": monthEndCloseTemplate,
    "ar-followup": arFollowupTemplate,
    "outbound-sdr": outboundSdrTemplate,
  };

  const template = templateMap[key];
  if (!template) {
    res.status(404).json({ error: "NotFound", message: `Template '${key}' not found`, statusCode: 404 });
    return;
  }

  res.json({ data: template });
});

// ----------------------------------------------------------------------------
// GET /api/workflows/:id - Get a single workflow
// ----------------------------------------------------------------------------

workflowsRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workflow = await prisma.workflowDefinition.findFirst({
      where: { id: req.params.id, orgId: req.nexusOrgId! },
    });

    if (!workflow) {
      res.status(404).json({ error: "NotFound", message: "Workflow not found", statusCode: 404 });
      return;
    }

    res.json({ data: workflow });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// POST /api/workflows - Create a workflow
// ----------------------------------------------------------------------------

workflowsRouter.post(
  "/",
  requireActiveSubscription,
  requireRole("owner", "admin", "member"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateWorkflowSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "ValidationError",
          message: "Invalid workflow data",
          statusCode: 400,
          details: parsed.error.flatten(),
        });
        return;
      }

      const { name, description, definition, isTemplate } = parsed.data;

      const workflow = await prisma.workflowDefinition.create({
        data: {
          orgId: req.nexusOrgId!,
          name,
          description,
          definition: definition as unknown as import("@prisma/client").Prisma.InputJsonValue,
          isTemplate: isTemplate ?? false,
          createdBy: req.nexusUser!.id,
        },
      });

      res.status(201).json({ data: workflow });
    } catch (err) {
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// PUT /api/workflows/:id - Update a workflow
// ----------------------------------------------------------------------------

workflowsRouter.put(
  "/:id",
  requireRole("owner", "admin", "member"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = UpdateWorkflowSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "ValidationError",
          message: "Invalid workflow data",
          statusCode: 400,
          details: parsed.error.flatten(),
        });
        return;
      }

      const existing = await prisma.workflowDefinition.findFirst({
        where: { id: req.params.id, orgId: req.nexusOrgId! },
      });

      if (!existing) {
        res.status(404).json({ error: "NotFound", message: "Workflow not found", statusCode: 404 });
        return;
      }

      const { definition, ...rest } = parsed.data;

      const updated = await prisma.workflowDefinition.update({
        where: { id: req.params.id },
        data: {
          ...rest,
          ...(definition && {
            definition: definition as unknown as import("@prisma/client").Prisma.InputJsonValue,
            version: { increment: 1 },
          }),
        },
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// DELETE /api/workflows/:id - Delete a workflow
// ----------------------------------------------------------------------------

workflowsRouter.delete(
  "/:id",
  requireRole("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.workflowDefinition.findFirst({
        where: { id: req.params.id, orgId: req.nexusOrgId! },
      });

      if (!existing) {
        res.status(404).json({ error: "NotFound", message: "Workflow not found", statusCode: 404 });
        return;
      }

      // Soft delete: set isActive = false
      await prisma.workflowDefinition.update({
        where: { id: req.params.id },
        data: { isActive: false },
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);
