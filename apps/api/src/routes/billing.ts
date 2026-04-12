import { Router, Request, Response, NextFunction } from "express";
import Stripe from "stripe";
import { z } from "zod";
import { prisma } from "@nexus/db";
import { requireAuth } from "../middleware/auth";

export const billingRouter = Router();

// ----------------------------------------------------------------------------
// Stripe client
// ----------------------------------------------------------------------------

function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY environment variable is required");
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16",
  });
}

// Price IDs (configure via env after running scripts/stripe-setup.ts)
const PRICE_IDS: Record<string, string> = {
  starter_monthly:       process.env.STRIPE_PRICE_STARTER_MONTHLY ?? "",
  starter_annual:        process.env.STRIPE_PRICE_STARTER_ANNUAL ?? "",
  starter_metered:       process.env.STRIPE_PRICE_STARTER_METERED ?? "",
  professional_monthly:  process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY ?? "",
  professional_annual:   process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL ?? "",
  enterprise_monthly:    process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY ?? "",
};

// ----------------------------------------------------------------------------
// Validation schemas
// ----------------------------------------------------------------------------

const CreateCheckoutSchema = z.object({
  priceId: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  quantity: z.number().int().min(1).max(1000).optional().default(1),
});

const RecordUsageSchema = z.object({
  quantity: z.number().int().min(1),
  timestamp: z.number().optional(),
  action: z.enum(["increment", "set"]).optional().default("increment"),
});

// ----------------------------------------------------------------------------
// GET /api/billing/plans - List available plans
// ----------------------------------------------------------------------------

billingRouter.get("/plans", (_req: Request, res: Response) => {
  res.json({
    data: [
      {
        id: "free",
        name: "Free",
        price: 0,
        currency: "eur",
        interval: null,
        features: [
          "3 workflows",
          "50 executions/month",
          "1 team member",
          "Community support",
        ],
        limits: {
          workflowsPerMonth: 3,
          executionsPerMonth: 50,
          aiStepsIncluded: 100,
          teamMembers: 1,
          templates: 1,
        },
      },
      {
        id: "starter",
        name: "Starter",
        price: 299,
        currency: "eur",
        interval: "month",
        priceId: PRICE_IDS.starter_monthly,
        annualPriceId: PRICE_IDS.starter_annual,
        annualPrice: 249,
        features: [
          "1,000 workflow runs/month",
          "3 templates",
          "5 team members",
          "Google Workspace + email integrations",
          "Email support",
          "Audit logs",
          "€0.04 per AI step above limit",
        ],
        limits: {
          workflowsPerMonth: -1,
          executionsPerMonth: 1000,
          aiStepsIncluded: 1000,
          teamMembers: 5,
          templates: 3,
        },
        overage: {
          pricePerStep: 0.04,
          currency: "eur",
        },
      },
      {
        id: "growth",
        name: "Professional",
        price: 999,
        currency: "eur",
        interval: "month",
        priceId: PRICE_IDS.professional_monthly,
        annualPriceId: PRICE_IDS.professional_annual,
        annualPrice: 849,
        features: [
          "Unlimited workflow runs",
          "All templates",
          "25 team members",
          "HubSpot + full integrations",
          "Priority support",
          "Advanced analytics",
          "SLA guarantee",
        ],
        limits: {
          workflowsPerMonth: -1,
          executionsPerMonth: -1,
          aiStepsIncluded: -1,
          teamMembers: 25,
          templates: -1,
        },
        popular: true,
      },
      {
        id: "enterprise",
        name: "Enterprise",
        price: 3500,
        currency: "eur",
        interval: "month",
        priceId: PRICE_IDS.enterprise_monthly,
        features: [
          "Unlimited everything",
          "Unlimited team members",
          "Custom SLAs",
          "SOC 2 compliance pack",
          "Human-in-loop workflows",
          "SSO/SAML",
          "Dedicated onboarding",
          "Custom AI models",
        ],
        limits: {
          workflowsPerMonth: -1,
          executionsPerMonth: -1,
          aiStepsIncluded: -1,
          teamMembers: -1,
          templates: -1,
        },
      },
    ],
  });
});

// ----------------------------------------------------------------------------
// GET /api/billing/subscription - Get current org subscription
// ----------------------------------------------------------------------------

