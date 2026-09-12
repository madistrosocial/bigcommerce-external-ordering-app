---
name: SMTP retry safety
description: The at-most-once boundary for marketing email retries when SMTP responses are ambiguous.
---

Marketing email retries must be limited to explicit transient SMTP responses received before message data is accepted. A connection failure after `DATA` may mean the provider accepted the message even when the client saw an error, so retrying can send a duplicate.

**Why:** SMTP does not provide a universal idempotency guarantee for a message whose final acceptance response was lost.

**How to apply:** Treat post-`DATA`, permanent, and transport errors without a definitive pre-message 4xx response as non-retryable; keep retry attempts for recognized pre-`DATA` 4xx command responses only.