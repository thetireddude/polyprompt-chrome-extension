"use client";

import { useEffect, useState } from "react";
import { useSessionGuard } from "@/lib/useSessionGuard";

function formatDateTime(value) {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";

  return new Intl.DateTimeFormat([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}

export default function AccountPage() {
  const { supabase, user, loading } = useSessionGuard();

  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (loading || !user) return;

    async function loadProfile() {
      setBusy(true);
      setError("");

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        // Profiles table is optional for this screen; fall back to auth metadata.
        console.warn("profiles read skipped:", profileError.message);
      }

      const metadata = user.user_metadata || {};
      const fallbackUsername =
        metadata.display_name || metadata.user_name || metadata.full_name || metadata.name || "";

      setUsername(data?.display_name || fallbackUsername || "");
      setBusy(false);
    }

    loadProfile();
  }, [loading, supabase, user]);

  async function saveProfile(e) {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setError("");
    setMessage("");

    const cleanUsername = username.trim();

    const { error: authError } = await supabase.auth.updateUser({
      data: {
        display_name: cleanUsername || null
      }
    });

    if (authError) {
      setError(authError.message);
      setSaving(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: cleanUsername || null });

    if (profileError) {
      setMessage("Account updated. Profiles table sync was skipped.");
    } else {
      setMessage("Account updated.");
    }
    setSaving(false);
  }

  return (
    <div className="grid">
      <header className="page-head">
        <div>
          <h1>Account</h1>
          <p>View account details. Only username is editable.</p>
        </div>
      </header>

      <section className="card">
        <h3>Profile</h3>
        {busy ? (
          <div className="loading">Loading account...</div>
        ) : (
          <form className="grid" onSubmit={saveProfile}>
            <div className="grid two">
              <label>
                Username
                <input value={username} onChange={(e) => setUsername(e.target.value)} />
              </label>

              <label>
                Email
                <input value={user?.email || ""} disabled />
              </label>

              <label>
                Account Created
                <input value={formatDateTime(user?.created_at)} disabled />
              </label>

              <label>
                Last Sign-In
                <input value={formatDateTime(user?.last_sign_in_at)} disabled />
              </label>
            </div>

            <div className="actions">
              <button className="button" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>
        )}

        {error ? <div className="error">{error}</div> : null}
        {message ? <div className="success">{message}</div> : null}
      </section>

    </div>
  );
}
