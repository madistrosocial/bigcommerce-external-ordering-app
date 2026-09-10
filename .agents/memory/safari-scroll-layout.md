---
name: Safari browser scroll layout
description: Mobile Safari toolbar behavior depends on document scrolling rather than a fixed app root with an internal scroller.
---

Browser Safari should keep the document scrollable. A fixed `#root`, hidden body overflow, and an inner scrolling main prevent Safari from collapsing its bottom toolbar and make the browser chrome look like a persistent bottom bar. Installed standalone PWAs can use the pinned root and inner scroller because they have no browser toolbar.

**Why:** The dashboard appeared to have a large bottom band in Safari even though the content was present; the app was scrolling inside `main`, so Safari never received the page scroll gesture needed to hide its browser UI.

**How to apply:** Use document scrolling in browser mode and scope the bounded inner scroller to the real standalone `.app-shell`, with one `100dvh` viewport owner. On iOS, also detect `navigator.standalone` because the CSS media query can be inconsistent; do not extend the global root with a safe-area height value because it creates a second background boundary below the application. Send the launch HTML and manifest with `no-store` so installed PWAs revalidate viewport fixes. Avoid putting safe-area bottom padding on a shared standalone scroller when full-height page children have their own backgrounds; that can expose the shell background as a bottom strip. Put the inset on the fixed control or page content that actually needs it. Keep `theme-color`, manifest theme/background colors, and `color-scheme` aligned with the light app surface. Before an SPA history update from an open dark drawer, synchronously remove its backdrop so Safari does not retain the sampled gray browser-chrome color. Fixed drawers and backdrops should use the viewport edges directly; keep only their interactive content padded above the safe areas.

Authenticated pages rendered inside `SaaSLayout` should be content-growing. Do not add `min-h-screen`, `h-full`, or a full-page `flex-1 overflow-auto` wrapper to individual route pages; reserve scrolling for local tables, dialogs, dropdowns, editors, and fixed controls.

**Why:** Page-level flex scrollers nested inside `.app-shell-main` recreate the iOS Safari toolbar and bottom-boundary problems the shell sizing fix is intended to prevent.

**How to apply:** When adding or moving a route under `SaaSLayout`, start with normal-flow page content and let the browser document or standalone shell main own vertical scrolling. Add a bounded scroller only around a genuinely local region.

Standalone shells also require `min-height: 0` on the direct flex column containing the header and `.app-shell-main`. Without it, the column's default `min-height: auto` can force the shell to grow to the page's content height, leaving the intended inner scroller with no overflow.

**Why:** Long PWA pages were expanding the shell itself instead of scrolling inside `.app-shell-main`, which recreates the bottom-gap and stuck-toolbar symptoms even when the viewport variable is correct.

**How to apply:** Keep the shell's content column shrinkable whenever the standalone shell owns the viewport height; verify a long page has `main.scrollHeight > main.clientHeight` while the shell height remains equal to the visible viewport.

In browser mode, a desktop sidebar must be its own fixed viewport-height rail rather than a full-height flex sibling of the growing page content. Its navigation can scroll locally so the sign-out footer stays visible on long modules.

**Why:** Content-growing browser pages otherwise stretch the sidebar to the page height, pushing the footer below the viewport on routes such as Customers while short routes appear correct.

**How to apply:** Use `position: fixed; inset-block-start: 0; inset-inline-start: 0; height: var(--app-height, 100dvh)` on the desktop rail, offset the content column by the rail width, and keep document scrolling on the page content.