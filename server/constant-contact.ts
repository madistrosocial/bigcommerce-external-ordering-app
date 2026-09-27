import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { storage } from "./storage";

export const CONSTANT_CONTACT_CALLBACK_PATH = "/api/constant-contact/oauth/callback";
export const CONSTANT_CONTACT_STATE_TTL_MS = 20 * 60 * 1000;

const TOKEN_ENDPOINT = "https://authz.constantcontact.com/oauth2/default/v1/token";
const API_BASE_URL = "https://api.cc.email/v3";
const API_ORIGIN = new URL(API_BASE_URL).origin;
const SETTINGS_KEY = "constant_contact_oauth";
const REQUIRED_SCOPES = ["account_read", "contact_data", "campaign_data", "offline_access"];
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface ConstantContactTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  connectedAt: number;
}

interface EncryptedTokenRecord {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

let refreshInFlight: Promise<ConstantContactTokens> | null = null;

function getAppCredentials() {
  const clientId = String(process.env.CONSTANT_CONTACT_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.CONSTANT_CONTACT_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("Constant Contact API client credentials are not configured.");
  }
  return { clientId, clientSecret };
}

export function hasConstantContactAppCredentials(): boolean {
  return Boolean(
    String(process.env.CONSTANT_CONTACT_CLIENT_ID || "").trim()
    && String(process.env.CONSTANT_CONTACT_CLIENT_SECRET || "").trim(),
  );
}

export function generateConstantContactOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export async function storeConstantContactOAuthState(state: string, redirectUri: string): Promise<void> {
  const stateHash = createHash("sha256").update("constant-contact-state\0").update(state).digest("hex");
  const now = Date.now();
  await storage.purgeExpiredConstantContactOAuthStates(now);
  await storage.storeConstantContactOAuthState(stateHash, {
    expiresAt: now + CONSTANT_CONTACT_STATE_TTL_MS,
    redirectUri,
  });
}

export async function consumeConstantContactOAuthState(
  state: string,
): Promise<{ redirectUri: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return null;
  const stateHash = createHash("sha256").update("constant-contact-state\0").update(state).digest("hex");
  const record = await storage.consumeConstantContactOAuthState(stateHash);
  if (
    !record
    || !Number.isFinite(record.expiresAt)
    || record.expiresAt <= Date.now()
    || !record.redirectUri
  ) {
    return null;
  }
  return { redirectUri: record.redirectUri };
}

export function createConstantContactAuthorizationUrl(redirectUri: string, state: string): string {
  const { clientId } = getAppCredentials();
  const authorizationUrl = new URL("https://authz.constantcontact.com/oauth2/default/v1/authorize");
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: REQUIRED_SCOPES.join(" "),
    state,
  }).toString();
  return authorizationUrl.toString();
}

function encryptionKey(): Buffer {
  const sessionSecret = String(process.env.SESSION_SECRET || "");
  if (!sessionSecret) throw new Error("SESSION_SECRET must be configured to protect Constant Contact authorization.");
  return createHash("sha256")
    .update("constant-contact-oauth-v1\0")
    .update(sessionSecret)
    .digest();
}

async function readStoredTokens(): Promise<ConstantContactTokens | null> {
  const setting = await storage.getSetting(SETTINGS_KEY);
  const record = setting?.value as EncryptedTokenRecord | null | undefined;
  if (!record) return null;
  if (record.version !== 1 || !record.iv || !record.tag || !record.ciphertext) {
    throw new Error("Saved Constant Contact authorization is invalid. Reconnect the account.");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(record.iv, "hex"));
    decipher.setAuthTag(Buffer.from(record.tag, "hex"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, "hex")),
      decipher.final(),
    ]).toString("utf8");
    const tokens = JSON.parse(plaintext) as ConstantContactTokens;
    if (
      typeof tokens.accessToken !== "string"
      || typeof tokens.refreshToken !== "string"
      || !Number.isFinite(tokens.expiresAt)
      || !Array.isArray(tokens.scopes)
    ) {
      throw new Error("invalid token payload");
    }
    return tokens;
  } catch {
    throw new Error("Saved Constant Contact authorization cannot be decrypted. Reconnect the account.");
  }
}

async function writeStoredTokens(tokens: ConstantContactTokens): Promise<void> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(tokens), "utf8"),
    cipher.final(),
  ]);
  const record: EncryptedTokenRecord = {
    version: 1,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };
  await storage.setSetting(SETTINGS_KEY, record);
}

