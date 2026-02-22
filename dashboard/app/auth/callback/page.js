"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

const MAX_SESSION_CHECK_ATTEMPTS = 40;
const SESSION_CHECK_DELAY_MS = 250;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const providerError = params.get("error");
    const errorDescription = params.get("error_description");

    async function completeSignIn() {
      if (providerError || errorDescription) {
        if (!active) return;
        setError(errorDescription || providerError || "Authentication failed.");
        return;
      }

      if (!code) {
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!active) return;

        if (session) {
          router.replace("/dashboard");
          return;
        }

        setError("No auth code returned.");
        return;
      }

      for (let attempt = 0; attempt < MAX_SESSION_CHECK_ATTEMPTS; attempt += 1) {
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!active) return;

        if (session) {
          router.replace("/dashboard");
          return;
        }

        await wait(SESSION_CHECK_DELAY_MS);
      }

      if (!active) return;
      setError("Sign-in could not be completed. Return to login and try again in the same browser tab.");
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active || !nextSession) return;
      router.replace("/dashboard");
    });

    completeSignIn();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="brand-kicker">EventSnap Dashboard</p>
        <h1>Finalizing sign-in</h1>
        <p>Completing Google authentication and preparing your dashboard.</p>
        {error ? <div className="error">{error}</div> : <div className="note">Please wait...</div>}
      </section>
    </main>
  );
}
