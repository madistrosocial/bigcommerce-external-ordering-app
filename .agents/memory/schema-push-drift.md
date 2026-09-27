---
name: Schema push drift
description: Safe handling when Drizzle push detects unrelated destructive schema changes.
---

When `drizzle-kit push` asks to truncate a populated unrelated table because of pre-existing schema drift, do not force the prompt just to apply a new table.

**Why:** A broad forced push can destroy existing project data that is unrelated to the requested feature.

**How to apply:** Keep the Drizzle schema definition as the source of truth, but apply only the requested development DDL through the approved database tooling; leave unrelated drift for an explicit schema cleanup task.

**Non-interactive prompt rule:** If `drizzle-kit push` exits because a table/schema conflict requires an interactive prompt and no TTY is available, do not pipe an answer or use `--force`. Inspect the development schema and apply only the feature's necessary, non-destructive DDL through approved database tooling.

**Why:** The tool cannot safely distinguish an intended change from unrelated drift without an informed choice, and automatic approval can truncate or rename populated tables.

**How to apply:** Verify the exact target columns and indexes first, then execute narrowly scoped development DDL. Confirm the resulting schema afterward; production schema changes remain on the supported publish flow.