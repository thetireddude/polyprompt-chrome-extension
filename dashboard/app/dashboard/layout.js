"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useSessionGuard } from "@/lib/useSessionGuard";

const EVENT_NAV_ITEM = { href: "/dashboard", label: "Events" };

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, supabase } = useSessionGuard();
  const [signingOut, setSigningOut] = useState(false);
  const isEventsActive = pathname === "/dashboard" || pathname.startsWith("/dashboard/events/");

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
        <div className="sidebar-brand">
          <p className="brand-kicker brand-wordmark">
            <span className="brand-poly">Poly</span>
            <span className="brand-sync">Sync</span>
          </p>
          <h1 className="nav-title">Dashboard</h1>
          <p className="nav-subtitle">{user?.email || ""}</p>
        </div>

        <nav className="flex flex-col items-start gap-3">
          <Link
            href={EVENT_NAV_ITEM.href}
            className={`inline-flex w-fit items-center justify-center rounded-full border px-6 py-2 text-sm font-semibold leading-none transition-colors ${
              isEventsActive
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-800 text-slate-900 hover:bg-slate-100"
            }`}
          >
            {EVENT_NAV_ITEM.label}
          </Link>
        </nav>

        <div className="sidebar-footer">
          <button className="button-secondary" onClick={signOut} disabled={signingOut}>
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>

      <section className="main-panel">{children}</section>
    </main>
  );
}
