import { Router, Request, Response, NextFunction } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { launchSdrCampaign, estimateCampaignMetrics } from "../sdr/campaign-runner";
import { PROSPECT_LIST } from "../sdr/prospect-list";

export const sdrRouter = Router();

// ----------------------------------------------------------------------------
// POST /api/sdr/campaigns/launch
//
// Launches the 500-prospect AI SDR outreach campaign.
// Creates a pending WorkflowExecution for each ICP-matched prospect.
// The Nexus workflow executor picks up pending executions and runs them
// (ICP scoring → email draft → Resend send → HubSpot log → follow-up).
//
// Body:
//   orgId           - Nexus org to associate executions with
//   senderName      - Full name of the outreach sender
//   senderEmail     - Sender email (must be a verified Resend domain)
//   sdrEmail        - SDR review email (receives human approval requests)
//   valueProposition - Product value prop injected into AI prompts
//   calendarUrl     - Calendly / demo booking URL embedded in CTA emails
//   crmWebhookUrl   - (optional) HubSpot webhook URL for deal/contact sync
//   batchSize       - (optional) Prospects per DB batch; default 50
//   icpScoreThreshold - (optional) Min ICP score to send; default 6
// ----------------------------------------------------------------------------

sdrRouter.post(
  "/campaigns/launch",
  requireAuth,
  requireRole("owner", "admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        orgId,
        senderName,
        senderEmail,
        sdrEmail,
        valueProposition,
        calendarUrl,
        crmWebhookUrl,
        batchSize,
        icpScoreThreshold,
      } = req.body as {
        orgId?: string;
        senderName?: string;
        senderEmail?: string;
        sdrEmail?: string;
        valueProposition?: string;
        calendarUrl?: string;
        crmWebhookUrl?: string;
        batchSize?: number;
        icpScoreThreshold?: number;
      };

      const resolvedOrgId = orgId ?? req.nexusOrgId;

      if (!resolvedOrgId) {
        res.status(400).json({ error: "BadRequest", message: "orgId is required", statusCode: 400 });
        return;
      }
      if (!senderName || !senderEmail || !sdrEmail || !valueProposition || !calendarUrl) {
        res.status(400).json({
          error: "BadRequest",
          message: "senderName, senderEmail, sdrEmail, valueProposition, and calendarUrl are required",
          statusCode: 400,
        });
        return;
      }

      const report = await launchSdrCampaign({
        orgId: resolvedOrgId,
        senderName,
        senderEmail,
        sdrEmail,
        valueProposition,
        calendarUrl,
        crmWebhookUrl,
        batchSize,
        icpScoreThreshold,
      });

      // Attach projected metrics using industry benchmarks
      const metrics = estimateCampaignMetrics(report.totalLaunched);

      res.status(201).json({
        data: {
          ...report,
          projectedMetrics: metrics,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ----------------------------------------------------------------------------
// GET /api/sdr/prospects
//
// Preview the ICP prospect list (paginated).
// Query params:
//   limit  - max records to return (default 50, max 500)
//   offset - skip N records (default 0)
//   industry - filter by "FinTech" | "Professional Services" | "Logistics"
// ----------------------------------------------------------------------------

sdrRouter.get(
  "/prospects",
  requireAuth,
  requireRole("owner", "admin", "member"),
  (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit ?? 50), 500);
    const offset = Number(req.query.offset ?? 0);
    const industry = req.query.industry as string | undefined;

    let prospects = PROSPECT_LIST;
    if (industry) {
      prospects = prospects.filter(
        (p) => p.companyIndustry.toLowerCase() === industry.toLowerCase()
      );
    }

    const page = prospects.slice(offset, offset + limit);

    res.json({
      data: page,
      meta: {
        total: prospects.length,
        limit,
        offset,
        returned: page.length,
        breakdown: {
          fintech: PROSPECT_LIST.filter((p) => p.companyIndustry === "FinTech").length,
          professionalServices: PROSPECT_LIST.filter(
            (p) => p.companyIndustry === "Professional Services"
          ).length,
          logistics: PROSPECT_LIST.filter((p) => p.companyIndustry === "Logistics").length,
        },
      },
    });
  }
);

// ----------------------------------------------------------------------------
// GET /api/sdr/campaigns/metrics/estimate
//
// Returns projected campaign metrics for a given launched count.
// Useful for planning before launch.
// Query params:
//   launched - number of prospects launched (default: total prospect list size)
// ----------------------------------------------------------------------------

sdrRouter.get(
  "/campaigns/metrics/estimate",
  requireAuth,
  requireRole("owner", "admin", "member"),
  (req: Request, res: Response) => {
    const launched = Number(req.query.launched ?? PROSPECT_LIST.length);
    const metrics = estimateCampaignMetrics(launched);

    res.json({
      data: {
        inputLaunched: launched,
        ...metrics,
        methodology:
          "Industry benchmarks: ~35% open rate, ~8% reply rate (23% of opens), ~1-2% booking rate from replies",
      },
    });
  }
);
