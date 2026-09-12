---
name: Reactivation stage initialization
description: Concurrency and aggregation constraints for the reactivation pipeline.
---

Default reactivation stages are requested by more than one authenticated surface, so initialization must tolerate concurrent first requests and enforce unique stage names at the database boundary.

**Why:** The board and stage configuration page can load in parallel; a read-then-insert seed without a uniqueness guard created duplicate defaults. Grouped summary queries also become fragile when the same visibility joins are reused.

**How to apply:** Use conflict-safe default inserts with a unique stage-name index. Prefer deduplicated application-side aggregation for summary metrics when visibility joins can multiply customer rows.