"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSessionGuard } from "@/lib/useSessionGuard";
import { getAuthErrorMessage } from "@/lib/authErrorMessage";

export default function LoginPage() {
  const router = useRouter();
  const { supabase, session, loading } = useSessionGuard({ requireSession: false });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && session) {
      router.replace("/dashboard");
    }
  }, [loading, router, session]);

  async function signInWithGoogle() {
    try {
      setPending(true);
      setError("");

      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account"
          }
        }
      });

      if (authError) {
        setError(getAuthErrorMessage(authError, "Failed to sign in."));
      }
    } catch (err) {
      setError(getAuthErrorMessage(err, "Failed to sign in."));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="brand-kicker">PolySync Dashboard</p>
        <h1>Sign in</h1>
        <p>Use your Google account to manage captured events across devices.</p>

        <button className="button" onClick={signInWithGoogle} disabled={pending}>
          {pending ? "Connecting..." : "Continue with Google"}
        </button>

        {error ? <div className="error">{error}</div> : null}

        <div className="link-row">
          New here? <Link href="/signup">Create your account</Link>
        </div>
      </section>
    </main>
  );
}
