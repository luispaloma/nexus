// ----------------------------------------------------------------------------
// SDR Campaign Runner
//
// Orchestrates the launch of outreach sequences for each prospect.
// Uses the outbound SDR workflow definition registered in the DB.
// Tracks per-prospect execution state in memory (and optionally DB).
// ----------------------------------------------------------------------------

import { prisma } from "@nexus/db";
import { PROSPECT_LIST, type Prospect } from "./prospect-list";

export interface CampaignConfig {
  orgId: string;
  senderName: string;
  senderEmail: string;
  sdrEmail: string;
  valueProposition: string;
  calendarUrl: string;
  crmWebhookUrl?: string;
  /** Batch size per launch call; default 50 */
  batchSize?: number;
  icpScoreThreshold?: number;
}

export interface BatchResult {
  batchIndex: number;
  launched: number;
  skipped: number;
  executionIds: string[];
  errors: { prospect: string; error: string }[];
}

export interface CampaignReport {
  campaignId: string;
  totalProspects: number;
  totalLaunched: number;
  totalSkipped: number;
  totalErrors: number;
  batches: number;
  executionIds: string[];
  startedAt: string;
  finishedAt: string;
  breakdown: {
    fintech: number;
    professionalServices: number;
    logistics: number;
  };
}

// ---------------------------------------------------------------------------
// Find or create the outbound SDR workflow definition for the org
// ---------------------------------------------------------------------------

async function getOrCreateSdrWorkflow(orgId: string): Promise<string> {
  // Check if already exists
  const existing = await prisma.workflowDefinition.findFirst({
    where: {
      orgId,
      isActive: true,
      name: { contains: "Outbound SDR", mode: "insensitive" },
    },
    select: { id: true },
  });

  if (existing) return existing.id;

  // Import the template definition dynamically to avoid circular deps
  const { outboundSdrTemplate } = await import("@nexus/ai");

  const created = await prisma.workflowDefinition.create({
    data: {
      orgId,
      name: "Outbound SDR — AI Personalised Outreach",
      description:
        "hubspot:sdr_campaign | 3-touch AI-personalised cold outreach sequence: intro → value-add → demo ask. " +
        "Integrated with HubSpot CRM and Calendly demo links.",
      definition: outboundSdrTemplate as object,
      isTemplate: false,
      isActive: true,
    },
    select: { id: true },
  });

  return created.id;
}

// ---------------------------------------------------------------------------
// Launch a single batch of executions
// ---------------------------------------------------------------------------

async function launchBatch(
  workflowId: string,
  orgId: string,
  prospects: Prospect[],
  config: CampaignConfig,
  batchIndex: number
): Promise<BatchResult> {
  const result: BatchResult = {
    batchIndex,
    launched: 0,
    skipped: 0,
    executionIds: [],
    errors: [],
  };

  for (const prospect of prospects) {
    try {
      const input = {
        prospectName: prospect.prospectName,
        prospectEmail: prospect.prospectEmail,
        prospectTitle: prospect.prospectTitle,
        companyName: prospect.companyName,
        companyIndustry: prospect.companyIndustry,
        companySize: prospect.companySize,
        companyWebsite: prospect.companyWebsite,
        ...(prospect.linkedinUrl && { linkedinUrl: prospect.linkedinUrl }),
        ...(prospect.recentCompanyNews && { recentCompanyNews: prospect.recentCompanyNews }),
        senderName: config.senderName,
        senderTitle: "Head of Growth",
        senderEmail: config.senderEmail,
        sdrEmail: config.sdrEmail,
        calendarUrl: config.calendarUrl,
        ...(config.crmWebhookUrl && { crmWebhookUrl: config.crmWebhookUrl }),
        icpScoreThreshold: config.icpScoreThreshold ?? 6,
        valueProposition: config.valueProposition,
      };

      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId,
          orgId,
          status: "pending",
          input,
        },
        select: { id: true },
      });

      result.executionIds.push(execution.id);
      result.launched++;
    } catch (err) {
      result.errors.push({
        prospect: prospect.prospectEmail,
        error: err instanceof Error ? err.message : String(err),
      });
      result.skipped++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main campaign launcher
// ---------------------------------------------------------------------------

export async function launchSdrCampaign(config: CampaignConfig): Promise<CampaignReport> {
  const startedAt = new Date().toISOString();
  const batchSize = config.batchSize ?? 50;

  // Get or provision the SDR workflow
  const workflowId = await getOrCreateSdrWorkflow(config.orgId);

  const allProspects = PROSPECT_LIST;
  const totalProspects = allProspects.length;

  const allExecutionIds: string[] = [];
  const batchResults: BatchResult[] = [];
  let totalErrors = 0;

  // Chunk prospects into batches
  for (let i = 0; i < allProspects.length; i += batchSize) {
    const chunk = allProspects.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize);
    const batch = await launchBatch(workflowId, config.orgId, chunk, config, batchIndex);
    batchResults.push(batch);
    allExecutionIds.push(...batch.executionIds);
    totalErrors += batch.errors.length;
  }

  const totalLaunched = allExecutionIds.length;
  const totalSkipped = totalErrors;

  const finishedAt = new Date().toISOString();

  // Campaign ID is derived from the first execution ID for traceability
  const campaignId = `sdr-campaign-${Date.now()}`;

  const breakdown = {
    fintech: allProspects.filter((p) => p.companyIndustry === "FinTech").length,
    professionalServices: allProspects.filter((p) => p.companyIndustry === "Professional Services").length,
    logistics: allProspects.filter((p) => p.companyIndustry === "Logistics").length,
  };

  return {
    campaignId,
    totalProspects,
    totalLaunched,
    totalSkipped,
    totalErrors,
    batches: batchResults.length,
    executionIds: allExecutionIds,
    startedAt,
    finishedAt,
    breakdown,
  };
}

// ---------------------------------------------------------------------------
// Simulated campaign metrics (for demo/reporting when live email not configured)
// ---------------------------------------------------------------------------

export interface CampaignMetrics {
  sent: number;
  opened: number;
  replied: number;
  booked: number;
  openRate: string;
  replyRate: string;
  bookingRate: string;
}

export function estimateCampaignMetrics(launched: number): CampaignMetrics {
  // Industry benchmarks: ~35% open, ~8% reply, ~2% book from reply
  const sent = launched;
  const opened = Math.round(sent * 0.35);
  const replied = Math.round(opened * 0.23); // ~8% of sent
  const booked = Math.max(1, Math.round(replied * 0.18)); // ~1-2% of sent

  return {
    sent,
    opened,
    replied,
    booked,
    openRate: `${((opened / sent) * 100).toFixed(1)}%`,
    replyRate: `${((replied / sent) * 100).toFixed(1)}%`,
    bookingRate: `${((booked / sent) * 100).toFixed(2)}%`,
  };
}
