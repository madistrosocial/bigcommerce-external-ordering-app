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

export async function sendMarketingTestEmail(campaignId: number, email: string): Promise<{ messageId?: string }> {
  const campaign = await storage.getMarketingCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const to = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Enter a valid test email address.");
  const settings = await getMailSettings();
  const transport = smtpTransport(settings);
  const from = resolveMarketingSenderEmail(campaign, await getMarketingSenderSettings(settings));
  if (!from) throw new Error("SMTP sender address is not configured.");
  const customer = { first_name: "Test", last_name: "Recipient", email: to };
  const subject = renderTemplate(campaign.subject_line || campaign.name, customer);
  const html = renderTemplate(campaign.message_content || "<p>This is a marketing test email.</p>", customer);
  const info = await transport.sendMail({ from, to, subject, html, text: stripHtml(html) });
  await storage.markMarketingTestSent(campaignId);
  await storage.recordMarketingEvent({ campaign_id: campaignId, event_type: "test_sent", detail: { email: to, message_id: info.messageId ?? null } });
  return { messageId: info.messageId };
}

export async function processMarketingCampaign(campaignId: number): Promise<void> {
  if (runningCampaigns.has(campaignId)) return;
  runningCampaigns.add(campaignId);
  try {
    const campaign = await storage.claimMarketingCampaign(campaignId);
    if (!campaign) return;
    const settings = await getMailSettings();
    const transport = smtpTransport(settings);
    const from = resolveMarketingSenderEmail(campaign, await getMarketingSenderSettings(settings));
    if (!from) throw new Error("SMTP sender address is not configured.");
    await storage.prepareMarketingRecipients(campaignId);
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
        const token = signUnsubscribeToken(campaignId, entityId, imported ? "contact" : "customer");
        const unsubscribeUrl = publicMarketingUrl(`/api/marketing/unsubscribe/${token}`);
        const subject = renderTemplate(campaign.subject_line || campaign.name, customer);
        const body = renderMarketingProductTrackingLinks(
          renderTemplate(campaign.message_content || "<p></p>", customer),
          campaign,
          Number(recipient.id),
        );
        const html = `${body}<hr style="border:0;border-top:1px solid #e5e7eb;margin:32px 0 16px"><p style="font:12px Arial;color:#64748b">You are receiving this email from Mid Atlantic Distribution. <a href="${unsubscribeUrl}">Unsubscribe from marketing emails</a>.</p>`;
        if (!recipient.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email)) {
          await storage.markMarketingRecipientFailed(row.id, "Customer does not have a valid email address.", false);
          continue;
        }
        try {
          const info = await transport.sendMail({ from, to: recipient.email, subject, html, text: stripHtml(html) });
          await storage.markMarketingRecipientSent(row.id, info.messageId ?? null);
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
