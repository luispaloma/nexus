"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface MetricsData {
  mrr: {
    currentEur: number;
    arrEur: number;
    byPlan: { starter: number; growth: number; enterprise: number };
    movement30d: {
      newEur: number;
      expansionEur: number;
      churnedEur: number;
      netEur: number;
    };
  };
  subscribers: {
    total: number;
    active: number;
    trialing: number;
    pastDue: number;
    byPlan: { free: number; starter: number; growth: number; enterprise: number };
  };
  churn: {
    rate30dPct: number;
    churned30d: number;
  };
  trialConversion: {
    ratePct: number;
    converted: number;
    totalWithTrial: number;
  };
  goal: {
    targetArrEur: number;
    currentArrEur: number;
    progressPct: number;
  };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function eur(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `€${(value / 1_000).toFixed(1)}K`;
  return `€${value.toLocaleString()}`;
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className={`text-3xl font-bold mb-1 ${accent ?? ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function MrrMovementBar({
  newEur,
  expansionEur,
  churnedEur,
  netEur,
}: {
  newEur: number;
  expansionEur: number;
  churnedEur: number;
  netEur: number;
}) {
  const total = newEur + expansionEur + churnedEur || 1;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold text-sm mb-4">MRR Movement — Last 30 Days</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">New MRR</p>
          <p className="text-xl font-bold text-green-600">{eur(newEur)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Expansion MRR</p>
          <p className="text-xl font-bold text-blue-600">{eur(expansionEur)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Churned MRR</p>
          <p className="text-xl font-bold text-red-500">-{eur(churnedEur)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Net New MRR</p>
          <p className={`text-xl font-bold ${netEur >= 0 ? "text-green-600" : "text-red-500"}`}>
            {netEur >= 0 ? "+" : ""}{eur(netEur)}
          </p>
        </div>
      </div>
      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        {newEur > 0 && (
          <div
            className="bg-green-500"
            style={{ width: `${(newEur / total) * 100}%` }}
            title={`New: ${eur(newEur)}`}
          />
        )}
        {expansionEur > 0 && (
          <div
            className="bg-blue-500"
            style={{ width: `${(expansionEur / total) * 100}%` }}
            title={`Expansion: ${eur(expansionEur)}`}
          />
        )}
        {churnedEur > 0 && (
          <div
            className="bg-red-400"
            style={{ width: `${(churnedEur / total) * 100}%` }}
            title={`Churned: ${eur(churnedEur)}`}
          />
        )}
        {newEur === 0 && expansionEur === 0 && churnedEur === 0 && (
          <div className="bg-muted flex-1" />
        )}
      </div>
    </div>
  );
}

function SubscriberBreakdown({
  byPlan,
  active,
  trialing,
  pastDue,
}: {
  byPlan: { free: number; starter: number; growth: number; enterprise: number };
  active: number;
  trialing: number;
  pastDue: number;
}) {
  const plans = [
    { key: "enterprise", label: "Enterprise", price: "€3,500/mo", color: "bg-purple-500" },
    { key: "growth", label: "Professional", price: "€999/mo", color: "bg-blue-500" },
    { key: "starter", label: "Starter", price: "€299/mo", color: "bg-green-500" },
    { key: "free", label: "Free", price: "—", color: "bg-muted-foreground/30" },
  ] as const;

  const total = Object.values(byPlan).reduce((s, v) => s + v, 0) || 1;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold text-sm mb-4">Subscribers by Plan</h2>
      <div className="space-y-3">
        {plans.map(({ key, label, price, color }) => {
          const count = byPlan[key];
          const pct = Math.round((count / total) * 100);
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">{price}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {count} <span className="text-xs text-muted-foreground font-normal">({pct}%)</span>
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-lg font-bold text-green-600">{active}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </div>
        <div>
          <p className="text-lg font-bold text-blue-600">{trialing}</p>
          <p className="text-xs text-muted-foreground">Trialing</p>
        </div>
        <div>
          <p className={`text-lg font-bold ${pastDue > 0 ? "text-orange-500" : "text-muted-foreground"}`}>
            {pastDue}
          </p>
          <p className="text-xs text-muted-foreground">Past Due</p>
        </div>
      </div>
    </div>
  );
}

function GoalProgressBar({
  currentArrEur,
  targetArrEur,
  progressPct,
}: {
  currentArrEur: number;
  targetArrEur: number;
  progressPct: number;
}) {
  const displayPct = Math.min(progressPct, 100);
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-sm">Progress toward 100M EUR ARR</h2>
        <span className="text-xs font-medium text-muted-foreground">
          {eur(currentArrEur)} / {eur(targetArrEur)}
        </span>
      </div>
      <div className="h-4 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
          style={{ width: `${Math.max(displayPct, 0.2)}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">€0</span>
        <span className="text-sm font-bold">
          {progressPct < 0.01 ? "<0.01" : progressPct.toFixed(4)}% of goal
        </span>
        <span className="text-xs text-muted-foreground">€100M</span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Main page
// ----------------------------------------------------------------------------

export default function RevenueDashboardPage() {
  const { getToken } = useAuth();
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/billing/metrics", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        setError("Access denied. This page requires owner or admin role.");
        return;
      }
      if (!res.ok) throw new Error("Failed to load revenue metrics");
      const json = await res.json();
      setMetrics(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Revenue Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              MRR · ARR · Churn · Trial Conversion · 100M EUR Goal
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/analytics"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Analytics
            </Link>
            <Link
              href="/billing"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Billing
            </Link>
            <button
              onClick={fetchMetrics}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {loading && (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading revenue metrics...
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive text-sm mb-6">
            {error}
          </div>
        )}

        {!loading && metrics && (
          <>
            {/* Top KPIs — MRR / ARR / Churn / Trial conversion */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                label="Current MRR"
                value={eur(metrics.mrr.currentEur)}
                sub={`ARR: ${eur(metrics.mrr.arrEur)}`}
                accent="text-green-600"
              />
              <StatCard
                label="Annual Run Rate"
                value={eur(metrics.mrr.arrEur)}
                sub="MRR × 12"
              />
              <StatCard
                label="Churn Rate (30d)"
                value={`${metrics.churn.rate30dPct}%`}
                sub={`${metrics.churn.churned30d} customer${metrics.churn.churned30d !== 1 ? "s" : ""} churned`}
                accent={
                  metrics.churn.rate30dPct === 0
                    ? "text-green-600"
                    : metrics.churn.rate30dPct < 2
                    ? "text-yellow-600"
                    : "text-red-500"
                }
              />
              <StatCard
                label="Trial Conversion"
                value={`${metrics.trialConversion.ratePct}%`}
                sub={`${metrics.trialConversion.converted} of ${metrics.trialConversion.totalWithTrial} trials converted`}
                accent={
                  metrics.trialConversion.ratePct >= 20
                    ? "text-green-600"
                    : metrics.trialConversion.ratePct > 0
                    ? "text-yellow-600"
                    : "text-muted-foreground"
                }
              />
            </div>

            {/* ARR Goal progress */}
            <div className="mb-6">
              <GoalProgressBar
                currentArrEur={metrics.goal.currentArrEur}
                targetArrEur={metrics.goal.targetArrEur}
                progressPct={metrics.goal.progressPct}
              />
            </div>

            {/* MRR movement + subscriber breakdown side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <MrrMovementBar
                newEur={metrics.mrr.movement30d.newEur}
                expansionEur={metrics.mrr.movement30d.expansionEur}
                churnedEur={metrics.mrr.movement30d.churnedEur}
                netEur={metrics.mrr.movement30d.netEur}
              />
              <SubscriberBreakdown
                byPlan={metrics.subscribers.byPlan}
                active={metrics.subscribers.active}
                trialing={metrics.subscribers.trialing}
                pastDue={metrics.subscribers.pastDue}
              />
            </div>

            {/* MRR by plan */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-semibold text-sm">MRR by Plan</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Plan</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">
                      Active Subscribers
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">
                      Price/mo
                    </th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">
                      MRR Contribution
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      plan: "Enterprise",
                      key: "enterprise" as const,
                      price: 3500,
                      color: "text-purple-600",
                    },
                    {
                      plan: "Professional",
                      key: "growth" as const,
                      price: 999,
                      color: "text-blue-600",
                    },
                    {
                      plan: "Starter",
                      key: "starter" as const,
                      price: 299,
                      color: "text-green-600",
                    },
                  ].map(({ plan, key, price, color }) => {
                    const count = metrics.subscribers.byPlan[key];
                    const mrr = metrics.mrr.byPlan[key];
                    const share =
                      metrics.mrr.currentEur > 0
                        ? Math.round((mrr / metrics.mrr.currentEur) * 100)
                        : 0;
                    return (
                      <tr
                        key={key}
                        className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors"
                      >
                        <td className="px-5 py-3 font-medium">{plan}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{count}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          €{price.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={`font-semibold tabular-nums ${color}`}>
                            {eur(mrr)}
                          </span>
                          {metrics.mrr.currentEur > 0 && (
                            <span className="ml-1 text-xs text-muted-foreground">({share}%)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-muted/20">
                    <td className="px-5 py-3 font-semibold">Total</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {metrics.subscribers.active}
                    </td>
                    <td className="px-4 py-3" />
                    <td className="px-5 py-3 text-right font-bold tabular-nums text-green-600">
                      {eur(metrics.mrr.currentEur)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
