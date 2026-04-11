import type { WorkflowDefinitionBody } from "@nexus/types";

// ----------------------------------------------------------------------------
// Outbound AI SDR Agent Workflow Template
//
// This workflow powers the outbound pipeline generation function.
// It takes a prospect from a lead list, researches them with AI, crafts a
// personalised cold outreach, and sequences follow-ups.
//
// Flow:
//   1. Claude researches the prospect and creates an ICP fit score
//   2. If score >= threshold, draft a personalised outbound email
//   3. Send first touch email
//   4. Log contact to CRM via HTTP webhook
//   5. Slack alert to SDR with summary
//   6. Human SDR review gate (SDR decides: move to sequence / disqualify)
// ----------------------------------------------------------------------------

export const outboundSdrTemplate: WorkflowDefinitionBody = {
  inputSchema: {
    type: "object",
    properties: {
      prospectName: { type: "string", description: "Prospect full name" },
      prospectEmail: { type: "string", description: "Prospect business email", format: "email" },
      prospectTitle: { type: "string", description: "Job title / role" },
      companyName: { type: "string", description: "Company name" },
      companyIndustry: { type: "string", description: "Company industry" },
      companySize: { type: "string", description: "Estimated headcount or range" },
      companyWebsite: { type: "string", description: "Company website URL" },
      linkedinUrl: { type: "string", description: "Prospect LinkedIn URL (optional)" },
      recentCompanyNews: { type: "string", description: "Recent news or trigger events about the company (optional)" },
      senderName: { type: "string", description: "Sender full name (your SDR)" },
      senderTitle: { type: "string", description: "Sender job title" },
      senderEmail: { type: "string", description: "Sender email", format: "email" },
      sdrEmail: { type: "string", description: "SDR email for review notifications", format: "email" },
      calendarUrl: { type: "string", description: "Calendar link for booking a call (e.g. Calendly URL)" },
      crmWebhookUrl: { type: "string", description: "CRM webhook URL to log the contact (optional)" },
      icpScoreThreshold: { type: "number", description: "Minimum ICP score to proceed with outreach (default: 6)" },
      valueProposition: {
        type: "string",
        description: "Your product's core value proposition (e.g. Nexus automates Finance workflows with AI, saving 20+ hours/month)",
      },
    },
    required: [
      "prospectName",
      "prospectEmail",
      "prospectTitle",
      "companyName",
      "companyIndustry",
      "senderName",
      "senderEmail",
      "sdrEmail",
      "valueProposition",
    ],
  },
  steps: [
    {
      id: "icp_research",
      name: "AI Prospect Research & ICP Scoring",
      type: "claude_task",
      description: "Claude scores the prospect against ICP criteria and identifies personalisation angles",
      config: {
        model: "claude-sonnet-4-6",
        systemPrompt: `You are an expert B2B sales development AI. Your job is to:
1. Score prospects against Ideal Customer Profile (ICP) criteria
2. Identify the top 2-3 personalisation angles specific to this prospect and company
3. Determine the most relevant pain points your product can address
4. Decide if this prospect is worth pursuing

ICP criteria (score 1-10, 10 = perfect fit):
- Company size ≥ 50 employees: +2
- Finance or Operations role: +2
- Industry: Finance, Accounting, Professional Services, SaaS: +2
- Active growth signals (hiring, funding, expansion): +2
- Pain point match with workflow automation: +2

Respond strictly with JSON:
{
  "icpScore": number,
  "icpRationale": string,
  "shouldContact": boolean,
  "personalizationAngles": string[],
  "primaryPainPoint": string,
  "recommendedApproach": "direct_value" | "pain_point" | "case_study" | "trigger_event",
  "companyInsights": string,
  "competitorContext": string
}`,
        userPromptTemplate: `Research this prospect for outbound outreach:

Prospect: {{input.prospectName}}, {{input.prospectTitle}} at {{input.companyName}}
Industry: {{input.companyIndustry}} | Size: {{input.companySize}}
{{#if input.companyWebsite}}Website: {{input.companyWebsite}}{{/if}}
{{#if input.linkedinUrl}}LinkedIn: {{input.linkedinUrl}}{{/if}}
{{#if input.recentCompanyNews}}Recent news: {{input.recentCompanyNews}}{{/if}}

Our value proposition:
{{input.valueProposition}}

ICP score threshold to proceed: {{input.icpScoreThreshold}} (default: 6)`,
        outputKey: "icp_research",
      },
    },
    {
      id: "draft_outreach_email",
      name: "AI Personalised Outreach Email",
      type: "claude_task",
      description: "Draft a highly personalised, non-generic cold email",
      dependsOn: ["icp_research"],
      condition: `stepOutputs.icp_research.icpScore >= (input.icpScoreThreshold || 6)`,
      config: {
        model: "claude-sonnet-4-6",
        systemPrompt: `You are an elite B2B cold email copywriter specialising in Finance/SaaS.
Write cold emails that are:
- Under 120 words (brevity drives reply rates)
- Specific: reference the prospect's company, role, or a trigger event
- Pain-focused: lead with a relatable pain, not a product pitch
- Human: conversational, no buzzwords, no "I hope this finds you well"
- Clear CTA: one specific ask (call, reply, or "does this resonate?")
- Never use "synergy", "revolutionize", "game-changer"

Respond strictly with JSON:
{
  "subject": string,
  "emailBody": string,
  "previewText": string,
  "followUp1Subject": string,
  "followUp1Body": string,
  "followUp2Subject": string,
  "followUp2Body": string
}`,
        userPromptTemplate: `Draft a cold outreach sequence for this prospect.

Prospect: {{input.prospectName}}, {{input.prospectTitle}} at {{input.companyName}}
Industry: {{input.companyIndustry}}
Primary Pain Point: {{stepOutputs.icp_research.primaryPainPoint}}
Personalisation angles: {{stepOutputs.icp_research.personalizationAngles}}
Approach: {{stepOutputs.icp_research.recommendedApproach}}
Company Insights: {{stepOutputs.icp_research.companyInsights}}

Sender: {{input.senderName}}, {{input.senderTitle}}
Our Value Prop: {{input.valueProposition}}
Calendar Link: {{input.calendarUrl}}`,
        outputKey: "email_draft",
      },
    },
    {
      id: "send_first_touch",
      name: "Send First Touch Email",
      type: "tool_call",
      description: "Send the personalised first-touch outreach email",
      dependsOn: ["draft_outreach_email"],
      condition: `stepOutputs.icp_research.icpScore >= (input.icpScoreThreshold || 6)`,
      config: {
        tool: "email",
        from: "{{input.senderEmail}}",
        toTemplate: "{{input.prospectEmail}}",
        subject: "{{stepOutputs.email_draft.emailSubject}}",
        bodyTemplate: "{{stepOutputs.email_draft.emailBody}}",
        isHtml: false,
        outputKey: "first_touch_sent",
      },
    },
    {
      id: "log_to_crm",
      name: "Log Contact to CRM",
      type: "tool_call",
      description: "POST prospect and outreach data to CRM webhook",
      dependsOn: ["send_first_touch"],
      condition: `input.crmWebhookUrl && stepOutputs.icp_research.icpScore >= (input.icpScoreThreshold || 6)`,
      config: {
        tool: "http",
        urlTemplate: "{{input.crmWebhookUrl}}",
        method: "POST",
        headersTemplate: { "Content-Type": "application/json" },
        bodyTemplate: `{
  "action": "create_contact",
  "contact": {
    "name": "{{input.prospectName}}",
    "email": "{{input.prospectEmail}}",
    "title": "{{input.prospectTitle}}",
    "company": "{{input.companyName}}",
    "industry": "{{input.companyIndustry}}"
  },
  "deal": {
    "name": "{{input.companyName}} — Nexus Outreach",
    "stage": "Prospecting",
    "icpScore": {{stepOutputs.icp_research.icpScore}},
    "source": "AI SDR",
    "primaryPainPoint": "{{stepOutputs.icp_research.primaryPainPoint}}"
  }
}`,
        outputKey: "crm_log",
        expectedStatusCodes: [200, 201, 202],
      },
    },
    {
      id: "sdr_slack_summary",
      name: "SDR Slack Summary",
      type: "tool_call",
      description: "Post prospect summary to SDR Slack channel for visibility",
      dependsOn: ["send_first_touch"],
      config: {
        tool: "slack",
        action: "send_message",
        channel: "#sdr-pipeline",
        messageTemplate: `🎯 *New Outreach Sent*

*Prospect:* {{input.prospectName}} ({{input.prospectTitle}} @ {{input.companyName}})
*ICP Score:* {{stepOutputs.icp_research.icpScore}}/10
*Primary Pain:* {{stepOutputs.icp_research.primaryPainPoint}}
*Approach:* {{stepOutputs.icp_research.recommendedApproach}}

*Email Sent:* ✓ First touch delivered to {{input.prospectEmail}}

*AI Insight:* {{stepOutputs.icp_research.companyInsights}}

Review in your inbox and update status.`,
        outputKey: "slack_summary",
      },
    },
    {
      id: "sdr_review",
      name: "SDR Qualification Review",
      type: "human_approval",
      description: "SDR reviews prospect profile and decides next step in the sequence",
      dependsOn: ["sdr_slack_summary"],
      config: {
        title: "Prospect Review: {{input.prospectName}} @ {{input.companyName}} (ICP {{stepOutputs.icp_research.icpScore}}/10)",
        descriptionTemplate: `**Prospect:** {{input.prospectName}}, {{input.prospectTitle}}
**Company:** {{input.companyName}} ({{input.companyIndustry}}, {{input.companySize}})
**Email:** {{input.prospectEmail}}

**ICP Score:** {{stepOutputs.icp_research.icpScore}}/10
**Primary Pain:** {{stepOutputs.icp_research.primaryPainPoint}}
**Approach Used:** {{stepOutputs.icp_research.recommendedApproach}}
**Company Insights:** {{stepOutputs.icp_research.companyInsights}}

**First touch email sent.** Review the email body and decide:
- **Approve** = This is a qualified prospect, continue sequence (send follow-up 1 in 3 days)
- **Reject** = Disqualify or pause this prospect`,
        assignToTemplate: "{{input.sdrEmail}}",
        contextKeys: ["icp_research", "email_draft"],
        expiresInHours: 72,
        outputKey: "sdr_review_response",
      },
    },
    {
      id: "send_followup_1",
      name: "Send Follow-Up 1 (Day 3)",
      type: "tool_call",
      description: "Send first follow-up email if SDR approved continuation",
      dependsOn: ["sdr_review"],
      condition: `stepOutputs.sdr_review_response.decision === "approved"`,
      config: {
        tool: "email",
        from: "{{input.senderEmail}}",
        toTemplate: "{{input.prospectEmail}}",
        subject: "{{stepOutputs.email_draft.followUp1Subject}}",
        bodyTemplate: "{{stepOutputs.email_draft.followUp1Body}}",
        isHtml: false,
        outputKey: "followup_1_sent",
      },
    },
  ],
  outputMapping: {
    prospectName: "input.prospectName",
    companyName: "input.companyName",
    icpScore: "stepOutputs.icp_research.icpScore",
    shouldContact: "stepOutputs.icp_research.shouldContact",
    sdrDecision: "stepOutputs.sdr_review_response.decision",
  },
  defaultFailurePolicy: "continue",
};
