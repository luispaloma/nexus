"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface OverviewData {
  period: string;
  executions: {
    total: number;
    completed: number;
    failed: number;
    waitingApproval: number;
    running: number;
    recent7Days: number;
    trend: number;
  };
  successRate: {
    current: number;
    previous: number;
    delta: number;
  };
  workflows: { active: number; total: number };
  approvals: {
    total: number;
    responded: number;
    pending: number;
    responseRate: number;
  };
  timeSaved: {
    estimatedMinutes: number;
    estimatedHours: number;
    assumptionMinutesPerExecution: number;
  };
  chart: {
    daily: { date: string; count: number }[];
  };
}

interface WorkflowStat {
  id: string;
  name: string;
  description: string | null;
  isTemplate: boolean;
  totalExecutions: number;
  last30Days: {
    total: number;
    completed: number;
    failed: number;
    successRate: number;
    avgDurationSeconds: number;
  };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function TrendBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-muted-foreground text-xs">no change</span>;
  const up = value > 0;
  return (
    <span className={`text-xs font-medium ${up ? "text-green-600" : "text-red-500"}`}>
      {up ? "↑" : "↓"} {Math.abs(value)}% vs prior 30d
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  trend,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold mb-1 ${accent ?? ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      {trend !== undefined && <TrendBadge value={trend} />}
    </div>
  );
}

function MiniBarChart({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0)
    return <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">No data</div>;

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d) => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
          <div
            className="w-full bg-primary/20 hover:bg-primary/40 rounded-sm transition-colors"
            style={{ height: `${(d.count / max) * 80}px`, minHeight: d.count > 0 ? "4px" : "0" }}
          />
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover border border-border rounded px-2 py-1 text-xs whitespace-nowrap z-10 shadow-sm">
            {d.date}: {d.count}
          </div>
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Main page
// ----------------------------------------------------------------------------

export default function AnalyticsPage() {
  const { getToken } = useAuth();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [overviewRes, workflowsRes] = await Promise.all([
        fetch("/api/analytics/overview", { headers }),
        fetch("/api/analytics/workflows", { headers }),
      ]);

      if (!overviewRes.ok || !workflowsRes.ok) {
        throw new Error("Failed to load analytics data");
      }

      const [overviewJson, workflowsJson] = await Promise.all([
        overviewRes.json(),
        workflowsRes.json(),
      ]);

      setOverview(overviewJson.data);
      setWorkflows(workflowsJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Last 30 days · auto-refreshes every 5 minutes</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/workflows"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Workflows
            </Link>
            <button
              onClick={fetchData}
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
              Loading analytics...
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive text-sm mb-6">
            {error}
          </div>
        )}

        {!loading && overview && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                label="Total Executions"
                value={overview.executions.total.toLocaleString()}
                sub={`${overview.executions.recent7Days} in last 7 days`}
                trend={overview.executions.trend}
              />
              <StatCard
                label="Success Rate"
                value={`${overview.successRate.current}%`}
                sub={`${overview.executions.completed} completed · ${overview.executions.failed} failed`}
                trend={overview.successRate.delta}
                accent={
                  overview.successRate.current >= 90
                    ? "text-green-600"
                    : overview.successRate.current >= 70
                    ? "text-yellow-600"
                    : "text-red-500"
                }
              />
              <StatCard
                label="Time Saved"
                value={`${overview.timeSaved.estimatedHours}h`}
                sub={`~${overview.timeSaved.assumptionMinutesPerExecution}min saved per execution`}
              />
              <StatCard
                label="Active Workflows"
                value={overview.workflows.active}
                sub={`${overview.workflows.total} total`}
              />
            </div>

            {/* Secondary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <StatCard
                label="Pending Approvals"
                value={overview.approvals.pending}
                sub={`${overview.approvals.responseRate}% response rate`}
                accent={overview.approvals.pending > 5 ? "text-orange-500" : undefined}
              />
              <StatCard
                label="Waiting Approval"
                value={overview.executions.waitingApproval}
                sub="Executions paused"
              />
              <StatCard
                label="Currently Running"
                value={overview.executions.running}
                sub="Active right now"
              />
            </div>

            {/* Daily Chart */}
            <div className="rounded-xl border border-border bg-card p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-sm">Executions — Last 14 Days</h2>
                <span className="text-xs text-muted-foreground">Daily</span>
              </div>
              <MiniBarChart data={overview.chart.daily} />
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                {overview.chart.daily.length > 0 && (
                  <>
                    <span>{overview.chart.daily[0]?.date}</span>
                    <span>{overview.chart.daily[overview.chart.daily.length - 1]?.date}</span>
                  </>
                )}
              </div>
            </div>

            {/* Per-workflow table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-semibold text-sm">Workflow Performance (Last 30 Days)</h2>
              </div>
              {workflows.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No active workflows yet.{" "}
                  <Link href="/workflows/new" className="underline">
                    Create one
                  </Link>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Workflow</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Runs (30d)</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Success Rate</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Avg Duration</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Total Runs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workflows.map((wf) => (
                      <tr key={wf.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-medium">{wf.name}</div>
                          {wf.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-xs">{wf.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span>{wf.last30Days.total}</span>
                          {wf.last30Days.failed > 0 && (
                            <span className="ml-1 text-xs text-red-500">({wf.last30Days.failed} failed)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={
                              wf.last30Days.successRate >= 90
                                ? "text-green-600 font-medium"
                                : wf.last30Days.successRate >= 70
                                ? "text-yellow-600 font-medium"
                                : wf.last30Days.total === 0
                                ? "text-muted-foreground"
                                : "text-red-500 font-medium"
                            }
                          >
                            {wf.last30Days.total === 0 ? "—" : `${wf.last30Days.successRate}%`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                          {wf.last30Days.avgDurationSeconds > 0
                            ? wf.last30Days.avgDurationSeconds < 60
                              ? `${wf.last30Days.avgDurationSeconds}s`
                              : `${Math.round(wf.last30Days.avgDurationSeconds / 60)}m`
                            : "—"}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">
                          {wf.totalExecutions.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
