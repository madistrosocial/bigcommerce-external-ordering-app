---
name: Live permission updates
description: Keeping UI permission checks aligned with grants made from another session.
---

When an administrator changes another user's permissions, that user's already-open app cannot receive local query invalidation from the administrator's browser. Permission-sensitive UI must refresh permissions on focus/mount and periodically, while server routes remain authoritative for access.

**Why:** Cached permission state can hide newly granted filters and actions after the server has already authorized the user.

**How to apply:** For interactive permission-gated screens, refresh the user's permission query after direct edits when possible, and also refresh it in active clients so cross-session changes take effect without signing out.
