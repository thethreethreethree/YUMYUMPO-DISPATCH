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
| Frontend    | HTML5, Tailwind CSS (CDN), vanilla ES modules |
| Backend     | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Hosting     | Static — Vercel, GitHub Pages, Netlify, Cloudflare Pages |
| Offline/PWA | Service worker + Web Manifest |

No build step. No bundler. Just static files.

---

## Quick start (production)

### 1. Create your Supabase project
1. Sign up at [supabase.com](https://supabase.com) and create a new project.
2. Open **SQL Editor** → paste `supabase/schema.sql` → **Run**. (Idempotent — safe to re-run.)
3. In **Storage**, create two buckets:
   - `verifications` — **private**
   - `avatars` — **public**
4. Run the storage policy SQL at the bottom of `schema.sql` (or paste them in **Storage → Policies**).
5. In **Authentication → Providers**, enable Email (password + magic link).
6. (Optional) Configure your SMTP under **Authentication → Email Templates** for branded emails.

### 2. Wire the keys
```bash
cp assets/js/config.example.js assets/js/config.js
```
Open `assets/js/config.js` and paste your project URL + anon key from **Settings → API**. This file is `.gitignored` — never commit production keys.

### 3. Run locally
```bash
npx serve .
# or
python -m http.server 5173
```
ES modules need to load over HTTP, not `file://`.

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

- **restaurant** — signs up via `/auth.html` (or `/restaurants.html` redirect). Gets a row in `restaurants` keyed by `user_id`.
- **rider (driver)** — signs up via `/riders.html` with their verification documents in one step. Gets a row in `riders` keyed by `user_id` with `verification_status='pending'`.
- **admin** — flag via `app_metadata.is_admin = true` on `auth.users`.

Row-Level Security is enforced for everything: restaurants only see their own requests, drivers only see open requests in their own zones (plus their own assigned ones), notifications are recipient-scoped, etc. See `supabase/schema.sql`.

---

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
├── restaurants.html            # Restaurant dashboard (auth-gated)
├── riders.html                 # Driver application (auth signup + Storage upload)
├── rider.html                  # Public driver profile
├── rider-dashboard.html        # Driver dashboard (auth-gated)
├── marketplace.html            # Public browse drivers
├── admin.html                  # Admin console (admin-only via app_metadata)
├── manifest.webmanifest        # PWA manifest
├── sw.js                       # Service worker (offline cache + web push)
├── vercel.json
├── supabase/
│   └── schema.sql              # Full DDL, RLS, triggers, realtime publication
└── assets/
    ├── css/styles.css
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

## Going live checklist

- [ ] Supabase project created
- [ ] `schema.sql` executed
- [ ] Storage buckets `verifications` (private) and `avatars` (public) created + policies applied
- [ ] Email auth enabled, SMTP configured (or default Supabase email)
- [ ] `assets/js/config.js` filled in and **not** committed
- [ ] At least one admin user flagged via `app_metadata.is_admin`
- [ ] Custom domain pointed at your host with HTTPS
- [ ] (Optional) Push provider wired to `sw.js` for cross-device push

---

## License

Built for the YUMYUMPO hospitality network.
