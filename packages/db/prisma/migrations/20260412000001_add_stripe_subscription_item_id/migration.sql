-- AlterTable: add stripeSubscriptionItemId to Organization for Stripe metered billing
ALTER TABLE "Organization" ADD COLUMN "stripeSubscriptionItemId" TEXT;
