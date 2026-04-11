"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface WorkflowSummary {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isTemplate: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  _count: { executions: number };
}

interface PaginatedWorkflows {
  data: WorkflowSummary[];
  total: number;
  page: number;
  hasMore: boolean;
}

// ----------------------------------------------------------------------------
// Status badge component
// ----------------------------------------------------------------------------

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        active
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${active ? "bg-green-500" : "bg-slate-400"}`}
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Main Page
// ----------------------------------------------------------------------------

export default function WorkflowsPage() {
  const { getToken } = useAuth();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        ...(search && { search }),
      });
      const res = await fetch(`/api/workflows?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load workflows");
      const data: PaginatedWorkflows = await res.json();
      setWorkflows(data.data);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workflows");
    } finally {
      setLoading(false);
    }
  }, [getToken, page, search]);

  useEffect(() => {
    const timer = setTimeout(fetchWorkflows, 300);
    return () => clearTimeout(timer);
  }, [fetchWorkflows]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this workflow?")) return;
    try {
      const token = await getToken();
      const res = await fetch(`/api/workflows/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete workflow");
      fetchWorkflows();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Workflows</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {total} workflow{total !== 1 ? "s" : ""}
            </p>
          </div>
          <Link
            href="/workflows/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            New Workflow
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Search */}
        <div className="mb-6">
          <input
            type="search"
            placeholder="Search workflows..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full max-w-sm rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Content */}
        {loading && (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading workflows...
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive text-sm">
            {error}
          </div>
        )}

        {!loading && !error && workflows.length === 0 && (
          <div className="text-center py-24">
            <div className="text-5xl mb-4">⚡</div>
            <h3 className="text-lg font-semibold mb-2">No workflows yet</h3>
            <p className="text-muted-foreground text-sm mb-6">
              Create your first workflow or start from a template.
            </p>
            <Link
              href="/workflows/new"
              className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Create your first workflow
            </Link>
          </div>
        )}

        {!loading && !error && workflows.length > 0 && (
          <div className="space-y-3">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <Link
                        href={`/workflows/${workflow.id}`}
                        className="font-semibold text-foreground hover:text-primary transition-colors truncate"
                      >
                        {workflow.name}
                      </Link>
                      <StatusBadge active={workflow.isActive} />
                      {workflow.isTemplate && (
                        <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-2.5 py-0.5 text-xs font-medium">
                          Template
                        </span>
                      )}
                    </div>
                    {workflow.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {workflow.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>v{workflow.version}</span>
                      <span>{workflow._count.executions} run{workflow._count.executions !== 1 ? "s" : ""}</span>
                      <span>
                        Updated {new Date(workflow.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/executions?workflowId=${workflow.id}`}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                    >
                      View runs
                    </Link>
                    <Link
                      href={`/workflows/${workflow.id}/edit`}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(workflow.id)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      Delete
                    </button>
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
