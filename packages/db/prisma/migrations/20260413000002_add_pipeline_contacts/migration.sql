-- AddEnum: ReplyStatus
CREATE TYPE "ReplyStatus" AS ENUM (
  'no_reply',
  'replied',
  'demo_booked',
  'in_evaluation',
  'closed_won',
  'closed_lost'
);

-- CreateTable: PipelineContact (interim SDR pipeline tracker, pre-HubSpot)
CREATE TABLE "PipelineContact" (
  "id"             TEXT NOT NULL,
  "contactName"    TEXT NOT NULL,
  "contactEmail"   TEXT NOT NULL,
  "contactTitle"   TEXT NOT NULL,
  "companyName"    TEXT NOT NULL,
  "vertical"       TEXT NOT NULL,
  "companySize"    TEXT NOT NULL,
  "outreachDate"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "replyStatus"    "ReplyStatus" NOT NULL DEFAULT 'no_reply',
  "nextAction"     TEXT,
  "nextActionDue"  TIMESTAMP(3),
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PipelineContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineContact_replyStatus_idx"  ON "PipelineContact"("replyStatus");
CREATE INDEX "PipelineContact_vertical_idx"     ON "PipelineContact"("vertical");
CREATE INDEX "PipelineContact_outreachDate_idx" ON "PipelineContact"("outreachDate");
