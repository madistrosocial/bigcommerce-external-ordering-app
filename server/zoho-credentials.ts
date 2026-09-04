import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { storage } from "./storage";

const ZOHO_CREDENTIALS_SETTING_KEY = "zoho_credentials";
const CREDENTIALS_VERSION = 1;
const DEFAULT_ZOHO_CAMPAIGNS_API_BASE = "https://campaigns.zoho.com";

export const ZOHO_CREDENTIAL_FIELDS = [
  {
    key: "apiKey",
    envName: "ZOHO_CAMPAIGNS_API_TOKEN",
    label: "Zoho Campaigns Email API key",
    secret: true,
    required: true,
    instructions: "Create this in Zoho Campaigns → Settings → Developer Space → API Keys with the ZohoCampaigns.emailapi.ALL scope.",
  },
  {
    key: "clientId",
    envName: "ZOHO_CAMPAIGNS_CLIENT_ID",
    label: "Zoho OAuth client ID",
    secret: true,
    required: false,
    instructions: "Optional. Create an OAuth client in the Zoho API Console. The current Email API transmission uses the API key above, not OAuth.",
  },
  {
    key: "clientSecret",
    envName: "ZOHO_CAMPAIGNS_CLIENT_SECRET",
    label: "Zoho OAuth client secret",
    secret: true,
    required: false,
    instructions: "Optional OAuth credential for future Zoho API features. Do not use it as the Email API key.",
  },
  {
    key: "refreshToken",
    envName: "ZOHO_CAMPAIGNS_REFRESH_TOKEN",
    label: "Zoho OAuth refresh token",
    secret: true,
    required: false,
    instructions: "Optional OAuth credential for future Zoho API features. Keep it in Replit Secrets in production when possible.",
  },
  {
    key: "apiBase",
    envName: "ZOHO_CAMPAIGNS_API_BASE",
    label: "Zoho Campaigns API base URL",
    secret: false,
    required: false,
    instructions: "Leave blank for the default US data center. Use your Zoho Campaigns regional base URL only when your account is hosted elsewhere.",
  },
] as const;

type ZohoCredentialKey = (typeof ZOHO_CREDENTIAL_FIELDS)[number]["key"];
type ZohoCredentialValues = Partial<Record<ZohoCredentialKey, string>>;
type CredentialSource = "environment" | "admin" | "default" | "none";

type EncryptedCredentials = {
  version: number;
  iv: string;
  authTag: string;
  ciphertext: string;
};

export type ZohoCredentialStatusField = {
  key: ZohoCredentialKey;
  envName: string;
  label: string;
  secret: boolean;
  required: boolean;
  instructions: string;
  configured: boolean;
  source: CredentialSource;
};

function encryptionKey(): Buffer {
  const sessionSecret = String(process.env.SESSION_SECRET ?? "");
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required to encrypt admin-managed Zoho credentials.");
  }
  return createHash("sha256")
    .update(`vansales-pro:zoho-credentials:${sessionSecret}`)
    .digest();
}

