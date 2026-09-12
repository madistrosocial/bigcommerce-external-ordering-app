---
name: Render secret boundary
description: Deployment-specific handling for the HMAC authentication secret
---

Render services do not inherit secrets configured in the Replit workspace. The production service must define `SESSION_SECRET` in Render, preferably with a generated value managed by the Render Blueprint.

**Why:** The signed bearer-token authentication middleware cannot safely use a source-code fallback, and generating a new value on every boot would invalidate sessions and break multi-instance deployments.

**How to apply:** Keep the application fail-fast when `SESSION_SECRET` is absent. For new Render Blueprint services use `generateValue: true`; for an existing Render service add the secret in its Environment settings and redeploy without revealing or committing its value.