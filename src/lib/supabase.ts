import { createClient } from "@supabase/supabase-js";

// Anon key by design (audit F-01): Vite inlines every VITE_* value into the
// shipped bundle, so the client must never hold the service-role key. Anon
// access is scoped server-side by the anon_personal_app_access_v2_scoped
// migration (22 app tables; agent/system schemas stay service-role-only).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const intellizenLocalAccessKey = import.meta.env.VITE_INTELLIZEN_LOCAL_ACCESS_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the local desktop app.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: intellizenLocalAccessKey
      ? { "x-intellizen-local-access": intellizenLocalAccessKey }
      : {},
  },
});
