import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { prisma } from "@nexus/db";
import type { UserRole } from "@nexus/types";

// ----------------------------------------------------------------------------
// Extend Express Request with auth context
// ----------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      nexusUser?: {
        id: string;
        clerkUserId: string;
        email: string;
        name: string | null;
        organizationId: string;
        role: UserRole;
      };
      nexusOrgId?: string;
    }
  }
}

// ----------------------------------------------------------------------------
// requireAuth middleware
// Validates Clerk session and loads Nexus user/org from DB
// ----------------------------------------------------------------------------

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);

  if (!auth.userId) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Authentication required",
      statusCode: 401,
    });
    return;
  }

  // Load user from DB asynchronously
  loadNexusUser(auth.userId, req, res, next);
}

async function loadNexusUser(
  clerkUserId: string,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { clerkUserId },
    });

    if (!user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not found in Nexus. Please complete onboarding.",
        statusCode: 401,
      });
      return;
    }

    req.nexusUser = {
      id: user.id,
      clerkUserId: user.clerkUserId,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId,
      role: user.role as UserRole,
    };
    req.nexusOrgId = user.organizationId;

    next();
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------------------
// requireRole middleware factory
// Use after requireAuth
// ----------------------------------------------------------------------------

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.nexusUser) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
        statusCode: 401,
      });
      return;
    }

    if (!allowedRoles.includes(req.nexusUser.role)) {
      res.status(403).json({
        error: "Forbidden",
        message: `This action requires one of the following roles: ${allowedRoles.join(", ")}`,
        statusCode: 403,
      });
      return;
    }

    next();
  };
}

// ----------------------------------------------------------------------------
// requireSubscription middleware
// Blocks access if subscription is not active
// ----------------------------------------------------------------------------

export async function requireActiveSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.nexusOrgId) {
    res.status(401).json({ error: "Unauthorized", message: "Not authenticated", statusCode: 401 });
    return;
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.nexusOrgId },
      select: { subscriptionStatus: true, plan: true },
    });

    if (!org) {
      res.status(401).json({ error: "Unauthorized", message: "Organization not found", statusCode: 401 });
      return;
    }

    const activeStatuses = ["active", "trialing"];
    if (!activeStatuses.includes(org.subscriptionStatus)) {
      res.status(402).json({
        error: "PaymentRequired",
        message: "Your subscription has expired. Please update your billing information.",
        statusCode: 402,
        details: { subscriptionStatus: org.subscriptionStatus },
      });
      return;
    }

    next();
  } catch (err) {
    next(err);
  }
}
