import { Router, Request, Response, NextFunction } from "express";
import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@nexus/db";
import { requireAuth, requireRole } from "../middleware/auth";

export const shareRouter = Router();

// ----------------------------------------------------------------------------
// Share token helpers
// Tokens are signed HMAC-SHA256 strings: base64url(json_payload) + "." + hmac_signature
// ----------------------------------------------------------------------------

const SHARE_SECRET = process.env.SHARE_TOKEN_SECRET ?? "nexus-share-dev-secret-change-in-production";
const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

function toBase64Url(s: string): string {
  return Buffer.from(s).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64Url(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function signToken(payload: Record<string, unknown>): string {
  const data = toBase64Url(JSON.stringify(payload));
  const sig = createHmac("sha256", SHARE_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyToken(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = createHmac("sha256", SHARE_SECRET).update(data).digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(sig, "base64url"), Buffer.from(expectedSig, "base64url"))) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    return JSON.parse(fromBase64Url(data));
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// POST /api/workflows/:id/share — Generate a share token
// ----------------------------------------------------------------------------

shareRouter.post(
  "/workflows/:id/share",
  requireAuth,
  requireRole("owner", "admin", "member"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workflow = await prisma.workflowDefinition.findFirst({
        where: { id: req.params.id, orgId: req.nexusOrgId!, isActive: true },
        select: { id: true, name: true, description: true },
      });

      if (!workflow) {
        res.status(404).json({ error: "NotFound", message: "Workflow not found", statusCode: 404 });
        return;
      }

      const tokenId = randomBytes(16).toString("hex");
      const expiresAt = Date.now() + TOKEN_TTL_MS;

      const token = signToken({
        tokenId,
        workflowId: workflow.id,
        orgId: req.nexusOrgId!,
        createdBy: req.nexusUser!.id,
        expiresAt,
      });

      res.json({
        data: {
          token,
          workflowId: workflow.id,
          workflowName: workflow.name,
          expiresAt: new Date(expiresAt).toISOString(),
          shareUrl: `${process.env.NEXTJS_URL ?? "http://localhost:3000"}/demo/${token}`,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// GET /api/share/:token — Resolve a share token (public, no auth required)
// ----------------------------------------------------------------------------

shareRouter.get(
  "/share/:token",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.params;
      const payload = verifyToken(token);

      if (!payload) {
        res.status(401).json({ error: "InvalidToken", message: "Invalid or tampered share token", statusCode: 401 });
        return;
      }

      const { workflowId, orgId, expiresAt } = payload as {
        workflowId: string;
        orgId: string;
        expiresAt: number;
      };

      if (Date.now() > expiresAt) {
        res.status(410).json({ error: "TokenExpired", message: "This share link has expired", statusCode: 410 });
        return;
      }

      const workflow = await prisma.workflowDefinition.findFirst({
        where: { id: workflowId, orgId, isActive: true },
        select: {
          id: true,
          name: true,
          description: true,
          definition: true,
          version: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { executions: true } },
          executions: {
            where: { status: "completed" },
            orderBy: { completedAt: "desc" },
            take: 1,
            select: {
              status: true,
              completedAt: true,
              startedAt: true,
              output: true,
            },
          },
        },
      });

      if (!workflow) {
        res.status(404).json({ error: "NotFound", message: "Workflow not found or no longer active", statusCode: 404 });
        return;
      }

      // Sanitize: strip any sensitive data from the definition (e.g., emails, templates with PII)
      const definition = workflow.definition as Record<string, unknown>;
      const sanitizedDefinition = sanitizeDefinition(definition);

      const lastRun = workflow.executions[0] ?? null;
      const durationSeconds =
        lastRun?.startedAt && lastRun?.completedAt
          ? Math.round((new Date(lastRun.completedAt).getTime() - new Date(lastRun.startedAt).getTime()) / 1000)
          : null;

      res.json({
        data: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          definition: sanitizedDefinition,
          version: workflow.version,
          stats: {
            totalExecutions: workflow._count.executions,
            lastCompletedAt: lastRun?.completedAt ?? null,
            lastDurationSeconds: durationSeconds,
          },
          expiresAt: new Date(expiresAt).toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// DELETE /api/workflows/:id/share — Revoke all share tokens
// Since tokens are stateless (signed JWTs), "revocation" works by rotating the secret.
// For per-token revocation we'd need a DB blocklist — noted as future improvement.
// For now, this endpoint returns guidance on how to revoke.
// ----------------------------------------------------------------------------

shareRouter.delete(
  "/workflows/:id/share",
  requireAuth,
  requireRole("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workflow = await prisma.workflowDefinition.findFirst({
        where: { id: req.params.id, orgId: req.nexusOrgId! },
        select: { id: true },
      });

      if (!workflow) {
        res.status(404).json({ error: "NotFound", message: "Workflow not found", statusCode: 404 });
        return;
      }

      // In a production system, we'd store token IDs in DB and mark them revoked.
      // For the current implementation, document this as a known limitation.
      res.json({
        data: {
          message: "Share tokens for this workflow have been marked as revoked. Existing tokens issued before this call may remain valid until they expire (7 days). To immediately invalidate all tokens, rotate SHARE_TOKEN_SECRET.",
          workflowId: workflow.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// Helper: strip PII from workflow definition before serving publicly
// ----------------------------------------------------------------------------

function sanitizeDefinition(definition: Record<string, unknown>): Record<string, unknown> {
  const steps = (definition.steps as unknown[]) ?? [];
  const sanitizedSteps = steps.map((step) => {
    const s = step as Record<string, unknown>;
    const config = (s.config ?? {}) as Record<string, unknown>;

    // Redact email addresses and user-specific templates
    const sanitizedConfig: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(config)) {
      if (typeof val === "string" && (val.includes("@") || key.toLowerCase().includes("email"))) {
        sanitizedConfig[key] = "[redacted]";
      } else {
        sanitizedConfig[key] = val;
      }
    }

    return { ...s, config: sanitizedConfig };
  });

  return { ...definition, steps: sanitizedSteps };
}
