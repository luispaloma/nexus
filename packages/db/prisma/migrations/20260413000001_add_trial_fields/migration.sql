-- Add trial tracking fields to Organization
ALTER TABLE "Organization" ADD COLUMN "trialStartedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "trialDay10ReminderSentAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "trialDay13ReminderSentAt" TIMESTAMP(3);

-- Backfill existing trialing orgs: treat createdAt as trial start
UPDATE "Organization"
SET
  "trialStartedAt" = "createdAt",
  "trialEndsAt"    = "createdAt" + INTERVAL '14 days'
WHERE "subscriptionStatus" = 'trialing' AND "trialStartedAt" IS NULL;
