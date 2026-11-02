import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

let client;
let publicClient;

function createClientOptions(persistSession) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Konfigurasi Supabase belum lengkap.");
  }
  if (!globalThis.supabase?.createClient) {
    throw new Error("Library Supabase belum tersedia. Muat ulang halaman atau periksa koneksi.");
  }
  return {
    auth: {
      autoRefreshToken: persistSession,
      persistSession,
      detectSessionInUrl: persistSession,
      storageKey: persistSession
        ? undefined
        : `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-anon-auth-token`,
    },
  };
}

export function getSupabaseClient() {
  if (!client) {
    const options = createClientOptions(true);
    client = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options);
  }
  return client;
}

export function getPublicSupabaseClient() {
  if (!publicClient) {
    const options = createClientOptions(false);
    publicClient = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options);
  }
  return publicClient;
}
