---
name: Constant Contact campaign API boundary
description: Migration constraints for replacing the current per-recipient campaign sender with Constant Contact.
---

**Rule:** Constant Contact's v3 campaign API creates custom-code email campaigns and requires recipients to be assigned through contact lists or segments before scheduling. It is not a direct send-to-arbitrary-address endpoint.

**Why:** The current marketing workflow personalizes each recipient's message, signed unsubscribe URL, and product tracking URLs before sending. Replacing the transport therefore affects audience synchronization, unsubscribe ownership, tracking, and recipient-level delivery status—not just provider credentials.

**How to apply:** Before implementing a Constant Contact migration, agree on whether the app or Constant Contact owns the audience and opt-outs, how app-specific links and tracking will work, and how provider campaign-level results map to recipient logs. Do not send a live campaign without explicit authorization.

**Authorization rule:** Use the user's own Constant Contact developer app for this project; keep OAuth authorization and read-only permission checks separate from audience sync and campaign delivery.

**Why:** The Replit connector's redirect URI belongs to its own OAuth client, so the user's separate developer-app credentials cannot fix a connector callback mismatch.

**How to apply:** Register the exact callback URL for each environment in the user's developer app. Keep client credentials in the environment's secret store and OAuth tokens encrypted server-side. Do not sync contacts or send campaigns as part of authorization.

**Callback-state rule:** Do not rely on a SameSite cookie for OAuth state initiated from the embedded Replit preview. Store only a hash of the random state with an expiry and the exact redirect URI, then consume that record once.

**Why:** The preview browser omitted the state cookie on the cross-site callback even after enabling `SameSite=None`; server-managed one-time state removes that browser dependency.

**How to apply:** For OAuth flows launched from embedded previews, assume third-party cookie restrictions may apply. Keep pending state records inaccessible through generic settings APIs and delete them atomically when validating the callback.

**Read-only audience audit rule:** Routine page refreshes use `/contact_lists` with `include_membership_count=active`, `/contacts/counts`, and `/segments` metadata. Do not enumerate contacts during the aggregate refresh; segment metadata cannot establish member-level matches.

**Why:** Contact enumeration returns personal data and adds paginated API work; segment membership results also come from contact records. Local CRM suppression counts and provider unsubscribe totals cover different populations.

**How to apply:** Keep the ordinary readiness refresh aggregate-only. Run contact-level reconciliation only as a separate, explicit user action; compare names as labels rather than identity mappings.

**Contact reconciliation rule:** `GET /contacts` defaults to non-deleted contacts across consent states; `include_count=true` returns `contacts_count` for that same filter, while `status=all` includes deleted contacts. Compare populations carefully, and limit reconciliation writes to list membership for contacts that already exist and are sendable.

**Why:** Account counts and the default collection can differ due to population or timing. List membership is not consent: creating contacts or changing consent during reconciliation risks unwanted outreach.

**How to apply:** Fetch contact records only for an explicit audience operation, normalize email by trimming and lowercasing, and compare against local records. Add only matching existing, sendable provider contact IDs to lists; record/export missing, unsubscribed, invalid, or locally suppressed contacts. Never create contacts or alter provider consent.

**Contact creation rule:** Constant Contact supports contact creation, but its direct-create and sign-up-form API guides say to use those methods only when the person has explicitly agreed to email. A future app-driven create flow must require recorded consent evidence; ordinary CRM/customer presence or imported CSV membership is not enough. Bulk imports setting `permission_to_send=implicit` do not establish consent.

**Why:** Audience membership is not evidence of consent, and the create-or-update opt-in endpoint can affect existing permission state. Unsubscribes and the app's local suppressions must never be silently overridden.

**How to apply:** Keep audience reconciliation limited to matching existing, sendable provider contacts; report absent contacts instead of creating them. Any future create flow needs an explicit consent-capture/source record, must preserve both local and provider opt-outs, and must not resubscribe contacts without their own action. Do not create or alter contacts without explicit implementation authorization.

Reference: https://developer.constantcontact.com/api_guide/email_campaign_create.html and https://developer.constantcontact.com/api_guide/email_campaign_create_schedule.html