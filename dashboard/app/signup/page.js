"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSessionGuard } from "@/lib/useSessionGuard";
import { getAuthErrorMessage } from "@/lib/authErrorMessage";

export default function SignupPage() {
  const router = useRouter();
  const { supabase, session, loading } = useSessionGuard({ requireSession: false });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && session) {
      router.replace("/dashboard");
    }
  }, [loading, router, session]);

  async function signUpWithGoogle() {
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
        setError(getAuthErrorMessage(authError, "Failed to continue."));
      }
    } catch (err) {
      setError(getAuthErrorMessage(err, "Failed to continue."));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="brand-kicker">EventSnap Dashboard</p>
        <h1>Create account</h1>
        <p>Account creation is automatic the first time you continue with Google.</p>

        <button className="button" onClick={signUpWithGoogle} disabled={pending}>
          {pending ? "Connecting..." : "Continue with Google"}
        </button>

        {error ? <div className="error">{error}</div> : null}

        <div className="link-row">
          Already have access? <Link href="/login">Sign in</Link>
        </div>
      </section>
    </main>
  );
}
