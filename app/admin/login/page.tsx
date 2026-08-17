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
      <div className="wrap center" style={{ maxWidth: 420 }}>
        <div className="eyebrow">JUM Admin</div>
        <h2>Sign in</h2>
        <div className="panel" style={{ textAlign: "left" }}>
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
