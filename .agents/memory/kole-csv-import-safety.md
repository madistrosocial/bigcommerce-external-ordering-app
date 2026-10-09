---
name: Kole CSV import safety
description: Memory-bounded and atomic processing rules for large Kole vendor CSVs.
---

Keep each Kole CSV ingestion path streaming and memory-bounded: parse and upsert in small batches, record seen SKUs in a transaction-scoped PostgreSQL temporary table, and mark missing products only after the complete file validates. Do not keep whole-file rows, products, or SKU sets in Node memory.

**Why:** Production Node heap is constrained; a CSV plus parsed rows, product objects, raw fields, and a seen-SKU set can use several times the file size. Partial commits can also leave catalog availability inconsistent after malformed input or a failed upload.

**How to apply:** Use the same streaming parser and database transaction for manual uploads and fetched Kole feeds. Avoid `express.text()` or `Response.text()` for whole-file ingestion.
