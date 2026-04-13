import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

// ---------------------------------------------------------------------------
// Case study data — fictional but realistic early-adopter stories
// ---------------------------------------------------------------------------

const caseStudies = {
  fintech: {
    vertical: "FinTech",
    slug: "fintech",
    customer: "Meridian Capital Partners",
    tagline: "Boutique asset manager, 140 employees",
    heroStat: "73%",
    heroStatLabel: "reduction in invoice processing time",
    accentColor: "nexus",
    problem: {
      heading: "Manual approvals were creating compliance gaps and burning analyst hours",
      body: "Meridian's finance team processed 400+ vendor invoices per month entirely by email. Each invoice required GL coding, a two-tier sign-off, and an export into their ERP — a chain that averaged 8.4 days and left auditors chasing PDF trails. With new DORA compliance requirements looming, the team knew fragmented approvals were a liability, not just an inefficiency.",
      painPoints: [
        "8.4-day average invoice cycle — well above industry benchmark of 3 days",
        "No machine-readable audit log; auditors spent 12 hours per quarter reconstructing approvals from email chains",
        "2.3 FTE-hours per week spent on manual GL coding and routing",
        "Zero visibility into approval bottlenecks until a payment deadline was missed",
      ],
    },
    solution: {
      heading: "An AI-native approval workflow with full audit trail",
      body: "Meridian deployed Nexus's Invoice Approval template and customised it in a single afternoon. Claude extracts line-item data from PDFs, maps each item to the correct GL code using Meridian's chart-of-accounts context, and routes for approval — escalating automatically if no response within 24 hours. Every step is timestamped and immutable.",
      steps: [
        "Invoice ingestion via email or upload — Claude extracts vendor, amount, line items, and due date",
        "Automated GL coding against Meridian's CoA (98% accuracy on first run)",
        "Two-tier approval gate: team lead → CFO for invoices > €10 000",
        "ERP write-back via HTTP integration upon final approval",
        "Compliance-grade audit log exported automatically to S3",
      ],
    },
    results: [
      { stat: "73%", label: "reduction in invoice cycle time (8.4 days → 2.3 days)" },
      { stat: "100%", label: "audit trail coverage — zero manual reconstruction for auditors" },
      { stat: "2.3 FTE-hrs", label: "saved per week on GL coding and routing" },
      { stat: "€0", label: "late payment penalties in the 6 months since go-live" },
    ],
    quote: {
      body: "Our CFO said it was the fastest ROI she'd seen on any software purchase. We were live in a day and the audit prep that used to take half a week now takes an hour.",
      author: "Head of Finance Operations",
      company: "Meridian Capital Partners",
    },
  },

  "professional-services": {
    vertical: "Professional Services",
    slug: "professional-services",
    customer: "Vantage Consulting Group",
    tagline: "Mid-market strategy consultancy, 320 employees",
    heroStat: "4×",
    heroStatLabel: "faster contract turnaround",
    accentColor: "nexus",
    problem: {
      heading: "A 5-day contract review cycle was bottlenecking the entire sales pipeline",
      body: "Vantage's deal desk reviewed every client MSA and SOW before signature — a thorough process that took an average of 5 working days. As the firm grew from 200 to 320 staff, legal throughput didn't scale. Deals stalled, clients chased, and a backlog of €2M in unsigned contracts sat in the pipeline at any given moment.",
      painPoints: [
        "5-day average contract review — clients routinely threatened to re-engage competitors",
        "€2M average pipeline backlog waiting on legal sign-off",
        "Legal team spent 60% of time on routine extraction (parties, term, SLA clauses) rather than risk analysis",
        "No standardised risk scoring — every reviewer applied personal judgment inconsistently",
      ],
    },
    solution: {
      heading: "AI-assisted contract review with automatic risk flagging and parallel onboarding",
      body: "Vantage implemented Nexus's Contract Review workflow to front-load AI extraction before any human touches the document. Claude reads each contract, extracts key terms, scores risk clauses against Vantage's policy checklist, and produces a structured summary for legal review. Clean contracts self-approve; flagged clauses go to a named reviewer. Once signed, the onboarding checklist triggers automatically.",
      steps: [
        "Contract uploaded to Nexus — Claude extracts parties, term, value, SLA, IP, and liability caps",
        "Automated risk scoring against Vantage's 14-point policy checklist",
        "Low-risk contracts (score < 3): auto-approved for signature",
        "High-risk contracts: routed to senior legal with AI-generated clause-by-clause summary",
        "On signature: client onboarding checklist created and assigned to delivery lead",
      ],
    },
    results: [
      { stat: "4×", label: "faster contract turnaround (5 days → 1.2 days average)" },
      { stat: "€840K", label: "pipeline unblocked in the first quarter post-launch" },
      { stat: "0", label: "compliance incidents in 6 months — first clean audit in 3 years" },
      { stat: "60%", label: "of legal time freed from routine extraction to strategic review" },
    ],
    quote: {
      body: "Legal used to be the bottleneck everyone complained about. Now they're the team that ships fastest. The AI handles the extraction; our lawyers focus on the decisions that actually matter.",
      author: "Chief Operating Officer",
      company: "Vantage Consulting Group",
    },
  },

  logistics: {
    vertical: "Logistics",
    slug: "logistics",
    customer: "FlowBridge Freight",
    tagline: "Regional 3PL operator, 580 employees",
    heroStat: "2×",
    heroStatLabel: "faster shipment exception resolution",
    accentColor: "nexus",
    problem: {
      heading: "Shipment exceptions required 4-department coordination and averaged 12 hours to resolve",
      body: "FlowBridge handles 3 000+ shipments per week across 14 carrier relationships. Every exception — a missed pickup, damaged cargo, customs hold — required manual notification chains across operations, finance, customer success, and carrier accounts. The average resolution took 12 hours; SLA breaches were costing the business €180K in annual penalties.",
      painPoints: [
        "12-hour average exception resolution — SLA target was 6 hours",
        "67% SLA adherence rate; contract minimums required 85%",
        "€180K/year in client penalty charges for missed SLAs",
        "Ops team spent 3+ hours daily on status update emails across departments",
      ],
    },
    solution: {
      heading: "Smart multi-party routing with auto-escalation and carrier notification",
      body: "FlowBridge deployed Nexus's Shipment Exception workflow to replace the email chain with an intelligent routing engine. When a carrier posts an exception, Nexus classifies it, determines the correct resolution path (ops-only vs. finance approval vs. client notification), and routes with context-rich summaries. Escalation fires automatically at 2-hour intervals if no response.",
      steps: [
        "Exception event received from carrier API or EDI feed",
        "Claude classifies exception type and determines resolution owner(s)",
        "Parallel notification to all relevant parties with pre-populated action options",
        "Automated escalation if no acknowledgement within 2 hours",
        "On resolution: carrier update sent, client notified, SLA clock stopped with audit record",
      ],
    },
    results: [
      { stat: "2×", label: "faster exception resolution (12 hrs → 5.8 hrs average)" },
      { stat: "94%", label: "SLA adherence rate — up from 67%, exceeding all client minimums" },
      { stat: "€180K", label: "in annual penalty charges eliminated" },
      { stat: "3 hrs", label: "per day returned to ops team from status-update email work" },
    ],
    quote: {
      body: "We went from dreading Monday morning exception queues to having dashboards that practically run themselves. Our biggest client renewed and increased volume 40% after seeing our SLA numbers improve.",
      author: "VP of Operations",
      company: "FlowBridge Freight",
    },
  },
} as const;

