# Branded email templates

Five HTML templates that replace Supabase's default emails with the YUMYUMPO Dispatch look — yellow header, black wordmark, big bold headline, prominent yellow CTA button, friendly safety footer.

| File | Supabase template | Subject suggestion |
|---|---|---|
| `confirm-signup.html` | **Confirm signup** | Confirm your YUMYUMPO Dispatch account |
| `reset-password.html` | **Reset Password** | Reset your YUMYUMPO Dispatch password |
| `magic-link.html` | **Magic Link** | Your YUMYUMPO Dispatch sign-in link |
| `change-email.html` | **Change Email Address** | Confirm your new YUMYUMPO Dispatch email |
| `invite.html` | **Invite user** | You're invited to YUMYUMPO Dispatch |

## How to install

1. Open your Supabase project → **Authentication → Email Templates**
2. For each of the five templates listed above:
   - Click the template name in the left sidebar
   - **Subject heading** → paste the matching subject from the table above
   - **Message body** → switch to **HTML** mode (toggle near the top of the editor), then **paste the entire contents** of the matching `.html` file. Replace whatever default markup is there.
   - Click **Save**
3. Send yourself a fresh confirmation/reset to test — sign out, sign back up with a different email, or use the "Forgot password" flow.

## Variables Supabase fills in for you

Each template references a few placeholders the auth service replaces at send time. They're already used correctly in the files above — don't change them:

| Variable | Where it's used |
|---|---|
| `{{ .ConfirmationURL }}` | The actual confirmation / sign-in / reset link. Appears as the yellow button and as a pastable plain-text URL underneath. |
| `{{ .NewEmail }}` | Used in `change-email.html` to show the new address the user is moving to. |

If you ever swap to Supabase's Go-template syntax for advanced cases (loops, conditions), reference the [Supabase email template docs](https://supabase.com/docs/guides/auth/auth-email-templates).

## Notes on the design

- Pure **inline CSS** — every email client renders it identically (no flexbox, no custom fonts, no media queries that some clients strip).
- **System font fallback** — Inter / Space Grotesk fall back to native sans-serif. You can't reliably load custom fonts in email; this is the industry standard.
- **600px width**, centered card with 24px rounded corners on clients that support it (Gmail, Apple Mail, modern Outlook). Older Outlook flattens corners — still looks clean.
- **Yellow CTA button** uses the bulletproof technique: a `<table>` cell with `border-radius` + an inline-block `<a>` with padding. Works in Outlook 2007-2024.
- A hidden **preheader** is included for each email so inbox previews show meaningful copy ("One tap and you're in — confirm your email…") instead of the first body line.
- The friendly **"Didn't request this?"** footer appears on every transactional email — standard anti-phishing courtesy.

## Custom SMTP (recommended for production)

By default Supabase sends from `noreply@mail.supabase.io`. Two limitations:

1. **Rate-limited** — Supabase free tier caps you at 4 emails/hour. Plenty for testing, not enough for a real launch.
2. **Deliverability** — generic shared sender domains often land in spam.

For production, configure your own SMTP (Resend, Postmark, SendGrid, AWS SES, your Google Workspace, whatever) under **Authentication → SMTP Settings**. Once that's wired, the same templates work, but emails come from `you@yumyumpo.ph` and reliably hit inboxes.

## Updating later

If you want to tweak copy or colours, edit the `.html` file in this folder, re-paste into the Supabase dashboard, save. There's no automatic sync — Supabase stores the rendered HTML internally.

Keep a copy here so the brand version is in version control.