billingRouter.get(
  "/subscription",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: req.nexusOrgId! },
        select: {
          plan: true,
          subscriptionStatus: true,
          stripeCustomerId: true,
          stripePriceId: true,
          stripeSubscriptionItemId: true,
          seats: true,
        },
      });

      if (!org) {
        res.status(404).json({ error: "NotFound", message: "Organization not found", statusCode: 404 });
        return;
      }

      let stripeSubscription = null;
      if (org.stripeCustomerId) {
        try {
          const stripe = getStripe();
          const subscriptions = await stripe.subscriptions.list({
            customer: org.stripeCustomerId,
            status: "all",
            limit: 1,
          });
          if (subscriptions.data.length > 0) {
            const sub = subscriptions.data[0];
            stripeSubscription = {
              id: sub.id,
              status: sub.status,
              currentPeriodEnd: new Date(sub.current_period_end * 1000),
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
            };
          }
        } catch {
          // Don't fail if Stripe lookup fails
        }
      }

      res.json({
        data: {
          ...org,
          stripeSubscription,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /api/billing/checkout - Create Stripe checkout session
// ----------------------------------------------------------------------------

billingRouter.post(
  "/checkout",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateCheckoutSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "ValidationError",
          message: "Invalid checkout request",
          statusCode: 400,
          details: parsed.error.flatten(),
        });
        return;
      }

      const stripe = getStripe();
      const { priceId, successUrl, cancelUrl, quantity } = parsed.data;
      const orgId = req.nexusOrgId!;

      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { stripeCustomerId: true, name: true },
      });

      if (!org) {
        res.status(404).json({ error: "NotFound", message: "Organization not found", statusCode: 404 });
        return;
      }

      // Create or retrieve Stripe customer
      let customerId = org.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: req.nexusUser!.email,
          name: org.name,
          metadata: {
            nexusOrgId: orgId,
            nexusUserId: req.nexusUser!.id,
          },
        });
        customerId = customer.id;
        await prisma.organization.update({
          where: { id: orgId },
          data: { stripeCustomerId: customerId },
        });
      }

      // Build line items — for Starter, include the metered overage price
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
        { price: priceId, quantity },
      ];

      const isStarterMonthly = priceId === PRICE_IDS.starter_monthly;
      const isStarterAnnual = priceId === PRICE_IDS.starter_annual;
      if ((isStarterMonthly || isStarterAnnual) && PRICE_IDS.starter_metered) {
        lineItems.push({ price: PRICE_IDS.starter_metered });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: lineItems,
        success_url: successUrl,
        cancel_url: cancelUrl,
        subscription_data: {
          metadata: { nexusOrgId: orgId },
        },
        allow_promotion_codes: true,
        billing_address_collection: "auto",
        currency: "eur",
        metadata: { nexusOrgId: orgId },
      });

      res.json({ data: { sessionId: session.id, url: session.url } });
    } catch (err) {
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /api/billing/portal - Create Stripe customer portal session
// ----------------------------------------------------------------------------

billingRouter.post(
  "/portal",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stripe = getStripe();
      const returnUrl = (req.body.returnUrl as string) ?? process.env.NEXTJS_URL ?? "http://localhost:3000";

      const org = await prisma.organization.findUnique({
        where: { id: req.nexusOrgId! },
        select: { stripeCustomerId: true },
      });

      if (!org?.stripeCustomerId) {
        res.status(400).json({
          error: "BadRequest",
          message: "No billing account found. Please subscribe to a plan first.",
          statusCode: 400,
        });
        return;
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: org.stripeCustomerId,
        return_url: returnUrl,
      });

      res.json({ data: { url: session.url } });
    } catch (err) {
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /api/billing/usage - Record metered AI step usage (Stripe usage records)
// Called by the workflow executor when an AI step completes on Starter plan.
// ----------------------------------------------------------------------------

billingRouter.post(
  "/usage",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = RecordUsageSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "ValidationError",
          message: "Invalid usage request",
          statusCode: 400,
          details: parsed.error.flatten(),
        });
        return;
      }

      const org = await prisma.organization.findUnique({
        where: { id: req.nexusOrgId! },
        select: {
          plan: true,
          stripeSubscriptionItemId: true,
        },
      });

      if (!org) {
        res.status(404).json({ error: "NotFound", message: "Organization not found", statusCode: 404 });
        return;
      }

      // Only Starter plan has metered overage pricing
      if (org.plan !== "starter" || !org.stripeSubscriptionItemId) {
        res.json({ data: { recorded: false, reason: "Plan does not use metered billing" } });
        return;
      }

      const stripe = getStripe();
      const { quantity, timestamp, action } = parsed.data;

      const usageRecord = await stripe.subscriptionItems.createUsageRecord(
        org.stripeSubscriptionItemId,
        {
          quantity,
          timestamp: timestamp ?? Math.floor(Date.now() / 1000),
          action,
        }
      );

      res.json({ data: { recorded: true, usageRecordId: usageRecord.id } });
    } catch (err) {
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /api/billing/webhook - Stripe webhook handler
// IMPORTANT: Uses raw body (mounted before JSON middleware in index.ts)
// ----------------------------------------------------------------------------

billingRouter.post(
  "/webhook",
  async (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      res.status(500).json({ error: "Webhook secret not configured" });
      return;
    }

    let event: Stripe.Event;

    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err) {
      console.error("Stripe webhook signature verification failed:", err);
      res.status(400).json({
        error: "WebhookError",
        message: `Webhook signature verification failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
      return;
    }

    try {
      await handleStripeEvent(event);
      res.json({ received: true });
    } catch (err) {
      console.error(`Error handling Stripe event ${event.type}:`, err);
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// Stripe event handlers
// ----------------------------------------------------------------------------

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription) {
        const orgId = session.metadata?.nexusOrgId;
        if (!orgId) return;

        const stripe = getStripe();
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );

        await updateOrgSubscription(orgId, subscription);
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = subscription.metadata?.nexusOrgId;

      if (!orgId) {
        // Try to find org by customer ID
        const org = await prisma.organization.findFirst({
          where: { stripeCustomerId: subscription.customer as string },
        });
        if (org) {
          await updateOrgSubscription(org.id, subscription);
        }
        return;
      }

      await updateOrgSubscription(orgId, subscription);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = subscription.metadata?.nexusOrgId;

      const where = orgId
        ? { id: orgId }
        : { stripeCustomerId: subscription.customer as string };

      await prisma.organization.updateMany({
        where,
        data: {
          subscriptionStatus: "canceled",
          plan: "free",
          stripePriceId: null,
          stripeSubscriptionItemId: null,
        },
      });
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        const org = await prisma.organization.findFirst({
          where: { stripeCustomerId: invoice.customer as string },
        });
        if (org) {
          await prisma.organization.update({
            where: { id: org.id },
            data: { subscriptionStatus: "past_due" },
          });
        }
      }
      break;
    }

    default:
      // Unhandled event types are OK
      break;
  }
}

async function updateOrgSubscription(
  orgId: string,
  subscription: Stripe.Subscription
): Promise<void> {
  // Find the base (non-metered) subscription item to get the main price
  const items = subscription.items.data;
  const baseItem = items.find((item) => {
    const recurring = item.price.recurring;
    return recurring?.usage_type !== "metered";
  }) ?? items[0];

  // Find the metered item for Starter overage
  const meteredItem = items.find((item) => {
    const recurring = item.price.recurring;
    return recurring?.usage_type === "metered";
  });

  const priceId = baseItem?.price.id ?? "";
  const plan = getPlanFromPriceId(priceId);
  const status = mapStripeStatus(subscription.status);

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      subscriptionStatus: status,
      plan,
      stripePriceId: priceId,
      stripeSubscriptionItemId: meteredItem?.id ?? null,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      action: "billing.subscription_updated",
      resource: "Organization",
      resourceId: orgId,
      details: {
        subscriptionId: subscription.id,
        plan,
        status,
        priceId,
        meteredItemId: meteredItem?.id ?? null,
      },
    },
  });
}

function getPlanFromPriceId(priceId: string): "free" | "starter" | "growth" | "enterprise" {
  const starter = [PRICE_IDS.starter_monthly, PRICE_IDS.starter_annual];
  const professional = [PRICE_IDS.professional_monthly, PRICE_IDS.professional_annual];
  const enterprise = [PRICE_IDS.enterprise_monthly];

  if (starter.includes(priceId)) return "starter";
  if (professional.includes(priceId)) return "growth"; // internal name is "growth"
  if (enterprise.includes(priceId)) return "enterprise";
  return "free";
}

function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status
): "active" | "trialing" | "past_due" | "canceled" | "incomplete" {
  const statusMap: Record<
    Stripe.Subscription.Status,
    "active" | "trialing" | "past_due" | "canceled" | "incomplete"
  > = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    incomplete: "incomplete",
    incomplete_expired: "canceled",
    unpaid: "past_due",
    paused: "past_due",
  };
  return statusMap[stripeStatus] ?? "incomplete";
}
