"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import Link from "next/link";

// Pages where we never block even if trial is expired
const UNBLOCKED_PATHS = ["/billing", "/onboarding", "/sign-in", "/sign-up"];

// ============================================================================
// TrialExpiredGate
// Full-screen overlay shown when the org's 14-day trial has expired.
// Blocks access until the user upgrades.
// ============================================================================

export default function TrialExpiredGate({ children }: { children: React.ReactNode }) {
  const { getToken, isSignedIn } = useAuth();
  const pathname = usePathname();
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSignedIn) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function checkTrial() {
      try {
        const token = await getToken();
        const res = await fetch("/api/billing/trial", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          // 402 = trial expired (from auth middleware) or payment required
          if (res.status === 402) {
            const body = await res.json().catch(() => ({}));
            if (!cancelled && body?.details?.trialExpired) setExpired(true);
          }
          return;
        }
        const json = await res.json();
        if (!cancelled && json.data?.isExpired) setExpired(true);
      } catch {
        // Non-fatal
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    checkTrial();
    return () => { cancelled = true; };
  }, [isSignedIn, getToken]);

  const isUnblocked = UNBLOCKED_PATHS.some((p) => pathname?.startsWith(p));

  if (loading || !expired || isUnblocked) return <>{children}</>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        {/* Icon */}
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">Your trial has ended</h1>
        <p className="text-slate-500 text-sm mb-6 leading-relaxed">
          Your 14-day free trial is over. Upgrade to Starter to keep your workflows, execution history, and team access.
        </p>

        {/* Plan card */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-6 text-left">
          <div className="flex items-baseline justify-between mb-3">
            <span className="font-bold text-slate-900 text-lg">Starter</span>
            <span className="font-bold text-slate-900">
              €299<span className="text-sm font-normal text-slate-500">/mo</span>
            </span>
          </div>
          <ul className="space-y-1.5 text-sm text-slate-600">
            {[
              "1,000 workflow runs / month",
              "5 team members",
              "All your existing workflows",
              "Google Workspace + email integrations",
              "Audit logs & email support",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <Link
          href="/billing"
          className="block w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 transition-colors text-white font-semibold py-3 text-center"
        >
          Upgrade to Starter — €299/mo
        </Link>

        <p className="text-xs text-slate-400 mt-4">
          Cancel anytime. Need Enterprise?{" "}
          <a href="mailto:sales@nexus.ai" className="text-indigo-500 hover:underline">
            Contact sales
          </a>
        </p>
      </div>
    </div>
  );
}
