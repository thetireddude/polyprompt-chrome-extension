"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

export function useSessionGuard({ redirectTo = "/login", requireSession = true } = {}) {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const pathname = usePathname();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const {
        data: { session: existingSession }
      } = await supabase.auth.getSession();

      if (!active) return;

      setSession(existingSession);
      setLoading(false);

      if (requireSession && !existingSession && pathname !== redirectTo) {
        router.replace(redirectTo);
      }
    }

    loadSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (requireSession && !nextSession && pathname !== redirectTo) {
        router.replace(redirectTo);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname, redirectTo, requireSession, router, supabase.auth]);

  return {
    supabase,
    session,
    user: session?.user ?? null,
    loading
  };
}
