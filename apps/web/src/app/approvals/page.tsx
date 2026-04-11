"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import type { ApprovalStatus } from "@nexus/types";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface ApprovalRequest {
  id: string;
  executionId: string;
  stepId: string;
  assignedTo: string;
  title: string;
  description: string;
  context: Record<string, unknown>;
  status: ApprovalStatus;
  expiresAt: string | null;
  createdAt: string;
  execution: {
    id: string;
    status: string;
    createdAt: string;
    workflow: { name: string };
  };
}

// ----------------------------------------------------------------------------
// Approval card component
// ----------------------------------------------------------------------------

function ApprovalCard({
  approval,
  onRespond,
}: {
  approval: ApprovalRequest;
  onRespond: (decision: "approved" | "rejected", comment?: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [responding, setResponding] = useState(false);
  const [comment, setComment] = useState("");
  const [showCommentBox, setShowCommentBox] = useState<"approve" | "reject" | null>(null);

  const isExpired =
    approval.expiresAt && new Date(approval.expiresAt) < new Date();

  const timeUntilExpiry = () => {
    if (!approval.expiresAt) return null;
    const ms = new Date(approval.expiresAt).getTime() - Date.now();
    if (ms <= 0) return "Expired";
    const hours = Math.floor(ms / 3600000);
    const days = Math.floor(hours / 24);
    if (days > 0) return `Expires in ${days}d`;
    return `Expires in ${hours}h`;
  };

  const handleDecision = async (decision: "approved" | "rejected") => {
    setResponding(true);
    try {
      await onRespond(decision, comment || undefined);
    } finally {
      setResponding(false);
      setShowCommentBox(null);
      setComment("");
    }
  };

  return (
    <div
      className={`rounded-xl border bg-card p-5 transition-all ${
        isExpired
          ? "border-border opacity-60"
          : "border-orange-200 dark:border-orange-900/50"
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm mb-1">{approval.title}</h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{approval.execution.workflow.name}</span>
            <span>•</span>
            <span>{new Date(approval.createdAt).toLocaleString()}</span>
            {timeUntilExpiry() && (
              <>
                <span>•</span>
                <span
                  className={
                    isExpired ? "text-destructive" : "text-orange-600 font-medium"
                  }
                >
                  {timeUntilExpiry()}
                </span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          {expanded ? "Show less" : "Show details"}
        </button>
      </div>

      {/* Description - always shown */}
      <div className="text-sm text-muted-foreground mb-4 whitespace-pre-wrap leading-relaxed line-clamp-4">
        {approval.description}
      </div>

      {/* Expanded context */}
      {expanded && Object.keys(approval.context).length > 0 && (
        <div className="mb-4 rounded-lg bg-muted/50 p-3 border border-border">
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Context
          </p>
          <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(approval.context, null, 2)}
          </pre>
        </div>
      )}

      {/* Action buttons */}
      {!isExpired && approval.status === "pending" && (
        <div>
          {showCommentBox ? (
            <div className="space-y-3">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={`Add a comment for your ${showCommentBox} decision (optional)...`}
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleDecision(showCommentBox)}
                  disabled={responding}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-70 ${
                    showCommentBox === "approved"
                      ? "bg-green-600 hover:bg-green-500 text-white"
                      : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  }`}
                >
                  {responding
                    ? "Submitting..."
                    : showCommentBox === "approved"
                    ? "Confirm Approve"
                    : "Confirm Reject"}
                </button>
                <button
                  onClick={() => {
                    setShowCommentBox(null);
                    setComment("");
                  }}
                  disabled={responding}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowCommentBox("approved")}
                className="flex-1 rounded-lg bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/50 px-4 py-2 text-sm font-medium hover:bg-green-200 dark:hover:bg-green-900/30 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => setShowCommentBox("reject")}
                className="flex-1 rounded-lg bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50 px-4 py-2 text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}

      {isExpired && (
        <p className="text-xs text-destructive font-medium">
          This approval request has expired.
        </p>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Main page
// ----------------------------------------------------------------------------

export default function ApprovalsPage() {
  const { getToken } = useAuth();
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/executions/approvals/pending", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load approvals");
      const data = await res.json();
      setApprovals(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchApprovals();
    // Poll for new approvals every 30 seconds
    const interval = setInterval(fetchApprovals, 30_000);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  const handleRespond = useCallback(
    async (
      executionId: string,
      decision: "approved" | "rejected",
      comment?: string
    ) => {
      const token = await getToken();
      const res = await fetch(`/api/executions/${executionId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ decision, comment }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? "Failed to submit response");
      }

      const message =
        decision === "approved"
          ? "Approved! The workflow will continue."
          : "Rejected. The workflow has been stopped.";
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(null), 5000);

      // Remove from list
      setApprovals((prev) => prev.filter((a) => a.executionId !== executionId));
    },
    [getToken]
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Approval Inbox</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {approvals.length > 0
                  ? `${approvals.length} pending approval${approvals.length !== 1 ? "s" : ""} require your attention`
                  : "No pending approvals"}
              </p>
            </div>
            <button
              onClick={fetchApprovals}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Success message */}
        {successMessage && (
          <div className="mb-4 rounded-lg bg-green-100 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-900/50 dark:text-green-400 p-4 text-sm font-medium">
            {successMessage}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading approvals...
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive text-sm">
            {error}
          </div>
        )}

        {!loading && !error && approvals.length === 0 && (
          <div className="text-center py-24">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-lg font-semibold mb-2">All caught up!</h3>
            <p className="text-muted-foreground text-sm">
              You have no pending approvals. This page auto-refreshes every 30 seconds.
            </p>
          </div>
        )}

        {!loading && !error && approvals.length > 0 && (
          <div className="space-y-4">
            {approvals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                onRespond={(decision, comment) =>
                  handleRespond(approval.executionId, decision, comment)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
