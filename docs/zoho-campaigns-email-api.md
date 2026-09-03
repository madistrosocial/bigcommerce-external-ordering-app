# Zoho Campaigns Email API setup

Marketing Campaign test and live sends use the Zoho Campaigns Email API v2
transmission endpoint. Invoice email and Marketing Automations continue to use
the existing SMTP configuration.

## Required Replit Secret

Only one credential is required by this implementation:

### `ZOHO_CAMPAIGNS_API_TOKEN`

1. Sign in to the Zoho Campaigns organization that owns the sending domain.
2. Open the Email API area and go to **API Keys** in the left navigation.
3. Create an API key with the `ZohoCampaigns.emailapi.ALL` scope.
4. Copy the generated key once and save it as the Replit Secret named
   `ZOHO_CAMPAIGNS_API_TOKEN`.

The application sends it server-side as:

```text
Authorization: Zoho-zapikey <api-key>
```

Never put this value in frontend code, campaign content, or chat.

## Optional data-center endpoint

The default endpoint is:

```text
https://campaigns.zoho.com/emailapi/v2/transmission
```

If the Zoho organization is in another data center, add the Replit Secret
`ZOHO_CAMPAIGNS_API_BASE` with the regional Zoho Campaigns base URL. The app
appends `/emailapi/v2/transmission` automatically. Use the base URL shown by
Zoho for the organization; do not mix a US API key with another data center.

## Credentials that are not used

`ZOHO_CAMPAIGNS_CLIENT_ID`, `ZOHO_CAMPAIGNS_CLIENT_SECRET`, and
`ZOHO_CAMPAIGNS_REFRESH_TOKEN` are OAuth credentials for other Zoho APIs or
flows. Email API v2 authentication uses the API key above, so those three
values are not required for campaign transmission and are not read by this
delivery path.

## Zoho account setup

Before sending:

1. Add and verify the sending domain in Zoho Campaigns Email API.
2. Publish the required DNS records, including DKIM, and wait for Zoho to show
   the domain as verified.
3. Ensure every address configured under Marketing sender settings belongs to
   that verified/authorized sending domain.
4. Confirm the account has Email API transmission access and enough quota for
   the intended audience.
5. Add the app's public unsubscribe URL to any Zoho webhook configuration only
   if provider-side unsubscribe events are also needed. The application
   continues to enforce its own suppression and unsubscribe checks.

## Operational behavior

- Each recipient is submitted as its own transmission because campaign HTML
  contains recipient-specific signed links.
- Zoho transmission IDs are stored as the recipient provider message ID.
- Provider failures are marked non-retryable. A network failure after a POST has
  unknown acceptance state, so automatic retrying could send duplicates.
- There is no silent SMTP fallback for Marketing Campaign sends.
- Zoho API delivery logs should be separate from the mailbox Sent folder, while
  the app retains its own campaign and recipient analytics.

Official references:

- https://www.zoho.com/campaigns/help/emailapi/authentication.html
- https://www.zoho.com/campaigns/help/emailapi/transmission/send-email.html
- https://www.zoho.com/campaigns/help/emailapi/overview.html