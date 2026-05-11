// Supabase client initializer.
// 1) Create a project at https://supabase.com
// 2) Run /supabase/schema.sql in the SQL editor
// 3) Fill the values below or set them at window.SUPABASE_CONFIG
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.SUPABASE_CONFIG || {
  url: "YOUR_SUPABASE_URL",
  anonKey: "YOUR_SUPABASE_ANON_KEY",
};

export const supabase = (cfg.url && cfg.url.startsWith("http"))
  ? createClient(cfg.url, cfg.anonKey)
  : null;

export const HAS_SUPABASE = !!supabase;
