// ----------------------------------------------------------------------------
// Nurture Sequence Runner
//
// Orchestrates the launch of a 3-touch email nurture sequence for the 500
// SDR contacts.  For each prospect, three WorkflowExecution records are
// created — one per touch — each with a `scheduledAfter` date so the
// executor picks them up at the right time:
//
//   Touch 1 → scheduledAfter = now + 3  days  (social proof)
//   Touch 2 → scheduledAfter = now + 7  days  (ROI narrative)
//   Touch 3 → scheduledAfter = now + 14 days  (soft close)
//
// The existing workflow executor polls for `status = pending` records where
// `scheduledAfter IS NULL OR scheduledAfter <= NOW()`, so no additional
// scheduler is needed — timing is baked into the execution records.
// ----------------------------------------------------------------------------

import { prisma } from "@nexus/db";
import { PROSPECT_LIST, type Prospect } from "./prospect-list";

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

export interface NurtureCampaignConfig {
  orgId: string;
  senderName: string;
  senderTitle?: string;
  senderEmail: string;
  calendarUrl: string;
  crmWebhookUrl?: string;
  /** Override day offsets. Defaults: [3, 7, 14] */
  touchDays?: [number, number, number];
  /** Filter to a specific vertical for targeted re-launches */
  industry?: "FinTech" | "Professional Services" | "Logistics";
  /** ICP score data from the original SDR campaign (keyed by prospectEmail) */
  icpScores?: Record<string, { score: number; painPoint: string }>;
}

export interface NurtureBatchResult {
  batchIndex: number;
  launched: number;
  errors: { prospect: string; error: string }[];
  executionIds: string[];
}

