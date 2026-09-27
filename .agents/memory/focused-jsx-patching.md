---
name: Focused JSX patching
description: A reliable editing approach for dense one-line JSX when patch context must match exactly.
---

When TSX components contain compressed, one-line markup, patch one target hunk at a time and use short, unique context instead of replacing a long JSX row.

**Why:** Small formatting differences in dense markup can invalidate a large hunk and prevent otherwise independent edits in the same file from applying.

**How to apply:** Search and read the exact current line, patch the smallest matching section, verify the diff, then continue to the next markup row.