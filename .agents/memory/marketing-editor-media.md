---
name: Marketing editor media
description: Persistence and safety decisions for marketing editor images and product click links
---

Marketing editor images are persisted inline as validated PNG, JPEG, GIF, or WebP data URLs, capped at 2 MB per image and validated again at the API boundary. Product links are rewritten only during live recipient sends to signed redirects that validate the campaign snapshot before recording a click.

**Why:** The existing application already persists uploaded images inline for settings, while marketing HTML must remain reopenable without introducing a separate media-management system or an open redirect.

**How to apply:** Keep test/review renders deterministic and direct. Preserve merge fields and product markers when sanitizing editor content, and never trust a redirect target without checking both its signature and the current campaign snapshot.