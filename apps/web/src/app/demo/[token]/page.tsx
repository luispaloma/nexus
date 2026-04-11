import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";

// ----------------------------------------------------------------------------
// Public workflow demo page — no auth required
// Resolves the share token server-side and renders a read-only workflow viewer
// ----------------------------------------------------------------------------

interface WorkflowStep {
  id: string;
  name: string;
  type: string;
  description?: string;
}

interface DemoData {
  id: string;
  name: string;
  description: string | null;
  definition: { steps: WorkflowStep[] };
  version: number;
  stats: {
    totalExecutions: number;
    lastCompletedAt: string | null;
    lastDurationSeconds: number | null;
  };
  expiresAt: string;
}

const STEP_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  claude_task: { label: "AI Task", icon: "🧠", color: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800" },
  tool_call: { label: "Tool Call", icon: "⚡", color: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800" },
  human_approval: { label: "Human Approval", icon: "👤", color: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800" },
  condition: { label: "Condition", icon: "🔀", color: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800" },
  loop: { label: "Loop", icon: "🔄", color: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-800" },
};

async function fetchDemoData(token: string): Promise<DemoData | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  try {
    const res = await fetch(`${apiUrl}/api/share/${encodeURIComponent(token)}`, {
      next: { revalidate: 300 }, // cache 5 min
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data as DemoData;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await fetchDemoData(token);
  if (!data) return { title: "Demo Not Found — Nexus" };
  return {
    title: `${data.name} — Nexus Workflow Demo`,
    description: data.description ?? "View this AI-powered workflow automation demo from Nexus.",
    openGraph: {
      title: `${data.name} — Nexus Workflow Demo`,
      description: data.description ?? "AI workflow automation powered by Nexus.",
    },
  };
}

export default async function DemoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await fetchDemoData(token);

  if (!data) {
    notFound();
  }

  const steps = data.definition.steps ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Nav */}
      <nav className="border-b border-border bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-6 py-3 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center text-white font-bold text-sm">N</div>
            <span className="font-semibold text-sm">Nexus</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Shared workflow demo</span>
            <Link
              href="/sign-up"
              className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              Try free
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-3">
            <h1 className="text-3xl font-bold">{data.name}</h1>
            <span className="text-xs text-muted-foreground shrink-0 mt-1.5">v{data.version}</span>
          </div>
          {data.description && (
            <p className="text-muted-foreground leading-relaxed">{data.description}</p>
          )}

          {/* Stats */}
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>📊</span>
              <span><strong className="text-foreground">{data.stats.totalExecutions.toLocaleString()}</strong> total executions</span>
            </div>
            {data.stats.lastDurationSeconds !== null && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span>⏱</span>
                <span>Avg <strong className="text-foreground">
                  {data.stats.lastDurationSeconds < 60
                    ? `${data.stats.lastDurationSeconds}s`
                    : `${Math.round(data.stats.lastDurationSeconds / 60)}m`}
                </strong> runtime</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>🔢</span>
              <span><strong className="text-foreground">{steps.length}</strong> steps</span>
            </div>
          </div>
        </div>

        {/* Step Flow */}
        <div className="mb-8">
          <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">Workflow Steps</h2>
          <div className="space-y-3">
            {steps.map((step, idx) => {
              const meta = STEP_TYPE_LABELS[step.type] ?? { label: step.type, icon: "⚙️", color: "bg-gray-100 text-gray-700 border-gray-200" };
              return (
                <div key={step.id} className="flex gap-4 items-start">
                  {/* Step number + connector */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-8 h-8 rounded-full bg-card border-2 border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
                      {idx + 1}
                    </div>
                    {idx < steps.length - 1 && (
                      <div className="w-0.5 h-6 bg-border mt-1" />
                    )}
                  </div>
                  {/* Step card */}
                  <div className="flex-1 rounded-xl border border-border bg-card p-4 mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                        {meta.icon} {meta.label}
                      </span>
                    </div>
                    <h3 className="font-medium text-sm">{step.name}</h3>
                    {step.description && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 p-6 text-center">
          <h3 className="font-bold text-lg mb-2">Build this workflow in minutes</h3>
          <p className="text-muted-foreground text-sm mb-4 max-w-sm mx-auto">
            Nexus lets you automate any business process with AI, human approvals, and real integrations — no code required.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/sign-up"
              className="rounded-xl bg-primary text-primary-foreground px-6 py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Start free — 50 executions/mo
            </Link>
            <Link
              href="/sign-in"
              className="rounded-xl border border-border px-6 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
            >
              Sign in
            </Link>
          </div>
          <p className="text-xs text-muted-foreground mt-3">No credit card required</p>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          This shared link expires {new Date(data.expiresAt).toLocaleDateString()}.
        </p>
      </div>
    </div>
  );
}
