import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { storage } from "./storage";

const SETTING_KEY = "zoho_crm_credentials";
const CREDENTIALS_VERSION = 1;
const DEFAULT_API_BASE = "https://www.zohoapis.com/crm/v6";
const DEFAULT_ACCOUNTS_BASE = "https://accounts.zoho.com";

export const ZOHO_CRM_CREDENTIAL_FIELDS = [
  {
    key: "clientId",
    envName: "ZOHO_CRM_CLIENT_ID",
    label: "Zoho CRM OAuth client ID",
    secret: true,
    required: true,
    instructions: "OAuth client ID for the Zoho CRM Accounts read scope.",
  },
  {
    key: "clientSecret",
    envName: "ZOHO_CRM_CLIENT_SECRET",
    label: "Zoho CRM OAuth client secret",
    secret: true,
    required: true,
    instructions: "OAuth client secret paired with the client ID.",
  },
  {
    key: "refreshToken",
    envName: "ZOHO_CRM_REFRESH_TOKEN",
    label: "Zoho CRM OAuth refresh token",
    secret: true,
    required: true,
    instructions: "Long-lived refresh token authorized for Zoho CRM Accounts read access.",
  },
  {
    key: "apiBase",
    envName: "ZOHO_CRM_API_BASE",
    label: "Zoho CRM API base URL",
    secret: false,
    required: false,
    instructions: "Leave blank for the default US data center.",
  },
  {
    key: "accountsBase",
    envName: "ZOHO_CRM_ACCOUNTS_BASE",
    label: "Zoho OAuth accounts base URL",
    secret: false,
    required: false,
    instructions: "Leave blank for the default US OAuth data center.",
  },
] as const;

type CredentialKey = (typeof ZOHO_CRM_CREDENTIAL_FIELDS)[number]["key"];
type CredentialValues = Partial<Record<CredentialKey, string>>;
type CredentialSource = "environment" | "admin" | "default" | "none";

type EncryptedCredentials = {
  version: number;
  iv: string;
  authTag: string;
  ciphertext: string;
};

export type ZohoCrmCredentialStatusField = {
  key: CredentialKey;
  envName: string;
  label: string;
  secret: boolean;
  required: boolean;
  instructions: string;
  configured: boolean;
  source: CredentialSource;
};

export type ZohoCrmAccount = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  bigcommerceCustomerId: number | null;
  raw: Record<string, unknown>;
};

function encryptionKey(): Buffer {
  const sessionSecret = String(process.env.SESSION_SECRET ?? "");
  if (!sessionSecret) throw new Error("SESSION_SECRET is required to encrypt Zoho CRM credentials.");
  return createHash("sha256").update(`vansales-pro:zoho-crm:${sessionSecret}`).digest();
}

function encryptCredentials(values: CredentialValues): EncryptedCredentials {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(values), "utf8"), cipher.final()]);
  return {
    version: CREDENTIALS_VERSION,
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

function decryptCredentials(value: unknown): CredentialValues {
  const encrypted = value as Partial<EncryptedCredentials> | null;
  if (!encrypted || encrypted.version !== CREDENTIALS_VERSION
    || typeof encrypted.iv !== "string" || typeof encrypted.authTag !== "string"
    || typeof encrypted.ciphertext !== "string") return {};
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(encrypted.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64url"));
    const parsed = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const values: CredentialValues = {};
    for (const field of ZOHO_CRM_CREDENTIAL_FIELDS) {
      if (typeof parsed[field.key] === "string" && parsed[field.key].trim()) {
        values[field.key] = parsed[field.key].trim();
      }
    }
    return values;
  } catch {
    return {};
  }
}

async function getAdminCredentials(): Promise<CredentialValues> {
  const setting = await storage.getSetting(SETTING_KEY).catch(() => null);
  return decryptCredentials(setting?.value);
}

function environmentValue(name: string): string {
  return String(process.env[name] ?? "").trim();
}

export async function getZohoCrmCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  apiBase: string;
  accountsBase: string;
  sources: Record<CredentialKey, CredentialSource>;
}> {
  const admin = await getAdminCredentials();
  const resolved = {} as CredentialValues;
  const sources = {} as Record<CredentialKey, CredentialSource>;
  for (const field of ZOHO_CRM_CREDENTIAL_FIELDS) {
    const env = environmentValue(field.envName);
    if (env) {
      resolved[field.key] = env;
      sources[field.key] = "environment";
    } else if (admin[field.key]) {
      resolved[field.key] = admin[field.key];
      sources[field.key] = "admin";
    } else if (field.key === "apiBase") {
      resolved[field.key] = DEFAULT_API_BASE;
      sources[field.key] = "default";
    } else if (field.key === "accountsBase") {
      resolved[field.key] = DEFAULT_ACCOUNTS_BASE;
      sources[field.key] = "default";
    } else {
      sources[field.key] = "none";
    }
  }
  return {
    clientId: resolved.clientId ?? "",
    clientSecret: resolved.clientSecret ?? "",
    refreshToken: resolved.refreshToken ?? "",
    apiBase: (resolved.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, ""),
    accountsBase: (resolved.accountsBase ?? DEFAULT_ACCOUNTS_BASE).replace(/\/+$/, ""),
    sources,
  };
}

