import type { WorkflowDefinitionBody } from "@nexus/types";

// ----------------------------------------------------------------------------
// Lead Qualification Workflow Template
//
// Flow:
//   1. Claude scores the lead based on company/contact info (BANT, ICP fit)
//   2. HTTP lookup for company enrichment (e.g., Clearbit-style API)
//   3. Conditional routing: high-score leads go to sales, low-score to nurture
//   4. High-score: Slack notification to sales + personalized outreach email
//   5. Low-score: Add to nurture sequence email
// ----------------------------------------------------------------------------

export const leadQualificationTemplate: WorkflowDefinitionBody = {
  inputSchema: {
    type: "object",
    properties: {
      leadId: { type: "string", description: "CRM lead ID" },
      firstName: { type: "string" },
      lastName: { type: "string" },
      email: { type: "string", format: "email" },
      company: { type: "string", description: "Company name" },
      jobTitle: { type: "string", description: "Lead's job title" },
      companySize: { type: "string", description: "Company employee count" },
      industry: { type: "string" },
      budget: { type: "string", description: "Stated budget range" },
      timeline: { type: "string", description: "Purchase timeline" },
      painPoints: { type: "string", description: "Described pain points or use case" },
      leadSource: { type: "string", description: "How the lead was acquired" },
      salesRepEmail: { type: "string", format: "email", description: "Assigned sales rep email" },
      enrichmentApiUrl: { type: "string", description: "Company enrichment API endpoint" },
    },
    required: ["leadId", "firstName", "lastName", "email", "company", "jobTitle", "salesRepEmail"],
  },
  steps: [
    {
      id: "score_lead",
      name: "AI Lead Scoring",
      type: "claude_task",
      description: "Claude evaluates the lead against ICP criteria using BANT methodology",
      config: {
        model: "claude-sonnet-4-6",
        systemPrompt: `You are an expert B2B sales qualification AI. You evaluate leads using BANT methodology and Ideal Customer Profile (ICP) criteria.

ICP criteria:
- Company size: 50-5000 employees (sweet spot: 100-1000)
- Industries: Technology, Finance, Healthcare, Manufacturing, Professional Services
- Decision makers: VP, Director, C-suite, Head of
- Pain points: workflow automation, manual processes, operational efficiency, scaling challenges

Score leads 0-100 based on:
- Budget: 0-25 pts (stated budget vs. our pricing)
- Authority: 0-25 pts (is this a decision maker?)
- Need: 0-25 pts (clear pain points matching our solution)
- Timeline: 0-25 pts (purchase urgency)

Return a JSON object:
{
  "score": number (0-100),
  "grade": "A" | "B" | "C" | "D",
  "bantScores": {
    "budget": number,
    "authority": number,
    "need": number,
    "timeline": number
  },
  "icpFit": "strong" | "good" | "weak" | "poor",
  "routingDecision": "sales_qualified" | "nurture" | "disqualify",
  "keyInsights": string[],
  "suggestedApproach": string,
  "talkingPoints": string[],
  "nextBestAction": string
}`,
        userPromptTemplate: `Please qualify this lead:

Name: {{input.firstName}} {{input.lastName}}
Email: {{input.email}}
Company: {{input.company}}
Job Title: {{input.jobTitle}}
Company Size: {{input.companySize}} employees
Industry: {{input.industry}}
Budget: {{input.budget}}
Timeline: {{input.timeline}}
Pain Points: {{input.painPoints}}
Lead Source: {{input.leadSource}}`,
        outputKey: "lead_score",
      },
    },
    {
      id: "enrich_company",
      name: "Company Data Enrichment",
      type: "tool_call",
      description: "Fetch additional company data from enrichment API",
      condition: `input.enrichmentApiUrl && input.company`,
      config: {
        tool: "http",
        urlTemplate: "{{input.enrichmentApiUrl}}?company={{input.company}}&domain={{input.email}}",
        method: "GET",
        headersTemplate: {
          "Authorization": "Bearer {{input.enrichmentApiKey}}",
          "Accept": "application/json",
        },
        outputKey: "company_data",
        expectedStatusCodes: [200],
      },
    },
    {
      id: "notify_sales_slack",
      name: "Notify Sales Rep (High Score)",
      type: "tool_call",
      description: "Alert sales rep in Slack for high-value leads",
      dependsOn: ["score_lead"],
      condition: `stepOutputs.lead_score.routingDecision === 'sales_qualified'`,
      config: {
        tool: "slack",
        action: "send_message",
        channel: "#sales-qualified-leads",
        messageTemplate: `*New Sales Qualified Lead!* :fire:

*{{input.firstName}} {{input.lastName}}* from *{{input.company}}*
- Title: {{input.jobTitle}}
- Email: {{input.email}}
- Industry: {{input.industry}}

*AI Score: {{stepOutputs.lead_score.score}}/100* (Grade: {{stepOutputs.lead_score.grade}})
*ICP Fit:* {{stepOutputs.lead_score.icpFit}}

*Key Insights:*
{{#each stepOutputs.lead_score.keyInsights}}• {{this}}
{{/each}}

*Suggested Approach:* {{stepOutputs.lead_score.suggestedApproach}}
*Next Best Action:* {{stepOutputs.lead_score.nextBestAction}}

Assigned to: {{input.salesRepEmail}}`,
        outputKey: "sales_slack_notification",
      },
    },
    {
      id: "send_sales_outreach",
      name: "Send Personalized Sales Outreach",
      type: "tool_call",
      description: "Send personalized email to qualified lead",
      dependsOn: ["notify_sales_slack"],
      condition: `stepOutputs.lead_score.routingDecision === 'sales_qualified'`,
      config: {
        tool: "email",
        from: "{{input.salesRepEmail}}",
        toTemplate: "{{input.email}}",
        subject: "Streamline your workflows at {{input.company}} - Quick question",
        bodyTemplate: `Hi {{input.firstName}},

I came across {{input.company}} and noticed you're focused on {{input.industry}} - we've been helping similar companies dramatically reduce manual work and improve operational efficiency.

Given your role as {{input.jobTitle}}, I thought you'd be interested in how Nexus has helped teams like yours:
{{#each stepOutputs.lead_score.talkingPoints}}- {{this}}
{{/each}}

{{stepOutputs.lead_score.suggestedApproach}}

Would you be open to a quick 20-minute call to see if there's a fit?

Best,
{{input.salesRepEmail}}

P.S. {{stepOutputs.lead_score.nextBestAction}}`,
        isHtml: false,
        outputKey: "outreach_email",
      },
    },
    {
      id: "send_nurture_email",
      name: "Add to Nurture Sequence",
      type: "tool_call",
      description: "Send educational nurture email to lower-scored leads",
      dependsOn: ["score_lead"],
      condition: `stepOutputs.lead_score.routingDecision === 'nurture'`,
      config: {
        tool: "email",
        from: "hello@nexus-workflows.com",
        toTemplate: "{{input.email}}",
        subject: "Workflow automation insights for {{input.company}}",
        bodyTemplate: `Hi {{input.firstName}},

Thank you for your interest in Nexus! We help teams automate complex workflows with AI.

Here are some resources that might be helpful for {{input.company}}:

1. [Guide] How to identify automation opportunities in your team
2. [Case Study] How a {{input.industry}} company saved 20 hours/week with workflow automation
3. [Webinar] AI-powered approvals: From manual to automated in 30 minutes

When the timing is right, we'd love to show you how Nexus can help with your specific challenges around {{input.painPoints}}.

Feel free to reply with any questions!

Best,
The Nexus Team`,
        isHtml: false,
        outputKey: "nurture_email",
      },
    },
  ],
  outputMapping: {
    leadId: "input.leadId",
    score: "stepOutputs.lead_score.score",
    grade: "stepOutputs.lead_score.grade",
    routingDecision: "stepOutputs.lead_score.routingDecision",
    icpFit: "stepOutputs.lead_score.icpFit",
    nextBestAction: "stepOutputs.lead_score.nextBestAction",
  },
  defaultFailurePolicy: "continue",
};
