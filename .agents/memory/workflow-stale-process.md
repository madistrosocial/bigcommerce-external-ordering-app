---
name: Workflow process-state diagnosis
description: Distinguish stale listeners and opaque workflow-runner failures from application startup errors.
---

When a workflow reports `EADDRINUSE`, check whether the existing development server is still returning responses and confirm its process belongs to this workspace before retrying. For an opaque `[RUNTIME_ERROR]` with no application stack trace, check the workflow state and listener first; if no process or port remains, retry the managed workflow once before changing application code.

**Why:** A failed status can coexist with a healthy old server, while an opaque runner error can leave no app process and recover on a managed restart. Neither condition alone identifies a code defect.

**How to apply:** Inspect workflow status, process ownership, and an HTTP response together. Stop only a verified stale process; after an opaque runner failure, confirm the restarted workflow serves HTTP before editing code or changing ports.