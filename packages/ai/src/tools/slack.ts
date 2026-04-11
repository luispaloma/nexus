import { WebClient } from "@slack/web-api";

// ----------------------------------------------------------------------------
// Slack Tool Implementation
// ----------------------------------------------------------------------------

export interface SendMessageParams {
  channel: string;
  text: string;
  blocks?: object[];
  threadTs?: string;
}

export interface SendDmParams {
  userId: string;
  text: string;
  blocks?: object[];
}

export interface MessageResult {
  ts: string;
  channel: string;
}

export class SlackToolImpl {
  private client: WebClient;

  constructor(token: string) {
    this.client = new WebClient(token);
  }

  async sendMessage(params: SendMessageParams): Promise<MessageResult> {
    const response = await this.client.chat.postMessage({
      channel: params.channel,
      text: params.text,
      blocks: params.blocks as import("@slack/types").KnownBlock[] | undefined,
      thread_ts: params.threadTs,
    });

    if (!response.ok || !response.ts || !response.channel) {
      throw new Error(
        `Slack sendMessage failed: ${response.error ?? "Unknown error"}`
      );
    }

    return {
      ts: response.ts,
      channel: response.channel,
    };
  }

  async sendDm(params: SendDmParams): Promise<MessageResult> {
    // Open a DM channel first
    const dmResponse = await this.client.conversations.open({
      users: params.userId,
    });

    if (!dmResponse.ok || !dmResponse.channel?.id) {
      throw new Error(
        `Failed to open DM with user ${params.userId}: ${dmResponse.error ?? "Unknown error"}`
      );
    }

    return this.sendMessage({
      channel: dmResponse.channel.id,
      text: params.text,
      blocks: params.blocks,
    });
  }

  async createChannel(name: string): Promise<{ channelId: string; name: string }> {
    // Slack channel names must be lowercase, no spaces
    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9-_]/g, "-");

    const response = await this.client.conversations.create({
      name: sanitizedName,
    });

    if (!response.ok || !response.channel?.id || !response.channel?.name) {
      throw new Error(
        `Failed to create Slack channel ${name}: ${response.error ?? "Unknown error"}`
      );
    }

    return {
      channelId: response.channel.id,
      name: response.channel.name,
    };
  }

  async lookupUserByEmail(email: string): Promise<{ userId: string; name: string } | null> {
    try {
      const response = await this.client.users.lookupByEmail({ email });
      if (!response.ok || !response.user?.id) {
        return null;
      }
      return {
        userId: response.user.id,
        name: response.user.real_name ?? response.user.name ?? email,
      };
    } catch {
      return null;
    }
  }
}
