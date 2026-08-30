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

function signUnsubscribeToken(campaignId: number, customerId: number): string {
  const payload = `${campaignId}.${customerId}`;
  const secret = String(process.env.SESSION_SECRET ?? "");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function verifyMarketingUnsubscribeToken(token: string): { campaignId: number; customerId: number } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [rawCampaignId, rawCustomerId, supplied] = decoded.split(".");
    const campaignId = Number(rawCampaignId);
    const customerId = Number(rawCustomerId);
    if (!Number.isInteger(campaignId) || !Number.isInteger(customerId) || !supplied) return null;
    const payload = `${campaignId}.${customerId}`;
    const expected = createHmac("sha256", String(process.env.SESSION_SECRET ?? "")).update(payload).digest("base64url");
    if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
    return { campaignId, customerId };
  } catch {
    return null;
  }
}

async function getMailSettings() {
  const setting = await storage.getSetting("invoice_settings");
  return setting?.value && typeof setting.value === "string" ? JSON.parse(setting.value) : setting?.value ?? {};
}

export async function sendMarketingTestEmail(campaignId: number, email: string): Promise<{ messageId?: string }> {
  const campaign = await storage.getMarketingCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const to = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Enter a valid test email address.");
  const settings = await getMailSettings();
  const transport = smtpTransport(settings);
  const from = String(settings.smtp_from || settings.company_email || settings.smtp_user || "").trim();
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
    const from = String(settings.smtp_from || settings.company_email || settings.smtp_user || "").trim();
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
        const customerId = Number(customer.id ?? row.customer_id);
        if (!customerId) {
          await storage.markMarketingRecipientFailed(row.id, "Recipient is missing a CRM customer id.", false);
          continue;
        }
        const token = signUnsubscribeToken(campaignId, customerId);
        const unsubscribeUrl = publicMarketingUrl(`/api/marketing/unsubscribe/${token}`);
        const subject = renderTemplate(campaign.subject_line || campaign.name, customer);
        const body = renderTemplate(campaign.message_content || "<p></p>", customer);
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
