---
name: Tiptap version alignment
description: Tiptap dependency upgrades are constrained by exact-version peer dependencies across the editor package family.
---

Upgrade the Tiptap packages used by the app in one aligned set. Updating only the visible root extensions can leave starter-kit's transitive extensions pinned to the old exact peer version, causing npm `ERESOLVE`.

**Why:** A partial upgrade from 3.29.2 to 3.30.5 failed resolution because the older starter-kit subtree required exact 3.29.2 peers while the updated font-family extension required exact 3.30.5 peers.

**How to apply:** Before another Tiptap security update, enumerate the installed `@tiptap/*` packages and move the complete package family and lockfile to the same fixed release; do not force or use legacy peer resolution.
