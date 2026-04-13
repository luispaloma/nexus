// ============================================================================
// Trial Reminder Emails — sent via Resend on day 10 and day 13 of a trial
// ============================================================================

interface TrialReminderOptions {
  to: string;
  orgName: string;
  daysRemaining: number;
  upgradeUrl: string;
}

export async function sendTrialReminderEmail(opts: TrialReminderOptions): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.warn("RESEND_API_KEY not configured — skipping trial reminder email");
    return;
  }

  const { to, orgName, daysRemaining, upgradeUrl } = opts;
  const subject =
    daysRemaining <= 1
      ? `Your Nexus trial expires tomorrow — upgrade to keep access`
      : `Your Nexus trial ends in ${daysRemaining} days`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">⚡ Nexus</p>
              <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">AI Workflow Automation</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0f172a;">
                ${daysRemaining <= 1 ? "Your trial expires tomorrow" : `${daysRemaining} days left in your trial`}
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                Hi there! Your free trial for <strong>${orgName}</strong> on Nexus
                ${daysRemaining <= 1 ? "expires <strong>tomorrow</strong>" : `ends in <strong>${daysRemaining} days</strong>`}.
                Don't lose access to your workflows and automation history.
              </p>
              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background:#6366f1;border-radius:8px;">
                    <a href="${upgradeUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Upgrade to Starter — €299/mo →
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Features reminder -->
              <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">What you get with Starter:</p>
              <ul style="margin:0 0 24px;padding:0 0 0 20px;font-size:14px;color:#475569;line-height:1.8;">
                <li>1,000 workflow runs / month</li>
                <li>5 team members</li>
                <li>Google Workspace + email integrations</li>
                <li>Audit logs &amp; email support</li>
                <li>All templates you've built, preserved</li>
              </ul>
              <p style="margin:0;font-size:13px;color:#94a3b8;">
                Questions? Reply to this email or visit <a href="https://nexus.ai" style="color:#6366f1;text-decoration:none;">nexus.ai</a>.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                You're receiving this because you signed up for a Nexus trial.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Nexus <noreply@nexus.ai>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Failed to send trial reminder email to ${to}: ${res.status} ${body}`);
  }
}
