import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Stories — Nexus",
  description:
    "See how FinTech, Professional Services, and Logistics teams use Nexus AI workflows to automate critical business processes.",
};

const caseStudies = [
  {
    slug: "fintech",
    vertical: "FinTech",
    customer: "Meridian Capital Partners",
    tagline: "Boutique asset manager",
    heroStat: "73%",
    heroStatLabel: "reduction in invoice processing time",
    summary:
      "Meridian replaced an 8-day email-based invoice approval chain with an AI-native workflow that codes, routes, and logs every invoice automatically.",
    tags: ["Invoice Approval", "Compliance", "Audit Trail"],
    icon: "🏦",
  },
  {
    slug: "professional-services",
    vertical: "Professional Services",
    customer: "Vantage Consulting Group",
    tagline: "Mid-market strategy consultancy",
    heroStat: "4×",
    heroStatLabel: "faster contract turnaround",
    summary:
      "Vantage unblocked €840K in pipeline by using Claude to extract, score, and route contracts — cutting review time from 5 days to under 2.",
    tags: ["Contract Review", "Client Onboarding", "Risk Scoring"],
    icon: "📋",
  },
  {
    slug: "logistics",
    vertical: "Logistics",
    customer: "FlowBridge Freight",
    tagline: "Regional 3PL operator",
    heroStat: "2×",
    heroStatLabel: "faster shipment exception resolution",
    summary:
      "FlowBridge replaced a 12-hour, 4-department exception email chain with smart multi-party routing — saving €180K in annual SLA penalties.",
    tags: ["Exception Handling", "Multi-Party Approval", "Carrier Ops"],
    icon: "🚛",
  },
];

export default function CustomersPage() {
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
        <div className="flex items-center gap-4">
          <Link
            href="/sign-in"
            className="text-sm text-slate-300 hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg bg-nexus-500 hover:bg-nexus-400 px-4 py-2 text-sm font-medium transition-colors"
          >
            Get started free
          </Link>
        </div>
      </nav>

      {/* Header */}
      <header className="px-8 pt-16 pb-12 max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-nexus-900/50 border border-nexus-700/50 px-4 py-1.5 text-xs text-nexus-300 mb-6">
          Customer Stories
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Real results from real teams
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
          See how teams in FinTech, Professional Services, and Logistics use Nexus to
          automate their most critical workflows — and the measurable outcomes they achieved.
        </p>
      </header>

      {/* Case study cards */}
      <section className="px-8 pb-24 max-w-5xl mx-auto">
        <div className="space-y-8">
          {caseStudies.map((cs) => (
            <Link
              key={cs.slug}
              href={`/customers/${cs.slug}`}
              className="block rounded-2xl bg-white/5 border border-white/10 p-8 hover:bg-white/8 hover:border-nexus-700/50 transition-all group"
            >
              <div className="flex items-start gap-6">
                <div className="shrink-0 text-4xl">{cs.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className="text-xs font-semibold uppercase tracking-widest text-nexus-400">
                      {cs.vertical}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="text-sm text-slate-400">{cs.tagline}</span>
                  </div>
                  <h2 className="text-xl font-bold mb-1 group-hover:text-nexus-300 transition-colors">
                    {cs.customer}
                  </h2>
                  <p className="text-slate-400 text-sm leading-relaxed mb-6">{cs.summary}</p>

                  <div className="flex items-end gap-8 flex-wrap">
                    {/* Stat */}
                    <div>
                      <div className="text-3xl font-bold text-nexus-400">{cs.heroStat}</div>
                      <div className="text-slate-400 text-xs">{cs.heroStatLabel}</div>
                    </div>

                    {/* Tags */}
                    <div className="flex gap-2 flex-wrap">
                      {cs.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-nexus-900/60 border border-nexus-700/40 px-3 py-1 text-xs text-nexus-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* CTA arrow */}
                    <span className="ml-auto text-nexus-400 text-sm font-medium group-hover:translate-x-1 transition-transform">
                      Read case study →
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-8 py-20 text-center border-t border-white/10">
        <h2 className="text-3xl font-bold mb-4">Want results like these?</h2>
        <p className="text-slate-400 mb-8 max-w-md mx-auto">
          Start with a production-ready template. Be live in under an hour.
        </p>
        <Link
          href="/sign-up"
          className="inline-block rounded-xl bg-nexus-500 hover:bg-nexus-400 px-10 py-4 text-base font-semibold transition-colors"
        >
          Start free — no credit card required
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-8 py-8 max-w-7xl mx-auto flex items-center justify-between text-sm text-slate-500">
        <span>© 2026 Nexus. All rights reserved.</span>
        <div className="flex gap-6">
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          <Link href="mailto:hello@nexus.ai" className="hover:text-white transition-colors">Contact</Link>
        </div>
      </footer>
    </main>
  );
}
