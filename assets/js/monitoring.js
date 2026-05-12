// =====================================================================
// Error monitoring — lazy Sentry init.
// Activates ONLY when window.SENTRY_CONFIG.dsn is provided in
// assets/js/config.js. Otherwise this module is a no-op; the site
// runs with zero monitoring overhead for self-hosted / dev usage.
// =====================================================================

const cfg = (typeof window !== "undefined" && window.SENTRY_CONFIG) || null;
const hasDsn = !!(cfg && typeof cfg.dsn === "string" && cfg.dsn.startsWith("https://"));

let Sentry = null;
let bootPromise = null;

// Error patterns we never want to bother on-call about. Network glitches,
// user-cancelled fetches, expected auth redirects, etc.
const SUPPRESS_PATTERNS = [
  /ResizeObserver/i,
  /Non-Error promise rejection captured/i,
  /Failed to fetch/i,
  /NetworkError/i,
  /Load failed/i,
  /AbortError/i,
  /redirecting/i,            // we throw "redirecting" in requireAuth to halt page init
  /no profile/i,
  /not verified/i,
  /not found/i,
];

function shouldSuppress(value) {
  if (!value) return false;
  const msg = (value.message || String(value)).toString();
  return SUPPRESS_PATTERNS.some(rx => rx.test(msg));
}

async function bootSentry() {
  if (!hasDsn) return null;
  if (Sentry) return Sentry;
  try {
    Sentry = await import("https://esm.sh/@sentry/browser@8?bundle");
    Sentry.init({
      dsn: cfg.dsn,
      release: cfg.release || "yumyumpo-dispatch@unknown",
      environment: cfg.environment || (location.hostname === "localhost" ? "development" : "production"),
      // Keep the bundle lean — no replay, no profiling, no perf by default.
      tracesSampleRate: 0,
      // Drop noise before it ships.
      beforeSend(event, hint) {
        const original = hint?.originalException;
        if (shouldSuppress(original) || shouldSuppress(event.message)) return null;
        return event;
      },
    });
    // Mark the current role on every event when known (set by app code).
    if (cfg.user) Sentry.setUser(cfg.user);
  } catch (e) {
    console.warn("Sentry failed to initialise:", e?.message || e);
    Sentry = null;
  }
  return Sentry;
}

if (hasDsn && typeof window !== "undefined") {
  bootPromise = bootSentry();

  // Belt-and-braces: capture anything Sentry's auto-instrumentation misses
  // (e.g. errors thrown before its handlers attach).
  window.addEventListener("error", (e) => {
    if (shouldSuppress(e.error || e.message)) return;
    bootPromise?.then(s => s?.captureException(e.error || new Error(e.message)));
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (shouldSuppress(e.reason)) return;
    bootPromise?.then(s => s?.captureException(e.reason));
  });
}

// Public helpers for app code to enrich events.
export async function setMonitoringUser(user) {
  if (!hasDsn) return;
  const s = await bootPromise;
  s?.setUser(user || null);
}
export async function addBreadcrumb(crumb) {
  if (!hasDsn) return;
  const s = await bootPromise;
  s?.addBreadcrumb(crumb);
}
export async function captureMessage(msg, level = "info") {
  if (!hasDsn) return;
  const s = await bootPromise;
  s?.captureMessage(msg, level);
}

export const MONITORING_ENABLED = hasDsn;
