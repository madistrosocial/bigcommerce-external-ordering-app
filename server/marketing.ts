import nodemailer from "nodemailer";
import { storage } from "./storage";
import { createHmac, timingSafeEqual } from "crypto";

type MarketingCustomer = {
  id?: number;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  email?: string | null;
  customer_group_name?: string | null;
  customer_type?: string | null;
  account_health?: string | null;
  lifetime_orders?: number | null;
  lifetime_revenue?: string | number | null;
  last_order_date?: Date | string | null;
  store_credit_balance?: string | number | null;
};

const runningCampaigns = new Set<number>();
const DEFAULT_ZOHO_CAMPAIGNS_API_BASE = "https://campaigns.zoho.com/api/v1.1";

export type MarketingDeliveryProvider = "smtp" | "zoho";

export type MarketingDeliverySettings = {
  provider: MarketingDeliveryProvider;
  zohoApiBase: string;
  replyTo: string;
};

export function normalizeMarketingDeliverySettings(value: unknown): MarketingDeliverySettings {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { parsed = {}; }
  }
  const raw = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  const provider = raw.provider === "zoho" ? "zoho" : "smtp";
  const configuredBase = String(raw.zohoApiBase ?? raw.zoho_api_base ?? "").trim().replace(/\/+$/, "");
  const zohoApiBase = configuredBase && /\/api\/v1\.1$/i.test(configuredBase)
    ? configuredBase
    : DEFAULT_ZOHO_CAMPAIGNS_API_BASE;
  const replyTo = String(raw.replyTo ?? raw.reply_to ?? "").trim();
  return {
    provider,
    zohoApiBase: /^https:\/\//i.test(zohoApiBase) ? zohoApiBase : DEFAULT_ZOHO_CAMPAIGNS_API_BASE,
    replyTo: MARKETING_EMAIL_PATTERN.test(replyTo) ? replyTo : "",
  };
}

export async function getMarketingDeliverySettings(): Promise<MarketingDeliverySettings> {
  const setting = await storage.getSetting("marketing_delivery_settings");
  return normalizeMarketingDeliverySettings(setting?.value ?? {
    provider: process.env.MARKETING_EMAIL_PROVIDER,
    zohoApiBase: process.env.ZOHO_CAMPAIGNS_API_BASE,
    replyTo: process.env.MARKETING_REPLY_TO,
  });
}

export function getMarketingDeliveryStatus(settings: MarketingDeliverySettings) {
  return {
    ...settings,
    zohoApiTokenConfigured: Boolean(String(process.env.ZOHO_CAMPAIGNS_API_TOKEN ?? "").trim()),
    zohoWebhookTokenConfigured: Boolean(String(process.env.ZOHO_CAMPAIGNS_WEBHOOK_TOKEN ?? "").trim()),
  };
}

class MarketingDeliveryError extends Error {
  retryable: boolean;
  statusCode?: number;

  constructor(message: string, options: { retryable?: boolean; statusCode?: number } = {}) {
    super(message);
    this.name = "MarketingDeliveryError";
    this.retryable = options.retryable ?? false;
    this.statusCode = options.statusCode;
  }
}

function ensureZohoConfigured(settings: MarketingDeliverySettings): string {
  if (settings.provider !== "zoho") throw new MarketingDeliveryError("Zoho delivery is not enabled.");
  const apiToken = String(process.env.ZOHO_CAMPAIGNS_ACCESS_TOKEN ?? process.env.ZOHO_CAMPAIGNS_API_TOKEN ?? "").trim();
  if (!apiToken) {
    throw new MarketingDeliveryError("Zoho Campaigns delivery is selected, but a Zoho Campaigns OAuth access token is not configured in Replit Secrets.");
  }
  return apiToken;
}

