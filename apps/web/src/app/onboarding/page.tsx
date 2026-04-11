"use client";

import { useState, useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

// ----------------------------------------------------------------------------
// Template gallery data
// ----------------------------------------------------------------------------

const TEMPLATES = [
  {
    key: "invoice-approval",
    name: "Invoice Approval",
    icon: "🧾",
    description: "AI-powered invoice review with risk assessment and manager approval",
    category: "Finance",
  },
  {
    key: "expense-report-approval",
    name: "Expense Report Approval",
    icon: "💳",
    description: "Policy-compliant expense review with automatic accounting notification",
    category: "Finance",
  },
  {
    key: "vendor-payment-approval",
    name: "Vendor Payment Approval",
    icon: "💸",
    description: "Fraud detection + CFO approval gate for outgoing payments",
    category: "Finance",
  },
  {
    key: "budget-request-approval",
    name: "Budget Request Approval",
    icon: "📊",
    description: "AI-scored business case with department head and CFO approval chains",
    category: "Finance",
  },
  {
    key: "month-end-close",
    name: "Month-End Close",
    icon: "📅",
    description: "AI-generated close checklist, controller review, and CFO period lock",
    category: "Finance",
  },
  {
    key: "ar-followup",
    name: "AR Follow-Up",
    icon: "📬",
    description: "Urgency-based AI collection emails with escalation routing",
    category: "Finance",
  },
  {
    key: "contract-review",
    name: "Contract Review",
    icon: "📝",
    description: "Comprehensive AI contract analysis with legal counsel approval gate",
    category: "Legal",
  },
  {
    key: "lead-qualification",
    name: "Lead Qualification",
    icon: "🎯",
    description: "BANT-based lead scoring and automated routing for sales teams",
    category: "Sales",
  },
] as const;

const TEAM_SIZES = ["solo", "2-10", "11-50", "51-200", "200+"] as const;

const USE_CASES = [
  "Finance process automation",
  "Procurement / vendor management",
  "Sales pipeline automation",
  "Legal & compliance",
  "HR & people operations",
  "Customer success",
  "Other",
];

// ----------------------------------------------------------------------------
// Multi-step onboarding wizard
// ----------------------------------------------------------------------------

type Step = "profile" | "use_case" | "template" | "done";

export default function OnboardingPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const [step, setStep] = useState<Step>("profile");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [teamSize, setTeamSize] = useState<string>("");
  const [useCase, setUseCase] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Pre-fill from Clerk user
  useEffect(() => {
    if (user) {
      setFullName(user.fullName ?? "");
    }
  }, [user]);

  const handleProfileNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !fullName.trim()) return;
    setStep("use_case");
  };

  const handleUseCaseNext = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("template");
  };

  const handleComplete = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          organizationName: orgName,
          userFullName: fullName,
          userEmail: user?.primaryEmailAddress?.emailAddress ?? "",
          teamSize: teamSize || undefined,
          primaryUseCase: useCase || undefined,
          firstWorkflowTemplate: selectedTemplate || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? "Onboarding failed");
      }

      setStep("done");
      // Redirect to workflows after brief delay
      setTimeout(() => router.push("/workflows"), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center font-bold text-xl text-primary-foreground">
            N
          </div>
          <span className="text-2xl font-bold">Nexus</span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {(["profile", "use_case", "template"] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  step === s
                    ? "bg-primary text-primary-foreground"
                    : step === "done" || (["profile", "use_case", "template"].indexOf(s) < ["profile", "use_case", "template"].indexOf(step))
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step === "done" || (["profile", "use_case", "template"].indexOf(s) < ["profile", "use_case", "template"].indexOf(step))
                  ? "✓"
                  : i + 1}
              </div>
              {i < 2 && <div className="w-8 h-0.5 bg-border" />}
            </div>
          ))}
        </div>

        {/* Step: Profile */}
        {step === "profile" && (
          <div className="rounded-2xl border border-border bg-card p-8">
            <h1 className="text-2xl font-bold mb-1">Welcome to Nexus 👋</h1>
            <p className="text-muted-foreground text-sm mb-6">Let's set up your workspace in 2 minutes.</p>

            <form onSubmit={handleProfileNext} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Your name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Company / organization name</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Acme Finance Corp"
                  required
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Team size</label>
                <div className="flex flex-wrap gap-2">
                  {TEAM_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setTeamSize(size)}
                      className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                        teamSize === size
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:bg-accent"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors mt-2"
              >
                Continue →
              </button>
            </form>
          </div>
        )}

        {/* Step: Use case */}
        {step === "use_case" && (
          <div className="rounded-2xl border border-border bg-card p-8">
            <h1 className="text-2xl font-bold mb-1">What will you automate?</h1>
            <p className="text-muted-foreground text-sm mb-6">This helps us show you the most relevant templates.</p>

            <form onSubmit={handleUseCaseNext} className="space-y-4">
              <div className="space-y-2">
                {USE_CASES.map((uc) => (
                  <button
                    key={uc}
                    type="button"
                    onClick={() => setUseCase(uc)}
                    className={`w-full text-left rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                      useCase === uc
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    {uc}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Continue →
              </button>
            </form>
          </div>
        )}

        {/* Step: Template gallery */}
        {step === "template" && (
          <div className="rounded-2xl border border-border bg-card p-8">
            <h1 className="text-2xl font-bold mb-1">Pick a starter template</h1>
            <p className="text-muted-foreground text-sm mb-6">
              We'll create your first workflow from this template. You can customise it later or skip.
            </p>

            <div className="grid grid-cols-1 gap-3 mb-6 max-h-80 overflow-y-auto pr-1">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSelectedTemplate(selectedTemplate === t.key ? null : t.key)}
                  className={`text-left rounded-xl border px-4 py-3 transition-colors ${
                    selectedTemplate === t.key
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl shrink-0">{t.icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm">{t.name}</span>
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{t.category}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{t.description}</p>
                    </div>
                    {selectedTemplate === t.key && (
                      <span className="ml-auto shrink-0 text-primary">✓</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-destructive text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleComplete}
                disabled={loading}
                className="flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-70"
              >
                {loading ? "Setting up..." : selectedTemplate ? "Get started →" : "Skip & get started →"}
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h1 className="text-2xl font-bold mb-2">You're all set, {fullName.split(" ")[0]}!</h1>
            <p className="text-muted-foreground text-sm">
              Your workspace is ready. Redirecting you to your workflows...
            </p>
            <div className="mt-6 w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}
      </div>
    </div>
  );
}
