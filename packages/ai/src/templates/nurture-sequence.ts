import type { WorkflowDefinitionBody } from "@nexus/types";

// ----------------------------------------------------------------------------
// 3-Touch Email Nurture Sequence Workflow Template
//
// This workflow powers the follow-up nurture track for the 500 SDR contacts.
// Each execution represents ONE email touch for ONE prospect. The campaign
// runner creates three scheduled executions per contact:
//
//   Touch 1 (Day  3) — Social proof: "A company like yours cut X by Y%"
//   Touch 2 (Day  7) — ROI narrative: "Here's the math for a team your size"
//   Touch 3 (Day 14) — Soft close:  "Worth 20 minutes to see if it fits?"
//
// Messaging is personalised per vertical:
//   FinTech             — payment/invoice automation, compliance workflows
//   Professional Services — client billing, contract automation, billable hours
//   Logistics           — freight invoice reconciliation, carrier dispute mgmt
//
// Flow:
//   1. Claude generates a vertical + touch-appropriate email
//   2. Send via Resend
//   3. (Optional) Log nurture event to CRM webhook
// ----------------------------------------------------------------------------

export const nurtureSequenceTemplate: WorkflowDefinitionBody = {
  inputSchema: {
    type: "object",
    properties: {
      // Prospect identifiers
      prospectName: { type: "string", description: "Prospect full name" },
      prospectEmail: { type: "string", description: "Prospect business email", format: "email" },
      prospectTitle: { type: "string", description: "Job title / role" },
      companyName: { type: "string", description: "Company name" },
      companyIndustry: {
        type: "string",
        enum: ["FinTech", "Professional Services", "Logistics"],
        description: "Prospect vertical — drives messaging angle",
      },
      companySize: { type: "string", description: "Estimated headcount or range" },

      // Nurture sequence parameters
      touchNumber: {
        type: "number",
        enum: [1, 2, 3],
        description: "Which touch in the nurture sequence: 1=Day 3, 2=Day 7, 3=Day 14",
      },
      primaryPainPoint: {
        type: "string",
        description: "Primary pain point identified during initial ICP research (from outbound-sdr run)",
      },
      icpScore: {
        type: "number",
        description: "ICP score from original research (used to calibrate persistence level)",
      },

      // Sender config
      senderName: { type: "string", description: "Sender full name" },
      senderTitle: { type: "string", description: "Sender job title" },
      senderEmail: { type: "string", description: "Sender email (verified Resend domain)", format: "email" },
      calendarUrl: { type: "string", description: "Calendly / demo booking link for CTA" },

      // Optional integrations
      crmWebhookUrl: { type: "string", description: "CRM webhook URL to log nurture event (optional)" },
    },
    required: [
      "prospectName",
      "prospectEmail",
      "prospectTitle",
      "companyName",
      "companyIndustry",
      "touchNumber",
      "primaryPainPoint",
      "senderName",
      "senderEmail",
      "calendarUrl",
    ],
  },

  steps: [
    // -------------------------------------------------------------------------
    // Step 1 — Generate vertical + touch-specific nurture email
    // -------------------------------------------------------------------------
    {
      id: "generate_nurture_email",
      name: "Generate Nurture Email",
      type: "claude_task",
      description: "Claude writes a vertical-specific nurture email for the appropriate touch",
      config: {
        model: "claude-sonnet-4-6",
        systemPrompt: `You are an elite B2B email copywriter specialising in Finance and SaaS.

You are writing a nurture follow-up email for a prospect who received an initial cold outreach but has not yet replied.

Touch strategy:
- Touch 1 (Day 3): Social proof angle — lead with a concrete customer story from the prospect's industry showing the outcome (time saved, error rate reduced, revenue recovered). No hard sell.
- Touch 2 (Day 7): ROI narrative angle — give the prospect a specific ROI estimate tailored to their company size and pain point. Use real numbers (hours/week saved, % reduction in errors, € recovered). One clear CTA to book a call.
- Touch 3 (Day 14): Soft close angle — acknowledge this is the last touch, keep it human and brief. Ask if the timing is off or if there's a better person to speak to. Ultra-low friction CTA.

Vertical messaging guidance:
FinTech (payments, lending, neobanks):
  - Touch 1: "A Series B payments company we work with cut AP processing time by 70% — from 3 days to under 4 hours — in the first 6 weeks."
  - Touch 2: For a team of {{companySize}}, manual invoice reconciliation typically costs 12–20 hours/week of Finance staff time. At €60/hr fully-loaded, that's €37–60k/year in recoverable capacity. Nexus pays for itself in month 1.
  - Touch 3: Lightweight, personal — offer an async loom or just ask if it's the wrong time.

Professional Services (consulting, accounting, law):
  - Touch 1: "An 80-person consulting firm we work with automated their client billing workflow — recovered 8 billable hours per consultant per month. That's €96k ARR unlocked without hiring."
  - Touch 2: For {{companySize}} billable professionals, 5 hours/month of admin per head adds up. Automate contract-to-invoice with Nexus and redirect that to client-facing work.
  - Touch 3: Brief — ask if now is a bad time or if there's an ops or finance lead who owns this.

Logistics (3PL, freight, last-mile):
  - Touch 1: "A 3PL we work with automated freight invoice reconciliation — reduced dispute resolution time from 6 days to same-day, saving €140k/year in billing errors."
  - Touch 2: Industry data: 3–5% of freight invoices contain billing errors. For a carrier network your size, fixing that manually costs a full-time analyst. Nexus flags and resolves discrepancies automatically.
  - Touch 3: Short — confirm if this is the right person, offer to loop in someone else if not.

Tone rules:
- Under 100 words (nurture emails are shorter than cold outreach)
- Never start with "I" — open with the insight, story, or result
- No buzzwords: no "leverage", "synergy", "game-changer", "cutting-edge"
- Sign off as a person, not a company
- One CTA maximum

Respond strictly with JSON:
{
  "subject": string,
  "emailBody": string,
  "previewText": string,
  "touchStrategy": "social_proof" | "roi_narrative" | "soft_close"
}`,
        userPromptTemplate: `Write nurture email Touch {{input.touchNumber}} for this prospect.

Prospect: {{input.prospectName}}, {{input.prospectTitle}} at {{input.companyName}}
Vertical: {{input.companyIndustry}}
Company size: {{input.companySize}}
Primary pain point: {{input.primaryPainPoint}}
{{#if input.icpScore}}ICP score: {{input.icpScore}}/10{{/if}}

Sender: {{input.senderName}}, {{input.senderTitle}}
Calendar link: {{input.calendarUrl}}

Instructions:
- This is Touch {{input.touchNumber}} of 3.
- Use the {{input.companyIndustry}} vertical messaging guide.
- Personalise the story/numbers to their specific pain point: {{input.primaryPainPoint}}.
- Make the CTA link to: {{input.calendarUrl}}`,
        outputKey: "nurture_email",
      },
    },

    // -------------------------------------------------------------------------
    // Step 2 — Send nurture email via Resend
    // -------------------------------------------------------------------------
    {
      id: "send_nurture_email",
      name: "Send Nurture Email",
      type: "tool_call",
      description: "Deliver the nurture email via Resend",
      dependsOn: ["generate_nurture_email"],
      config: {
        tool: "email",
        from: "{{input.senderEmail}}",
        toTemplate: "{{input.prospectEmail}}",
        subject: "{{stepOutputs.nurture_email.subject}}",
        bodyTemplate: "{{stepOutputs.nurture_email.emailBody}}",
        isHtml: false,
        outputKey: "send_result",
      },
    },

    // -------------------------------------------------------------------------
    // Step 3 — Log nurture event to CRM (optional)
    // -------------------------------------------------------------------------
    {
      id: "log_nurture_to_crm",
      name: "Log Nurture Event to CRM",
      type: "tool_call",
      description: "POST nurture touch event to CRM webhook when configured",
      dependsOn: ["send_nurture_email"],
      condition: `input.crmWebhookUrl`,
      config: {
        tool: "http",
        urlTemplate: "{{input.crmWebhookUrl}}",
        method: "POST",
        headersTemplate: { "Content-Type": "application/json" },
        bodyTemplate: `{
  "action": "log_nurture_touch",
  "contact": {
    "email": "{{input.prospectEmail}}",
    "name": "{{input.prospectName}}",
    "company": "{{input.companyName}}",
    "industry": "{{input.companyIndustry}}"
  },
  "nurture": {
    "touchNumber": {{input.touchNumber}},
    "touchStrategy": "{{stepOutputs.nurture_email.touchStrategy}}",
    "subject": "{{stepOutputs.nurture_email.subject}}",
    "sentAt": "{{now}}"
  }
}`,
        outputKey: "crm_log",
        expectedStatusCodes: [200, 201, 202],
      },
    },
  ],

  outputMapping: {
    prospectEmail: "input.prospectEmail",
    companyName: "input.companyName",
    touchNumber: "input.touchNumber",
    touchStrategy: "stepOutputs.nurture_email.touchStrategy",
    subject: "stepOutputs.nurture_email.subject",
    sent: "stepOutputs.send_result",
  },

  defaultFailurePolicy: "continue",
};