export interface NurtureCampaignReport {
  campaignId: string;
  totalProspects: number;
  totalTouches: number;       // totalProspects × 3
  totalLaunched: number;
  totalErrors: number;
  touchBreakdown: {
    touch1: { count: number; scheduledAfter: string };
    touch2: { count: number; scheduledAfter: string };
    touch3: { count: number; scheduledAfter: string };
  };
  verticalBreakdown: {
    fintech: number;
    professionalServices: number;
    logistics: number;
  };
  executionIds: string[];
  startedAt: string;
  finishedAt: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const TOUCH_DAYS_DEFAULT: [number, number, number] = [3, 7, 14];

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Find or create the Nurture Sequence workflow definition for this org. */
async function getOrCreateNurtureWorkflow(orgId: string): Promise<string> {
  const existing = await prisma.workflowDefinition.findFirst({
    where: {
      orgId,
      isActive: true,
      name: { contains: "Nurture Sequence", mode: "insensitive" },
    },
    select: { id: true },
  });

  if (existing) return existing.id;

  const { nurtureSequenceTemplate } = await import("@nexus/ai");

  const created = await prisma.workflowDefinition.create({
    data: {
      orgId,
      name: "3-Touch Email Nurture Sequence",
      description:
        "hubspot:nurture_sequence | Vertical-specific follow-up: Day 3 social proof → Day 7 ROI narrative → Day 14 soft close. " +
        "Automated sends for SDR-prospected contacts with optional CRM logging.",
      definition: nurtureSequenceTemplate as object,
      isTemplate: false,
      isActive: true,
    },
    select: { id: true },
  });

  return created.id;
}

/** Create all 3 touch executions for a single prospect. */
async function createProspectTouches(
  workflowId: string,
  orgId: string,
  prospect: Prospect,
  config: NurtureCampaignConfig,
  touchDays: [number, number, number],
  now: Date
): Promise<{ executionIds: string[]; errors: { prospect: string; error: string }[] }> {
  const executionIds: string[] = [];
  const errors: { prospect: string; error: string }[] = [];

  const icpData = config.icpScores?.[prospect.prospectEmail];
  const primaryPainPoint =
    icpData?.painPoint ??
    defaultPainPoint(prospect.companyIndustry as "FinTech" | "Professional Services" | "Logistics");

  for (let i = 0; i < 3; i++) {
    const touchNumber = (i + 1) as 1 | 2 | 3;
    const scheduledAfter = addDays(now, touchDays[i]);

    const input = {
      prospectName: prospect.prospectName,
      prospectEmail: prospect.prospectEmail,
      prospectTitle: prospect.prospectTitle,
      companyName: prospect.companyName,
      companyIndustry: prospect.companyIndustry,
      companySize: prospect.companySize,
      touchNumber,
      primaryPainPoint,
      ...(icpData?.score !== undefined && { icpScore: icpData.score }),
      senderName: config.senderName,
      senderTitle: config.senderTitle ?? "Head of Growth",
      senderEmail: config.senderEmail,
      calendarUrl: config.calendarUrl,
      ...(config.crmWebhookUrl && { crmWebhookUrl: config.crmWebhookUrl }),
    };

    try {
      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId,
          orgId,
          status: "pending",
          scheduledAfter,
          input,
        },
        select: { id: true },
      });
      executionIds.push(execution.id);
    } catch (err) {
      errors.push({
        prospect: prospect.prospectEmail,
        error: `touch${touchNumber}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return { executionIds, errors };
}

/** Default pain point copy when ICP research data isn't available. */
function defaultPainPoint(industry: "FinTech" | "Professional Services" | "Logistics"): string {
  const map: Record<string, string> = {
    FinTech: "manual invoice reconciliation and AP processing overhead",
    "Professional Services": "time lost to admin work that should be billable client hours",
    Logistics: "freight invoice errors and slow dispute resolution",
  };
  return map[industry] ?? "manual workflow overhead";
}

// ---------------------------------------------------------------------------
// Main campaign launcher
// ---------------------------------------------------------------------------

export async function launchNurtureCampaign(config: NurtureCampaignConfig): Promise<NurtureCampaignReport> {
  const now = new Date();
  const startedAt = now.toISOString();
  const touchDays = config.touchDays ?? TOUCH_DAYS_DEFAULT;

  const workflowId = await getOrCreateNurtureWorkflow(config.orgId);

  let prospects = PROSPECT_LIST;
  if (config.industry) {
    prospects = prospects.filter((p) => p.companyIndustry === config.industry);
  }

  const allExecutionIds: string[] = [];
  const allErrors: { prospect: string; error: string }[] = [];

  const touch1Ids: string[] = [];
  const touch2Ids: string[] = [];
  const touch3Ids: string[] = [];

  // Process in batches of 50 to avoid DB connection saturation
  const BATCH_SIZE = 50;
  for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
    const chunk = prospects.slice(i, i + BATCH_SIZE);
    await Promise.all(
      chunk.map(async (prospect) => {
        const { executionIds, errors } = await createProspectTouches(
          workflowId,
          config.orgId,
          prospect,
          config,
          touchDays,
          now
        );
        allExecutionIds.push(...executionIds);
        allErrors.push(...errors);
        if (executionIds[0]) touch1Ids.push(executionIds[0]);
        if (executionIds[1]) touch2Ids.push(executionIds[1]);
        if (executionIds[2]) touch3Ids.push(executionIds[2]);
      })
    );
  }

  const finishedAt = new Date().toISOString();
  const touch1Date = addDays(now, touchDays[0]).toISOString();
  const touch2Date = addDays(now, touchDays[1]).toISOString();
  const touch3Date = addDays(now, touchDays[2]).toISOString();

  return {
    campaignId: `nurture-campaign-${Date.now()}`,
    totalProspects: prospects.length,
    totalTouches: prospects.length * 3,
    totalLaunched: allExecutionIds.length,
    totalErrors: allErrors.length,
    touchBreakdown: {
      touch1: { count: touch1Ids.length, scheduledAfter: touch1Date },
      touch2: { count: touch2Ids.length, scheduledAfter: touch2Date },
      touch3: { count: touch3Ids.length, scheduledAfter: touch3Date },
    },
    verticalBreakdown: {
      fintech: prospects.filter((p) => p.companyIndustry === "FinTech").length,
      professionalServices: prospects.filter((p) => p.companyIndustry === "Professional Services").length,
      logistics: prospects.filter((p) => p.companyIndustry === "Logistics").length,
    },
    executionIds: allExecutionIds,
    startedAt,
    finishedAt,
  };
}

// ---------------------------------------------------------------------------
// Projected nurture metrics
// ---------------------------------------------------------------------------

export interface NurtureMetrics {
  totalEmails: number;
  projectedOpenRate: string;
  projectedReplyRate: string;
  projectedDemosBooked: number;
  perTouchBreakdown: {
    touch: number;
    day: number;
    name: string;
    strategy: string;
    projectedReplies: number;
  }[];
}

export function estimateNurtureMetrics(prospects: number): NurtureMetrics {
  // Nurture benchmarks (warmer audience, lower friction):
  //   Touch 1 (social proof): ~40% open, ~9% reply
  //   Touch 2 (ROI):          ~36% open, ~7% reply
  //   Touch 3 (soft close):   ~32% open, ~5% reply
  // Demo conversion from reply: ~22%
  const touches = [
    { touch: 1, day: 3,  name: "Social Proof",  strategy: "social_proof",  openRate: 0.40, replyRate: 0.09 },
    { touch: 2, day: 7,  name: "ROI Narrative",  strategy: "roi_narrative",  openRate: 0.36, replyRate: 0.07 },
    { touch: 3, day: 14, name: "Soft Close",     strategy: "soft_close",    openRate: 0.32, replyRate: 0.05 },
  ];

  const perTouchBreakdown = touches.map((t) => ({
    touch: t.touch,
    day: t.day,
    name: t.name,
    strategy: t.strategy,
    projectedReplies: Math.round(prospects * t.replyRate),
  }));

  const totalReplies = perTouchBreakdown.reduce((sum, t) => sum + t.projectedReplies, 0);
  const totalEmails = prospects * 3;
  const totalOpens = touches.reduce((sum, t) => sum + Math.round(prospects * t.openRate), 0);
  const demosBooked = Math.max(1, Math.round(totalReplies * 0.22));

  return {
    totalEmails,
    projectedOpenRate: `${((totalOpens / totalEmails) * 100).toFixed(1)}%`,
    projectedReplyRate: `${((totalReplies / prospects) * 100).toFixed(1)}%`,
    projectedDemosBooked: demosBooked,
    perTouchBreakdown,
  };
}
