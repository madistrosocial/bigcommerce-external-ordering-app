import assert from "node:assert/strict";
import express from "express";
import { securityHeadersAndErrorRedaction, loginRateLimit } from "../server/security";

const app = express();
app.use(securityHeadersAndErrorRedaction);
app.get("/api/failure", (_req, res) => {
  res.status(500).json({ error: "database secret details", stack: "private stack" });
});
app.post("/api/auth/login", loginRateLimit, (_req, res) => {
  res.json({ success: true });
});

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
    console.log("Security middleware checks passed (generic 5xx, headers, and login throttling).");
  } finally {
    server.close();
  }
});
