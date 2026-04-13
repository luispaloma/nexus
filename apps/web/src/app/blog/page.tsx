import Link from "next/link";
import type { Metadata } from "next";
import { BLOG_POSTS } from "./data";

export const metadata: Metadata = {
  title: "Blog — AI Workflow Automation Insights | Nexus",
  description:
    "Practical guides on AI workflow automation for FinTech, Professional Services, and Logistics teams. Real use cases, real results.",
};

const CATEGORY_COLORS: Record<string, string> = {
  FinTech: "bg-nexus-900/50 text-nexus-300 border border-nexus-700/40",
  "Professional Services": "bg-teal-900/50 text-teal-300 border border-teal-700/40",
  Logistics: "bg-orange-900/50 text-orange-300 border border-orange-700/40",
  "Finance Operations": "bg-purple-900/50 text-purple-300 border border-purple-700/40",
  "Buyers Guide": "bg-slate-700 text-slate-300 border border-slate-600/50",
};

export default function BlogIndexPage() {
  const sorted = [...BLOG_POSTS].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

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
          <Link href="/customers" className="text-sm text-slate-300 hover:text-white transition-colors">
            Customers
          </Link>
          <Link href="/sign-in" className="text-sm text-slate-300 hover:text-white transition-colors">
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
          Nexus Blog
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          AI Workflow Automation Insights
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
          Practical guides for FinTech, Professional Services, and Logistics teams automating
          critical business workflows with AI.
        </p>
      </header>

      {/* Post list */}
      <section className="px-8 pb-24 max-w-4xl mx-auto">
        <div className="space-y-6">
          {sorted.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block rounded-2xl bg-white/5 border border-white/10 p-7 hover:bg-white/8 hover:border-nexus-700/50 transition-all group"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${CATEGORY_COLORS[post.category] ?? "bg-slate-700 text-slate-300"}`}
                >
                  {post.category}
                </span>
                <span className="text-slate-500 text-xs shrink-0">
                  {new Date(post.publishedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}{" "}
                  · {post.readingMinutes} min read
                </span>
              </div>

              <h2 className="text-lg font-bold mb-2 group-hover:text-nexus-300 transition-colors leading-snug">
                {post.title}
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-5">{post.metaDescription}</p>

              <div className="flex items-center gap-6">
                <div>
                  <div className="text-2xl font-bold text-nexus-400">{post.heroStat}</div>
                  <div className="text-slate-500 text-xs">{post.heroStatLabel}</div>
                </div>
                <div className="flex gap-2 flex-wrap ml-auto">
                  {post.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-xs text-slate-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <span className="text-nexus-400 text-sm font-medium group-hover:translate-x-1 transition-transform ml-4 shrink-0">
                  Read →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-8 py-20 text-center border-t border-white/10">
        <h2 className="text-3xl font-bold mb-4">Ready to automate your workflows?</h2>
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
          <Link href="/customers" className="hover:text-white transition-colors">Customers</Link>
          <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
        </div>
      </footer>
    </main>
  );
}
