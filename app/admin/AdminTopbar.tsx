"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/availability", label: "Availability" },
];

export function AdminTopbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const onLogin = pathname === "/admin/login";

  useEffect(() => {
    if (onLogin) {
      setEmail(null);
      return;
    }
    fetch("/api/admin/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setEmail(data?.admin?.email ?? null))
      .catch(() => setEmail(null));
  }, [onLogin, pathname]);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setEmail(null);
    router.push("/admin/login");
  }

  return (
    <header className="adm-top">
      <div className="adm-top-inner">
        <Link href="/admin" className="adm-brand" aria-label="JUM admin home">
          <span className="adm-logo">JUM</span>
          <span className="adm-brand-text">
            <b>Just U And Me</b>
            <small>Admin</small>
          </span>
        </Link>

        {!onLogin && (
          <nav className="adm-nav" aria-label="Admin">
            {NAV.map((n) => {
              const active = n.href === "/admin" ? pathname === "/admin" || pathname.startsWith("/admin/call") : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} className={active ? "active" : ""}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
        )}

        {email && (
          <div className="adm-user">
            <span className="adm-user-email" title={email}>
              {email}
            </span>
            <button className="adm-logout" onClick={logout}>
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
