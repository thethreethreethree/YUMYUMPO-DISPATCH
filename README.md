# YUMYUMPO Dispatch

The official **driver discovery partner** of YUMYUMPO. Restaurants find independent delivery drivers — drivers get discovered. Coordination happens between them, off-platform.

We are **not a delivery company**. We don't employ drivers, own fleets, run deliveries, or process food payments. We are a discovery + verification + notification layer, full stop.

Reference brand: [YUMYUMPO Discovery](https://thethreethreethree.github.io/YUMYUMPO/)

---

## What's in the box

- Driver marketplace (filter by zone, vehicle, status, verified)
- Driver profiles (WhatsApp / Call CTAs, no in-app chat)
- Restaurant dashboard (browse drivers, save preferred, send requests, rate after delivery, cancel)
- Driver dashboard (status toggle, incoming requests by zone, accept/pickup/deliver lifecycle, profile editor)
- Driver application + ID/selfie/video verification with real Supabase Storage uploads
- Admin console with real verification approval flow, suspension, ecosystem analytics
- Notification & alert system with realtime delivery via Supabase, browser push fallback, drop-in bell+panel UI
- Auth (email/password + magic link), session-aware nav, RLS-protected data
- PWA: installable, offline-cached HTML/CSS/JS/images, web push ready
- Mobile-first, Space Grotesk + Inter, brand-yellow (#FFD000) palette aligned with YUMYUMPO Discovery

---

## Tech stack

| Layer       | Tech |
|-------------|------|
| Frontend    | HTML5, **Tailwind CSS (pre-built)**, vanilla ES modules |
| Backend     | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Hosting     | Static — Vercel, GitHub Pages, Netlify, Cloudflare Pages |
| Offline/PWA | Service worker + Web Manifest |

The only build step is a single Tailwind CLI pass that emits `assets/css/styles.css` from `src/input.css` + `tailwind.config.js`. No bundler, no framework.

```bash
npm install        # one-time, installs Tailwind CLI as a devDependency
npm run build      # generates assets/css/styles.css (~37 KB minified)
npm run watch      # rebuilds on every change while you develop
```

On Vercel the `vercel.json` already runs `npm run build` on every deploy. For GitHub Pages, run `npm run build` before pushing so the built CSS is committed.

---

## Quick start (production)

### 1. Create your Supabase project
1. Sign up at [supabase.com](https://supabase.com) and create a new project.
2. Open **SQL Editor** → paste `supabase/schema.sql` → **Run**. (Idempotent — safe to re-run.)
   - This creates all tables, RLS policies, triggers, **and the `verifications` + `avatars` storage buckets with their policies**. No manual bucket setup needed.
3. In **Authentication → Providers**, enable Email (password + magic link).
4. (Optional) Configure your SMTP under **Authentication → Email Templates** for branded emails.

> **Note on storage:** the script writes to `storage.buckets` and `storage.objects` policies, which requires running the SQL as the project owner via the Supabase SQL Editor (the default when you open it). The `verifications` bucket is **private** with a 25 MB limit (images + short videos); `avatars` is **public** with a 5 MB limit (images only). Files are stored under `${user_id}/…` paths and RLS prevents users from reading or writing to any folder but their own.

### 2. Wire the keys
```bash
cp assets/js/config.example.js assets/js/config.js
```
Open `assets/js/config.js` and paste your project URL + anon key from **Settings → API**. This file is `.gitignored` — never commit production keys.

### 3. Run locally
```bash
npm install            # install Tailwind CLI (one-time)
npm run build          # build assets/css/styles.css
npx serve .            # or: python -m http.server 5173
```
ES modules need to load over HTTP, not `file://`.

For active development, run `npm run watch` in a second terminal so Tailwind rebuilds on every file change.

### 4. Create your first admin
After you sign up an account, mark it as admin in the Supabase SQL editor:
```sql
update auth.users
set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data,'{}'::jsonb), '{is_admin}', 'true')
where email = 'you@example.com';
```
Then visit `/admin.html` — RLS unlocks admin views via the `public.is_admin()` claim helper.

### 5. Deploy

**Vercel** (recommended):
```bash
vercel
```
`vercel.json` is included — static, no build step.

**GitHub Pages**: push to `main`, enable Pages.

**Cloudflare Pages / Netlify**: drop in the repo as a static site, no build command.

---

## Auth & roles

- **restaurant** — signs up via `/auth.html`. The role is stored in `auth.users.raw_user_meta_data.role`.
- **rider (driver)** — signs up via `/riders.html` in two steps: (1) create account → confirm email, (2) come back to upload ID/selfie/video and finalise zones + pricing.
- **admin** — flag via `app_metadata.is_admin = true` on `auth.users`.

### How the profile row is created

When a new user signs up, the **`tg_handle_new_user` trigger on `auth.users`** (`SECURITY DEFINER`) reads `role`/`display_name`/`phone`/`whatsapp` from `raw_user_meta_data` and creates the matching row in `restaurants` or `riders`. This works **even when email confirmation is enabled** (the client is not yet authenticated at signup time, so an RLS-gated insert from the browser would fail). The client never directly writes the profile row — it only sets metadata via `supabase.auth.signUp`.

A second trigger (`tg_sync_user_email`) keeps `restaurants.email` / `riders.email` in sync when a user changes their email in Supabase Auth.

### Verification flow for drivers

1. Rider signs up on `/riders.html` (or `/auth.html`).
2. The DB trigger creates a `riders` row with `verification_status='pending'`.
3. After confirming their email, the rider lands back on `/riders.html?confirmed=1`.
4. The page detects the half-finished application (rider exists, no `rider_verifications` row yet) and shows the documents form.
5. On submit: profile patch → file uploads to `verifications` bucket → `rider_verifications` row inserted.
6. `/rider-dashboard.html` gates entry on `verification_status='verified'` and otherwise sends the user back to `/riders.html`.
7. Admin reviews in `/admin.html`. Approval flips `riders.verification_status` to `verified`.

Row-Level Security is enforced for everything: restaurants only see their own requests, drivers only see open requests in their own zones (plus their own assigned ones), notifications are recipient-scoped, etc. See `supabase/schema.sql`.

---

## Scheduled jobs (Edge Functions)

The repo ships one Supabase Edge Function under `supabase/functions/`:

- **`expire-requests`** — scans `delivery_requests` for rows still `Available` past their `expires_at` (default: 5 min after creation), marks them `Cancelled`, and emits two notifications: `no_response` to the restaurant and `request_expired` to every eligible driver in the zone so the dashboards reflect the timeout without anyone refreshing.

Deploy + schedule:

```bash
# Deploy
supabase functions deploy expire-requests --no-verify-jwt

# Schedule in Supabase Studio: Database → Cron Jobs → New job
#   Name:     expire-requests
#   Schedule: */1 * * * *   (every minute is fine — the function is cheap)
#   Command:
#     select net.http_post(
#       url:='https://YOUR-REF.functions.supabase.co/expire-requests',
#       headers:=jsonb_build_object('Authorization','Bearer ' || current_setting('app.cron_secret'))
#     );
```

The function uses the service role key (set automatically in Edge Function env vars) so it can write notifications across user boundaries.

## Delivery lifecycle

```
Restaurant creates request          → status: Available
   → fan-out notification to all online drivers in matching zone
Driver accepts                       → status: Accepted   + notify restaurant
Restaurant contacts driver via WhatsApp / call (off-platform)
Driver marks picked up               → status: Picked Up
Driver marks delivered               → status: Delivered  + notify restaurant + bump completed_deliveries
Restaurant rates the driver          → updates rider.rating via trigger
```

Restaurant can `Cancel` while status is `Available` or `Accepted`.

---

## File map

```
.
├── index.html                  # Homepage
├── about.html                  # Brand / mission
├── auth.html                   # Sign in / sign up (email + magic link)
├── settings.html               # Account, password, email, notif prefs, deactivate
├── restaurants.html            # Restaurant dashboard (auth-gated)
├── analytics.html              # Restaurant analytics (auth-gated)
├── riders.html                 # Driver application (auth signup + Storage upload)
├── rider.html                  # Public driver profile
├── rider-dashboard.html        # Driver dashboard (auth-gated)
├── history.html                # Driver activity history (auth-gated)
├── marketplace.html            # Public browse drivers
├── admin.html                  # Admin console (admin-only via app_metadata)
├── manifest.webmanifest        # PWA manifest
├── sw.js                       # Service worker (offline cache + web push)
├── vercel.json                 # Vercel build + cache + security headers
├── package.json                # Tailwind CLI devDep + npm scripts
├── tailwind.config.js          # Theme tokens + content paths
├── src/
│   └── input.css               # @tailwind directives + custom CSS layer
├── supabase/
│   └── schema.sql              # Full DDL, RLS, triggers, realtime publication
└── assets/
    ├── favicon.svg             # Brand mark
    ├── og-image.svg            # Social share card
    ├── css/styles.css          # ← BUILT by `npm run build` — do not edit by hand
    └── js/
        ├── config.example.js   # → copy to config.js
        ├── config.js           # (gitignored) your real keys
        ├── supabase.js         # Client init
        ├── auth.js             # signUp / signIn / signOut / requireAuth / getCurrentProfile
        ├── api.js              # Domain API: riders, requests, preferred, ratings, verifications, files
        ├── notifications.js    # Pub/sub, realtime, browser push
        ├── notification-center.js  # Bell + panel UI component
        ├── session-ui.js       # Signed-in nav badge
        ├── components.js       # Driver card, toast, modal
        ├── mock-data.js        # Preview dataset (used only when config missing)
        └── main.js             # Service worker registration + animations
```

---

## Database schema (summary)

| Table | Purpose |
|---|---|
| `restaurants`         | Restaurant accounts (FK `user_id` → `auth.users`) |
| `riders`              | Driver accounts (FK `user_id` → `auth.users`) |
| `rider_zones`         | Active delivery zones, public read |
| `rider_availability`  | Status change history (trigger-populated) |
| `delivery_requests`   | The job lifecycle |
| `delivery_activity`   | Per-request event log |
| `preferred_riders`    | Restaurant → driver favorites (preferred_count auto-sync trigger) |
| `rider_verifications` | ID/selfie/video review queue |
| `rider_ratings`       | Per-metric scoring; trigger recomputes `riders.rating` |
| `notifications`       | Recipient-scoped alerts, RLS-protected, in `supabase_realtime` |
| `analytics_events`    | Ecosystem-wide event firehose |

Triggers automatically:
- bump `riders.completed_deliveries` when a request reaches `Delivered`
- recompute `riders.rating` on every rating change
- keep `riders.preferred_count` in sync with `preferred_riders`
- log every `riders.availability_status` change to `rider_availability`
- touch `updated_at` on `restaurants` and `riders` updates

---

## Notifications

19 typed `notification_kind` events covering the full operational loop:
- Restaurant: `request_accepted`, `rider_arrived`, `delivery_completed`, `no_response`, `preferred_online`, `rider_suspended`, etc.
- Driver: `request_new`, `request_cancelled`, `request_expired`, `verification_approved`, `verification_rejected`, `new_restaurant_nearby`, etc.

**Delivery channels:**
1. **In-app** — bell + panel UI on every dashboard, unread counter, filters
2. **Realtime** — Supabase Realtime push to currently-open tabs
3. **Browser push** — Notification API, only fires when the tab is unfocused
4. **Web Push** — service worker `push` handler is wired (point your push provider at it)

---

## Design system

| Token | Value |
|---|---|
| Brand yellow | `#FFD000` |
| Yellow dark  | `#E6BB00` |
| Brand black  | `#111111` |
| Background   | `#FFFFFF` |
| Surface      | `#F9F9F9` |
| Display font | Space Grotesk (400–800) |
| Body font    | Inter (300–700) |

Aligned 1:1 with the YUMYUMPO Discovery palette so the two products feel like one network.

---

## Error monitoring (optional)

Drop a Sentry DSN into `assets/js/config.js` and the site auto-loads Sentry from CDN, captures uncaught errors + unhandled rejections, and attaches the signed-in user's role + ID to every event. Network glitches, ResizeObserver warnings, and expected auth redirects are filtered out before they ship.

```js
window.SENTRY_CONFIG = {
  dsn:         "https://YOUR_KEY@oXXXX.ingest.sentry.io/PROJECT_ID",
  environment: "production",
  release:     "yumyumpo-dispatch@1.0.0",
};
```

With no DSN set, the monitoring module is a no-op — zero overhead.

## Social sharing (OpenGraph)

Each public page has OpenGraph + Twitter Card meta tags that point at `./assets/og-image.svg`. The Facebook and Twitter scrapers prefer **absolute** URLs — once you deploy to a real domain, the cleanest fix is to do a one-time find-and-replace on each public page:

```
./assets/og-image.svg  →  https://YOUR-DOMAIN.com/assets/og-image.svg
```

Same for `og:url` if you decide to add it. Relative paths work in WhatsApp and most modern scrapers, so this is optional for soft-launch but recommended once you start sharing publicly.

## Going live checklist

- [ ] Supabase project created
- [ ] `schema.sql` executed (this also creates the storage buckets + policies)
- [ ] Email auth enabled, SMTP configured (or default Supabase email)
- [ ] `assets/js/config.js` filled in and **not** committed
- [ ] At least one admin user flagged via `app_metadata.is_admin`
- [ ] Custom domain pointed at your host with HTTPS
- [ ] (Optional) Push provider wired to `sw.js` for cross-device push

---

## License

Built for the YUMYUMPO hospitality network.