export async function getZohoCrmCredentialStatus() {
  const credentials = await getZohoCrmCredentials();
  const missing = ZOHO_CRM_CREDENTIAL_FIELDS
    .filter(field => field.required && !credentials[field.key])
    .map(field => field.envName);
  return {
    provider: "zoho_crm_accounts",
    fields: ZOHO_CRM_CREDENTIAL_FIELDS.map(field => ({
      key: field.key,
      envName: field.envName,
      label: field.label,
      secret: field.secret,
      required: field.required,
      instructions: field.instructions,
      configured: Boolean(credentials[field.key]),
      source: credentials.sources[field.key],
    })),
    configured: missing.length === 0,
    apiBase: credentials.apiBase,
    authentication: "oauth_refresh_token",
    missing,
  };
}

export async function saveZohoCrmCredentials(input: {
  credentials?: Record<string, unknown>;
  clear?: unknown[];
}): Promise<void> {
  const current = await getAdminCredentials();
  const next: CredentialValues = { ...current };
  const allowed = new Set<string>(ZOHO_CRM_CREDENTIAL_FIELDS.map(field => field.key));
  if (Array.isArray(input.clear)) {
    for (const key of input.clear) {
      if (typeof key === "string" && allowed.has(key)) delete next[key as CredentialKey];
    }
  }
  if (input.credentials && typeof input.credentials === "object" && !Array.isArray(input.credentials)) {
    for (const field of ZOHO_CRM_CREDENTIAL_FIELDS) {
      const value = input.credentials[field.key];
      if (typeof value !== "string" || !value.trim()) continue;
      const trimmed = value.trim();
      if (trimmed.length > 10000) throw new Error(`${field.label} is too long.`);
      if (field.key === "apiBase" || field.key === "accountsBase") {
        let url: URL;
        try { url = new URL(trimmed); } catch { throw new Error(`${field.label} must be a valid HTTPS URL.`); }
        if (url.protocol !== "https:") throw new Error(`${field.label} must use HTTPS.`);
        next[field.key] = trimmed.replace(/\/+$/, "");
      } else {
        next[field.key] = trimmed;
      }
    }
  }
  await storage.setSetting(SETTING_KEY, encryptCredentials(next));
}

export async function clearZohoCrmCredentials(): Promise<void> {
  await storage.setSetting(SETTING_KEY, encryptCredentials({}));
}

async function getAccessToken(): Promise<string> {
  const credentials = await getZohoCrmCredentials();
  if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
    throw new Error("Zoho CRM OAuth credentials are not configured.");
  }
  const response = await fetch(`${credentials.accountsBase}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: credentials.refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error(`Zoho CRM OAuth token request failed (${response.status}).`);
  }
  return body.access_token;
}

function firstValue(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
    if (value && typeof value === "object" && "value" in value) {
      const nested = (value as { value?: unknown }).value;
      if (typeof nested === "string" && nested.trim()) return nested.trim();
      if (typeof nested === "number") return String(nested);
    }
  }
  return null;
}

function normalizeAccount(raw: Record<string, unknown>): ZohoCrmAccount | null {
  const id = firstValue(raw, ["id"]);
  if (!id) return null;
  const bcValue = firstValue(raw, [
    "BigCommerce_Customer_ID", "BigCommerce Customer ID", "BigCommerce_Customer_Id",
    "Bigcommerce_Customer_ID", "BC_Customer_ID", "BC_Customer_Id", "BigCommerceID",
  ]);
  const parsedBcId = bcValue && /^\d+$/.test(bcValue) ? Number(bcValue) : null;
  return {
    id,
    name: firstValue(raw, ["Account_Name", "account_name", "name"]) ?? "",
    email: firstValue(raw, ["Email", "email"]),
    phone: firstValue(raw, ["Phone", "phone"]),
    website: firstValue(raw, ["Website", "website"]),
    bigcommerceCustomerId: parsedBcId,
    raw,
  };
}

export async function listZohoAccounts(search?: string): Promise<ZohoCrmAccount[]> {
  const credentials = await getZohoCrmCredentials();
  const token = await getAccessToken();
  const accounts: ZohoCrmAccount[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const url = new URL(`${credentials.apiBase}/Accounts`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "200");
    const response = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: "application/json" },
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 204) break;
    if (!response.ok) {
      const detail = typeof body?.message === "string" ? `: ${body.message}` : "";
      throw new Error(`Zoho CRM Accounts request failed (${response.status})${detail}`);
    }
    const rows = Array.isArray(body?.data) ? body.data : [];
    for (const row of rows) {
      if (row && typeof row === "object") {
        const account = normalizeAccount(row as Record<string, unknown>);
        if (account) accounts.push(account);
      }
    }
    if (rows.length < 200 || body?.info?.more_records === false) break;
  }
  const query = String(search ?? "").trim().toLowerCase();
  if (!query) return accounts;
  return accounts.filter(account =>
    [account.id, account.name, account.email, account.phone, account.website, String(account.bigcommerceCustomerId ?? "")]
      .some(value => String(value ?? "").toLowerCase().includes(query)),
  );
}