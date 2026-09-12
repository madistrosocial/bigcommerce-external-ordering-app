---
name: iOS PWA safe-area layout
description: Safe-area handling for the installed iOS PWA app shell.
---

The installed iOS PWA should render its app shell edge-to-edge. Apply the top safe-area inset to the header and protect fixed interactive controls with the bottom inset, rather than putting safe-area padding on the outer shell.

**Why:** Padding the entire shell with `env(safe-area-inset-bottom)` creates a visible empty strip above the home-indicator area and makes the app look like it is inside a smaller wrapper.

**How to apply:** Keep the root and shell backgrounds full-viewport. Use `viewport-fit=cover`, header-specific top inset handling, and bottom inset handling only where content or controls could be obscured.