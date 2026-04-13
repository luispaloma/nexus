import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nexus - AI Workflow Automation",
};

// ----------------------------------------------------------------------------
// Landing / Dashboard root page
// Authenticated users -> /workflows
// Unauthenticated users -> marketing landing page
// ----------------------------------------------------------------------------

export default async function HomePage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/workflows");
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-nexus-950 via-nexus-900 to-slate-900 text-white">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-nexus-500 rounded-lg flex items-center justify-center font-bold text-lg">
            N
          </div>
          <span className="text-xl font-bold tracking-tight">Nexus</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/blog"
            className="text-sm text-slate-300 hover:text-white transition-colors"
          >
            Blog
          </Link>
          <Link
            href="/customers"
            className="text-sm text-slate-300 hover:text-white transition-colors"
          >
            Customers
          </Link>
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

      {/* Hero */}
      <section className="px-8 pt-20 pb-32 max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-nexus-900/50 border border-nexus-700/50 px-4 py-1.5 text-xs text-nexus-300 mb-8">
          <span className="w-1.5 h-1.5 bg-nexus-400 rounded-full animate-pulse-slow" />
          Powered by Claude claude-sonnet-4-6
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-tight">
          Automate workflows
          <br />
          <span className="text-nexus-400">with AI intelligence</span>
        </h1>

        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
          Build complex multi-step automations that think. From invoice approval to
          contract review, Nexus combines Claude AI with human oversight to handle
          your most critical business processes.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/sign-up"
            className="rounded-xl bg-nexus-500 hover:bg-nexus-400 px-8 py-4 text-base font-semibold transition-colors"
          >
            Start automating for free
          </Link>
          <Link
            href="#how-it-works"
            className="rounded-xl border border-white/20 hover:border-white/40 px-8 py-4 text-base font-semibold transition-colors"
          >
            See how it works
          </Link>
        </div>

        <p className="text-xs text-slate-500 mt-4">
          No credit card required. 50 executions free every month.
        </p>
      </section>

      {/* Features */}
      <section id="how-it-works" className="px-8 py-24 max-w-7xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-4">
          AI workflows that handle your toughest processes
        </h2>
        <p className="text-slate-400 text-center mb-16 max-w-xl mx-auto">
          Nexus combines Claude AI reasoning with configurable steps, human approval
          gates, and real integrations.
        </p>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: "🧠",
              title: "AI-Powered Steps",
              description:
                "Claude analyzes documents, scores leads, and extracts insights at each workflow step — with full context from prior steps.",
            },
            {
              icon: "👤",
              title: "Human-in-the-Loop",
              description:
                "Pause workflows for human review and approval before critical actions. Approvers get AI summaries to decide faster.",
            },
            {
              icon: "⚡",
              title: "Real Integrations",
              description:
                "Send Slack messages, emails via Resend, and call any HTTP API. Connect to your existing tools without writing code.",
            },
            {
              icon: "🔄",
              title: "Retry & Recovery",
              description:
                "Configurable retry logic with exponential backoff. Failures are captured, logged, and recoverable.",
            },
            {
              icon: "📊",
              title: "Full Audit Trail",
              description:
                "Every execution, step, and approval is logged. Know exactly what happened, when, and why.",
            },
            {
              icon: "🚀",
              title: "Template Library",
              description:
                "Start with production-ready templates: invoice approval, contract review, lead qualification, and more.",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl bg-white/5 border border-white/10 p-6 hover:bg-white/8 transition-colors"
            >
              <div className="text-3xl mb-4">{feature.icon}</div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-8 py-24 text-center">
        <h2 className="text-4xl font-bold mb-4">Ready to automate?</h2>
        <p className="text-slate-400 mb-8 max-w-md mx-auto">
          Join teams using Nexus to save hours on manual processes every week.
        </p>
        <Link
          href="/sign-up"
          className="inline-block rounded-xl bg-nexus-500 hover:bg-nexus-400 px-10 py-4 text-base font-semibold transition-colors"
        >
          Get started for free
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