type VerticalSlug = keyof typeof caseStudies;

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ vertical: string }>;
}): Promise<Metadata> {
  const { vertical } = await params;
  const cs = caseStudies[vertical as VerticalSlug];
  if (!cs) return {};
  return {
    title: `${cs.customer} — ${cs.vertical} Case Study`,
    description: `How ${cs.customer} used Nexus to achieve ${cs.heroStat} ${cs.heroStatLabel}.`,
  };
}

export function generateStaticParams() {
  return Object.keys(caseStudies).map((vertical) => ({ vertical }));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CaseStudyPage({
  params,
}: {
  params: Promise<{ vertical: string }>;
}) {
  const { vertical } = await params;
  const cs = caseStudies[vertical as VerticalSlug];
  if (!cs) notFound();

  return (
    <main className="min-h-screen bg-gradient-to-br from-nexus-950 via-nexus-900 to-slate-900 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-nexus-500 rounded-lg flex items-center justify-center font-bold text-lg">
            N
          </div>
          <span className="text-xl font-bold tracking-tight">Nexus</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/customers"
            className="text-sm text-slate-300 hover:text-white transition-colors"
          >
            All case studies
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg bg-nexus-500 hover:bg-nexus-400 px-4 py-2 text-sm font-medium transition-colors"
          >
            Get started free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="px-8 pt-16 pb-20 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full bg-nexus-900/50 border border-nexus-700/50 px-4 py-1.5 text-xs text-nexus-300 mb-6">
          {cs.vertical} · Case Study
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 leading-tight">
          {cs.customer}
        </h1>
        <p className="text-slate-400 text-lg mb-10">{cs.tagline}</p>

        {/* Hero stat */}
        <div className="rounded-2xl bg-nexus-900/40 border border-nexus-700/40 p-8 inline-block">
          <div className="text-6xl font-bold text-nexus-400 mb-1">{cs.heroStat}</div>
          <div className="text-slate-300 text-lg">{cs.heroStatLabel}</div>
        </div>
      </header>

      {/* Problem */}
      <section className="px-8 py-16 max-w-4xl mx-auto">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-nexus-400">
          The Problem
        </div>
        <h2 className="text-2xl font-bold mb-6">{cs.problem.heading}</h2>
        <p className="text-slate-300 leading-relaxed mb-8">{cs.problem.body}</p>
        <ul className="space-y-3">
          {cs.problem.painPoints.map((point) => (
            <li key={point} className="flex items-start gap-3 text-slate-300">
              <span className="mt-1 shrink-0 w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 text-xs">
                ✕
              </span>
              {point}
            </li>
          ))}
        </ul>
      </section>

      <div className="max-w-4xl mx-auto px-8">
        <div className="border-t border-white/10" />
      </div>

      {/* Solution */}
      <section className="px-8 py-16 max-w-4xl mx-auto">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-nexus-400">
          The Solution
        </div>
        <h2 className="text-2xl font-bold mb-6">{cs.solution.heading}</h2>
        <p className="text-slate-300 leading-relaxed mb-8">{cs.solution.body}</p>
        <ol className="space-y-4">
          {cs.solution.steps.map((step, i) => (
            <li key={step} className="flex items-start gap-4">
              <span className="shrink-0 w-7 h-7 rounded-full bg-nexus-500/20 border border-nexus-500/40 flex items-center justify-center text-nexus-400 text-sm font-bold">
                {i + 1}
              </span>
              <span className="text-slate-300 pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="max-w-4xl mx-auto px-8">
        <div className="border-t border-white/10" />
      </div>

      {/* Results */}
      <section className="px-8 py-16 max-w-4xl mx-auto">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-nexus-400">
          The Results
        </div>
        <h2 className="text-2xl font-bold mb-10">By the numbers</h2>
        <div className="grid sm:grid-cols-2 gap-6">
          {cs.results.map((r) => (
            <div
              key={r.stat}
              className="rounded-2xl bg-white/5 border border-white/10 p-6 hover:bg-white/8 transition-colors"
            >
              <div className="text-4xl font-bold text-nexus-400 mb-2">{r.stat}</div>
              <div className="text-slate-300 text-sm leading-relaxed">{r.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Quote */}
      <section className="px-8 py-16 max-w-4xl mx-auto">
        <figure className="rounded-2xl bg-nexus-900/40 border border-nexus-700/40 p-8">
          <blockquote className="text-xl text-white leading-relaxed mb-6">
            &ldquo;{cs.quote.body}&rdquo;
          </blockquote>
          <figcaption className="text-slate-400 text-sm">
            <span className="font-medium text-white">{cs.quote.author}</span>
            {" · "}
            {cs.quote.company}
          </figcaption>
        </figure>
      </section>

      {/* CTA */}
      <section className="px-8 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to get similar results?</h2>
        <p className="text-slate-400 mb-8 max-w-md mx-auto">
          Join {cs.vertical} teams using Nexus to automate their most critical workflows.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/sign-up"
            className="rounded-xl bg-nexus-500 hover:bg-nexus-400 px-8 py-4 text-base font-semibold transition-colors"
          >
            Start free — no credit card required
          </Link>
          <Link
            href="/customers"
            className="rounded-xl border border-white/20 hover:border-white/40 px-8 py-4 text-base font-semibold transition-colors"
          >
            See all case studies
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-8 py-8 max-w-7xl mx-auto flex items-center justify-between text-sm text-slate-500">
        <span>© 2026 Nexus. All rights reserved.</span>
        <div className="flex gap-6">
          <Link href="/customers" className="hover:text-white transition-colors">Customers</Link>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          <Link href="mailto:hello@nexus.ai" className="hover:text-white transition-colors">Contact</Link>
        </div>
      </footer>
    </main>
  );
}
