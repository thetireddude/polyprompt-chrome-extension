"use client";

import { useEffect, useMemo, useState } from "react";
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

function normalizePhotoUrl(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.toString();
  } catch (_err) {
    return null;
  }
}

function getInitials(value) {
  const normalized = (value || "").trim();
  if (!normalized) return "U";

  return normalized
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function AccountPage() {
  const { supabase, user, loading } = useSessionGuard();

  const [username, setUsername] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const providerLabel = useMemo(() => {
    const providers = Array.isArray(user?.app_metadata?.providers) ? user.app_metadata.providers : [];
    if (providers.length) return providers.join(", ");
    if (user?.app_metadata?.provider) return user.app_metadata.provider;
    return "Unknown";
  }, [user]);

  const initials = useMemo(() => {
    return getInitials(username || user?.email || "");
  }, [user?.email, username]);

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
      const fallbackPhoto = metadata.avatar_url || metadata.picture || "";

      setUsername(data?.display_name || fallbackUsername || "");
      setProfilePhotoUrl(fallbackPhoto || "");
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
    const cleanPhotoUrl = normalizePhotoUrl(profilePhotoUrl);

    if (cleanPhotoUrl === null) {
      setError("Profile photo URL must be a valid http(s) URL.");
      setSaving(false);
      return;
    }

    const { error: authError } = await supabase.auth.updateUser({
      data: {
        display_name: cleanUsername || null,
        avatar_url: cleanPhotoUrl || null
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

    setProfilePhotoUrl(cleanPhotoUrl || "");
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
          <p>View account details. Only username and profile photo are editable.</p>
        </div>
      </header>

      <section className="card">
        <h3>Profile</h3>
        {busy ? (
          <div className="loading">Loading account...</div>
        ) : (
          <form className="grid" onSubmit={saveProfile}>
            <div className="profile-grid">
              <div className="avatar-editor">
                <div className="avatar-preview-shell">
                  {profilePhotoUrl ? (
                    <img className="avatar-preview" src={profilePhotoUrl} alt="Profile" />
                  ) : (
                    <div className="avatar-fallback">{initials}</div>
                  )}
                </div>

                <label>
                  Profile Photo URL (optional)
                  <input
                    value={profilePhotoUrl}
                    onChange={(e) => setProfilePhotoUrl(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                  />
                </label>
              </div>

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
                  User ID
                  <input value={user?.id || ""} disabled />
                </label>

                <label>
                  Auth Provider
                  <input value={providerLabel} disabled />
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

      <section className="card">
        <h3>Data Notes</h3>
        <ul>
          <li>Events are loaded from Supabase when URL + key are configured.</li>
          <li>Session persistence is handled by Supabase Auth on this dashboard origin.</li>
          <li>Analytics and API token sections were removed from dashboard navigation.</li>
        </ul>
      </section>
    </div>
  );
}
