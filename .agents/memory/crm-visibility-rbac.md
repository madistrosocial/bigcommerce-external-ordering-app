---
name: CRM Visibility RBAC
description: How CRM customer visibility scoping works — permission strings, helper function, and the new crm:view_all perm.
---

# CRM Visibility RBAC

## The rule
`getCrmVisibilityScope` (inside `registerRoutes` in `server/routes.ts`) determines whether a user sees ALL customers or only their ASSIGNED ones.

- Admins always get `ALL_CUSTOMERS`.
- `crm:view_all` OR `crm:visibility_all` → `ALL_CUSTOMERS` (both strings accepted for backward compat).
- `crm:visibility_assigned_unassigned` → `ASSIGNED_AND_UNASSIGNED`.
- Default (no perm) → `ASSIGNED_ONLY`.

**Why:** The old system used three `crm:visibility_*` strings which were never exposed in the admin UI. The new `crm:view_all` permission is the canonical way to grant full visibility and IS exposed in AdminUsers / AdminGroups.

## CRM action permissions (crm module, non-view actions)
These live in `CRM_ACTION_PERMS` (exported from `AdminUsers.tsx`) and are auto-created on admin page load:
- `crm:view_all` — see all customers (otherwise ASSIGNED_ONLY)
- `crm:assign_rep` — assign/remove sales rep
- `crm:export` — export customer list CSV/XLSX

These are surfaced as a "CRM Permissions" card in both UserDetail (AdminUsers.tsx) and GroupDetail (AdminGroups.tsx), separate from the standard `module:view` MODULES array.

**How to apply:** When adding new CRM-scoped action perms, add to `CRM_ACTION_PERMS` in AdminUsers.tsx and check the string in `getCrmVisibilityScope` or the relevant route.
