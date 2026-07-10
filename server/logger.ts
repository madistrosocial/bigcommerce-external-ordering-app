/**
 * Diagnostic Logging Framework — VanSales Pro
 *
 * Enable with environment variable:  DIAG_LOGGING=true
 * Disable (default):                 DIAG_LOGGING=false  (or unset)
 *
 * Logs are written to stdout and held in an in-memory ring buffer (last 200 entries).
 * Retrieve recent logs via GET /api/bc/auth/diagnostics (admin-only).
 *
 * NEVER logs secrets, tokens, passwords, or JWTs — sensitive keys are auto-redacted.
 */

// ─── Module categories ────────────────────────────────────────────────────────

export enum DiagModule {
  OAuth         = "OAuth",
  Authentication = "Authentication",
  BigCommerceAPI = "BigCommerce API",
  Xero          = "Xero",
  POSCheckout   = "POS Checkout",
  StoreCredit   = "Store Credit",
  CRM           = "CRM",
  Inventory     = "Inventory",
  BackgroundJobs = "Background Jobs",
  Database      = "Database",
}

// ─── Status values ────────────────────────────────────────────────────────────

export enum DiagStatus {
  Info    = "INFO",
  Success = "SUCCESS",
  Failure = "FAILURE",
  Warning = "WARNING",
  Error   = "ERROR",
}

// ─── Entry shape ──────────────────────────────────────────────────────────────

export interface DiagEntry {
  module:      DiagModule;
  event:       string;
  status:      DiagStatus;
  requestId?:  string;
  durationMs?: number;
  data?:       Record<string, unknown>;
  error?:      string;
  stack?:      string;
}

export interface DiagEntryStored extends DiagEntry {
  timestamp: string; // ISO-8601
}

// ─── Redaction ────────────────────────────────────────────────────────────────

const REDACTED = "[REDACTED]";

const SENSITIVE_KEYS = new Set([
  "token",
  "access_token",
  "client_secret",
  "clientsecret",
  "password",
  "jwt",
  "authorization",
  "secret",
  "api_key",
  "apikey",
  "code",           // OAuth authorization code — one-time use, treat as secret
]);

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEYS.has(key.toLowerCase())) return REDACTED;
  return value;
}

export function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, redactValue(k, v)]),
  );
}

// ─── In-memory ring buffer ────────────────────────────────────────────────────

const BUFFER_SIZE = 200;
const logBuffer: DiagEntryStored[] = [];

export function getLogBuffer(): DiagEntryStored[] {
  return [...logBuffer];
}

export function clearLogBuffer(): void {
  logBuffer.length = 0;
}

// ─── Master switch ────────────────────────────────────────────────────────────

export function isDiagEnabled(): boolean {
  return process.env.DIAG_LOGGING === "true";
}

// ─── Core logging function ────────────────────────────────────────────────────

export function diagLog(entry: DiagEntry): void {
  if (!isDiagEnabled()) return;

  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 23); // "2026-07-10 14:32:15.123"

  const stored: DiagEntryStored = { ...entry, timestamp };
  if (logBuffer.length >= BUFFER_SIZE) logBuffer.shift();
  logBuffer.push(stored);

  // Format for stdout
  const lines: string[] = [
    `[${timestamp}]`,
    `  Module:    ${entry.module}`,
    `  Event:     ${entry.event}`,
    `  Status:    ${entry.status}`,
  ];
  if (entry.requestId)        lines.push(`  RequestId: ${entry.requestId}`);
  if (entry.durationMs !== undefined) lines.push(`  Duration:  ${entry.durationMs}ms`);
  if (entry.data)             lines.push(`  Data:      ${JSON.stringify(redactObject(entry.data))}`);
  if (entry.error)            lines.push(`  Error:     ${entry.error}`);
  if (entry.stack)            lines.push(`  Stack:     ${entry.stack.split("\n").slice(0, 4).join(" | ")}`);

  console.log(lines.join("\n"));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a closure that returns elapsed milliseconds since it was called. */
export function makeTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

/** Generate a short random request/correlation ID. */
export function makeRequestId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