async function refreshZohoAccessToken(): Promise<string | null> {
  const refreshToken = String(process.env.ZOHO_CAMPAIGNS_REFRESH_TOKEN ?? "").trim();
  const clientId = String(process.env.ZOHO_CAMPAIGNS_CLIENT_ID ?? "").trim();
  const clientSecret = String(process.env.ZOHO_CAMPAIGNS_CLIENT_SECRET ?? "").trim();
  if (!refreshToken || !clientId || !clientSecret) return null;
  const accountsBase = String(process.env.ZOHO_ACCOUNTS_API_BASE ?? "https://accounts.zoho.com").trim().replace(/\/+$/, "");
  const response = await fetch(`${accountsBase}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const result = await response.json().catch(() => ({}));
  return response.ok && result?.access_token ? String(result.access_token) : null;
}

function zohoCampaignKey(payload: any): string {
  return String(payload?.campaignKey ?? payload?.campaign_key ?? payload?.response?.campaignKey ?? "").trim();
}

async function zohoCampaignRequest(
  settings: MarketingDeliverySettings,
  path: string,
  params: Record<string, string>,
  tokenOverride?: string,
): Promise<any> {
  const apiToken = tokenOverride ?? ensureZohoConfigured(settings);
  const body = new URLSearchParams({ resfmt: "JSON", ...params });
  let response: Response;
  try {
    response = await fetch(`${settings.zohoApiBase}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${apiToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
  } catch (error: any) {
    throw new MarketingDeliveryError(`Zoho Campaigns request failed before a response was received: ${String(error?.message ?? error)}`);
  }
  if (response.status === 401 && !tokenOverride) {
    const refreshedToken = await refreshZohoAccessToken();
    if (refreshedToken) return zohoCampaignRequest(settings, path, params, refreshedToken);
  }
  const responseBody = await response.json().catch(() => ({}));
  const code = String(responseBody?.code ?? responseBody?.response?.code ?? "");
  if (!response.ok || (code && code !== "0" && code !== "200")) {
    const detail = String(responseBody?.message ?? responseBody?.response?.message ?? responseBody?.error ?? response.statusText ?? "Zoho rejected the request").slice(0, 500);
    throw new MarketingDeliveryError(`Zoho Campaigns rejected the request${response.status ? ` (${response.status})` : ""}: ${detail}`, {
      retryable: response.status === 408 || response.status === 429,
      statusCode: response.status,
    });
  }
  return responseBody;
}

function chunkMarketingEmails(emails: string[], size = 10): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < emails.length; index += size) chunks.push(emails.slice(index, index + size));
  return chunks;
}

async function createZohoCampaignList(
  settings: MarketingDeliverySettings,
  campaign: any,
  emails: string[],
): Promise<string> {
  const uniqueEmails = Array.from(new Set(emails.map(email => email.trim().toLowerCase()).filter(email => MARKETING_EMAIL_PATTERN.test(email))));
  if (!uniqueEmails.length) throw new MarketingDeliveryError("Zoho Campaigns cannot create a recipient list without valid email addresses.");
  const [firstChunk, ...remainingChunks] = chunkMarketingEmails(uniqueEmails);
  const listName = `MAD-${campaign.id}-${Date.now()}`.slice(0, 90);
  const created = await zohoCampaignRequest(settings, "addlistandcontacts", {
    listname: listName,
    signupform: "private",
    mode: "newlist",
    listdescription: `Marketing campaign ${campaign.id} recipient list`,
    emailids: firstChunk.join(","),
  });
  const listKey = String(created?.listkey ?? created?.response?.listkey ?? "").trim();
  if (!listKey) throw new MarketingDeliveryError("Zoho created the list but did not return a list key.");
  for (const chunk of remainingChunks) {
    await zohoCampaignRequest(settings, "addlistsubscribersinbulk", {
      listkey: listKey,
      emailids: chunk.join(","),
    });
  }
  return listKey;
}

async function sendZohoCampaignV11(
  settings: MarketingDeliverySettings,
  campaign: any,
  from: string,
  emails: string[],
): Promise<{ campaignKey: string }> {
  const listKey = await createZohoCampaignList(settings, campaign, emails);
  const contentToken = signMarketingContentToken(Number(campaign.id));
  const contentUrl = publicMarketingUrl(`/api/marketing/zoho/content/${contentToken}`);
  const created = await zohoCampaignRequest(settings, "createCampaign", {
    campaignname: String(campaign.name || `Marketing campaign ${campaign.id}`).slice(0, 100),
    from_email: from,
    subject: String(campaign.subject_line || campaign.name || "Marketing update").slice(0, 200),
    list_details: JSON.stringify({ [listKey]: [] }),
    content_url: contentUrl,
  });
  const campaignKey = zohoCampaignKey(created);
  if (!campaignKey) throw new MarketingDeliveryError("Zoho created the campaign but did not return a campaign key.");
  const sent = await zohoCampaignRequest(settings, "sendcampaign", { campaignkey: campaignKey });
  const status = String(sent?.campaign_status ?? sent?.response?.campaign_status ?? "").toLowerCase();
  if (status && !["inprogress", "sent", "scheduledafterreviewed"].includes(status)) {
    throw new MarketingDeliveryError(`Zoho returned an unexpected campaign status: ${status}`);
  }
  return { campaignKey };
}

