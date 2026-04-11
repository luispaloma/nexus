import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import { prisma } from "@nexus/db";

export const onboardingRouter = Router();

// ----------------------------------------------------------------------------
// Validation schemas
// ----------------------------------------------------------------------------

const OnboardingSchema = z.object({
  organizationName: z.string().min(1).max(200),
  userFullName: z.string().min(1).max(200),
  userEmail: z.string().email(),
  industry: z.string().max(100).optional(),
  teamSize: z.enum(["solo", "2-10", "11-50", "51-200", "200+"]).optional(),
  primaryUseCase: z.string().max(500).optional(),
  firstWorkflowTemplate: z.string().optional(), // e.g. "invoice-approval"
});

// ----------------------------------------------------------------------------
// POST /api/onboarding/complete
// Creates or updates Organization and User records after Clerk signup
// Called from the onboarding wizard after a new user signs up
// ----------------------------------------------------------------------------

onboardingRouter.post(
  "/complete",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuth(req);

      if (!auth.userId) {
        res.status(401).json({ error: "Unauthorized", message: "Authentication required", statusCode: 401 });
        return;
      }

      const parsed = OnboardingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "ValidationError",
          message: "Invalid onboarding data",
          statusCode: 400,
          details: parsed.error.flatten(),
        });
        return;
      }

      const {
        organizationName,
        userFullName,
        userEmail,
        industry,
        teamSize,
        primaryUseCase,
        firstWorkflowTemplate,
      } = parsed.data;

      // Check if user already exists (idempotent — re-entry allowed)
      let user = await prisma.user.findUnique({ where: { clerkUserId: auth.userId } });

      if (user) {
        // Already onboarded — just update name if changed
        user = await prisma.user.update({
          where: { id: user.id },
          data: { name: userFullName },
        });

        res.json({
          data: {
            alreadyOnboarded: true,
            userId: user.id,
            organizationId: user.organizationId,
          },
        });
        return;
      }

      // Create org + user in a transaction
      const { organization, newUser } = await prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            name: organizationName,
            clerkOrgId: auth.orgId ?? `nexus_org_${auth.userId}`,
            stripeCustomerId: null,
            stripePriceId: null,
            subscriptionStatus: "trialing",
            plan: "free",
            seats: 1,
          },
        });

        const newUser = await tx.user.create({
          data: {
            clerkUserId: auth.userId,
            email: userEmail,
            name: userFullName,
            organizationId: organization.id,
            role: "owner",
          },
        });

        // Log onboarding
        await tx.auditLog.create({
          data: {
            orgId: organization.id,
            userId: newUser.id,
            action: "billing.subscription_created",
            resource: "Organization",
            resourceId: organization.id,
            details: {
              plan: "free",
              industry: industry ?? null,
              teamSize: teamSize ?? null,
              primaryUseCase: primaryUseCase ?? null,
              firstWorkflowTemplate: firstWorkflowTemplate ?? null,
            },
          },
        });

        return { organization, newUser };
      });

      // If user chose a starter template, create it as their first workflow
      if (firstWorkflowTemplate) {
        try {
          const { WORKFLOW_TEMPLATES } = await import("@nexus/ai");
          if (firstWorkflowTemplate in WORKFLOW_TEMPLATES) {
            const templateModule = await import("@nexus/ai");
            const templateKey = firstWorkflowTemplate
              .split("-")
              .map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1)))
              .join("") + "Template";

            const template = (templateModule as Record<string, unknown>)[templateKey];
            if (template) {
              const meta = WORKFLOW_TEMPLATES[firstWorkflowTemplate as keyof typeof WORKFLOW_TEMPLATES];
              await prisma.workflowDefinition.create({
                data: {
                  orgId: organization.id,
                  name: meta.name,
                  description: `${meta.description} (from template)`,
                  definition: template as unknown as import("@prisma/client").Prisma.InputJsonValue,
                  isTemplate: false,
                  isActive: true,
                  createdBy: newUser.id,
                },
              });
            }
          }
        } catch {
          // Non-fatal: don't fail onboarding if template setup fails
        }
      }

      res.status(201).json({
        data: {
          userId: newUser.id,
          organizationId: organization.id,
          organizationName: organization.name,
          plan: organization.plan,
          message: "Onboarding complete! Welcome to Nexus.",
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// GET /api/onboarding/status
// Check if the current Clerk user has completed onboarding
// ----------------------------------------------------------------------------

onboardingRouter.get(
  "/status",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuth(req);

      if (!auth.userId) {
        res.status(401).json({ error: "Unauthorized", message: "Authentication required", statusCode: 401 });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { clerkUserId: auth.userId },
        select: {
          id: true,
          organizationId: true,
          role: true,
          organization: { select: { name: true, plan: true, subscriptionStatus: true } },
        },
      });

      res.json({
        data: {
          onboarded: !!user,
          userId: user?.id ?? null,
          organizationId: user?.organizationId ?? null,
          organizationName: user?.organization?.name ?? null,
          plan: user?.organization?.plan ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
