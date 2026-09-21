---
name: POS customer search mirror
description: POS customer lookup source-of-truth and live-data boundary.
---

POS customer search uses the device-local directory first, then customers_mirror. A miss may trigger one coalesced on-demand incremental customer sync, then retries PostgreSQL; a bounded BigCommerce search is the final fallback. Live BigCommerce calls remain the normal source for post-selection data such as addresses, store credit, and price-list assignment. The legacy BigCommerce fallback uses stale-while-revalidate for complete cached directories and bounded concurrent page refreshes.

**Why:** The device directory makes lookup work offline and keeps the normal dropdown fast; the mirror contains authoritative searchable fields without blocking the POS on full BigCommerce directory downloads. A complete prior BC directory is safer to serve during refresh than an incomplete new cache, provided its stale state is observable.

**How to apply:** Keep the initial dropdown local and fast. Preserve the incremental-sync fallback, scope/clear cached records for user or store changes, and do not reintroduce direct BigCommerce search into the normal keystroke path. Keep directory refresh concurrency bounded and retain the previous complete cache when refresh fails.