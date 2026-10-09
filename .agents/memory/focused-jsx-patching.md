---
name: Focused JSX patching
description: A reliable editing approach for dense one-line JSX when patch context must match exactly.
---

When TSX components contain compressed, one-line markup, patch one target hunk at a time and use short, unique context instead of replacing a long JSX row. If a patch has multiple hunks, order them from top to bottom; an out-of-order hunk rejects the whole patch.

**Why:** Dense JSX formatting differences and out-of-order hunks can reject an entire patch, blocking otherwise independent changes.

**How to apply:** Search and read the exact current line, patch the smallest matching section, apply multiple hunks in source order, verify the diff, then continue to the next markup row.