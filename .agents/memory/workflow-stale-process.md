---
name: Failed workflow stale process
description: A failed workflow can coexist with a surviving development server on its configured port.
---

When `Start application` reports `EADDRINUSE`, check whether the existing development server is still returning responses and confirm its process belongs to this workspace before retrying the workflow. Stop only the verified stale process, then restart the managed workflow.

**Why:** A duplicate start failed while the prior workspace server remained alive, even though the workflow status showed failed.

**How to apply:** For future port conflicts, inspect the listener and workflow status together rather than assuming the app is stopped or changing its port.