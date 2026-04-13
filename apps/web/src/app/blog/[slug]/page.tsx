import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { BLOG_POSTS, getBlogPost } from "../data";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};
  return {
    title: post.metaTitle,
    description: post.metaDescription,
    openGraph: {
      title: post.metaTitle,
      description: post.metaDescription,
      type: "article",
      publishedTime: post.publishedAt,
      tags: post.tags,
    },
  };
}

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  FinTech: "bg-nexus-900/50 text-nexus-300 border border-nexus-700/40",
  "Professional Services": "bg-teal-900/50 text-teal-300 border border-teal-700/40",
  Logistics: "bg-orange-900/50 text-orange-300 border border-orange-700/40",
  "Finance Operations": "bg-purple-900/50 text-purple-300 border border-purple-700/40",
  "Buyers Guide": "bg-slate-700 text-slate-300 border border-slate-600/50",
};

/** Render a body string with **bold** → <strong> and newlines → paragraphs */
function renderBody(text: string): React.ReactNode[] {
  return text.split("\n\n").map((para, i) => {
    if (para.startsWith("**") && para.includes("**\n")) {
      // Sub-heading style paragraph
      const [heading, ...rest] = para.split("\n");
      return (
        <div key={i} className="mb-4">
          <p className="font-semibold text-white mb-1">
            {heading.replace(/\*\*/g, "")}
          </p>
          <p className="text-slate-300 leading-relaxed">{rest.join("\n")}</p>
        </div>
      );
    }
    // Inline bold
    const parts = para.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className="text-slate-300 leading-relaxed mb-4">
        {parts.map((part, j) =>
          part.startsWith("**") ? (
            <strong key={j} className="text-white font-semibold">
              {part.slice(2, -2)}
            </strong>
          ) : (
            part
          )
        )}
      </p>
    );
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  // Related posts (same category or overlapping tags, excluding self)
  const related = BLOG_POSTS.filter(
    (p) => p.slug !== post.slug && (p.category === post.category || p.tags.some((t) => post.tags.includes(t)))
  ).slice(0, 2);

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
          <Link href="/blog" className="text-sm text-slate-300 hover:text-white transition-colors">
            Blog
          </Link>
          <Link href="/customers" className="text-sm text-slate-300 hover:text-white transition-colors">
            Customers
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg bg-nexus-500 hover:bg-nexus-400 px-4 py-2 text-sm font-medium transition-colors"
          >
            Get started free
          </Link>
        </div>
      </nav>

      {/* Article */}
      <article className="px-8 py-12 max-w-3xl mx-auto">
        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${CATEGORY_COLORS[post.category] ?? "bg-slate-700 text-slate-300"}`}
            >
              {post.category}
            </span>
            <span className="text-slate-500 text-xs">
              {new Date(post.publishedAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              · {post.readingMinutes} min read
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6 leading-snug">
            {post.title}
          </h1>

          {/* Hero stat */}
          <div className="rounded-2xl bg-nexus-900/40 border border-nexus-700/40 p-6 flex items-center gap-6">
            <div>
              <div className="text-4xl font-bold text-nexus-400">{post.heroStat}</div>
              <div className="text-slate-300 text-sm mt-0.5">{post.heroStatLabel}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-xs text-slate-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </header>

        {/* Sections */}
        <div className="space-y-10">
          {post.sections.map((section, i) => (
            <section key={i}>
              {section.heading && (
                <h2 className="text-xl font-bold text-white mb-4">{section.heading}</h2>
              )}

              {renderBody(section.body)}

              {section.listItems && (
                <ul className="space-y-2.5 mb-4">
                  {section.listItems.map((item, j) => {
                    const parts = item.split(/(\*\*[^*]+\*\*)/g);
                    return (
                      <li key={j} className="flex items-start gap-3 text-slate-300">
                        <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-nexus-400" />
                        <span>
                          {parts.map((p, k) =>
                            p.startsWith("**") ? (
                              <strong key={k} className="text-white font-semibold">
                                {p.slice(2, -2)}
                              </strong>
                            ) : (
                              p
                            )
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {section.callout && (
                <div
                  className={`rounded-xl p-5 mt-4 ${
                    section.callout.type === "stat"
                      ? "bg-nexus-900/40 border border-nexus-700/40"
                      : section.callout.type === "tip"
                      ? "bg-teal-900/30 border border-teal-700/40"
                      : "bg-nexus-500/10 border border-nexus-500/30"
                  }`}
                >
                  {section.callout.type === "cta" ? (
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <p className="text-slate-200 text-sm">{section.callout.text}</p>
                      <Link
                        href="/sign-up"
                        className="shrink-0 rounded-lg bg-nexus-500 hover:bg-nexus-400 px-4 py-2 text-sm font-medium transition-colors"
                      >
                        Try Nexus free
                      </Link>
                    </div>
                  ) : (
                    <p
                      className={`text-sm leading-relaxed ${
                        section.callout.type === "tip" ? "text-teal-200" : "text-nexus-200"
                      }`}
                    >
                      {section.callout.type === "stat" ? "📊 " : "💡 "}
                      {section.callout.text}
                    </p>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>

        {/* Final CTA */}
        <div className="mt-16 rounded-2xl bg-nexus-900/40 border border-nexus-700/40 p-8 text-center">
          <h3 className="text-xl font-bold mb-3">Start automating today</h3>
          <p className="text-slate-400 text-sm mb-6 max-w-sm mx-auto">
            Use Nexus to deploy the workflows described in this article. Production-ready
            templates, no credit card required.
          </p>
          <Link
            href="/sign-up"
            className="inline-block rounded-xl bg-nexus-500 hover:bg-nexus-400 px-8 py-3.5 text-sm font-semibold transition-colors"
          >
            Get started free
          </Link>
        </div>
      </article>

      {/* Related posts */}
      {related.length > 0 && (
        <section className="px-8 py-16 max-w-3xl mx-auto border-t border-white/10">
          <h3 className="text-lg font-bold mb-6 text-slate-300">Related articles</h3>
          <div className="grid sm:grid-cols-2 gap-5">
            {related.map((p) => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="block rounded-xl bg-white/5 border border-white/10 p-5 hover:bg-white/8 hover:border-nexus-700/50 transition-all group"
              >
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium mb-3 inline-block ${CATEGORY_COLORS[p.category] ?? "bg-slate-700 text-slate-300"}`}
                >
                  {p.category}
                </span>
                <h4 className="font-semibold text-sm leading-snug group-hover:text-nexus-300 transition-colors">
                  {p.title}
                </h4>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-white/10 px-8 py-8 max-w-7xl mx-auto flex items-center justify-between text-sm text-slate-500">
        <span>© 2026 Nexus. All rights reserved.</span>
        <div className="flex gap-6">
          <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
          <Link href="/customers" className="hover:text-white transition-colors">Customers</Link>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
        </div>
      </footer>
    </main>
  );
}
