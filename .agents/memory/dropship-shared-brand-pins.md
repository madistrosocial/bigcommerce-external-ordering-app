---
name: Shared dropship dashboard pins
description: Shared brand selection and per-user visibility boundary for the Dropship Dashboard.
---

Brand pins are a shared dashboard setting, not a per-user preference. Any user with Dropshipping Dashboard view access can see and manage the same pinned brands. Preserve old personal pin lists by merging them into the shared list on first read.

**Why:** The dashboard card is a shared team monitor, while who can see it remains an individual permission decision.

**How to apply:** Keep the main-dashboard component conditional on the user’s permission and enforce the same permission on every API endpoint that reads or changes shared pins. Do not add role-based pin visibility.
