import assert from "node:assert/strict";
import express from "express";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildSalesReportWhere, salesReportFilterError, validateSalesReportFilters } from "../server/sales-report-filters";
import {
  PASSWORD_RESET_RATE_LIMIT,
  securityHeadersAndErrorRedaction,
  loginRateLimit,
  passwordResetRateLimit,
} from "../server/security";

const app = express();
app.set("trust proxy", 1);
app.use(securityHeadersAndErrorRedaction);
app.use(express.json());
app.get("/api/failure", (_req, res) => {
  res.status(500).json({ error: "database secret details", stack: "private stack" });
});
app.post("/api/auth/login", loginRateLimit, (_req, res) => {
  res.json({ success: true });
});
app.post("/api/auth/password-reset/request", passwordResetRateLimit, (req, res) => {
  assert.match(String(req.body?.username ?? ""), /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  res.json({ success: true });
});
app.post("/api/auth/password-reset", passwordResetRateLimit, (req, res) => {
  assert.match(String(req.body?.token ?? ""), /^[a-f0-9]{64}$/i);
  assert.ok(String(req.body?.password ?? "").length >= 8);
  res.json({ success: true });
});
let salesReportHandlerCalls = 0;
for (const path of ["/api/reports/sales", "/api/reports/sales/stats"]) {
  app.get(path, validateSalesReportFilters, (_req, res) => {
    salesReportHandlerCalls += 1;
    res.json({ success: true });
  });
}

const server = app.listen(0, "127.0.0.1", async () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const failure = await fetch(`${origin}/api/failure`);
    assert.equal(failure.status, 500);
    assert.deepEqual(await failure.json(), { error: "Internal server error" });
    assert.equal(failure.headers.get("x-content-type-options"), "nosniff");
    assert.equal(failure.headers.get("referrer-policy"), "strict-origin-when-cross-origin");

    let lastResponse: Response | undefined;
    for (let attempt = 0; attempt < 31; attempt += 1) {
      lastResponse = await fetch(`${origin}/api/auth/login`, { method: "POST" });
    }
    assert.equal(lastResponse?.status, 429);

    const postJson = (path: string, body: Record<string, unknown>, ip: string) =>
      fetch(`${origin}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify(body),
      });
    for (let attempt = 0; attempt < PASSWORD_RESET_RATE_LIMIT; attempt += 1) {
      const response = await postJson("/api/auth/password-reset/request", { username: "staff@example.test" }, "198.51.100.10");
      assert.equal(response.status, 200, `password-reset request ${attempt + 1} should remain available`);
      assert.deepEqual(await response.json(), { success: true });
    }
    assert.equal(
      (await postJson("/api/auth/password-reset/request", { username: "staff@example.test" }, "198.51.100.10")).status,
      429,
      "password-reset request should throttle after five requests",
    );

    const validReset = { token: "a".repeat(64), password: "valid-test-password" };
    for (let attempt = 0; attempt < PASSWORD_RESET_RATE_LIMIT; attempt += 1) {
      const response = await postJson("/api/auth/password-reset", validReset, "198.51.100.11");
      assert.equal(response.status, 200, `password reset ${attempt + 1} should remain available`);
      assert.deepEqual(await response.json(), { success: true });
    }
    assert.equal(
      (await postJson("/api/auth/password-reset", validReset, "198.51.100.11")).status,
      429,
      "token reset should throttle after five requests",
    );

    const attackDate = "2026-10-01'::date OR 1=1 --";
    const attackProductId = "42) OR 1=1 --";
    assert.ok(salesReportFilterError({ dateFrom: attackDate }));
    assert.ok(salesReportFilterError({ bcProductIds: attackProductId }));
    assert.ok(salesReportFilterError({ brandId: "9 UNION SELECT 1" }));
    assert.ok(salesReportFilterError({ dateFrom: "2026-02-31" }));
    assert.ok(salesReportFilterError({ brandId: "9,10" }));
    assert.equal(salesReportFilterError({ dateFrom: "2026-10-01", dateTo: "2026-10-31", bcProductIds: "42,43" }), null);

    for (const path of ["/api/reports/sales", "/api/reports/sales/stats"]) {
      const valid = await fetch(`${origin}${path}?dateFrom=2026-10-01&dateTo=2026-10-31&bcProductIds=42%2C43`);
      assert.equal(valid.status, 200, `${path} should accept valid report filters`);
      assert.deepEqual(await valid.json(), { success: true });

      const badDate = await fetch(`${origin}${path}?dateFrom=${encodeURIComponent(attackDate)}`);
      assert.equal(badDate.status, 400, `${path} should reject an injected date`);
      const badProduct = await fetch(`${origin}${path}?bcProductIds=${encodeURIComponent(attackProductId)}`);
      assert.equal(badProduct.status, 400, `${path} should reject a non-numeric product ID`);
    }
    assert.equal(salesReportHandlerCalls, 2, "invalid report filters must be rejected before report handlers run");

    const whereClause = buildSalesReportWhere({
      dateFrom: attackDate,
      dateTo: "2026-10-31",
      bcProductIds: [42, 43],
      skuFilter: "x' OR 1=1 --",
      bcStatusFilter: ["Shipped' OR 1=1 --"],
    });
    const unsafeSql = new PgDialect().sqlToQuery(whereClause);
    for (const attack of [attackDate, "x' OR 1=1 --", "Shipped' OR 1=1 --"]) {
      assert.ok(!unsafeSql.sql.includes(attack), "filter values must not be embedded in generated SQL");
      assert.ok(unsafeSql.params.includes(attack), "filter values should be sent as SQL parameters");
    }
    assert.ok(unsafeSql.sql.includes("IN ($"));
    console.log("Security checks passed (error redaction, headers, login/reset throttling, and Sales Report filter safety).");
  } finally {
    server.close();
  }
});