async function requestTokens(
  grant: Record<string, string>,
  existing?: ConstantContactTokens | null,
): Promise<ConstantContactTokens> {
  const { clientId, clientSecret } = getAppCredentials();
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(grant),
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(`Constant Contact token request failed (HTTP ${response.status}).`);
  }

  const accessToken = typeof body?.access_token === "string" ? body.access_token : "";
  const refreshToken = typeof body?.refresh_token === "string"
    ? body.refresh_token
    : existing?.refreshToken || "";
  const expiresIn = Number(body?.expires_in);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("Constant Contact returned an incomplete authorization response.");
  }
  const scopesValue = body?.scope;
  const scopes = typeof scopesValue === "string"
    ? scopesValue.split(/[\s,]+/).filter(Boolean)
    : existing?.scopes || [];
  const tokens: ConstantContactTokens = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    scopes,
    connectedAt: existing?.connectedAt || Date.now(),
  };
  await writeStoredTokens(tokens);
  return tokens;
}

export async function completeConstantContactAuthorization(code: string, redirectUri: string): Promise<void> {
  await requestTokens({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
}

async function refreshTokens(existing: ConstantContactTokens): Promise<ConstantContactTokens> {
  return requestTokens(
    {
      grant_type: "refresh_token",
      refresh_token: existing.refreshToken,
    },
    existing,
  );
}

async function getValidTokens(): Promise<ConstantContactTokens> {
  const tokens = await readStoredTokens();
  if (!tokens) throw new Error("Constant Contact is not authorized. Connect the account first.");
  if (tokens.expiresAt > Date.now() + REFRESH_BUFFER_MS) return tokens;

  if (!refreshInFlight) {
    refreshInFlight = refreshTokens(tokens).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function getConstantContactAuthorizationStatus() {
  const tokens = await readStoredTokens();
  return {
    clientCredentialsConfigured: hasConstantContactAppCredentials(),
    authorized: Boolean(tokens),
    scopes: tokens?.scopes || [],
    expiresAt: tokens?.expiresAt || null,
    connectedAt: tokens?.connectedAt || null,
  };
}

export async function verifyConstantContactUserPrivileges() {
  const tokens = await getValidTokens();
  const response = await fetch(`${API_BASE_URL}/account/user/privileges`, {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      Accept: "application/json",
    },
  });
  const body = await response.json().catch(() => null) as any;
  if (!response.ok) {
    throw new Error(`Constant Contact permission check failed (HTTP ${response.status}).`);
  }

  const entries = Array.isArray(body)
    ? body
    : Array.isArray(body?.privileges)
      ? body.privileges
      : Array.isArray(body?.user_privileges)
        ? body.user_privileges
        : [];
  const privileges = entries
    .map((entry: any) => typeof entry?.privilege_name === "string" ? entry.privilege_name : "")
    .filter(Boolean)
    .sort();

  return {
    privileges,
    canCreateCampaigns: privileges.includes("campaign:create") || privileges.includes("campaign:write"),
    canReadCampaigns: privileges.includes("campaign:read"),
    canManageContacts: privileges.some((privilege: string) => /^(contacts?|lists?):/.test(privilege)),
  };
}

function safeContactCount(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || value === "") return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

async function getConstantContactJson(
  url: URL,
  accessToken: string,
  purpose = "audience audit",
): Promise<Record<string, any>> {
  if (url.origin !== API_ORIGIN) {
    throw new Error("Constant Contact returned an invalid pagination link.");
  }
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Constant Contact ${purpose} failed (HTTP ${response.status}).`);
  }
  const body = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`Constant Contact returned an invalid ${purpose} response.`);
  }
  return body as Record<string, any>;
}

async function constantContactRequest(
  path: string,
  method: "POST" | "PUT",
  body: Record<string, unknown>,
  purpose: string,
): Promise<Record<string, any>> {
  const tokens = await getValidTokens();
  const response = await fetch(new URL(path, `${API_BASE_URL}/`), {
    method,
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Constant Contact ${purpose} failed (HTTP ${response.status}).`);
  }
  return responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)
    ? responseBody as Record<string, any>
    : {};
}

export async function createConstantContactList(name: string, description = ""): Promise<{ id: string; name: string }> {
  const cleanName = name.trim().slice(0, 255);
  if (!cleanName) throw new Error("A Constant Contact list name is required.");
  const created = await constantContactRequest("contact_lists", "POST", {
    name: cleanName,
    description: description.trim().slice(0, 255),
  }, "list creation");
  const id = String(created.list_id ?? "");
  if (!id) throw new Error("Constant Contact created a list but did not return its list ID.");
  return { id, name: String(created.name ?? cleanName) };
}

