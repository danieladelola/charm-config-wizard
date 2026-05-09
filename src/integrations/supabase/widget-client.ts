import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLIC } from "./client";

// Anonymous client for the embeddable widget.
// Does NOT persist or use any auth session, so requests always go as the
// `anon` role even if an admin happens to be signed in in the same browser
// (the widget runs in an iframe that shares storage with the parent app).
export const supabaseWidget = createClient(SUPABASE_PUBLIC.url, SUPABASE_PUBLIC.anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    storageKey: "th-widget-anon",
  },
  realtime: {
    params: { eventsPerSecond: 20 },
  },
});
