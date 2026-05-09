import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://lwwioivnoocelhgceqau.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tZl0LLvwFKfx8_rHph_XJQ_A18-8Nhf";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
  realtime: {
    params: { eventsPerSecond: 20 },
  },
});

export const SUPABASE_PUBLIC = { url: SUPABASE_URL, anonKey: SUPABASE_PUBLISHABLE_KEY };
