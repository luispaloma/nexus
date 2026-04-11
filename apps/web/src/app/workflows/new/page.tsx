"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import type { WorkflowDefinitionBody, WorkflowStep, StepType } from "@nexus/types";

// ----------------------------------------------------------------------------
// Templates gallery
// ----------------------------------------------------------------------------

const TEMPLATES = [
  {
    key: "invoice-approval",
    name: "Invoice Approval",
    description: "AI-powered invoice review with risk assessment and finance manager approval gate",
    category: "Finance",
    icon: "💰",
    steps: 5,
  },
  {
    key: "contract-review",
    name: "Contract Review",
    description: "Comprehensive contract analysis by Claude with legal counsel approval",
    category: "Legal",
    icon: "📝",
    steps: 5,
  },
  {
    key: "lead-qualification",
    name: "Lead Qualification",
    description: "BANT-based AI lead scoring with automatic routing to sales or nurture",
    category: "Sales",
    icon: "🎯",
    steps: 5,
  },
];

// ----------------------------------------------------------------------------
// Step type options
// ----------------------------------------------------------------------------

const STEP_TYPES: { value: StepType; label: string; description: string; icon: string }[] = [
  { value: "claude_task", label: "AI Task", description: "Claude analyzes or generates content", icon: "🧠" },
  { value: "tool_call", label: "Tool Call", description: "Send Slack message, email, or HTTP request", icon: "🔧" },
  { value: "human_approval", label: "Human Approval", description: "Pause and wait for human decision", icon: "👤" },
  { value: "condition", label: "Condition", description: "Branch based on a condition", icon: "🔀" },
  { value: "loop", label: "Loop", description: "Iterate over an array of items", icon: "🔄" },
];

// ----------------------------------------------------------------------------
// Main page
// ----------------------------------------------------------------------------

type BuilderMode = "blank" | "template" | "building";

