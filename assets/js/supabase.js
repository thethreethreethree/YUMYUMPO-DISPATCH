// Supabase client. Reads config from window.SUPABASE_CONFIG (loaded by assets/js/config.js).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = (typeof window !== "undefined" && window.SUPABASE_CONFIG) || null;
const valid = cfg && typeof cfg.url === "string" && cfg.url.startsWith("http")
  && typeof cfg.anonKey === "string" && cfg.anonKey.length > 20
  && !cfg.url.includes("YOUR-PROJECT") && !cfg.anonKey.includes("YOUR_");

export const supabase = valid
  ? createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;

export const HAS_SUPABASE = !!supabase;

if (!HAS_SUPABASE && typeof window !== "undefined") {
  console.warn(
    "%cYUMYUMPO Dispatch is running in offline preview mode.\n" +
    "Copy assets/js/config.example.js → assets/js/config.js and fill in your Supabase keys to go live.",
    "color:#E6BB00; font-weight:bold;"
  );
}
