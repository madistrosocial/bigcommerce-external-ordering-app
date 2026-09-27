---
name: Cross-platform npm optional lock entries
description: Diagnose npm ci failures caused by missing platform-specific optional dependency records.
---

Lockfiles used across deployment platforms must contain package records for every optional dependency declared by the locked package versions, including OS/CPU-specific binaries.

**Why:** A host-filtered install can leave only the current platform's optional package in the lockfile. A later `npm ci` may reject the incomplete graph before it skips incompatible platforms. `npm install --package-lock-only` can leave the omission untouched, while deleting the lockfile and regenerating it can upgrade many unrelated dependencies within their semver ranges.

**How to apply:** Audit optional dependencies across the full lockfile, add only missing records with exact version, integrity, OS, and CPU metadata, and validate with the deployment's npm major plus any pre-install lockfile rewrite. Avoid broad lockfile regeneration unless those dependency updates are intended.