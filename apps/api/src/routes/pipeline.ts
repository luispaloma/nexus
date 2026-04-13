import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "@nexus/db";
import { requireAuth } from "../middleware/auth";
import { PROSPECT_LIST } from "../sdr/prospect-list";

export const pipelineRouter = Router();

// ---------------------------------------------------------------------------
// POST /api/pipeline/seed
//
// One-time import of the 500-prospect list into PipelineContact.
// Idempotent: skips contacts with matching email already in the table.
// ---------------------------------------------------------------------------

pipelineRouter.post(
  "/seed",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.pipelineContact.findMany({
        select: { contactEmail: true },
      });
      const existingEmails = new Set(existing.map((c) => c.contactEmail));

      const toInsert = PROSPECT_LIST.filter(
        (p) => !existingEmails.has(p.prospectEmail)
      ).map((p) => ({
        contactName: p.prospectName,
        contactEmail: p.prospectEmail,
        contactTitle: p.prospectTitle,
        companyName: p.companyName,
        vertical: p.companyIndustry,
        companySize: p.companySize,
        outreachDate: new Date(),
        updatedAt: new Date(),
      }));

      if (toInsert.length === 0) {
        return res.json({ inserted: 0, message: "All prospects already seeded." });
      }

      await prisma.pipelineContact.createMany({ data: toInsert });
      res.json({ inserted: toInsert.length });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/pipeline
//
// Returns paginated pipeline contacts.
// Query params: page, pageSize, vertical, replyStatus, q (search)
// ---------------------------------------------------------------------------

pipelineRouter.get(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, parseInt(req.query.pageSize as string) || 50);
      const vertical = req.query.vertical as string | undefined;
      const replyStatus = req.query.replyStatus as string | undefined;
      const q = req.query.q as string | undefined;

      const where: Record<string, unknown> = {};
      if (vertical) where.vertical = vertical;
      if (replyStatus) where.replyStatus = replyStatus;
      if (q) {
        where.OR = [
          { contactName: { contains: q, mode: "insensitive" } },
          { companyName: { contains: q, mode: "insensitive" } },
          { contactEmail: { contains: q, mode: "insensitive" } },
        ];
      }

      const [data, total] = await Promise.all([
        prisma.pipelineContact.findMany({
          where,
          orderBy: [{ replyStatus: "asc" }, { outreachDate: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.pipelineContact.count({ where }),
      ]);

      res.json({ data, total, page, pageSize, hasMore: page * pageSize < total });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/pipeline/stats
//
// Returns a breakdown of contacts by replyStatus and vertical.
// ---------------------------------------------------------------------------

pipelineRouter.get(
  "/stats",
  requireAuth,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [byStatus, byVertical] = await Promise.all([
        prisma.pipelineContact.groupBy({
          by: ["replyStatus"],
          _count: { id: true },
        }),
        prisma.pipelineContact.groupBy({
          by: ["vertical"],
          _count: { id: true },
        }),
      ]);

      res.json({
        byStatus: Object.fromEntries(byStatus.map((r) => [r.replyStatus, r._count.id])),
        byVertical: Object.fromEntries(byVertical.map((r) => [r.vertical, r._count.id])),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /api/pipeline/:id
//
// Update replyStatus, nextAction, nextActionDue, or notes for a contact.
// ---------------------------------------------------------------------------

pipelineRouter.patch(
  "/:id",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { replyStatus, nextAction, nextActionDue, notes } = req.body as {
        replyStatus?: string;
        nextAction?: string;
        nextActionDue?: string;
        notes?: string;
      };

      const updated = await prisma.pipelineContact.update({
        where: { id: req.params.id },
        data: {
          ...(replyStatus !== undefined && { replyStatus: replyStatus as never }),
          ...(nextAction !== undefined && { nextAction }),
          ...(nextActionDue !== undefined && {
            nextActionDue: nextActionDue ? new Date(nextActionDue) : null,
          }),
          ...(notes !== undefined && { notes }),
        },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);
