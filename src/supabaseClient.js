import { createClient } from "@supabase/supabase-js";

// Ces deux valeurs sont publiques par conception dans une app navigateur Supabase.
// Vercel peut les surcharger via ses variables d'environnement.
const defaultUrl = "https://cdkmpeihiidgpleknzhj.supabase.co";
const defaultPublishableKey = "sb_publishable_RplNfEOohIw0nLqDBz1OBw_kb3BnKtv";

const configuredUrl = import.meta.env.VITE_SUPABASE_URL;
const configuredKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseUrl = configuredUrl || defaultUrl;
const supabaseKey = configuredKey || defaultPublishableKey;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);
export const supabaseProjectRef = (() => {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0];
  } catch {
    return "";
  }
})();

if (supabaseProjectRef !== "cdkmpeihiidgpleknzhj") {
  console.warn(
    `Supabase pointe vers le projet ${supabaseProjectRef || "inconnu"} au lieu de cdkmpeihiidgpleknzhj.`
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
