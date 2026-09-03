const DEFAULT_ZOHO_CAMPAIGNS_API_BASE = "https://campaigns.zoho.com";

export type ZohoCampaignEmailInput = {
  transmissionName: string;
  to: string;
  recipientName?: string;
  from: string;
  fromName?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  mergeData?: Record<string, unknown>;
  additionalData?: Record<string, unknown>;
  openTracking?: boolean;
  clickTracking?: boolean;
};

export class ZohoCampaignsError extends Error {
  readonly status?: number;
  readonly providerCode?: string | number;
  readonly retryable = false;

  constructor(message: string, options: { status?: number; providerCode?: string | number } = {}) {
    super(message);
    this.name = "ZohoCampaignsError";
    this.status = options.status;
    this.providerCode = options.providerCode;
  }
}

function getZohoCampaignsApiBase(): string {
  return String(process.env.ZOHO_CAMPAIGNS_API_BASE || DEFAULT_ZOHO_CAMPAIGNS_API_BASE)
    .trim()
    .replace(/\/+$/, "");
}

function getZohoCampaignsApiToken(): string {
  return String(process.env.ZOHO_CAMPAIGNS_API_TOKEN || "").trim();
}

export function getZohoCampaignsStatus(): {
  provider: "zoho_campaigns_email_api";
  configured: boolean;
  apiBase: string;
  authentication: "api_key";
  missing: string[];
} {
  const missing: string[] = [];
  if (!getZohoCampaignsApiToken()) missing.push("ZOHO_CAMPAIGNS_API_TOKEN");
  return {
    provider: "zoho_campaigns_email_api",
    configured: missing.length === 0,
    apiBase: getZohoCampaignsApiBase(),
    authentication: "api_key",
    missing,
  };
}

function transmissionName(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (normalized || "marketing-transmission").slice(0, 150);
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function providerErrorMessage(body: any, fallback: string): string {
  const responseMessage = body?.response?.message;
  const directMessage = body?.message;
  const errors = Array.isArray(body?.errors)
    ? body.errors.map((item: any) => item?.message || item?.code).filter(Boolean).join("; ")
    : "";
  return String(responseMessage || directMessage || errors || fallback).slice(0, 1000);
}

/**
 * Sends one personalized campaign message through Zoho Campaigns Email API v2.
 *
 * The app deliberately sends one recipient per transmission because campaign
 * HTML contains recipient-specific signed unsubscribe and product links.
 * Provider failures are never automatically retried: a lost response to a
 * POST has unknown acceptance state and retrying could duplicate the email.
 */
export async function sendZohoCampaignEmail(input: ZohoCampaignEmailInput): Promise<{
  transmissionId: string;
  acceptedRecipients: number;
}> {
  const token = getZohoCampaignsApiToken();
  if (!token) {
    throw new ZohoCampaignsError(
      "Zoho Campaigns Email API is not configured. Add ZOHO_CAMPAIGNS_API_TOKEN in Replit Secrets.",
    );
  }
  if (!validEmail(input.to)) throw new ZohoCampaignsError("Zoho recipient email is invalid.");
  if (!validEmail(input.from)) throw new ZohoCampaignsError("Zoho sender email is invalid.");
  if (input.replyTo && !validEmail(input.replyTo)) throw new ZohoCampaignsError("Zoho Reply-To email is invalid.");
  if (!input.subject.trim()) throw new ZohoCampaignsError("Zoho campaign subject is required.");

  const payload: Record<string, unknown> = {
    transmission_name: transmissionName(input.transmissionName),
    recipients: [{
      address: input.to.trim(),
      ...(input.recipientName ? { name: input.recipientName.slice(0, 100) } : {}),
      ...(input.mergeData ? { merge_data: input.mergeData } : {}),
      ...(input.additionalData ? { additional_data: input.additionalData } : {}),
    }],
    options: {
      open_tracking: input.openTracking === false ? "disabled" : "enabled",
      click_tracking: input.clickTracking === false ? "disabled" : "enabled",
    },
    content: {
      from: {
        address: input.from.trim(),
        ...(input.fromName ? { name: input.fromName.slice(0, 100) } : {}),
      },
      ...(input.replyTo ? { reply_to: input.replyTo.trim() } : {}),
      subject: input.subject.slice(0, 200),
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    },
  };

  let response: Response;
  try {
    response = await fetch(`${getZohoCampaignsApiBase()}/emailapi/v2/transmission`, {
      method: "POST",
      headers: {
        Authorization: `Zoho-zapikey ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error: any) {
    throw new ZohoCampaignsError(
      `Zoho Campaigns request failed without a response: ${String(error?.message ?? error).slice(0, 700)}`,
    );
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = body?.code ?? body?.response?.code;
    throw new ZohoCampaignsError(
      `Zoho Campaigns rejected the transmission (${response.status}): ${providerErrorMessage(body, response.statusText || "request rejected")}`,
      { status: response.status, providerCode: code },
    );
  }

  const transmissionId = String(body?.transmission_id || body?.response?.transmission_id || "").trim();
  const acceptedRecipients = Number(body?.accepted_recipients ?? 0);
  const rejectedRecipients = Number(body?.rejected_recipients ?? 0);
  if (!transmissionId) {
    throw new ZohoCampaignsError(
      `Zoho Campaigns returned no transmission ID: ${providerErrorMessage(body, "unexpected response")}`,
      { providerCode: body?.code ?? body?.response?.code },
    );
  }
  if (rejectedRecipients > 0 || acceptedRecipients < 1) {
    throw new ZohoCampaignsError(
      `Zoho Campaigns did not accept the recipient: ${providerErrorMessage(body, "recipient rejected")}`,
      { providerCode: body?.code ?? body?.response?.code },
    );
  }

  return { transmissionId, acceptedRecipients };
}