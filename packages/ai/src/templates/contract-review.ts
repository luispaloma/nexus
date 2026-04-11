import type { WorkflowDefinitionBody } from "@nexus/types";

// ----------------------------------------------------------------------------
// Contract Review Workflow Template
//
// Flow:
//   1. Claude performs comprehensive contract analysis (risk, terms, compliance)
//   2. Claude generates a redline summary with key concerns
//   3. Notify legal team via Slack
//   4. Request legal counsel approval
//   5. Send finalized review to requester via email
// ----------------------------------------------------------------------------

export const contractReviewTemplate: WorkflowDefinitionBody = {
  inputSchema: {
    type: "object",
    properties: {
      contractTitle: { type: "string", description: "Name or title of the contract" },
      contractText: { type: "string", description: "Full text of the contract" },
      contractType: {
        type: "string",
        enum: ["vendor", "customer", "employment", "partnership", "nda", "saas"],
        description: "Type of contract",
      },
      counterpartyName: { type: "string", description: "Name of the other party" },
      contractValue: { type: "number", description: "Contract value in USD (if applicable)" },
      startDate: { type: "string", description: "Contract start date (ISO 8601)" },
      endDate: { type: "string", description: "Contract end date (ISO 8601)" },
      requesterEmail: { type: "string", format: "email", description: "Email of the requester" },
      legalCounselEmail: { type: "string", format: "email", description: "Email of legal counsel" },
      urgency: {
        type: "string",
        enum: ["low", "normal", "high", "urgent"],
        description: "Review urgency level",
      },
    },
    required: ["contractTitle", "contractText", "contractType", "counterpartyName", "requesterEmail", "legalCounselEmail"],
  },
  steps: [
    {
      id: "initial_analysis",
      name: "Initial Contract Analysis",
      type: "claude_task",
      description: "Claude performs an initial pass analyzing the contract structure and key terms",
      config: {
        model: "claude-sonnet-4-6",
        systemPrompt: `You are a senior corporate attorney AI assistant specializing in contract analysis.
Analyze contracts with a focus on:
1. Key obligations and rights for each party
2. Termination clauses and exit provisions
3. Liability caps and indemnification
4. Intellectual property ownership
5. Data privacy and security requirements
6. Payment terms and penalties
7. Dispute resolution mechanisms

Return a JSON object:
{
  "executiveSummary": string,
  "contractDuration": string,
  "keyObligations": {
    "ourCompany": string[],
    "counterparty": string[]
  },
  "criticalClauses": Array<{
    "clause": string,
    "location": string,
    "concern": string,
    "severity": "low" | "medium" | "high" | "critical"
  }>,
  "missingClauses": string[],
  "riskScore": number (1-10, 10 being highest risk),
  "recommendedChanges": string[]
}`,
        userPromptTemplate: `Contract Type: {{input.contractType}}
Contract Title: {{input.contractTitle}}
Counterparty: {{input.counterpartyName}}
Contract Value: {{input.contractValue}} USD
Duration: {{input.startDate}} to {{input.endDate}}

CONTRACT TEXT:
{{input.contractText}}`,
        outputKey: "initial_analysis",
        maxTokens: 8192,
      },
    },
    {
      id: "risk_assessment",
      name: "Detailed Risk Assessment",
      type: "claude_task",
      description: "Claude creates detailed risk assessment and suggested redlines",
      dependsOn: ["initial_analysis"],
      config: {
        model: "claude-sonnet-4-6",
        systemPrompt: `You are a risk assessment specialist for contract review.
Based on the initial analysis, create a detailed risk assessment and specific contract redlines.
Focus on:
1. Legal and financial exposure
2. Operational risks
3. Regulatory compliance (GDPR, SOC2, etc. as applicable)
4. Negotiation strategy

Return a JSON object:
{
  "overallRiskLevel": "low" | "medium" | "high" | "critical",
  "topRisks": Array<{
    "risk": string,
    "impact": string,
    "mitigation": string
  }>,
  "redlines": Array<{
    "original": string,
    "suggested": string,
    "rationale": string
  }>,
  "negotiationPriorities": string[],
  "approvalRecommendation": "approve" | "approve_with_changes" | "reject",
  "legalCounselNotes": string
}`,
        userPromptTemplate: `Please provide a detailed risk assessment based on this initial contract analysis:

{{stepOutputs.initial_analysis}}

Contract Type: {{input.contractType}}
Counterparty: {{input.counterpartyName}}`,
        outputKey: "risk_assessment",
        maxTokens: 6144,
      },
    },
    {
      id: "notify_legal_slack",
      name: "Notify Legal Team",
      type: "tool_call",
      description: "Alert legal team in Slack about contract review request",
      dependsOn: ["risk_assessment"],
      config: {
        tool: "slack",
        action: "send_message",
        channel: "#legal-reviews",
        messageTemplate: `*Contract Review Required* :scroll:

*{{input.contractTitle}}*
- Type: {{input.contractType}}
- Counterparty: {{input.counterpartyName}}
- Value: ${{input.contractValue}}
- Requested by: {{input.requesterEmail}}
- Urgency: {{input.urgency}}

*AI Risk Assessment:* {{stepOutputs.risk_assessment.overallRiskLevel}} risk
*Recommendation:* {{stepOutputs.risk_assessment.approvalRecommendation}}

*Top Concerns:*
{{#each stepOutputs.risk_assessment.topRisks}}• {{this.risk}}
{{/each}}

Please review and approve/reject via email.`,
        outputKey: "slack_notification",
      },
    },
    {
      id: "legal_approval",
      name: "Legal Counsel Review",
      type: "human_approval",
      description: "Legal counsel reviews AI analysis and makes final determination",
      dependsOn: ["risk_assessment"],
      config: {
        title: "Contract Review: {{input.contractTitle}}",
        descriptionTemplate: `**Contract Review Request**

**Contract:** {{input.contractTitle}}
**Type:** {{input.contractType}}
**Counterparty:** {{input.counterpartyName}}
**Value:** ${{input.contractValue}}
**Duration:** {{input.startDate}} to {{input.endDate}}

---

**AI Analysis Summary**

Executive Summary: {{stepOutputs.initial_analysis.executiveSummary}}

**Risk Level:** {{stepOutputs.risk_assessment.overallRiskLevel}}
**AI Recommendation:** {{stepOutputs.risk_assessment.approvalRecommendation}}

**Top Risks:**
{{#each stepOutputs.risk_assessment.topRisks}}- {{this.risk}}: {{this.impact}}
{{/each}}

**Critical Clauses:**
{{#each stepOutputs.initial_analysis.criticalClauses}}- [{{this.severity}}] {{this.clause}}: {{this.concern}}
{{/each}}

---

Please review the full AI analysis and provide your determination.`,
        assignToTemplate: "{{input.legalCounselEmail}}",
        contextKeys: ["initial_analysis", "risk_assessment"],
        expiresInHours: 48,
        outputKey: "legal_approval",
      },
    },
    {
      id: "send_review_results",
      name: "Send Review Results to Requester",
      type: "tool_call",
      description: "Email the complete review results to the requester",
      dependsOn: ["legal_approval"],
      config: {
        tool: "email",
        from: "legal@nexus-workflows.com",
        toTemplate: "{{input.requesterEmail}}",
        subject: "Contract Review Complete: {{input.contractTitle}}",
        bodyTemplate: `Dear Team,

Your contract review for "{{input.contractTitle}}" has been completed.

SUMMARY
=======
Contract Type: {{input.contractType}}
Counterparty: {{input.counterpartyName}}
AI Risk Score: {{stepOutputs.initial_analysis.riskScore}}/10
Risk Level: {{stepOutputs.risk_assessment.overallRiskLevel}}
Legal Counsel Decision: {{stepOutputs.legal_approval.decision}}

EXECUTIVE SUMMARY
=================
{{stepOutputs.initial_analysis.executiveSummary}}

TOP RISKS
=========
{{#each stepOutputs.risk_assessment.topRisks}}• {{this.risk}}
  Impact: {{this.impact}}
  Mitigation: {{this.mitigation}}

{{/each}}

RECOMMENDED CHANGES
==================
{{#each stepOutputs.risk_assessment.redlines}}• Change: {{this.rationale}}
{{/each}}

{{#if stepOutputs.legal_approval.comment}}
LEGAL COUNSEL NOTES
===================
{{stepOutputs.legal_approval.comment}}
{{/if}}

Please contact the legal team if you have questions.

Legal & Compliance Team`,
        isHtml: false,
        outputKey: "review_email",
      },
    },
  ],
  outputMapping: {
    contractTitle: "input.contractTitle",
    riskScore: "stepOutputs.initial_analysis.riskScore",
    overallRiskLevel: "stepOutputs.risk_assessment.overallRiskLevel",
    legalDecision: "stepOutputs.legal_approval.decision",
    recommendation: "stepOutputs.risk_assessment.approvalRecommendation",
  },
  defaultFailurePolicy: "stop_all",
};