export async function renameConstantContactList(listId: string, name: string): Promise<{ id: string; name: string }> {
  const cleanId = listId.trim();
  const cleanName = name.trim().slice(0, 255);
  if (!cleanId || !cleanName) throw new Error("A list ID and name are required.");
  const tokens = await getValidTokens();
  const existing = await getConstantContactJson(
    new URL(`contact_lists/${encodeURIComponent(cleanId)}`, `${API_BASE_URL}/`),
    tokens.accessToken,
    "list lookup",
  );
  const updated = await constantContactRequest(
    `contact_lists/${encodeURIComponent(cleanId)}`,
    "PUT",
    {
      list_id: cleanId,
      name: cleanName,
      description: String(existing.description ?? ""),
      favorite: Boolean(existing.favorite),
    },
    "list update",
  );
  return { id: cleanId, name: String(updated.name ?? cleanName) };
}

async function waitForConstantContactActivity(activityId: string, purpose: string): Promise<void> {
  const tokens = await getValidTokens();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const status = await getConstantContactJson(
      new URL(`activities/${encodeURIComponent(activityId)}`, `${API_BASE_URL}/`),
      tokens.accessToken,
      purpose,
    );
    const state = String(status.state ?? status.status ?? "").trim().toLowerCase();
    if (["complete", "completed", "success", "successful"].includes(state)) return;
    if (["error", "failed", "cancelled"].includes(state)) {
      throw new Error(`Constant Contact ${purpose} did not complete successfully.`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Constant Contact ${purpose} is still processing. Retry after the activity finishes.`);
}

async function changeConstantContactListMembership(
  listId: string,
  contactIds: string[],
  action: "add" | "remove",
): Promise<number> {
  const cleanListId = listId.trim();
  const uniqueIds = Array.from(new Set(contactIds.map(id => id.trim()).filter(Boolean)));
  if (!cleanListId) throw new Error("A Constant Contact list ID is required.");
  if (uniqueIds.length > 500) throw new Error("Update no more than 500 Constant Contact contacts at a time.");
  if (!uniqueIds.length) return 0;

  let activityCount = 0;
  for (let offset = 0; offset < uniqueIds.length; offset += 500) {
    const activity = await constantContactRequest(
      action === "add" ? "activities/add_list_memberships" : "activities/remove_list_memberships",
      "POST",
      { source: { contact_ids: uniqueIds.slice(offset, offset + 500) }, list_ids: [cleanListId] },
      `${action} list members`,
    );
    const activityId = String(activity.activity_id ?? "");
    if (!activityId) throw new Error(`Constant Contact did not return an activity ID for the ${action} operation.`);
    await waitForConstantContactActivity(activityId, `${action} list members`);
    activityCount++;
  }
  return activityCount;
}

export const addConstantContactListMembers = (listId: string, contactIds: string[]) =>
  changeConstantContactListMembership(listId, contactIds, "add");

export const removeConstantContactListMembers = (listId: string, contactIds: string[]) =>
  changeConstantContactListMembership(listId, contactIds, "remove");

export async function createAndScheduleConstantContactCampaign(input: {
  name: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  subject: string;
  preheader?: string;
  html: string;
  listId: string;
  scheduledAt?: Date | null;
}): Promise<{ campaignId: string; activityId: string }> {
  const required = [input.name, input.fromName, input.fromEmail, input.replyToEmail, input.subject, input.listId];
  if (required.some(value => !String(value ?? "").trim())) {
    throw new Error("Campaign name, sender, subject, and a linked Constant Contact list are required.");
  }
  const created = await constantContactRequest("emails", "POST", {
    name: input.name.trim().slice(0, 200),
    email_campaign_activities: [{
      role: "primary_email",
      format_type: 5,
      from_name: input.fromName.trim().slice(0, 100),
      from_email: input.fromEmail.trim(),
      reply_to_email: input.replyToEmail.trim(),
      subject: input.subject.trim().slice(0, 200),
      preheader: String(input.preheader ?? "").trim().slice(0, 150),
      html_content: input.html,
    }],
  }, "campaign creation");
  const activity = Array.isArray(created.campaign_activities)
    ? created.campaign_activities.find((item: any) => item?.role === "primary_email")
    : null;
  const campaignId = String(created.campaign_id ?? "");
  const activityId = String(activity?.campaign_activity_id ?? "");
  if (!campaignId || !activityId) {
    throw new Error("Constant Contact created a campaign but did not return its campaign activity ID.");
  }

  await constantContactRequest(
    `emails/activities/${encodeURIComponent(activityId)}`,
    "PUT",
    {
      role: "primary_email",
      format_type: 5,
      from_name: input.fromName.trim().slice(0, 100),
      from_email: input.fromEmail.trim(),
      reply_to_email: input.replyToEmail.trim(),
      subject: input.subject.trim().slice(0, 200),
      preheader: String(input.preheader ?? "").trim().slice(0, 150),
      html_content: input.html,
      contact_list_ids: [input.listId.trim()],
    },
    "campaign audience update",
  );
  const scheduledDate = input.scheduledAt ? input.scheduledAt.toISOString() : 0;
  await constantContactRequest(
    `emails/activities/${encodeURIComponent(activityId)}/schedules`,
    "POST",
    { scheduled_date: scheduledDate },
    input.scheduledAt ? "campaign scheduling" : "campaign send",
  );
  return { campaignId, activityId };
}

async function getConstantContactCollection(
  path: string,
  property: "lists" | "segments",
  accessToken: string,
): Promise<{ items: Record<string, any>[]; collectionCount: number | null }> {
  let pageUrl = new URL(path, `${API_BASE_URL}/`);
  const seen = new Set<string>();
  const items: Record<string, any>[] = [];
  let collectionCount: number | null = null;

  for (let page = 0; page < 100; page++) {
    if (seen.has(pageUrl.toString())) {
      throw new Error("Constant Contact returned a repeated pagination link.");
    }
    seen.add(pageUrl.toString());
    const body = await getConstantContactJson(pageUrl, accessToken);
    if (!Array.isArray(body[property])) {
      throw new Error("Constant Contact returned an incomplete audience audit response.");
    }
    items.push(...body[property].filter((item: unknown) => item && typeof item === "object" && !Array.isArray(item)));
    if (collectionCount === null) {
      collectionCount = safeContactCount(
        property === "lists" ? body.lists_count : body.segments_count,
      );
    }
    const nextHref = body._links?.next?.href;
    if (typeof nextHref !== "string" || !nextHref.trim()) {
      return { items, collectionCount };
    }
    pageUrl = new URL(nextHref, pageUrl);
    if (pageUrl.origin !== API_ORIGIN) {
      throw new Error("Constant Contact returned an invalid pagination link.");
    }
  }
  throw new Error("Constant Contact audience audit exceeded the pagination safety limit.");
}

/**
 * Read only aggregate audience metadata from Constant Contact. In particular,
 * segment sizes are not inferred by listing segment members, because that
 * endpoint returns contact records and personal data.
 */
export async function getConstantContactAudienceSnapshot() {
  const tokens = await getValidTokens();
  const [listsPage, segmentsPage, consent] = await Promise.all([
    getConstantContactCollection(
      "contact_lists?include_count=true&status=active&include_membership_count=active&channel_type=email&limit=1000",
      "lists",
      tokens.accessToken,
    ),
    getConstantContactCollection("segments?limit=1000&sort_by=name", "segments", tokens.accessToken),
    getConstantContactJson(new URL("contacts/counts", `${API_BASE_URL}/`), tokens.accessToken),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    lists: listsPage.items.map(list => ({
      id: String(list.list_id ?? ""),
      name: String(list.name ?? "").trim(),
      activeMemberCount: safeContactCount(list.membership_count),
    })).filter(list => list.id && list.name),
    listCount: listsPage.collectionCount ?? listsPage.items.length,
    segments: segmentsPage.items.map(segment => ({
      id: String(segment.segment_id ?? ""),
      name: String(segment.name ?? "").trim(),
      memberCount: null,
    })).filter(segment => segment.id && segment.name),
    segmentCount: segmentsPage.collectionCount ?? segmentsPage.items.length,
    consentCounts: {
      total: safeContactCount(consent.total),
      explicit: safeContactCount(consent.explicit),
      implicit: safeContactCount(consent.implicit),
      pending: safeContactCount(consent.pending),
      unsubscribed: safeContactCount(consent.unsubscribed),
    },
  };
}

/**
 * Read Constant Contact opt-outs for an explicit one-way import. Contact
 * records are processed on the server and only validated email addresses are
 * returned to the caller; names and other contact fields are discarded.
 */
export async function getConstantContactUnsubscribedEmails(): Promise<{
  emails: string[];
  invalidEmailCount: number;
}> {
  const tokens = await getValidTokens();
  const pageUrls = new Set<string>();
  const emails = new Set<string>();
  let invalidEmailCount = 0;
  let pageUrl = new URL("contacts?status=unsubscribed&limit=500", `${API_BASE_URL}/`);

  for (let page = 0; page < 100; page++) {
    if (pageUrls.has(pageUrl.toString())) {
      throw new Error("Constant Contact returned a repeated contact pagination link.");
    }
    pageUrls.add(pageUrl.toString());

    const body = await getConstantContactJson(pageUrl, tokens.accessToken, "opt-out import");
    if (!Array.isArray(body.contacts)) {
      throw new Error("Constant Contact returned an incomplete opt-out response.");
    }

    for (const contact of body.contacts) {
      if (!contact || typeof contact !== "object" || Array.isArray(contact)) continue;
      const emailAddress = contact.email_address;
      if (!emailAddress || typeof emailAddress !== "object" || Array.isArray(emailAddress)) continue;
      if (String(emailAddress.permission_to_send ?? "").trim().toLowerCase() !== "unsubscribed") continue;

      const email = typeof emailAddress.address === "string"
        ? emailAddress.address.trim().toLowerCase()
        : "";
      if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        invalidEmailCount++;
        continue;
      }
      emails.add(email);
    }

    const nextHref = body._links?.next?.href;
    if (typeof nextHref !== "string" || !nextHref.trim()) {
      return { emails: Array.from(emails), invalidEmailCount };
    }

    pageUrl = new URL(nextHref, pageUrl);
    if (pageUrl.origin !== API_ORIGIN) {
      throw new Error("Constant Contact returned an invalid contact pagination link.");
    }
  }

  throw new Error("Constant Contact opt-out import exceeded the pagination safety limit.");
}

export interface ConstantContactReconciliationContact {
  contactId: string;
  email: string | null;
  permissionToSend: string;
  listIds: string[];
}

/**
 * Read all non-deleted Constant Contact contacts for an explicit email-level
 * comparison. Contact names and all unrelated fields are discarded.
 */
export async function getConstantContactReconciliationSnapshot(): Promise<{
  contacts: ConstantContactReconciliationContact[];
  collectionTotal: number | null;
  reportedTotal: number | null;
}> {
  const tokens = await getValidTokens();
  const countBody = await getConstantContactJson(
    new URL("contacts/counts", `${API_BASE_URL}/`),
    tokens.accessToken,
    "contact reconciliation",
  );
  const contacts: ConstantContactReconciliationContact[] = [];
  const seenPages = new Set<string>();
  let collectionTotal: number | null = null;
  let pageUrl = new URL("contacts?include_count=true&include=list_memberships&limit=500", `${API_BASE_URL}/`);

  for (let page = 0; page < 100; page++) {
    if (seenPages.has(pageUrl.toString())) {
      throw new Error("Constant Contact returned a repeated reconciliation pagination link.");
    }
    seenPages.add(pageUrl.toString());

    const body = await getConstantContactJson(pageUrl, tokens.accessToken, "contact reconciliation");
    if (!Array.isArray(body.contacts)) {
      throw new Error("Constant Contact returned an incomplete contact reconciliation response.");
    }
    if (page === 0) collectionTotal = safeContactCount(body.contacts_count);

    for (const contact of body.contacts) {
      const emailAddress = contact && typeof contact === "object" && !Array.isArray(contact)
        && contact.email_address && typeof contact.email_address === "object" && !Array.isArray(contact.email_address)
        ? contact.email_address
        : {};
      const rawEmail = typeof emailAddress.address === "string" ? emailAddress.address.trim().toLowerCase() : "";
      const email = rawEmail.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)
        ? rawEmail
        : null;

      contacts.push({
        contactId: contact && typeof contact.contact_id === "string" ? contact.contact_id : "",
        email,
        permissionToSend: String(emailAddress.permission_to_send ?? "").trim().toLowerCase(),
        listIds: Array.isArray(contact?.list_memberships)
          ? contact.list_memberships
            .map((membership: any) => String(membership?.list_id ?? "").trim())
            .filter(Boolean)
          : [],
      });
    }

    const nextHref = body._links?.next?.href;
    if (typeof nextHref !== "string" || !nextHref.trim()) {
      return {
        contacts,
        collectionTotal,
        reportedTotal: safeContactCount(countBody.total),
      };
    }
    pageUrl = new URL(nextHref, pageUrl);
    if (pageUrl.origin !== API_ORIGIN) {
      throw new Error("Constant Contact returned an invalid contact reconciliation pagination link.");
    }
  }

  throw new Error("Constant Contact contact reconciliation exceeded the pagination safety limit.");
}