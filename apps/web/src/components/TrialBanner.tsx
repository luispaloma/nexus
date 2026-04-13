"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

// ============================================================================
// Types
// ============================================================================

interface TrialStatus {
  isTrial: boolean;
  isExpired: boolean;
  daysRemaining: number | null;
  trialEndsAt: string | null;
}

// ============================================================================
// TrialBanner
// Renders a dismissible countdown banner for users in their 14-day trial.
// Polls GET /api/billing/trial which also fires day-10 / day-13 reminder emails.
// ============================================================================

export default function TrialBanner() {
  const { getToken, isSignedIn } = useAuth();
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;

    let cancelled = false;

    async function fetchTrial() {
      try {
        const token = await getToken();
        const res = await fetch("/api/billing/trial", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setTrial(json.data as TrialStatus);
      } catch {
        // Non-fatal — banner just won't show
      }
    }

    fetchTrial();
    return () => { cancelled = true; };
  }, [isSignedIn, getToken]);

  if (!trial || !trial.isTrial || dismissed) return null;
  if (trial.isExpired) return null; // TrialExpiredGate handles this state

  const days = trial.daysRemaining ?? 0;
  const urgency = days <= 1 ? "critical" : days <= 3 ? "warning" : "info";

  const bgClass =
    urgency === "critical"
      ? "bg-red-600 text-white"
      : urgency === "warning"
      ? "bg-amber-500 text-white"
      : "bg-indigo-600 text-white";

  const label =
    days <= 0
      ? "Your trial expires today"
      : days === 1
      ? "1 day left in your trial"
      : `${days} days left in your free trial`;

  return (
    <div className={`${bgClass} px-4 py-2.5 flex items-center justify-between gap-4 text-sm`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className="shrink-0 font-medium">{label}</span>
        <span className="opacity-80 hidden sm:inline truncate">
          Upgrade now to keep your workflows and team access.
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Link
          href="/billing"
          className="inline-flex items-center gap-1.5 rounded-md bg-white/20 hover:bg-white/30 transition-colors px-3 py-1 text-sm font-semibold"
        >
          Upgrade to Starter
        </Link>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss trial banner"
          className="opacity-70 hover:opacity-100 transition-opacity text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
