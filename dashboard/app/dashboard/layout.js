"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useSessionGuard } from "@/lib/useSessionGuard";

const EVENT_NAV_ITEM = { href: "/dashboard", label: "Events" };
const ACCOUNT_NAV_ITEM = { href: "/dashboard/account", label: "Account" };

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, supabase } = useSessionGuard();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="dashboard-shell">
        <section className="main-panel">
          <div className="loading">Loading dashboard...</div>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div>
          <p className="brand-kicker">EventSnap</p>
          <h1 className="nav-title">Dashboard</h1>
          <p className="nav-subtitle">{user?.email || ""}</p>
        </div>

        <nav className="nav-sections">
          <section className="nav-section">
            <p className="nav-section-title">Events</p>
            <div className="nav-links">
              <Link
                href={EVENT_NAV_ITEM.href}
                className={
                  pathname === "/dashboard" || pathname.startsWith("/dashboard/events/") ? "active" : ""
                }
              >
                {EVENT_NAV_ITEM.label}
              </Link>
            </div>
          </section>

          <section className="nav-section">
            <p className="nav-section-title">Account</p>
            <div className="nav-links">
              <Link
                href={ACCOUNT_NAV_ITEM.href}
                className={
                  pathname.startsWith("/dashboard/account") || pathname === "/dashboard/settings" ? "active" : ""
                }
              >
                {ACCOUNT_NAV_ITEM.label}
              </Link>
            </div>
          </section>
        </nav>

        <div className="note">Extension sync writes into the same event table in real time.</div>

        <div>
          <button className="button-secondary" onClick={signOut} disabled={signingOut}>
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>

      <section className="main-panel">{children}</section>
    </main>
  );
}
