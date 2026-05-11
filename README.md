# YUMYUMPO Dispatch

The official logistics and rider infrastructure partner of **YUMYUMPO**.

A decentralized hospitality logistics platform that connects restaurants with **independent**, **verified** delivery partners. Dispatch is the visibility layer — it is **not** a centralized dispatch system, fleet operator, or food-payment processor.

> "Operational infrastructure built for modern hospitality businesses."

Reference design language: [YUMYUMPO Discovery](https://thethreethreethree.github.io/YUMYUMPO/)

---

## Platform philosophy

- **Decentralized** — no central dispatch algorithm.
- **Independent riders** — they set their own zones and pricing.
- **Restaurant-first** — restaurants build their own preferred rider teams.
- **Coordination off-platform** — communication happens via WhatsApp / phone calls. We do not run a chat system.

---

## Pages

| Page | Path |
|---|---|
| Homepage | `/index.html` |
| Restaurant dashboard | `/restaurants.html` |
| Rider onboarding | `/riders.html` |
| Rider marketplace | `/marketplace.html` |
| Rider profile | `/rider.html?id=…` |
| Rider dashboard | `/rider-dashboard.html` |
| Admin | `/admin.html` |
| About | `/about.html` |
| Auth | `/auth.html` |

---

## Tech stack

- **Frontend** — HTML5, Tailwind CSS (CDN), vanilla JavaScript (ES modules)
- **Backend** — Supabase (PostgreSQL + Auth + Storage)
- **Hosting** — Static · ready for GitHub Pages or Vercel

No build step. Just static files.

---

## Project structure

```
.
├── index.html               # Homepage
├── restaurants.html         # Restaurant dashboard
├── riders.html              # Rider onboarding & application
├── rider.html               # Individual rider profile
├── rider-dashboard.html     # Logged-in rider view
├── marketplace.html         # Browse riders
├── admin.html               # Operations admin
├── about.html               # Brand / mission
├── auth.html                # Sign in
├── assets/
│   ├── css/styles.css       # Shared styles + design tokens
│   └── js/
│       ├── main.js          # Scroll & UI hooks
│       ├── supabase.js      # Supabase client init
│       ├── api.js           # Data API (Supabase or mock fallback)
│       ├── components.js    # Reusable HTML renderers
│       └── mock-data.js     # Demo dataset
├── supabase/
│   └── schema.sql           # Full DB schema (run this in Supabase)
├── vercel.json              # Vercel static config
└── README.md
```

---

## Setup

### 1. Run locally
ES modules need to load over HTTP, not `file://`:

```bash
npx serve .
# or
python -m http.server 5173
```

### 2. Connect Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** → paste `supabase/schema.sql` → run.
3. (Optional) Create a Storage bucket called `verifications` for ID + selfie uploads.
4. Add your keys before the module scripts in each HTML page, e.g.:

```html
<script>
  window.SUPABASE_CONFIG = {
    url: "https://YOUR-PROJECT.supabase.co",
    anonKey: "YOUR_ANON_KEY"
  };
</script>
```

If `SUPABASE_CONFIG` is missing, the app **automatically falls back to mock data** so the demo still works.

### 3. Deploy

**Vercel** (recommended):
```bash
vercel
```
`vercel.json` is included — static deploy, no build step.

**GitHub Pages**:
```bash
git init
git add .
git commit -m "Initial dispatch platform"
git push
# Then enable Pages on the main branch in repo settings.
```

---

## Database schema (summary)

| Table | Purpose |
|---|---|
| `restaurants` | Restaurant accounts |
| `riders` | Independent delivery partners |
| `rider_zones` | Active delivery zones |
| `rider_availability` | Status change history |
| `delivery_requests` | Restaurant → rider requests |
| `preferred_riders` | Restaurant favorites |
| `rider_verifications` | ID + selfie + video review pipeline |
| `rider_ratings` | Operational metrics (punctuality, comms, etc.) |
| `delivery_activity` | Status changes timeline |
| `analytics_events` | Ecosystem-wide events |

See `supabase/schema.sql` for full DDL, enums, and RLS policies.

---

## Design tokens

| Token | Value |
|---|---|
| Cream | `#FBF7F0` |
| Warm | `#F5EFE4` |
| Beige | `#E9DFCB` |
| Charcoal | `#161412` |
| Ember (accent) | `#E5631F` |
| Dust | `#A89F90` |
| Display font | Fraunces |
| Body font | Inter |

---

## License

Built for the YUMYUMPO hospitality network.
