"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createLocalClient } from "@/lib/localClient";

let client;

export function getSupabaseClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const explicitLocalMode = process.env.NEXT_PUBLIC_EVENTSNAP_LOCAL_MODE === "true";
  const shouldUseLocal = explicitLocalMode || !url || !key;

  if (shouldUseLocal) {
    client = createLocalClient();
    return client;
  }

  client = createBrowserClient(url, key);
  return client;
}
