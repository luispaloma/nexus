/**
 * stripe-setup.ts
 *
 * Creates the three Nexus pricing tiers in Stripe and prints the resulting
 * price IDs so you can paste them into your .env file.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... npx ts-node scripts/stripe-setup.ts
 *
 * Products created:
 *   - Starter       €299/mo  (+ metered overage at €0.04/AI step)
 *   - Professional  €999/mo
 *   - Enterprise    €3,500/mo
 */

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

async function main() {
  console.log("Setting up Nexus Stripe products and prices...\n");

  // -------------------------------------------------------------------------
  // Starter — €299/mo
  // -------------------------------------------------------------------------
  const starterProduct = await stripe.products.create({
    name: "Nexus Starter",
    description: "1,000 workflow runs/month · 3 templates · Google Workspace + email · 5 team members",
    metadata: { nexusPlan: "starter" },
  });

  const starterMonthly = await stripe.prices.create({
    product: starterProduct.id,
    unit_amount: 29900, // €299.00
    currency: "eur",
    recurring: { interval: "month" },
    nickname: "Starter Monthly",
    metadata: { nexusPlan: "starter", interval: "monthly" },
  });

  const starterAnnual = await stripe.prices.create({
    product: starterProduct.id,
    unit_amount: 24900, // €249.00/mo billed annually
    currency: "eur",
    recurring: { interval: "year" },
    nickname: "Starter Annual",
    metadata: { nexusPlan: "starter", interval: "annual" },
  });

  // Metered price for Starter overage: €0.04 per AI workflow step above the plan limit
  const starterMetered = await stripe.prices.create({
    product: starterProduct.id,
    unit_amount: 4, // €0.04 per step
    currency: "eur",
    recurring: {
      interval: "month",
      usage_type: "metered",
      aggregate_usage: "sum",
    },
    nickname: "Starter Overage (per AI step)",
    metadata: { nexusPlan: "starter", type: "metered_overage" },
  });

  console.log("✓ Starter product created:", starterProduct.id);
  console.log("  STRIPE_PRICE_STARTER_MONTHLY=", starterMonthly.id);
  console.log("  STRIPE_PRICE_STARTER_ANNUAL=", starterAnnual.id);
  console.log("  STRIPE_PRICE_STARTER_METERED=", starterMetered.id);
  console.log();

  // -------------------------------------------------------------------------
  // Professional — €999/mo
  // -------------------------------------------------------------------------
  const professionalProduct = await stripe.products.create({
    name: "Nexus Professional",
    description: "Unlimited workflow runs · All templates · HubSpot + full integrations · 25 team members · Priority support",
    metadata: { nexusPlan: "growth" }, // internal plan name
  });

  const professionalMonthly = await stripe.prices.create({
    product: professionalProduct.id,
    unit_amount: 99900, // €999.00
    currency: "eur",
    recurring: { interval: "month" },
    nickname: "Professional Monthly",
    metadata: { nexusPlan: "growth", interval: "monthly" },
  });

  const professionalAnnual = await stripe.prices.create({
    product: professionalProduct.id,
    unit_amount: 84900, // €849.00/mo billed annually
    currency: "eur",
    recurring: { interval: "year" },
    nickname: "Professional Annual",
    metadata: { nexusPlan: "growth", interval: "annual" },
  });

  console.log("✓ Professional product created:", professionalProduct.id);
  console.log("  STRIPE_PRICE_PROFESSIONAL_MONTHLY=", professionalMonthly.id);
  console.log("  STRIPE_PRICE_PROFESSIONAL_ANNUAL=", professionalAnnual.id);
  console.log();

  // -------------------------------------------------------------------------
  // Enterprise — €3,500/mo
  // -------------------------------------------------------------------------
  const enterpriseProduct = await stripe.products.create({
    name: "Nexus Enterprise",
    description: "Custom SLAs · SOC 2 compliance pack · Human-in-loop · SSO/SAML · Dedicated onboarding · Unlimited everything",
    metadata: { nexusPlan: "enterprise" },
  });

  const enterpriseMonthly = await stripe.prices.create({
    product: enterpriseProduct.id,
    unit_amount: 350000, // €3,500.00
    currency: "eur",
    recurring: { interval: "month" },
    nickname: "Enterprise Monthly",
    metadata: { nexusPlan: "enterprise", interval: "monthly" },
  });

  console.log("✓ Enterprise product created:", enterpriseProduct.id);
  console.log("  STRIPE_PRICE_ENTERPRISE_MONTHLY=", enterpriseMonthly.id);
  console.log();

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("=== Copy these into your .env file ===\n");
  console.log(`STRIPE_PRICE_STARTER_MONTHLY=${starterMonthly.id}`);
  console.log(`STRIPE_PRICE_STARTER_ANNUAL=${starterAnnual.id}`);
  console.log(`STRIPE_PRICE_STARTER_METERED=${starterMetered.id}`);
  console.log(`STRIPE_PRICE_PROFESSIONAL_MONTHLY=${professionalMonthly.id}`);
  console.log(`STRIPE_PRICE_PROFESSIONAL_ANNUAL=${professionalAnnual.id}`);
  console.log(`STRIPE_PRICE_ENTERPRISE_MONTHLY=${enterpriseMonthly.id}`);
  console.log();
  console.log("Done! Run `stripe listen --forward-to localhost:3001/api/billing/webhook` to test webhooks locally.");
}

main().catch((err) => {
  console.error("Stripe setup failed:", err.message);
  process.exit(1);
});
