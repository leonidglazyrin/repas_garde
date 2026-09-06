import { createClient } from "@supabase/supabase-js";

// L'app navigateur se connecte directement au projet Supabase actif.
// La clé publishable est publique par conception; aucune clé secrète/service_role
// n'est présente dans le frontend.
const supabaseUrl = "https://cdkmpeihiidgpleknzhj.supabase.co";
const supabaseKey = "sb_publishable_RplNfEOohIw0nLqDBz1OBw_kb3BnKtv";

export const supabaseConfigured = true;
export const supabaseProjectRef = "cdkmpeihiidgpleknzhj";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});
