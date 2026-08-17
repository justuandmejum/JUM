"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AdminInfo {
  email: string;
  role: string;
}

/** Auth-guards an admin page (redirects to /admin/login if not logged in)
 * and fetches the CSRF token every state-changing admin fetch needs to
 * send as `x-csrf-token`. */
export function useAdminAuth() {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          router.push("/admin/login");
          return;
        }
        setAdmin(data.admin);
        setCsrfToken(data.csrfToken);
        setCheckedAuth(true);
      });
  }, [router]);

  return { admin, csrfToken, checkedAuth };
}
