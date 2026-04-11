import { Router, Request, Response, NextFunction } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@nexus/db";
import { WorkflowExecutor } from "@nexus/ai";

export const integrationsRouter = Router();

// ----------------------------------------------------------------------------
// Helper: get a WorkflowExecutor instance
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
// POST /api/integrations/crm/hubspot
// HubSpot webhook receiver — triggers a Nexus workflow on new contact/deal events
//
// Configure in HubSpot → Settings → Integrations → Webhooks
// Secret: set HUBSPOT_WEBHOOK_SECRET env var and configure in HubSpot
// Supported subscriptions: contact.creation, deal.creation
// ----------------------------------------------------------------------------

integrationsRouter.post(
  "/crm/hubspot",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const secret = process.env.HUBSPOT_WEBHOOK_SECRET;

      // Verify HubSpot signature (v3 format)
      if (secret) {
        const signature = req.headers["x-hubspot-signature-v3"] as string;
        const requestUri = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
        const requestBody = JSON.stringify(req.body);
        const timestamp = req.headers["x-hubspot-request-timestamp"] as string;

        if (!signature || !timestamp) {
          res.status(401).json({ error: "Missing HubSpot signature headers" });
          return;
        }

        // Check timestamp freshness (5 min window)
        const tsMs = parseInt(timestamp, 10);
        if (Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
          res.status(401).json({ error: "Webhook timestamp expired" });
          return;
        }

        const toSign = `${process.env.HUBSPOT_APP_CLIENT_SECRET ?? secret}POST${requestUri}${requestBody}${timestamp}`;
        const expected = createHmac("sha256", secret).update(toSign).digest("base64");

        try {
          if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
            res.status(401).json({ error: "Invalid HubSpot webhook signature" });
            return;
          }
        } catch {
          res.status(401).json({ error: "Signature comparison failed" });
          return;
        }
      }

      // HubSpot sends an array of events
      const events = Array.isArray(req.body) ? req.body : [req.body];

      // Process each event — look for a matching workflow trigger
      const results = await Promise.allSettled(
        events.map(async (event: Record<string, unknown>) => {
          const eventType = event.subscriptionType as string | undefined;
          const objectId = event.objectId as number | undefined;

          // Find workflows that are configured as HubSpot triggers
          // Convention: workflow description contains "hubspot:contact.creation" or similar
          const matchingWorkflows = await prisma.workflowDefinition.findMany({
            where: {
              isActive: true,
              description: { contains: `hubspot:${eventType ?? ""}`, mode: "insensitive" },
            },
            select: { id: true, orgId: true },
          });

          for (const wf of matchingWorkflows) {
            const executor = getExecutor();
            await prisma.workflowExecution.create({
              data: {
                workflowId: wf.id,
                orgId: wf.orgId,
                status: "pending",
                input: {
                  hubspotEvent: event,
                  objectId,
                  eventType,
                  triggeredAt: new Date().toISOString(),
                } as unknown as import("@prisma/client").Prisma.InputJsonValue,
                context: { stepOutputs: {} },
              },
            }).then((exec) => {
              // Fire-and-forget execution
              setImmediate(async () => {
                try {
                  await executor.execute(wf.id, {
                    hubspotEvent: event,
                    objectId,
                    eventType,
                    triggeredAt: new Date().toISOString(),
                  }, wf.orgId, "hubspot-webhook");
                } catch (err) {
                  console.error(`HubSpot webhook execution ${exec.id} failed:`, err);
                }
              });
            });
          }

          return { eventType, objectId, matchedWorkflows: matchingWorkflows.length };
        })
      );

      res.json({
        received: true,
        processed: events.length,
        results: results.map((r) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) })),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /api/integrations/crm/salesforce
// Salesforce outbound message receiver (SOAP-based) or platform event webhook
// ----------------------------------------------------------------------------

integrationsRouter.post(
  "/crm/salesforce",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const secret = process.env.SALESFORCE_WEBHOOK_SECRET;

      if (secret) {
        const signature = req.headers["x-salesforce-signature"] as string;
        if (!signature) {
          res.status(401).json({ error: "Missing Salesforce signature" });
          return;
        }

        const expected = createHmac("sha256", secret)
          .update(JSON.stringify(req.body))
          .digest("hex");

        try {
          if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
            res.status(401).json({ error: "Invalid Salesforce webhook signature" });
            return;
          }
        } catch {
          res.status(401).json({ error: "Signature comparison failed" });
          return;
        }
      }

      const event = req.body as Record<string, unknown>;
      const eventType = event.eventType as string | undefined;

      const matchingWorkflows = await prisma.workflowDefinition.findMany({
        where: {
          isActive: true,
          description: { contains: `salesforce:${eventType ?? ""}`, mode: "insensitive" },
        },
        select: { id: true, orgId: true },
      });

      for (const wf of matchingWorkflows) {
        const executor = getExecutor();
        setImmediate(async () => {
          try {
            await executor.execute(wf.id, {
              salesforceEvent: event,
              eventType,
              triggeredAt: new Date().toISOString(),
            }, wf.orgId, "salesforce-webhook");
          } catch (err) {
            console.error(`Salesforce webhook execution failed for workflow ${wf.id}:`, err);
          }
        });
      }

      res.json({ received: true, matched: matchingWorkflows.length });
    } catch (err) {
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /api/integrations/generic/webhook
// Generic inbound webhook — triggers workflows tagged with a matching webhook key
// Useful for Zapier, Make, or any custom automation
// ----------------------------------------------------------------------------

integrationsRouter.post(
  "/generic/:key",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;

      // Optional HMAC verification via X-Webhook-Signature header
      const secret = process.env[`WEBHOOK_SECRET_${key.toUpperCase()}`];
      if (secret) {
        const signature = req.headers["x-webhook-signature"] as string;
        if (!signature) {
          res.status(401).json({ error: "Missing X-Webhook-Signature header" });
          return;
        }
        const expected = createHmac("sha256", secret)
          .update(JSON.stringify(req.body))
          .digest("hex");
        try {
          if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
            res.status(401).json({ error: "Invalid webhook signature" });
            return;
          }
        } catch {
          res.status(401).json({ error: "Signature comparison failed" });
          return;
        }
      }

      const matchingWorkflows = await prisma.workflowDefinition.findMany({
        where: {
          isActive: true,
          description: { contains: `webhook:${key}`, mode: "insensitive" },
        },
        select: { id: true, orgId: true },
      });

      if (matchingWorkflows.length === 0) {
        res.status(404).json({ error: "No active workflows found for this webhook key" });
        return;
      }

      for (const wf of matchingWorkflows) {
        const executor = getExecutor();
        setImmediate(async () => {
          try {
            await executor.execute(wf.id, {
              ...((req.body as Record<string, unknown>) ?? {}),
              _webhookKey: key,
              _triggeredAt: new Date().toISOString(),
            }, wf.orgId, "webhook");
          } catch (err) {
            console.error(`Generic webhook execution failed for workflow ${wf.id}:`, err);
          }
        });
      }

      res.json({ received: true, triggered: matchingWorkflows.length });
    } catch (err) {
      next(err);
    }
  }
);
