---
name: CRM auth pattern
description: How to read the authenticated user in CRM routes (and what NOT to do)
---

# CRM Route Auth Pattern

## The Rule
In `server/routes.ts`, the `requireAuth` middleware sets **`(req as any).authUser = user`** (the full user object). It does **NOT** set `(req as any).userId`.

**Correct pattern for all CRM routes:**
```typescript
const user = (req as any).authUser;
const userId = user?.id as number;
if (!user) return res.status(401).json({ error: "Unauthorized" });
```

**Wrong pattern (causes silent 401 / 0 results):**
```typescript
const userId = (req as any).userId as number;  // undefined! never set
const user = await storage.getUser(userId);     // getUser(NaN) → undefined
if (!user) return res.status(401).json({ error: "Unauthorized" }); // always fires
```

**Why:** The old pattern produced `userId = NaN`, `getUser(NaN) = undefined`, so every CRM endpoint returned 401. The frontend defaulted to empty arrays, showing "0 customers" with no visible error.

**How to apply:** Any new CRM route must use `(req as any).authUser` for the user object. The `requireAuth` middleware has already verified the user — no second DB lookup needed. All audit log `user_id` fields should use `userId ?? null` (not `(req as any).userId ?? null`).

## New BC-notes routes (Task #6)
The bc-notes routes correctly use `parseInt(req.headers["x-user-id"] as string)` + `(req as any).authUser` as they were written fresh. Both patterns work; prefer `authUser` to skip the extra DB call.
