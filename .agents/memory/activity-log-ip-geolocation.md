---
name: Activity-log IP geolocation
description: Provider terms, proxy trust, and rate-limit constraints for approximate activity-log locations.
---

Activity-log location lookups use FreeIPAPI's HTTPS free endpoint, which currently allows commercial use without an API key and limits free traffic to 10 requests per 10 seconds and 60 per minute. Cache results and serialize lookups below those limits. The anonymous ipapi.is tier allows only 30 requests per source IP per UTC day, while ipapi.co's free tier is intended for development and does not include HTTPS.

The app trusts one reverse-proxy hop for Express client-IP resolution. If deployment topology changes or the app scales to multiple processes sharing egress, reassess both proxy trust depth and distributed rate limiting; a per-process queue cannot enforce a shared provider quota.

**Why:** Activity records need the actual visitor address, but accepting arbitrary forwarded headers enables spoofing; free geolocation quotas are also enforced by provider egress IP, not per application process.

**How to apply:** Keep forwarded-IP trust narrow, skip non-public IPs, cache successful and failed lookups, and keep enrichment asynchronous so provider outages or throttling do not delay activity capture.