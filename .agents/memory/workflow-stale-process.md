---
name: Workflow process-state diagnosis
description: Distinguish stale listeners and opaque workflow-runner failures from application startup errors.
---

When a workflow reports `EADDRINUSE`, check whether the existing development server is still returning responses and confirm its process belongs to this workspace before retrying. For an opaque `[RUNTIME_ERROR]` with no application stack trace, check the workflow state and listener first; if no process or port remains, retry the managed workflow once before changing application code. The plain `tsx server/index.ts` dev command does not watch server files, so restart after backend edits. Verify API routes return their expected JSON/auth response: Vite's SPA fallback can return HTML with HTTP 200 for a missing API route.

**Why:** A failed status can coexist with a healthy old server, while an opaque runner error can leave no app process and recover on a managed restart. Missing API routes may look successful if the SPA fallback responds with HTML 200 and clients only check the status code.

**How to apply:** Inspect workflow status, process ownership, and an HTTP response together. Restart after server-side edits, then test the specific route for JSON/auth behavior rather than relying on an HTTP 200 alone. Stop only a verified stale process; after an opaque runner failure, confirm the restarted workflow serves HTTP before editing code or changing ports.