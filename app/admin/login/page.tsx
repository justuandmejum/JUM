"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        return;
      }
      router.push("/admin");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <div className="wrap center adm-login-wrap">
        <div className="adm-login-badge adm-rise">JUM</div>
        <div className="adm-eyebrow adm-rise" style={{ animationDelay: "60ms" }}>JUM Admin</div>
        <h1 className="adm-title adm-rise" style={{ animationDelay: "100ms" }}>Welcome back</h1>
        <div className="panel adm-login adm-rise" style={{ textAlign: "left", animationDelay: "160ms" }}>
          <form className="formrow" onSubmit={handleSubmit}>
            <label>
              <span>Email</span>
              <input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </label>
            <label>
              <span>Password</span>
              <input className="field" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p className="note" style={{ border: "1.5px solid #b03a2e", color: "#8a2f2f", background: "#fbecec" }}>{error}</p>}
            <button className="btn primary" type="submit" disabled={submitting}>
              {submitting ? "…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
