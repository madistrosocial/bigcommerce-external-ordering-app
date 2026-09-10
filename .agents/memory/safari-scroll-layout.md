---
name: Safari browser scroll layout
description: Mobile Safari toolbar behavior depends on document scrolling rather than a fixed app root with an internal scroller.
---

Browser Safari should keep the document scrollable. A fixed `#root`, hidden body overflow, and an inner scrolling main prevent Safari from collapsing its bottom toolbar and make the browser chrome look like a persistent bottom bar. Installed standalone PWAs can use the pinned root and inner scroller because they have no browser toolbar.

**Why:** The dashboard appeared to have a large bottom band in Safari even though the content was present; the app was scrolling inside `main`, so Safari never received the page scroll gesture needed to hide its browser UI.

**How to apply:** Use document scrolling in browser mode and scope fixed-root, hidden-overflow, safe-area inner scrolling to standalone display mode only. On iOS, also detect `navigator.standalone` because the CSS media query can be inconsistent; do not extend the fixed root with a negative bottom value because it can expose the body background below the shell.