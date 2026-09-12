---
name: BigCommerce customer search filters
description: Store-specific limitations and fallback behavior for POS customer search.
---

This BigCommerce store rejects the v3 customer filters `company:like` and `phone:like` with HTTP 422, while `name:like` and `email:in` work. Company and phone search must therefore use the v2 customer directory and filter locally.

**Why:** Sending an unsupported v3 filter causes the whole POS search request to fail even when the name search succeeds.

**How to apply:** Keep the v2 directory cached briefly and deduplicate its local matches with v3 name/email results. Treat fallback loading failures as degraded search results rather than converting successful name/email searches into a 500.