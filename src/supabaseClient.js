import { createClient } from "@supabase/supabase-js";

const configuredUrl = import.meta.env.VITE_SUPABASE_URL;
const configuredKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(configuredUrl && configuredKey);

if (!supabaseConfigured) {
  console.warn("Supabase environment variables are missing.");
}

// Keep the UI renderable even before the hosting environment is configured.
// These placeholders are not credentials and cannot access a real Supabase project.
const supabaseUrl = configuredUrl || "https://example.supabase.co";
const supabaseKey = configuredKey || "public-key-placeholder";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
