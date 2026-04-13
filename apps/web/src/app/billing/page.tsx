"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

// ============================================================================
// Types
// ============================================================================

interface Plan {
  id: string;
  name: string;
  price: number;
  annualPrice?: number;
  currency: string;
  interval: string | null;
  priceId?: string;
  annualPriceId?: string;
  features: string[];
  popular?: boolean;
}

interface TrialStatus {
  isTrial: boolean;
  isExpired: boolean;
  daysRemaining: number | null;
  trialEndsAt: string | null;
  subscriptionStatus: string;
  plan: string;
}

// ============================================================================
// BillingPage
// ============================================================================

export default function BillingPage() {
  const { getToken } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [annual, setAnnual] = useState(false);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const [plansRes, trialRes] = await Promise.all([
          fetch("/api/billing/plans"),
          fetch("/api/billing/trial", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (plansRes.ok) {
          const data = await plansRes.json();
          setPlans(data.data ?? []);
        }
        if (trialRes.ok) {
          const data = await trialRes.json();
          setTrial(data.data as TrialStatus);
        }
      } catch {
        // non-fatal
      }
    }
    load();
  }, [getToken]);

  async function handleUpgrade(plan: Plan) {
    setError(null);
    const priceId = annual ? (plan.annualPriceId ?? plan.priceId) : plan.priceId;
    if (!priceId) {
      setError("Contact sales for this plan.");
      return;
    }
    setLoadingPlanId(plan.id);
    try {
      const token = await getToken();
      const appUrl = window.location.origin;
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          priceId,
          successUrl: `${appUrl}/workflows?upgraded=1`,
          cancelUrl: `${appUrl}/billing`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Failed to start checkout.");
        return;
      }
      window.location.href = data.data.url;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoadingPlanId(null);
    }
  }

  const paidPlans = plans.filter((p) => p.id !== "free");
  const currentPlan = trial?.plan ?? "free";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-foreground">Billing & Plans</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upgrade to unlock more workflows, runs, and team seats.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Trial status banner */}
        {trial?.isTrial && !trial.isExpired && trial.daysRemaining !== null && (
          <div
            className={`mb-8 rounded-xl p-5 flex items-center gap-4 ${
              trial.daysRemaining <= 3
                ? "bg-red-50 border border-red-200"
                : "bg-indigo-50 border border-indigo-200"
            }`}
          >
            <div className="text-3xl">
              {trial.daysRemaining <= 3 ? "⚠️" : "⏳"}
            </div>
            <div>
              <p
                className={`font-semibold ${
                  trial.daysRemaining <= 3 ? "text-red-800" : "text-indigo-800"
                }`}
              >
                {trial.daysRemaining <= 0
                  ? "Your trial expires today"
                  : trial.daysRemaining === 1
                  ? "1 day left in your free trial"
                  : `${trial.daysRemaining} days left in your free trial`}
              </p>
              <p
                className={`text-sm mt-0.5 ${
                  trial.daysRemaining <= 3 ? "text-red-600" : "text-indigo-600"
                }`}
              >
                Upgrade now to keep your workflows, execution history, and team access.
              </p>
            </div>
          </div>
        )}

        {trial?.isExpired && (
          <div className="mb-8 rounded-xl p-5 bg-slate-50 border border-slate-200 flex items-center gap-4">
            <div className="text-3xl">🔒</div>
            <div>
              <p className="font-semibold text-slate-800">Your trial has ended</p>
              <p className="text-sm text-slate-600 mt-0.5">
                Choose a plan below to restore access to your workflows.
              </p>
            </div>
          </div>
        )}

        {/* Annual toggle */}
        <div className="flex items-center gap-3 mb-8">
          <span className={`text-sm ${!annual ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
            Monthly
          </span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
              annual ? "bg-primary" : "bg-input"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                annual ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className={`text-sm ${annual ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
            Annual
            <span className="ml-1.5 inline-flex items-center rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">
              Save ~17%
            </span>
          </span>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {paidPlans.map((plan) => {
            const displayPrice = annual ? (plan.annualPrice ?? plan.price) : plan.price;
            const isCurrentPlan = plan.id === currentPlan;

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-6 flex flex-col ${
                  plan.popular
                    ? "border-primary shadow-lg shadow-primary/10"
                    : "border-border"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-3 py-0.5 text-xs font-semibold">
                      Most popular
                    </span>
                  </div>
                )}

                <div className="mb-5">
                  <h2 className="text-lg font-bold text-foreground">{plan.name}</h2>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-foreground">
                      €{displayPrice}
                    </span>
                    <span className="text-sm text-muted-foreground">/mo</span>
                  </div>
                  {annual && plan.annualPrice && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Billed €{plan.annualPrice * 12}/yr
                    </p>
                  )}
                </div>

                <ul className="space-y-2.5 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <svg
                        className="w-4 h-4 text-primary shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                {plan.id === "enterprise" ? (
                  <a
                    href="mailto:sales@nexus.ai"
                    className="block w-full rounded-xl border border-border text-center py-2.5 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
                  >
                    Contact Sales
                  </a>
                ) : isCurrentPlan ? (
                  <div className="block w-full rounded-xl bg-muted text-center py-2.5 text-sm font-semibold text-muted-foreground cursor-default">
                    Current Plan
                  </div>
                ) : (
                  <button
                    onClick={() => handleUpgrade(plan)}
                    disabled={loadingPlanId !== null}
                    className={`block w-full rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                      plan.popular
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-foreground text-background hover:bg-foreground/90"
                    } disabled:opacity-60`}
                  >
                    {loadingPlanId === plan.id ? "Redirecting…" : `Upgrade to ${plan.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mt-6 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive text-sm">
            {error}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-8">
          All prices in EUR. Cancel anytime. Questions?{" "}
          <a href="mailto:support@nexus.ai" className="underline">
            support@nexus.ai
          </a>
        </p>
      </div>
    </div>
  );
}
