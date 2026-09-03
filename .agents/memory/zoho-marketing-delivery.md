---
name: Zoho marketing delivery boundary
description: Product-selection rule for replacing mailbox SMTP in marketing campaigns.
---

ZeptoMail is intended for transactional application email and explicitly excludes bulk, promotional, newsletter, and marketing campaign sends. Do not route Marketing Campaign traffic through ZeptoMail or disguise campaign messages as transactional mail.

**Why:** Provider policy and plan controls are part of deliverability compliance; technically accepted API requests are not permission to use the product outside its stated purpose.

**How to apply:** Use a Zoho Campaigns/Email API transmission product for campaign delivery if the account is enabled for it, verified for the sending domain, and within its published quota. Preserve the app’s audience and suppression checks, use provider-supported limits, and never silently fall back to mailbox SMTP after API failure.