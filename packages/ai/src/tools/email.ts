import { Resend } from "resend";

// ----------------------------------------------------------------------------
// Email Tool Implementation via Resend
// ----------------------------------------------------------------------------

export interface SendEmailParams {
  from: string;
  to: string | string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: string; // base64
  contentType?: string;
}

export interface SendEmailResult {
  messageId: string;
}

export class EmailToolImpl {
  private resend: Resend;

  constructor(apiKey: string) {
    this.resend = new Resend(apiKey);
  }

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    const to = Array.isArray(params.to) ? params.to : [params.to];

    const payload: Parameters<Resend["emails"]["send"]>[0] = {
      from: params.from,
      to,
      subject: params.subject,
      ...(params.isHtml ? { html: params.body } : { text: params.body }),
      ...(params.cc ? { cc: Array.isArray(params.cc) ? params.cc : [params.cc] } : {}),
      ...(params.bcc ? { bcc: Array.isArray(params.bcc) ? params.bcc : [params.bcc] } : {}),
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    };

    const { data, error } = await this.resend.emails.send(payload);

    if (error || !data?.id) {
      throw new Error(`Failed to send email to ${to.join(", ")}: ${error?.message ?? "Unknown error"}`);
    }

    return { messageId: data.id };
  }

  async sendBatch(emails: SendEmailParams[]): Promise<SendEmailResult[]> {
    const results = await Promise.allSettled(
      emails.map((email) => this.send(email))
    );

    const errors: string[] = [];
    const successes: SendEmailResult[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        successes.push(result.value);
      } else {
        errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      }
    }

    if (errors.length > 0) {
      throw new Error(`Batch email send had ${errors.length} failures: ${errors.join("; ")}`);
    }

    return successes;
  }
}