function encryptCredentials(values: ZohoCredentialValues): EncryptedCredentials {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(values), "utf8"),
    cipher.final(),
  ]);
  return {
    version: CREDENTIALS_VERSION,
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

function decryptCredentials(value: unknown): ZohoCredentialValues {
  const encrypted = value as Partial<EncryptedCredentials> | null;
  if (
    !encrypted
    || encrypted.version !== CREDENTIALS_VERSION
    || typeof encrypted.iv !== "string"
    || typeof encrypted.authTag !== "string"
    || typeof encrypted.ciphertext !== "string"
  ) {
    return {};
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(encrypted.iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const values: ZohoCredentialValues = {};
    for (const field of ZOHO_CREDENTIAL_FIELDS) {
      if (typeof parsed[field.key] === "string" && parsed[field.key].trim()) {
        values[field.key] = parsed[field.key].trim();
      }
    }
    return values;
  } catch {
    // An old SESSION_SECRET must not prevent valid production environment
    // secrets from working. The admin override is treated as unavailable.
    return {};
  }
}

async function getAdminCredentials(): Promise<ZohoCredentialValues> {
  const setting = await storage.getSetting(ZOHO_CREDENTIALS_SETTING_KEY).catch(() => null);
  return decryptCredentials(setting?.value);
}

function configuredEnvironmentValue(envName: string): string {
  return String(process.env[envName] ?? "").trim();
}

export async function getZohoCampaignsCredentials(): Promise<{
  apiKey: string;
  apiBase: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  sources: Record<ZohoCredentialKey, CredentialSource>;
}> {
  const admin = await getAdminCredentials();
  const sources = {} as Record<ZohoCredentialKey, CredentialSource>;
  const resolved = {} as ZohoCredentialValues;

  for (const field of ZOHO_CREDENTIAL_FIELDS) {
    const environmentValue = configuredEnvironmentValue(field.envName);
    if (environmentValue) {
      resolved[field.key] = environmentValue;
      sources[field.key] = "environment";
    } else if (admin[field.key]) {
      resolved[field.key] = admin[field.key];
      sources[field.key] = "admin";
    } else if (field.key === "apiBase") {
      resolved[field.key] = DEFAULT_ZOHO_CAMPAIGNS_API_BASE;
      sources[field.key] = "default";
    } else {
      sources[field.key] = "none";
    }
  }

  return {
    apiKey: resolved.apiKey ?? "",
    apiBase: (resolved.apiBase ?? DEFAULT_ZOHO_CAMPAIGNS_API_BASE).replace(/\/+$/, ""),
    clientId: resolved.clientId ?? "",
    clientSecret: resolved.clientSecret ?? "",
    refreshToken: resolved.refreshToken ?? "",
    sources,
  };
}

export async function getZohoCampaignsCredentialStatus(): Promise<{
  provider: "zoho_campaigns_email_api";
  fields: ZohoCredentialStatusField[];
  configured: boolean;
  apiBase: string;
  authentication: "api_key";
  missing: string[];
}> {
  const credentials = await getZohoCampaignsCredentials();
  const apiKeyField = ZOHO_CREDENTIAL_FIELDS.find(field => field.key === "apiKey")!;
  return {
    provider: "zoho_campaigns_email_api",
    fields: ZOHO_CREDENTIAL_FIELDS.map(field => ({
      key: field.key,
      envName: field.envName,
      label: field.label,
      secret: field.secret,
      required: field.required,
      instructions: field.instructions,
      configured: field.key === "apiBase"
        ? Boolean(credentials.apiBase)
        : Boolean(credentials[field.key]),
      source: credentials.sources[field.key],
    })),
    configured: Boolean(credentials.apiKey),
    apiBase: credentials.apiBase,
    authentication: "api_key",
    missing: credentials.apiKey ? [] : [apiKeyField.envName],
  };
}

export async function saveZohoCampaignsCredentials(
  input: { credentials?: Record<string, unknown>; clear?: unknown[] },
): Promise<void> {
  const current = await getAdminCredentials();
  const next: ZohoCredentialValues = { ...current };
  const allowedKeys = new Set<string>(ZOHO_CREDENTIAL_FIELDS.map(field => field.key));

  if (Array.isArray(input.clear)) {
    for (const key of input.clear) {
      if (typeof key === "string" && allowedKeys.has(key)) {
        delete next[key as ZohoCredentialKey];
      }
    }
  }

  if (input.credentials && typeof input.credentials === "object" && !Array.isArray(input.credentials)) {
    for (const field of ZOHO_CREDENTIAL_FIELDS) {
      const value = input.credentials[field.key];
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      if (trimmed.length > 10000) throw new Error(`${field.label} is too long.`);
      if (field.key === "apiBase") {
        let parsed: URL;
        try {
          parsed = new URL(trimmed);
        } catch {
          throw new Error("Zoho Campaigns API base URL must be a valid HTTPS URL.");
        }
        if (parsed.protocol !== "https:") {
          throw new Error("Zoho Campaigns API base URL must use HTTPS.");
        }
        next[field.key] = trimmed.replace(/\/+$/, "");
      } else {
        next[field.key] = trimmed;
      }
    }
  }

  await storage.setSetting(ZOHO_CREDENTIALS_SETTING_KEY, encryptCredentials(next));
}

export async function clearZohoCampaignsCredentials(): Promise<void> {
  await storage.setSetting(ZOHO_CREDENTIALS_SETTING_KEY, encryptCredentials({}));
}