---
name: Drizzle array parameters
description: Safe SQL patterns when a query needs multiple dynamic values.
---

Do not interpolate a JavaScript array into `unnest(...::text[])` expecting one PostgreSQL array bind. Drizzle expands the values into separate placeholders, producing a row expression rather than an array. Build a parameterized `VALUES` list with `sql.join` instead.

**Why:** PostgreSQL rejected a SKU lookup because the generated SQL cast a record of separate parameters to `text[]`.

**How to apply:** For finite lists of scalar values, prefer a CTE such as `WITH requested(value) AS (VALUES ${sql.join(values.map((value) => sql`(${value})`), sql`,`)})`. Keep each value interpolated as a bound parameter.
