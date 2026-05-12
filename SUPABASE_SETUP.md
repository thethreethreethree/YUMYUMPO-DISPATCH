# Supabase Setup — YUMYUMPO Dispatch

A complete walkthrough from a fresh Supabase account to a fully-configured project that the codebase connects to. Follow it in order; each step has a verification check at the end so you know it worked before moving on.

**Time required:** ~30 minutes.
**Cost:** $0 (everything fits in Supabase's free tier).

---

## Step 0 — Prerequisites

You need:
- [ ] A computer with Node.js 18+ (`node --version` to check)
- [ ] This repository cloned locally
- [ ] An email you control (for the Supabase account + your first admin login)
- [ ] About 30 minutes

Run once in the project folder:
```bash
npm install
```
This pulls down the Tailwind CLI. Confirm `node_modules/` now exists.

---

## Step 1 — Create the Supabase project

1. Go to **https://supabase.com** → click **Start your project** → sign in (GitHub or email).
2. Click **New project** in your dashboard.
3. Fill in:
   - **Name:** `yumyumpo-dispatch` (or whatever you like)
   - **Database password:** generate a strong one and **save it somewhere secure** — you may need it later for direct DB access
   - **Region:** pick the one closest to your users (for the Philippines, **Singapore (ap-southeast-1)** is the right pick)
   - **Pricing plan:** Free is fine to start
4. Click **Create new project**. Provisioning takes 1–2 minutes.

**Verify:** when it's done, you should land on the project's home screen with a green "All systems operational" banner.

---

## Step 2 — Note your keys

1. In the left sidebar of your project, go to **Settings → API**.
2. You'll see two values you need:
   - **Project URL** — looks like `https://abcd1234.supabase.co`
   - **anon public key** — a long JWT starting with `eyJ...`
3. Open Notepad / a text file and paste both. **Don't share them publicly**, but the anon key is safe to embed in client code (that's what it's for).

There's also a `service_role` key on that page. **NEVER expose the service_role key in client code.** We only use it for the optional Edge Function (Step 9), and it's auto-injected there by Supabase — you'll never need to copy it.

---

## Step 3 — Configure auth URLs

This is the one step beginners commonly skip and then wonder why email confirmation links don't work.

1. **Settings → Authentication → URL Configuration**
2. **Site URL** — this is where users land after confirming their email. For now, set it to:
   - **Local development:** `http://localhost:3000` (or whatever port you'll serve on)
   - **Deployed site:** your real domain like `https://dispatch.yumyumpo.ph`
3. **Redirect URLs** — paste **both** of these on separate lines (you can add more later for staging):
   ```
   http://localhost:3000/auth.html
   http://localhost:3000/auth.html?confirmed=1
   http://localhost:3000/auth.html?reset=1
   ```
   Then add the equivalents for your deployed domain.
4. Click **Save**.

5. Now go to **Settings → Authentication → Email** (or **Providers → Email** in newer Supabase UIs).
6. Make sure **Enable email provider** is on.
7. Decide:
   - **Confirm email** ON (recommended for production) — users must click a confirmation link before they can sign in.
   - **Confirm email** OFF (quicker for testing) — users are signed in immediately on signup.
   - You can change this later.

**Verify:** at the bottom of the **Email** page, the toggle for the email provider says **Enabled**.

---

## Step 4 — Run the schema

This is the big one. The schema script creates every table, every Row-Level Security policy, every trigger, the storage buckets, the storage policies, and the auth signup trigger. It's idempotent — safe to re-run.

1. In the left sidebar, go to **SQL Editor**.
2. Click **New query**.
3. Open `supabase/schema.sql` from this repo in any text editor.
4. **Copy the entire file** and paste it into the SQL Editor.
5. Click **Run** (or Ctrl/Cmd-Enter).

Expect this to take 5–10 seconds and finish with a "Success. No rows returned" message at the bottom.

**Verify:**
- Go to **Table Editor**. You should see these tables in the left sidebar:
  - `restaurants`, `riders`, `rider_zones`, `rider_availability`, `delivery_requests`, `preferred_riders`, `rider_verifications`, `rider_ratings`, `delivery_activity`, `analytics_events`, `notifications`
- Click `rider_zones` — there should already be 8 rows seeded (El Nido Town Proper, BGC, Cebu IT Park, etc.).
- Go to **Storage**. You should see two buckets:
  - `verifications` (private)
  - `avatars` (public)
- Go to **Database → Functions**. You should see helper functions like `handle_new_user`, `guard_delivery_request_update`, `is_admin`.

**If anything is missing**, re-read the SQL Editor error output — usually it's a permissions issue (run as project owner) or a copy-paste truncation. Re-run the whole file.

---

## Step 5 — Connect your local site

1. From the repo root, copy the example config:
   ```bash
   cp assets/js/config.example.js assets/js/config.js
   ```
   *(on Windows: `copy assets\js\config.example.js assets\js\config.js`)*

2. Open `assets/js/config.js` and fill in your values from Step 2:
   ```js
   window.SUPABASE_CONFIG = {
     url:     "https://abcd1234.supabase.co",
     anonKey: "eyJ...your_anon_key_here...",
   };
   ```

3. Save the file. **Do not commit it** — it's already in `.gitignore`.

4. Build the CSS:
   ```bash
   npm run build
   ```

5. Serve the site locally:
   ```bash
   npx serve .
   ```
   By default this serves at `http://localhost:3000`. If you used a different port in Step 3, restart from this step and adjust.

**Verify:**
- Open `http://localhost:3000` in your browser.
- Open the DevTools Console (F12).
- You should **NOT** see the yellow "YUMYUMPO Dispatch is running in offline preview mode" warning. If you do, your `config.js` either doesn't exist or has the placeholder values still in it.
- The homepage stats (Online now / Active zones / Verified drivers) should load — initially they'll show `0` for drivers and `8` for zones. That's correct.

---

## Step 6 — Create your first user (and admin)

You need at least one account to log in.

1. Visit `http://localhost:3000/auth.html`.
2. Switch to **Create account** tab.
3. Pick a role — `I'm a restaurant` is the cleanest test path.
4. Fill in:
   - Name: any
   - Email: a real address you can check
   - Password: 8+ chars
5. Click **Create account**.
6. If you have **Confirm email** ON, check your inbox for a confirmation link and click it. You'll land back on the site.
7. If you have **Confirm email** OFF, you'll be signed in immediately.

**Verify:** you should land on `/restaurants.html` and see "Tasteful Kitchen" replaced by the name you signed up with. The dashboard should show real KPI tiles (all zeros — you have no data yet).

### Promote yourself to admin

1. Back in Supabase, go to **SQL Editor → New query**.
2. Run this, replacing the email:
   ```sql
   update auth.users
   set raw_app_meta_data = jsonb_set(
     coalesce(raw_app_meta_data, '{}'::jsonb),
     '{is_admin}',
     'true'
   )
   where email = 'YOUR_EMAIL@example.com';
   ```
3. **Important:** sign out and sign back in on the local site. The `is_admin` claim only lands in your JWT on a fresh sign-in.
4. Visit `http://localhost:3000/admin.html`. You should see the admin console with KPI tiles instead of an "Admin access only" wall.

**Verify:** `/admin.html` loads with the Pending Verifications panel visible.

---

## Step 7 — Test the driver application flow

1. Open an **incognito / private window** (so it doesn't share the restaurant session).
2. Visit `http://localhost:3000/riders.html`.
3. Fill in the **Step 1 of 2 — Account** form with a *different* email than your admin account.
4. Submit → check the email if confirm-email is ON → click the link.
5. You should land back on `riders.html` in **Step 2 of 2** state.
6. Fill in the verification form, **pick at least one zone**, upload a fake ID and selfie (any image file works), submit.
7. You should see the **"Verification submitted"** card.

8. Switch back to your admin tab (sign in if needed). Visit `/admin.html`.
9. You should see the pending application. Click the **ID** / **Selfie** badges — they should open signed Storage URLs in new tabs and show the files you just uploaded.
10. Click **Approve**.
11. Switch to the driver tab. Refresh `/rider-dashboard.html` — it should now load successfully.

**Verify:**
- Driver dashboard shows the driver's name, "Pending zones / Online" controls, and a profile section.
- Switch status to **Online**.
- The "First dibs" badge feature works once a restaurant adds them as preferred (Step 8).

---

## Step 8 — Run an end-to-end delivery

In the **restaurant tab**:
1. On the dashboard, find your test driver in the **Available Drivers** list and click the ⭐ heart icon to save them as preferred.
2. Click **+ New Delivery Request**.
3. Fill in pickup, dropoff, zone (use the same zone the driver added in Step 7), submit.
4. You should see the **"Notified 1 preferred driver first. Opens to the rest in 30s"** banner appear at the bottom of the screen with a live countdown.

In the **driver tab**:
1. Refresh `/rider-dashboard.html` if you haven't yet.
2. You should see an incoming request **with a yellow ring and "🟡 First dibs" badge**.
3. The notification bell should have a yellow dot. Click it — you should see the request_new notification.
4. Click **Accept** on the request card.

Back in the **restaurant tab**:
1. The notification bell should pulse and show "{Driver name} accepted your delivery request."
2. The delivery request table on the dashboard should show **Accepted**.

In the driver tab:
1. Click **Picked up** → **Delivered** to walk through the full lifecycle.

Back in the restaurant tab:
1. Switch to the **Rate Drivers** tab. The driver should now appear there.
2. Visit `/analytics.html`. You should see KPIs of `Total: 1, Delivered: 1, etc.`
3. Click **Export CSV**. A file should download with one row of data.

**🎉 If all of that worked, your platform is fully wired.**

---

## Step 9 — (Optional) Deploy the expire-requests Edge Function

Required for production. Without this, `Available` requests that nobody accepts will sit there indefinitely.

1. Install the Supabase CLI: https://supabase.com/docs/guides/local-development/cli/getting-started
2. From the repo root:
   ```bash
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase functions deploy expire-requests --no-verify-jwt
   ```
   (Get the project ref from your Supabase URL — it's the `abcd1234` part of `https://abcd1234.supabase.co`)

3. In Supabase Studio: **Database → Cron Jobs → Create a new cron job**.
   - **Name:** `expire-requests`
   - **Schedule:** `*/1 * * * *` (every minute)
   - **Command:**
     ```sql
     select net.http_post(
       url:='https://YOUR-PROJECT-REF.functions.supabase.co/expire-requests',
       headers:=jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
       )
     );
     ```
     (Or, simpler: hardcode the service-role key. Less secure but easier to set up.)

**Verify:**
- Create a delivery request and don't accept it.
- Wait 5 minutes (the default expiry).
- Within 1 minute after that, the request should auto-Cancel and both restaurant + driver should get notifications.

---

## Step 10 — Deploy to production

The site is just static files + Supabase. Pick one host:

### Vercel (recommended — easiest)
```bash
npx vercel
```
First deploy will ask a few questions; accept defaults. `vercel.json` already includes the Tailwind build step.

After deploying:
1. Add your production domain to **Supabase → Settings → Authentication → URL Configuration → Redirect URLs**.
2. Update **Site URL** to your production domain.
3. In the deployed site, your `config.js` will need to ship. Either:
   - **Option A (simple):** commit `config.js` (remove it from `.gitignore` — the anon key is safe to expose in client code by design).
   - **Option B (cleaner):** set up Vercel environment variables + a build step that generates `config.js`. More work; only worth it if you want different keys per environment.

### GitHub Pages
1. `npm run build`
2. Commit `assets/css/styles.css` (the built file) + `assets/js/config.js`
3. Push, enable Pages on `main` in repo settings.

---

## Troubleshooting

**"Auth not configured" / preview mode banner**
- `assets/js/config.js` doesn't exist or has placeholder values. Double-check Step 5.

**Signup succeeds but `/restaurants.html` says "We couldn't find your driver profile" or similar**
- The auth trigger (`handle_new_user`) didn't fire. Re-run `schema.sql` end-to-end.
- Or: you signed up as a restaurant but landed on the rider page (or vice versa). Sign out and start fresh.

**Confirmation email doesn't arrive**
- Check spam.
- The default Supabase email sender has rate limits and weak deliverability. For production, configure your own SMTP in **Settings → Authentication → Email Templates**.
- For local testing, **temporarily turn OFF "Confirm email"** in Step 3.

**Admin console says "Admin access only" after running the SQL promotion**
- You need to sign **out** and back **in** for the JWT to refresh with the new `app_metadata`.

**RLS error: "new row violates row-level security policy"**
- Almost always means a profile row is missing for the current user. Check `restaurants` / `riders` tables in Table Editor; there should be one row per signed-up user.
- If a row is missing, the `handle_new_user` trigger didn't fire — re-run `schema.sql`.

**Driver dashboard redirects to `/riders.html` repeatedly**
- The driver's `verification_status` is not `verified`. Approve them from `/admin.html` first.

**Storage upload fails with "Bucket not found"**
- The `verifications` or `avatars` bucket wasn't created. Re-run `schema.sql` and check the **Storage** section.

**Storage upload fails with permission error**
- The storage policies weren't applied. They're now in the main `schema.sql` body (no longer commented out). Re-run the full script.

**Realtime notifications don't update without a refresh**
- Check **Database → Replication** in Supabase Studio. The `notifications` table should be listed under `supabase_realtime`. If not, re-run `schema.sql` (the publication step is near the bottom).

---

## What you have now

- Real auth with email confirmation + magic link + password reset
- RLS-protected tables that enforce role boundaries
- A signup trigger that creates the right profile row in one shot
- Storage with private verification docs + public avatars
- A realtime notification pipeline with browser push fallback
- Admin console with verification approval flow
- Driver + restaurant dashboards
- Activity history, analytics with CSV export
- Settings page with prefs + soft-delete
- A scheduled job for expiring stuck requests
- PWA install + service worker offline caching

The platform is live. Now go invite real drivers and restaurants.
