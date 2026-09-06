import { createClient } from "@supabase/supabase-js";

const configuredUrl = import.meta.env.VITE_SUPABASE_URL;
const configuredAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(configuredUrl && configuredAnonKey);

if (!supabaseConfigured) {
  console.warn(
    "Variables Supabase manquantes. L'application reste accessible, mais la synchronisation cloud est désactivée tant que VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY ne sont pas configurées."
  );
}

// createClient exige toujours une URL et une clé. On fournit des valeurs de secours
// uniquement pour éviter un crash au démarrage quand l'hébergeur n'a pas encore reçu
// les variables d'environnement. Les requêtes cloud échoueront proprement au lieu de
// provoquer une page blanche.
const supabaseUrl = configuredUrl || "https://example.supabase.co";
const supabaseAnonKey = configuredAnonKey || "public-anon-key-placeholder";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
