---
name: Zoho marketing delivery boundary
description: Product-selection rule for replacing mailbox SMTP in marketing campaigns.
---

ZeptoMail is intended for transactional application email and explicitly excludes bulk, promotional, newsletter, and marketing campaign sends. Do not route Marketing Campaign traffic through ZeptoMail or disguise campaign messages as transactional mail. Zoho Campaigns Email API v2 authenticates with an API key using the `Zoho-zapikey` header; OAuth access tokens are not interchangeable.

**Why:** Provider policy and plan controls are part of deliverability compliance; technically accepted API requests are not permission to use the product outside its stated purpose. A 401 such as "Invalid OAuth token" usually means an OAuth token was supplied where the Email API key is required.

**How to apply:** Use a Zoho Campaigns/Email API transmission product for campaign delivery if the account is enabled for it, verified for the sending domain, and within its published quota. Preserve the app’s audience and suppression checks, use provider-supported limits, and never silently fall back to mailbox SMTP after API failure.