function smtpTransport(settings: any) {
  const host = String(settings?.smtp_host ?? "").trim();
  const port = Number(settings?.smtp_port ?? 587);
  const user = String(settings?.smtp_user ?? "");
  const pass = String(settings?.smtp_pass ?? "");
  if (!host || !user || !pass) throw new Error("SMTP is not configured. Add SMTP host, username, and password in Invoice Settings.");
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function isSafeToRetrySmtpError(error: any): boolean {
  const command = String(error?.command ?? "").toUpperCase();
  const responseCode = Number(error?.responseCode);
  if (!Number.isInteger(responseCode) || responseCode < 400 || responseCode >= 500) return false;
  return ["CONN", "EHLO", "HELO", "AUTH", "MAIL", "RCPT"]
    .some(prefix => command === prefix || command.startsWith(`${prefix} `));
}

function stripHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

const MAX_MARKETING_HTML_BYTES = 8 * 1024 * 1024;
const MAX_EMBEDDED_IMAGE_BYTES = 2 * 1024 * 1024;
const EMBEDDED_IMAGE_PATTERN = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/i;

/**
 * Keep editor HTML safe at the API boundary as well as in the browser. Product
 * comments, merge fields, inline styles, and ordinary HTTPS images are retained.
 */
export function sanitizeMarketingEditorHtml(value: string): string {
  if (Buffer.byteLength(value, "utf8") > MAX_MARKETING_HTML_BYTES) {
    throw new Error("Marketing message content is too large.");
  }
  let html = value
    .replace(/<(script|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|iframe|object|embed|form)\b[^>]*\/?>/gi, "")
    .replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  html = html.replace(/\b(src|href)\s*=\s*(["'])(.*?)\2/gi, (match, attribute, quote, rawUrl) => {
    const url = String(rawUrl).replace(/&amp;/g, "&").trim();
    if (/^(?:javascript|vbscript):/i.test(url)) return `${attribute}=${quote}#${quote}`;
    if (/^data:/i.test(url) && attribute.toLowerCase() !== "src") {
      return `${attribute}=${quote}#${quote}`;
    }
    if (attribute.toLowerCase() === "src" && /^data:/i.test(url)) {
      const embedded = url.match(EMBEDDED_IMAGE_PATTERN);
      if (!embedded) return `${attribute}=${quote}#${quote}`;
      const imageBytes = Buffer.from(embedded[2], "base64").byteLength;
      if (imageBytes > MAX_EMBEDDED_IMAGE_BYTES) throw new Error("Embedded images must be 2 MB or smaller.");
    }
    return match;
  });
  return html;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderTemplate(template: string, customer: MarketingCustomer, unsubscribeUrl?: string): string {
  const firstName = customer.first_name ?? "";
  const lastName = customer.last_name ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const values: Record<string, unknown> = {
    first_name: firstName, last_name: lastName, full_name: fullName, customer_name: fullName,
    company: customer.company, email: customer.email, customer_group: customer.customer_group_name,
    customer_type: customer.customer_type, account_health: customer.account_health,
    lifetime_orders: customer.lifetime_orders ?? 0, lifetime_revenue: customer.lifetime_revenue ?? 0,
    store_credit_balance: customer.store_credit_balance ?? 0,
    last_order_date: customer.last_order_date ? new Date(customer.last_order_date).toLocaleDateString() : "",
    unsubscribe_url: unsubscribeUrl ?? "",
  };
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\{([a-zA-Z0-9_]+)\}/g, (_match, doubleKey, singleKey) => {
    const key = doubleKey || singleKey;
    return escapeHtml(values[key] ?? "");
  });
}

function publicMarketingUrl(path: string): string {
  const configured = String(process.env.MARKETING_PUBLIC_URL ?? "").trim().replace(/\/$/, "");
  if (configured) return `${configured}${path}`;
  const domains = String(process.env.REPLIT_DOMAINS ?? process.env.REPLIT_DEV_DOMAIN ?? "").split(",")[0].trim();
  return domains ? `https://${domains}${path}` : path;
}

function signUnsubscribeToken(campaignId: number, entityId: number, entityType: "customer" | "contact" = "customer"): string {
  const payload = entityType === "contact" ? `${campaignId}.contact.${entityId}` : `${campaignId}.${entityId}`;
  const secret = String(process.env.SESSION_SECRET ?? "");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

function safeProductUrl(value: unknown): string {
  const url = String(value ?? "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

function signMarketingClickToken(
  campaignId: number,
  recipientId: number,
  productId: number,
  targetUrl: string,
): string {
  const encodedTarget = Buffer.from(targetUrl).toString("base64url");
  const payload = `${campaignId}.${recipientId}.${productId}.${encodedTarget}`;
  const signature = createHmac("sha256", String(process.env.SESSION_SECRET ?? ""))
    .update(payload).digest("base64url");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function signMarketingCampaignClickToken(campaignId: number, productId: number, targetUrl: string): string {
  const encodedTarget = Buffer.from(targetUrl).toString("base64url");
  const payload = `${campaignId}.campaign.${productId}.${encodedTarget}`;
  const signature = createHmac("sha256", String(process.env.SESSION_SECRET ?? "")).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function verifyMarketingCampaignClickToken(token: string): {
  campaignId: number;
  productId: number;
  targetUrl: string;
} | null {
  try {
    const parts = Buffer.from(token, "base64url").toString("utf8").split(".");
    if (parts.length !== 5 || parts[1] !== "campaign") return null;
    const campaignId = Number(parts[0]);
    const productId = Number(parts[2]);
    const targetUrl = Buffer.from(parts[3], "base64url").toString("utf8");
    const expected = createHmac("sha256", String(process.env.SESSION_SECRET ?? ""))
      .update(`${campaignId}.campaign.${productId}.${parts[3]}`).digest("base64url");
    if (!Number.isInteger(campaignId) || campaignId < 1 || !Number.isInteger(productId) || productId < 1
      || !safeProductUrl(targetUrl) || parts[4].length !== expected.length
      || !timingSafeEqual(Buffer.from(parts[4]), Buffer.from(expected))) return null;
    return { campaignId, productId, targetUrl };
  } catch {
    return null;
  }
}

export function signMarketingContentToken(campaignId: number): string {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${campaignId}.content.${expiresAt}`;
  const signature = createHmac("sha256", String(process.env.SESSION_SECRET ?? "")).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function verifyMarketingContentToken(token: string): number | null {
  try {
    const parts = Buffer.from(token, "base64url").toString("utf8").split(".");
    if (parts.length !== 4 || parts[1] !== "content") return null;
    const campaignId = Number(parts[0]);
    const expiresAt = Number(parts[2]);
    const expected = createHmac("sha256", String(process.env.SESSION_SECRET ?? ""))
      .update(`${campaignId}.content.${expiresAt}`).digest("base64url");
    if (!Number.isInteger(campaignId) || campaignId < 1 || !Number.isFinite(expiresAt) || expiresAt < Date.now()
      || parts[3].length !== expected.length || !timingSafeEqual(Buffer.from(parts[3]), Buffer.from(expected))) return null;
    return campaignId;
  } catch {
    return null;
  }
}

export function signMarketingCampaignUnsubscribeToken(campaignId: number): string {
  const payload = `${campaignId}.unsubscribe`;
  const signature = createHmac("sha256", String(process.env.SESSION_SECRET ?? "")).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function verifyMarketingCampaignUnsubscribeToken(token: string): number | null {
  try {
    const parts = Buffer.from(token, "base64url").toString("utf8").split(".");
    if (parts.length !== 3 || parts[1] !== "unsubscribe") return null;
    const campaignId = Number(parts[0]);
    const expected = createHmac("sha256", String(process.env.SESSION_SECRET ?? ""))
      .update(`${campaignId}.unsubscribe`).digest("base64url");
    if (!Number.isInteger(campaignId) || campaignId < 1 || parts[2].length !== expected.length
      || !timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) return null;
    return campaignId;
  } catch {
    return null;
  }
}

export function verifyMarketingClickToken(token: string): {
  campaignId: number;
  recipientId: number;
  productId: number;
  targetUrl: string;
} | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(".");
    if (parts.length !== 5) return null;
    const [rawCampaignId, rawRecipientId, rawProductId, encodedTarget, supplied] = parts;
    const campaignId = Number(rawCampaignId);
    const recipientId = Number(rawRecipientId);
    const productId = Number(rawProductId);
    const targetUrl = Buffer.from(encodedTarget, "base64url").toString("utf8");
    const payload = `${campaignId}.${recipientId}.${productId}.${encodedTarget}`;
    const expected = createHmac("sha256", String(process.env.SESSION_SECRET ?? ""))
      .update(payload).digest("base64url");
    if (!Number.isInteger(campaignId) || campaignId < 1
      || !Number.isInteger(recipientId) || recipientId < 1
      || !Number.isInteger(productId) || productId < 1
      || !safeProductUrl(targetUrl) || !supplied
      || supplied.length !== expected.length
      || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      return null;
    }
    return { campaignId, recipientId, productId, targetUrl };
  } catch {
    return null;
  }
}

function renderMarketingProductTrackingLinks(
  template: string,
  campaign: any,
  recipientId: number,
): string {
  if (!recipientId) return template;
  const snapshots = Array.isArray(campaign?.product_snapshots) ? campaign.product_snapshots : [];
  const products = new Map<number, { id: number; productUrl: string }>();
  for (const product of snapshots) {
    const id = Number(product?.id ?? product?.bigcommerce_id);
    const productUrl = safeProductUrl(product?.product_url);
    if (Number.isInteger(id) && id > 0 && productUrl) products.set(id, { id, productUrl });
  }
  if (!products.size) return template;

  const rewriteProductBlock = (block: string): string => block.replace(/<a\b[^>]*>/gi, tag => {
    const hrefMatch = tag.match(/\bhref\s*=\s*"([^"]*)"/i);
    if (!hrefMatch) return tag;
    const idMatch = tag.match(/\bdata-marketing-product-id\s*=\s*"(\d+)"/i);
    const href = hrefMatch[1].replace(/&amp;/g, "&");
    const product = idMatch
      ? products.get(Number(idMatch[1]))
      : Array.from(products.values()).find(candidate => candidate.productUrl === href);
    if (!product) return tag;
    const token = signMarketingClickToken(campaign.id, recipientId, product.id, product.productUrl);
    const trackingUrl = publicMarketingUrl(`/api/marketing/click/${token}`);
    return tag.replace(/\bhref\s*=\s*"[^"]*"/i, `href="${escapeHtml(trackingUrl)}"`);
  });

  return template.replace(
    /<!-- marketing-product-(?:block:\d+|grid) -->[\s\S]*?<!-- \/marketing-product-(?:block:\d+|grid) -->/g,
    rewriteProductBlock,
  );
}

export function verifyMarketingUnsubscribeToken(token: string): { campaignId: number; customerId?: number; contactId?: number; entityType: "customer" | "contact" } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(".");
    const isContact = parts[1] === "contact";
    const rawCampaignId = parts[0];
    const rawEntityId = isContact ? parts[2] : parts[1];
    const supplied = isContact ? parts[3] : parts[2];
    const campaignId = Number(rawCampaignId);
    const entityId = Number(rawEntityId);
    if (!Number.isInteger(campaignId) || !Number.isInteger(entityId) || !supplied) return null;
    const payload = isContact ? `${campaignId}.contact.${entityId}` : `${campaignId}.${entityId}`;
    const expected = createHmac("sha256", String(process.env.SESSION_SECRET ?? "")).update(payload).digest("base64url");
    if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
    return isContact ? { campaignId, contactId: entityId, entityType: "contact" } : { campaignId, customerId: entityId, entityType: "customer" };
  } catch {
    return null;
  }
}

async function getMailSettings() {
  const setting = await storage.getSetting("invoice_settings");
  return setting?.value && typeof setting.value === "string" ? JSON.parse(setting.value) : setting?.value ?? {};
}

const MARKETING_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type MarketingSenderSettings = {
  emails: string[];
  defaultEmail: string;
};

export function normalizeMarketingSenderSettings(value: unknown, fallbackEmail = ""): MarketingSenderSettings {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const candidates = Array.isArray(raw.emails) ? raw.emails : [];
  const emails: string[] = [];
  for (const candidate of candidates) {
    const email = String(candidate ?? "").trim();
    if (MARKETING_EMAIL_PATTERN.test(email) && !emails.some(existing => existing.toLowerCase() === email.toLowerCase())) {
      emails.push(email);
    }
  }
  const fallback = String(fallbackEmail ?? "").trim();
  if (!emails.length && MARKETING_EMAIL_PATTERN.test(fallback)) emails.push(fallback);
  const requestedDefault = String(raw.defaultEmail ?? raw.default_email ?? "").trim();
  const defaultEmail = emails.find(email => email.toLowerCase() === requestedDefault.toLowerCase()) ?? emails[0] ?? "";
  return { emails, defaultEmail };
}

export async function getMarketingSenderSettings(invoiceSettings?: any): Promise<MarketingSenderSettings> {
  const invoice = invoiceSettings ?? await getMailSettings();
  const fallback = String(invoice.smtp_from || invoice.company_email || invoice.smtp_user || "").trim();
  const setting = await storage.getSetting("marketing_sender_settings");
  return normalizeMarketingSenderSettings(setting?.value, fallback);
}

export function resolveMarketingSenderEmail(campaign: any, settings: MarketingSenderSettings): string {
  const requested = String(campaign?.sender_email ?? "").trim();
  return settings.emails.find(email => email.toLowerCase() === requested.toLowerCase())
    ?? settings.defaultEmail
    ?? "";
}

function buildMarketingUnsubscribeFooter(campaignId: number, entityId: number, entityType: "customer" | "contact"): string {
  const token = signUnsubscribeToken(campaignId, entityId, entityType);
  const unsubscribeUrl = publicMarketingUrl(`/api/marketing/unsubscribe/${token}`);
  // Zoho recognizes this marker for its unsubscribe processing while the
  // signed application URL remains the source of truth for local suppression.
  return `<hr style="border:0;border-top:1px solid #e5e7eb;margin:32px 0 16px"><p style="font:12px Arial;color:#64748b">You are receiving this email from Mid Atlantic Distribution. <a data-zcea-unsubcribe="1" href="${unsubscribeUrl}">Unsubscribe from marketing emails</a>.</p>`;
}

function addMarketingPreviewText(html: string, previewText: unknown): string {
  const value = String(previewText ?? "").trim();
  if (!value) return html;
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(value)}</div>${html}`;
}

function renderZohoMergeTemplate(template: string): string {
  const defaults: Record<string, string> = {
    first_name: "Customer", last_name: "", full_name: "Customer", customer_name: "Customer",
    company: "", email: "", customer_group: "", customer_type: "", account_health: "",
    lifetime_orders: "0", lifetime_revenue: "0", store_credit_balance: "0", last_order_date: "",
    unsubscribe_url: "",
  };
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\{([a-zA-Z0-9_]+)\}/g, (_match, doubleKey, singleKey) => {
    const key = String(doubleKey || singleKey);
    return `$[${key}|${defaults[key] ?? ""}]$`;
  });
}

function renderZohoProductTrackingLinks(template: string, campaign: any): string {
  const snapshots = Array.isArray(campaign?.product_snapshots) ? campaign.product_snapshots : [];
  const products = new Map<number, { id: number; productUrl: string }>();
  for (const product of snapshots) {
    const id = Number(product?.id ?? product?.bigcommerce_id);
    const productUrl = safeProductUrl(product?.product_url);
    if (Number.isInteger(id) && id > 0 && productUrl) products.set(id, { id, productUrl });
  }
  if (!products.size) return template;
  return template.replace(
    /<!-- marketing-product-(?:block:\d+|grid) -->[\s\S]*?<!-- \/marketing-product-(?:block:\d+|grid) -->/g,
    block => block.replace(/<a\b[^>]*>/gi, tag => {
      const hrefMatch = tag.match(/\bhref\s*=\s*"([^"]*)"/i);
      if (!hrefMatch) return tag;
      const idMatch = tag.match(/\bdata-marketing-product-id\s*=\s*"(\d+)"/i);
      const href = hrefMatch[1].replace(/&amp;/g, "&");
      const product = idMatch
        ? products.get(Number(idMatch[1]))
        : Array.from(products.values()).find(candidate => candidate.productUrl === href);
      if (!product) return tag;
      const token = signMarketingCampaignClickToken(Number(campaign.id), product.id, product.productUrl);
      return tag.replace(/\bhref\s*=\s*"[^"]*"/i, `href="${escapeHtml(publicMarketingUrl(`/api/marketing/click/campaign/${token}`))}"`);
    }),
  );
}

export function renderMarketingCampaignContent(campaign: any): string {
  const body = renderZohoProductTrackingLinks(
    renderZohoMergeTemplate(sanitizeMarketingEditorHtml(String(campaign?.message_content ?? "<p></p>"))),
    campaign,
  );
  const unsubscribeToken = signMarketingCampaignUnsubscribeToken(Number(campaign.id));
  const unsubscribeUrl = publicMarketingUrl(`/api/marketing/zoho/unsubscribe/${unsubscribeToken}?email=$[email|]$`);
  return `${addMarketingPreviewText(body, campaign.preview_text)}<hr style="border:0;border-top:1px solid #e5e7eb;margin:32px 0 16px"><p style="font:12px Arial;color:#64748b">You are receiving this email from Mid Atlantic Distribution. <a data-zcea-unsubcribe="1" href="${unsubscribeUrl}">Unsubscribe from marketing emails</a>.</p>`;
}

function buildMarketingZohoMessage(campaign: any, customer: MarketingCustomer, recipientId: number, entityId: number, entityType: "customer" | "contact") {
  const subject = renderTemplate(campaign.subject_line || campaign.name, customer);
  const body = renderMarketingProductTrackingLinks(
    renderTemplate(campaign.message_content || "<p></p>", customer),
    campaign,
    recipientId,
  );
  const html = `${addMarketingPreviewText(body, campaign.preview_text)}${buildMarketingUnsubscribeFooter(campaign.id, entityId, entityType)}`;
  return { subject, html };
}

export async function sendMarketingTestEmail(campaignId: number, email: string): Promise<{ messageId?: string }> {
  const campaign = await storage.getMarketingCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const to = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Enter a valid test email address.");
  const delivery = await getMarketingDeliverySettings();
  const mailSettings = await getMailSettings();
  const senderSettings = await getMarketingSenderSettings(mailSettings);
  const from = resolveMarketingSenderEmail(campaign, senderSettings);
  if (!from) throw new Error("Marketing sender address is not configured.");
  const customer = { first_name: "Test", last_name: "Recipient", email: to };
  const subject = renderTemplate(campaign.subject_line || campaign.name, customer);
  const html = renderTemplate(campaign.message_content || "<p>This is a marketing test email.</p>", customer);
  let messageId: string | undefined;
  if (delivery.provider === "zoho") {
    const result = await sendZohoCampaignV11(delivery, campaign, from, [to]);
    messageId = result.campaignKey;
  } else {
    const transport = smtpTransport(mailSettings);
    const info = await transport.sendMail({ from, to, subject, html, text: stripHtml(html) });
    messageId = info.messageId;
  }
  await storage.markMarketingTestSent(campaignId);
  await storage.recordMarketingEvent({ campaign_id: campaignId, event_type: "test_sent", detail: { email: to, message_id: messageId ?? null, provider: delivery.provider } });
  return { messageId };
}

export async function processMarketingCampaign(campaignId: number): Promise<void> {
  if (runningCampaigns.has(campaignId)) return;
  runningCampaigns.add(campaignId);
  try {
    const campaign = await storage.claimMarketingCampaign(campaignId);
    if (!campaign) return;
    const delivery = await getMarketingDeliverySettings();
    const mailSettings = await getMailSettings();
    const senderSettings = await getMarketingSenderSettings(mailSettings);
    const from = resolveMarketingSenderEmail(campaign, senderSettings);
    if (!from) throw new Error("Marketing sender address is not configured.");
    const transport = delivery.provider === "smtp" ? smtpTransport(mailSettings) : null;
    if (delivery.provider === "zoho") ensureZohoConfigured(delivery);
    await storage.prepareMarketingRecipients(campaignId);
    if (delivery.provider === "zoho") {
      const recipientData = await storage.getMarketingRecipients(campaignId, { status: "all", limit: 100000 });
      const claimed: any[] = [];
      for (const row of recipientData.rows.filter((candidate: any) => candidate.status === "eligible" || (candidate.status === "failed" && candidate.attempt_count < 3))) {
        const recipient = await storage.claimMarketingRecipient(row.id);
        if (!recipient) continue;
        if (!recipient.email || !MARKETING_EMAIL_PATTERN.test(recipient.email)) {
          await storage.markMarketingRecipientFailed(row.id, "Customer does not have a valid email address.", false);
          continue;
        }
        claimed.push(recipient);
      }
      if (claimed.length) {
        try {
          const result = await sendZohoCampaignV11(delivery, campaign, from, claimed.map(recipient => recipient.email));
          for (const recipient of claimed) await storage.markMarketingRecipientSent(recipient.id, result.campaignKey);
        } catch (error: any) {
          for (const recipient of claimed) {
            await storage.markMarketingRecipientFailed(recipient.id, String(error?.message ?? error), Boolean(error?.retryable));
          }
        }
      }
      await storage.completeMarketingCampaign(campaignId);
      return;
    }
    while (true) {
      const batch = await storage.getMarketingRecipients(campaignId, { status: "all", limit: 100 });
      const pending = batch.rows.filter((row: any) => row.status === "eligible" || (row.status === "failed" && row.attempt_count < 3));
      if (!pending.length) break;
      for (const row of pending) {
        const recipient = await storage.claimMarketingRecipient(row.id);
        if (!recipient) continue;
        const customer = row.customer as MarketingCustomer;
        const imported = row.source === "imported" || (row.marketing_contact_id != null && Number.isInteger(Number(row.marketing_contact_id)));
        const entityId = imported ? Number(row.marketing_contact_id) : Number(customer.id ?? row.customer_id);
        if (!entityId) {
          await storage.markMarketingRecipientFailed(row.id, "Recipient is missing a contact id.", false);
          continue;
        }
        const { subject, html } = buildMarketingZohoMessage(
          campaign,
          customer,
          Number(recipient.id),
          entityId,
          imported ? "contact" : "customer",
        );
        if (!recipient.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email)) {
          await storage.markMarketingRecipientFailed(row.id, "Customer does not have a valid email address.", false);
          continue;
        }
        try {
          let messageId: string | null = null;
          const info = await transport!.sendMail({ from, to: recipient.email, subject, html, text: stripHtml(html) });
          messageId = info.messageId ?? null;
          await storage.markMarketingRecipientSent(row.id, messageId);
        } catch (error: any) {
          await storage.markMarketingRecipientFailed(
            row.id,
            String(error?.message ?? error),
            isSafeToRetrySmtpError(error),
          );
        }
      }
    }
    await storage.completeMarketingCampaign(campaignId);
  } catch (error: any) {
    const campaign = await storage.getMarketingCampaign(campaignId);
    if (campaign && campaign.status === "sending") {
      await storage.updateMarketingCampaignStatus(campaignId, "failed", campaign.created_by).catch(() => {});
    }
    console.error(`[marketing] campaign ${campaignId} failed:`, error?.message ?? error);
  } finally {
    runningCampaigns.delete(campaignId);
  }
}

export async function processMarketingQueue(): Promise<void> {
  const campaigns = await storage.getMarketingQueueCampaigns().catch((error) => {
    console.error("[marketing] queue check failed:", error?.message ?? error);
    return [];
  });
  await Promise.all(campaigns.map(campaign => processMarketingCampaign(campaign.id)));
  await processMarketingAutomations();
}

export async function processMarketingAutomations(): Promise<void> {
  const automations = await storage.getMarketingAutomations({ status: "active" }).catch(() => []);
  if (!automations.length) return;
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const signups = await storage.getCustomerSignups({ dateFrom: since, limit: 500, offset: 0 }).catch(() => ({ rows: [], total: 0 }));
  const settings = await getMailSettings().catch(() => ({}));
  let transport: any;
  try { transport = smtpTransport(settings); } catch { return; }
  const from = String(settings.smtp_from || settings.company_email || settings.smtp_user || "").trim();
  if (!from) return;
  for (const automation of automations) {
    if (!["customer_signup_completed", "customer_created"].includes(automation.trigger_type)) continue;
    for (const signup of signups.rows) {
      const customerId = Number(signup.crm_customer_id);
      if (!customerId) continue;
      const execution = await storage.createMarketingAutomationExecution({
        automationId: automation.id, customerId, triggerEvent: automation.trigger_type,
        dedupeKey: `${automation.id}:${customerId}:${new Date().toISOString().slice(0, 10)}`,
      });
      if (!execution) continue;
      try {
        const customer = await storage.getCrmCustomerById(customerId) as MarketingCustomer | undefined;
        if (!customer) throw new Error("CRM customer not found");
        for (const step of automation.steps ?? []) {
          if (step.action_type !== "send_email") continue;
          const templateId = Number(step.action_config?.template_id);
          const template = templateId ? await storage.getMarketingTemplateById(templateId) : undefined;
          if (!template) throw new Error("Automation email template not found");
          const subject = renderTemplate(template.subject_template || template.name, customer);
          const body = renderTemplate(template.body || "<p></p>", customer);
          await transport.sendMail({ from, to: customer.email, subject, html: body, text: stripHtml(body) });
        }
        await storage.updateMarketingAutomationExecution(execution.id, { status: "completed", completed_at: new Date(), last_error: null });
      } catch (error: any) {
        await storage.updateMarketingAutomationExecution(execution.id, { status: "failed", last_error: String(error?.message ?? error), completed_at: new Date() });
      }
    }
  }
}
