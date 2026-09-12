---
name: GitHub push authentication
description: How to handle branch pushes when the local Git HTTPS remote cannot use the installed GitHub integration.
---

When the local Git HTTPS remote rejects authentication, the installed GitHub integration can still update a specific branch through the authenticated Git data API. Recreate the local tree, create a single-parent commit from the current remote branch tip, and force-update only the requested branch ref. Verify the ref afterward.

**Why:** The GitHub integration authenticates API requests but is not automatically wired into the shell's HTTPS Git credential helper.

**How to apply:** Confirm the exact branch first, never pull or inspect other branches when the user forbids it, and verify that only the requested `refs/heads/<branch>` changed.