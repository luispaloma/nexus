"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import type { ExecutionStatus } from "@nexus/types";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface ExecutionSummary {
  id: string;
  status: ExecutionStatus;
  workflowId: string;
  workflow: { id: string; name: string };
  input: Record<string, unknown>;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  _count: { stepExecutions: number; approvalRequests: number };
}

// ----------------------------------------------------------------------------
// Status badge
// ----------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  ExecutionStatus,
  { label: string; className: string; dot: string }
> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-500" },
  running: { label: "Running", className: "bg-blue-100 text-blue-700", dot: "bg-blue-500 animate-pulse" },
  waiting_approval: { label: "Awaiting Approval", className: "bg-orange-100 text-orange-700", dot: "bg-orange-500 animate-pulse" },
  completed: { label: "Completed", className: "bg-green-100 text-green-700", dot: "bg-green-500" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700", dot: "bg-red-500" },
  canceled: { label: "Canceled", className: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
};

function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "-";
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const ms = endMs - startMs;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

// ----------------------------------------------------------------------------
// Main page
// ----------------------------------------------------------------------------

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "running", label: "Running" },
  { value: "waiting_approval", label: "Awaiting Approval" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "canceled", label: "Canceled" },
];

export default function ExecutionsPage() {
  const { getToken } = useAuth();
  const searchParams = useSearchParams();
  const workflowIdFilter = searchParams.get("workflowId");

  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const fetchExecutions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        ...(statusFilter && { status: statusFilter }),
        ...(workflowIdFilter && { workflowId: workflowIdFilter }),
      });
      const res = await fetch(`/api/executions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load executions");
      const data = await res.json();
      setExecutions(data.data);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load executions");
    } finally {
      setLoading(false);
    }
  }, [getToken, page, statusFilter, workflowIdFilter]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this execution?")) return;
    try {
      const token = await getToken();
      await fetch(`/api/executions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchExecutions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Execution History</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {workflowIdFilter ? "Filtered by workflow" : `${total} total execution${total !== 1 ? "s" : ""}`}
            </p>
          </div>
          <Link
            href="/workflows"
            className="text-sm text-primary hover:underline"
          >
            Run a workflow
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Status filter */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setStatusFilter(f.value);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading executions...
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive text-sm">
            {error}
          </div>
        )}

        {!loading && !error && executions.length === 0 && (
          <div className="text-center py-24">
            <div className="text-5xl mb-4">📋</div>
            <h3 className="text-lg font-semibold mb-2">No executions found</h3>
            <p className="text-muted-foreground text-sm">
              {statusFilter ? `No ${statusFilter} executions found.` : "Run a workflow to see executions here."}
            </p>
          </div>
        )}

        {!loading && !error && executions.length > 0 && (
          <div className="space-y-3">
            {executions.map((execution) => (
              <div
                key={execution.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1.5">
                      <Link
                        href={`/executions/${execution.id}`}
                        className="font-medium text-sm hover:text-primary transition-colors truncate"
                      >
                        {execution.id.slice(0, 8)}...
                      </Link>
                      <ExecutionStatusBadge status={execution.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <Link
                        href={`/workflows/${execution.workflow.id}`}
                        className="hover:text-foreground transition-colors"
                      >
                        {execution.workflow.name}
                      </Link>
                      <span>•</span>
                      <span>{execution._count.stepExecutions} steps</span>
                      {execution._count.approvalRequests > 0 && (
                        <>
                          <span>•</span>
                          <span>{execution._count.approvalRequests} approval{execution._count.approvalRequests !== 1 ? "s" : ""}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>{formatDuration(execution.startedAt, execution.completedAt)}</span>
                      <span>•</span>
                      <span>{new Date(execution.createdAt).toLocaleString()}</span>
                    </div>
                    {execution.error && (
                      <p className="mt-1.5 text-xs text-destructive font-mono bg-destructive/5 rounded px-2 py-1">
                        {execution.error}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/executions/${execution.id}`}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                    >
                      View details
                    </Link>
                    {(execution.status === "running" ||
                      execution.status === "pending" ||
                      execution.status === "waiting_approval") && (
                      <button
                        onClick={() => handleCancel(execution.id)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                    {execution.status === "waiting_approval" && (
                      <Link
                        href={`/approvals?executionId=${execution.id}`}
                        className="rounded-lg bg-orange-100 text-orange-700 border border-orange-200 px-3 py-1.5 text-xs font-medium hover:bg-orange-200 transition-colors"
                      >
                        Review
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > 20 && (
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50 hover:bg-accent transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * 20 >= total}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50 hover:bg-accent transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
