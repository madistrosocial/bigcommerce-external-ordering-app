---
name: Schema push drift
description: Safe handling when Drizzle push detects unrelated destructive schema changes.
---

When `drizzle-kit push` asks to truncate a populated unrelated table because of pre-existing schema drift, do not force the prompt just to apply a new table.

**Why:** A broad forced push can destroy existing project data that is unrelated to the requested feature.

**How to apply:** Keep the Drizzle schema definition as the source of truth, but apply only the requested development DDL through the approved database tooling; leave unrelated drift for an explicit schema cleanup task.