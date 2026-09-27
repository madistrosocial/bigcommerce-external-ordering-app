---
name: GitHub push authentication
description: How to handle branch pushes when the local Git HTTPS remote cannot use the installed GitHub integration.
---

When the local Git HTTPS remote rejects authentication, the installed GitHub integration can still update a specific branch through the authenticated Git data API. Recreate the local tree, create a single-parent commit from the current remote branch tip, and update only the requested branch ref. Verify the ref afterward.

**Why:** The GitHub integration authenticates API requests but is not automatically wired into the shell's HTTPS Git credential helper.

**How to apply:** Confirm the exact branch first, never pull or inspect other branches when the user forbids it, and verify that only the requested `refs/heads/<branch>` changed. A 401 from an added connection requires OAuth recovery before retrying the API operation. For large files, pass content through `readFile` rather than shell output and compare a remote hash before declaring success.

The user requires explicit confirmation immediately before any GitHub push or branch/ref update. Local commits and local file changes may proceed, but publishing must stop for confirmation.

**Why:** The user wants direct control over when changes are published to GitHub.

**How to apply:** Treat GitHub publishing as a gated action. Explain what branch and changes would be pushed, ask for confirmation, and do not call GitHub write APIs until the user confirms.