export default function NewWorkflowPage() {
  const router = useRouter();
  const { getToken } = useAuth();

  const [mode, setMode] = useState<BuilderMode>("blank");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // Load template
  // --------------------------------------------------------------------------

  const loadTemplate = async (key: string) => {
    setLoadingTemplate(key);
    try {
      const token = await getToken();
      const res = await fetch(`/api/workflows/templates/${key}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load template");
      const data = await res.json();
      const definition: WorkflowDefinitionBody = data.data;
      setSteps(definition.steps);
      const template = TEMPLATES.find((t) => t.key === key);
      if (template && !name) setName(template.name);
      setMode("building");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load template");
    } finally {
      setLoadingTemplate(null);
    }
  };

  // --------------------------------------------------------------------------
  // Add a new step
  // --------------------------------------------------------------------------

  const addStep = (type: StepType) => {
    const newStep: WorkflowStep = {
      id: `step_${Date.now()}`,
      name: `${STEP_TYPES.find((t) => t.value === type)?.label ?? type} Step`,
      type,
      config: getDefaultConfig(type),
    };
    setSteps((prev) => [...prev, newStep]);
  };

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, direction: "up" | "down") => {
    setSteps((prev) => {
      const next = [...prev];
      const swap = direction === "up" ? index - 1 : index + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
  };

  // --------------------------------------------------------------------------
  // Save workflow
  // --------------------------------------------------------------------------

  const saveWorkflow = async () => {
    if (!name.trim()) {
      setError("Workflow name is required");
      return;
    }
    if (steps.length === 0) {
      setError("Add at least one step");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const token = await getToken();
      const definition: WorkflowDefinitionBody = {
        steps,
        defaultFailurePolicy: "stop_all",
      };

      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, definition }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? "Failed to create workflow");
      }

      const data = await res.json();
      router.push(`/workflows/${data.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save workflow");
      setSaving(false);
    }
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  if (mode === "blank" || mode === "template") {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-card px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              Back
            </button>
            <h1 className="text-xl font-bold">Create New Workflow</h1>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Workflow details */}
          <div className="mb-8 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Workflow Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Invoice Approval Process"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this workflow do?"
                rows={2}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
          </div>

          {/* Options */}
          <div className="flex flex-col sm:flex-row gap-4 mb-10">
            <button
              onClick={() => setMode("building")}
              className={`flex-1 rounded-xl border-2 p-6 text-left transition-all ${
                mode === "blank"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="text-3xl mb-3">✨</div>
              <h3 className="font-semibold mb-1">Start from scratch</h3>
              <p className="text-sm text-muted-foreground">
                Build your workflow step by step with the visual builder
              </p>
            </button>
          </div>

          {/* Templates */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Or start from a template</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {TEMPLATES.map((template) => (
                <button
                  key={template.key}
                  onClick={() => loadTemplate(template.key)}
                  disabled={loadingTemplate === template.key}
                  className="rounded-xl border-2 border-border hover:border-primary/50 p-5 text-left transition-all disabled:opacity-70 group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-3xl">{template.icon}</span>
                    <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      {template.category}
                    </span>
                  </div>
                  <h3 className="font-semibold mb-1 group-hover:text-primary transition-colors">
                    {loadingTemplate === template.key ? "Loading..." : template.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">{template.description}</p>
                  <p className="text-xs text-muted-foreground mt-2">{template.steps} steps</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Building mode
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMode("blank")}
              className="text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              Back
            </button>
            <h1 className="text-lg font-bold truncate max-w-64">{name || "Untitled Workflow"}</h1>
          </div>
          <div className="flex items-center gap-3">
            {error && (
              <span className="text-xs text-destructive">{error}</span>
            )}
            <button
              onClick={saveWorkflow}
              disabled={saving}
              className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-70 transition-colors"
            >
              {saving ? "Saving..." : "Save Workflow"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 flex gap-6">
        {/* Steps list */}
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            Steps ({steps.length})
          </h2>

          {steps.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-border p-12 text-center text-muted-foreground">
              <p className="mb-2 font-medium">No steps yet</p>
              <p className="text-sm">Add steps from the panel on the right</p>
            </div>
          ) : (
            <div className="space-y-3">
              {steps.map((step, index) => {
                const typeInfo = STEP_TYPES.find((t) => t.value === step.type);
                return (
                  <div
                    key={step.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                          {index + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{step.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {typeInfo?.icon} {typeInfo?.label}
                            </span>
                          </div>
                          {step.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {step.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => moveStep(index, "up")}
                          disabled={index === 0}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 transition-colors"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveStep(index, "down")}
                          disabled={index === steps.length - 1}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 transition-colors"
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removeStep(index)}
                          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Remove step"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Step type picker */}
        <div className="w-64 shrink-0">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            Add Step
          </h2>
          <div className="space-y-2">
            {STEP_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => addStep(type.value)}
                className="w-full rounded-xl border border-border bg-card p-3 text-left hover:border-primary/50 hover:bg-primary/5 transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{type.icon}</span>
                  <div>
                    <p className="text-sm font-medium group-hover:text-primary transition-colors">
                      {type.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{type.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function getDefaultConfig(type: StepType): WorkflowStep["config"] {
  switch (type) {
    case "claude_task":
      return {
        model: "claude-sonnet-4-6",
        systemPrompt: "You are a helpful assistant.",
        userPromptTemplate: "{{input.data}}",
        outputKey: "ai_output",
        maxTokens: 4096,
      };
    case "tool_call":
      return {
        tool: "http",
        urlTemplate: "https://example.com/api",
        method: "POST",
        outputKey: "tool_output",
      };
    case "human_approval":
      return {
        title: "Review Required",
        descriptionTemplate: "Please review the following: {{input.data}}",
        assignToTemplate: "{{input.approverEmail}}",
        outputKey: "approval_response",
        expiresInHours: 48,
      };
    case "condition":
      return {
        expression: "stepOutputs.some_key === true",
        trueBranch: "",
        falseBranch: "",
      };
    case "loop":
      return {
        iterateOver: "input.items",
        itemKey: "item",
        steps: [],
        outputKey: "loop_results",
      };
  }
}
