// Copy this file to assets/js/config.js and fill in your real values.
// config.js is gitignored. Never commit production keys.
//
// Get the Supabase values from your project: Settings → API.
window.SUPABASE_CONFIG = {
  url:     "https://YOUR-PROJECT-REF.supabase.co",
  anonKey: "YOUR_PUBLIC_ANON_KEY",
};

// (Optional) Error monitoring — leave commented out to disable.
// When `dsn` is set, the site lazy-loads Sentry from CDN and reports
// uncaught errors + unhandled rejections. Network failures, expected
// auth redirects, and ResizeObserver noise are filtered out.
// window.SENTRY_CONFIG = {
//   dsn:         "https://YOUR_PUBLIC_KEY@oXXXX.ingest.sentry.io/PROJECT_ID",
//   environment: "production",          // or "staging", "development"
//   release:     "yumyumpo-dispatch@1.0.0",
// };
