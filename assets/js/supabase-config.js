// Supabase 프로젝트의 Settings > API에서 두 값을 복사해 넣으세요.
export const SUPABASE_URL = "https://pubpgleojbahojdygfrv.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_5--EkQEMtAMyJyTmQBnyZg_bdN4LgvP";

export const isSupabaseConfigured = () =>
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_") &&
  !SUPABASE_ANON_KEY.includes("YOUR_");

let client;

export async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}
