"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReplyStatus =
  | "no_reply"
  | "replied"
  | "demo_booked"
  | "in_evaluation"
  | "closed_won"
  | "closed_lost";

interface PipelineContact {
  id: string;
  contactName: string;
  contactEmail: string;
  contactTitle: string;
  companyName: string;
  vertical: string;
  companySize: string;
  outreachDate: string;
  replyStatus: ReplyStatus;
  nextAction: string | null;
  nextActionDue: string | null;
  notes: string | null;
}

interface Stats {
  byStatus: Record<ReplyStatus, number>;
  byVertical: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<ReplyStatus, string> = {
  no_reply: "No Reply",
  replied: "Replied",
  demo_booked: "Demo Booked",
  in_evaluation: "In Evaluation",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
};

const STATUS_COLORS: Record<ReplyStatus, string> = {
  no_reply: "bg-slate-700 text-slate-300",
  replied: "bg-blue-900/50 text-blue-300 border border-blue-700/50",
  demo_booked: "bg-purple-900/50 text-purple-300 border border-purple-700/50",
  in_evaluation: "bg-yellow-900/50 text-yellow-300 border border-yellow-700/50",
  closed_won: "bg-green-900/50 text-green-300 border border-green-700/50",
  closed_lost: "bg-red-900/50 text-red-400 border border-red-700/50",
};

const VERTICAL_COLORS: Record<string, string> = {
  FinTech: "bg-nexus-900/50 text-nexus-300 border border-nexus-700/40",
  "Professional Services": "bg-teal-900/50 text-teal-300 border border-teal-700/40",
  Logistics: "bg-orange-900/50 text-orange-300 border border-orange-700/40",
};

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-5">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-slate-400 text-sm mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PipelinePage() {
  const { getToken } = useAuth();

  const [contacts, setContacts] = useState<PipelineContact[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");

  // Filters
  const [q, setQ] = useState("");
  const [filterVertical, setFilterVertical] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (q) params.set("q", q);
      if (filterVertical) params.set("vertical", filterVertical);
      if (filterStatus) params.set("replyStatus", filterStatus);

      const [contactsRes, statsRes] = await Promise.all([
        fetch(`/api/pipeline?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/pipeline/stats`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (contactsRes.ok) {
        const json = await contactsRes.json();
        setContacts(json.data);
        setTotal(json.total);
        setHasMore(json.hasMore);
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } finally {
      setLoading(false);
    }
  }, [getToken, page, q, filterVertical, filterStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStatusChange = async (id: string, replyStatus: ReplyStatus) => {
    const token = await getToken();
    await fetch(`/api/pipeline/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ replyStatus }),
    });
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, replyStatus } : c))
    );
  };

  const handleSeed = async () => {
    setSeeding(true);
    setSeedMsg("");
    try {
      const token = await getToken();
      const res = await fetch("/api/pipeline/seed", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setSeedMsg(`Seeded ${json.inserted} contacts.`);
      await fetchData();
    } finally {
      setSeeding(false);
    }
  };

  const conversionRate =
    stats && (stats.byStatus.closed_won || 0) > 0
      ? (((stats.byStatus.closed_won || 0) / total) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="min-h-screen bg-gradient-to-br from-nexus-950 via-nexus-900 to-slate-900 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/10">
        <div className="flex items-center gap-4">
          <Link href="/workflows" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-nexus-500 rounded-lg flex items-center justify-center font-bold text-sm">
              N
            </div>
            <span className="font-semibold text-sm">Nexus</span>
          </Link>
          <span className="text-slate-600">/</span>
          <span className="text-slate-300 text-sm font-medium">SDR Pipeline</span>
        </div>
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="rounded-lg bg-nexus-500 hover:bg-nexus-400 disabled:opacity-50 px-4 py-2 text-sm font-medium transition-colors"
        >
          {seeding ? "Seeding…" : "Import Prospects"}
        </button>
      </nav>

      <div className="px-8 py-8 max-w-screen-xl mx-auto">
        {seedMsg && (
          <div className="mb-6 rounded-lg bg-green-900/40 border border-green-700/50 px-4 py-3 text-sm text-green-300">
            {seedMsg}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-6">Pipeline Overview</h1>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
              <StatCard label="Total Contacts" value={total} />
              <StatCard
                label="Replied"
                value={(stats.byStatus.replied || 0) + (stats.byStatus.demo_booked || 0) + (stats.byStatus.in_evaluation || 0)}
              />
              <StatCard label="Demo Booked" value={stats.byStatus.demo_booked || 0} />
              <StatCard label="In Evaluation" value={stats.byStatus.in_evaluation || 0} />
              <StatCard label="Closed Won" value={stats.byStatus.closed_won || 0} sub={`${conversionRate}% conversion`} />
              <StatCard label="No Reply" value={stats.byStatus.no_reply || 0} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(stats.byVertical).map(([vertical, count]) => (
                <div key={vertical} className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-center justify-between">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${VERTICAL_COLORS[vertical] ?? "bg-slate-700 text-slate-300"}`}>
                    {vertical}
                  </span>
                  <span className="font-bold text-white">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search name, company, email…"
            className="rounded-lg bg-white/5 border border-white/15 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-nexus-500 w-64"
          />
          <select
            value={filterVertical}
            onChange={(e) => { setFilterVertical(e.target.value); setPage(1); }}
            className="rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-nexus-500"
          >
            <option value="">All Verticals</option>
            <option value="FinTech">FinTech</option>
            <option value="Professional Services">Professional Services</option>
            <option value="Logistics">Logistics</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-nexus-500"
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <span className="ml-auto text-slate-500 text-sm self-center">{total} contacts</span>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Contact</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Company</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Vertical</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Outreach</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Next Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    No contacts found.{" "}
                    <button onClick={handleSeed} className="text-nexus-400 hover:underline">
                      Import prospects
                    </button>{" "}
                    to get started.
                  </td>
                </tr>
              ) : (
                contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{c.contactName}</div>
                      <div className="text-slate-500 text-xs">{c.contactTitle}</div>
                      <div className="text-slate-500 text-xs">{c.contactEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white">{c.companyName}</div>
                      <div className="text-slate-500 text-xs">{c.companySize} employees</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${VERTICAL_COLORS[c.vertical] ?? "bg-slate-700 text-slate-300"}`}
                      >
                        {c.vertical}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {new Date(c.outreachDate).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={c.replyStatus}
                        onChange={(e) => handleStatusChange(c.id, e.target.value as ReplyStatus)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-nexus-500 ${STATUS_COLORS[c.replyStatus]}`}
                        style={{ background: "transparent" }}
                      >
                        {Object.entries(STATUS_LABELS).map(([val, label]) => (
                          <option
                            key={val}
                            value={val}
                            style={{ background: "#0f172a", color: "white" }}
                          >
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-48 truncate">
                      {c.nextAction ?? <span className="text-slate-600">—</span>}
                      {c.nextActionDue && (
                        <div className="text-slate-500">
                          Due:{" "}
                          {new Date(c.nextActionDue).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm disabled:opacity-40 hover:bg-white/5 transition-colors"
          >
            Previous
          </button>
          <span className="text-slate-500 text-sm">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm disabled:opacity-40 hover:bg-white/5 transition-colors"
          >
            Next
          </button>
        </div>

        <p className="text-xs text-slate-600 mt-8 text-center">
          Interim tracker — will migrate to HubSpot once board completes{" "}
          <span className="text-slate-500">MAAA-32</span>
        </p>
      </div>
    </div>
  );
}
