---
name: Stale session recovery
description: Keep the app recoverable when persisted auth state or cached protected queries become invalid.
---

Persisted authentication state must be parsed defensively, and the UI should provide a visible recovery path that clears local auth state and cached protected queries before returning to sign-in.

**Why:** A malformed or expired saved session can leave protected routes unusable or appear blank even while the server is healthy.

**How to apply:** Preserve the safe local-session loader and keep a force-logout action available from authenticated screens and the login recovery state.