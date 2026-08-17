"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatTimeOfDay, formatFullDateLabel } from "../../lib/i18n/bookingFormat";
import { useAdminAuth } from "../../lib/useAdminAuth";

interface PendingBooking {
  id: string;
  date: string;
  startTime: number;
  duration: number;
  callMethod: string;
  sharedRealInfo: boolean;
  notes: string | null;
  amountInr: number;
  holdExpiresAt: string;
  user: { displayName: string; email: string; phone: string | null };
}

interface UpcomingBooking {
  id: string;
  date: string;
  startTime: number;
  duration: number;
  callMethod: string;
  callCode: string;
  user: { displayName: string; email: string };
}

function formatWhen(dateStr: string, startTime: number): string {
  return `${formatFullDateLabel(new Date(dateStr), "en")} at ${formatTimeOfDay(startTime, "en")}`;
}

function minutesLeft(isoExpiry: string, now: number): string {
  const ms = new Date(isoExpiry).getTime() - now;
  if (ms <= 0) return "expired";
  const totalSec = Math.floor(ms / 1000);
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { admin, csrfToken, checkedAuth } = useAdminAuth();

  const [pending, setPending] = useState<PendingBooking[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingBooking[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [callbackSent, setCallbackSent] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(() => {
    fetch("/api/bookings/pending")
      .then((res) => res.json())
      .then((data) => setPending(data.bookings ?? []));
    fetch("/api/admin/bookings/upcoming")
      .then((res) => res.json())
      .then((data) => setUpcoming(data.bookings ?? []));
  }, []);

  useEffect(() => {
    if (!checkedAuth) return;
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, [checkedAuth, refresh]);

  async function act(bookingId: string, action: "approve" | "decline") {
    setActingOn(bookingId);
    setActionError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/${action}`, { method: "POST", headers: { "x-csrf-token": csrfToken ?? "" } });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? `Could not ${action} this request.`);
        return;
      }
      refresh();
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setActingOn(null);
    }
  }

  async function cancelSession(bookingId: string) {
    if (!window.confirm("Cancel this confirmed session? The customer will receive a full refund.")) return;
    setActingOn(bookingId);
    setActionError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/admin-cancel`, { method: "POST", headers: { "x-csrf-token": csrfToken ?? "" } });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Could not cancel this session.");
        return;
      }
      refresh();
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setActingOn(null);
    }
  }

  async function sendCallback(bookingId: string) {
    setActingOn(bookingId);
    setActionError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/call/callback`, { method: "POST", headers: { "x-csrf-token": csrfToken ?? "" } });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Could not send a callback for this session.");
        return;
      }
      setCallbackSent((prev) => ({ ...prev, [bookingId]: true }));
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setActingOn(null);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  if (!checkedAuth) {
    return (
      <section>
        <div className="wrap center">…</div>
      </section>
    );
  }

  return (
    <section>
      <div className="wrap">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="eyebrow">JUM Admin</div>
            <h2 style={{ margin: "4px 0" }}>Dashboard</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link className="btn" href="/admin/availability">
              Availability
            </Link>
            <span className="fine" style={{ color: "#3f4c5e" }}>
              {admin?.email}
            </span>
            <button className="btn" onClick={logout}>
              Log out
            </button>
          </div>
        </div>

        {actionError && (
          <p className="note" style={{ border: "1.5px solid #b03a2e", color: "#8a2f2f", background: "#fbecec" }}>
            {actionError}
          </p>
        )}

        <h3 style={{ marginTop: 34 }}>Pending requests ({pending.length})</h3>
        {pending.length === 0 ? (
          <p className="lead" style={{ margin: "8px 0" }}>
            Nothing waiting on you right now.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
            {pending.map((b) => (
              <div className="panel" key={b.id} style={{ margin: 0, maxWidth: "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <b>{formatWhen(b.date, b.startTime)}</b> · {b.duration} min · ₹{b.amountInr} · {b.callMethod}
                    <div className="fine" style={{ marginTop: 4 }}>
                      {b.sharedRealInfo ? "Real name" : "Nickname"}: {b.user.displayName} · {b.user.email}
                      {b.user.phone ? ` · ${b.user.phone}` : ""}
                    </div>
                    {b.notes && <div className="fine" style={{ marginTop: 4, fontStyle: "italic" }}>&ldquo;{b.notes}&rdquo;</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="fine">Responds in {minutesLeft(b.holdExpiresAt, now)}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button className="btn primary" disabled={actingOn === b.id} onClick={() => act(b.id, "approve")}>
                        Approve
                      </button>
                      <button className="btn" disabled={actingOn === b.id} onClick={() => act(b.id, "decline")}>
                        Decline
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <h3 style={{ marginTop: 34 }}>Upcoming confirmed sessions ({upcoming.length})</h3>
        {upcoming.length === 0 ? (
          <p className="lead" style={{ margin: "8px 0" }}>
            Nothing confirmed yet.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {upcoming.map((b) => (
              <div className="panel" key={b.id} style={{ margin: 0, maxWidth: "none", padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <span>
                  <b>{formatWhen(b.date, b.startTime)}</b> · {b.duration} min · {b.callMethod} · {b.user.displayName} · code {b.callCode}
                </span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {b.callMethod === "JUM" && (
                    <>
                      <Link className="btn" href={`/admin/call/${b.id}`}>
                        Join Call
                      </Link>
                      <button className="btn" disabled={actingOn === b.id || callbackSent[b.id]} onClick={() => sendCallback(b.id)}>
                        {callbackSent[b.id] ? "Callback sent" : "Send Callback"}
                      </button>
                    </>
                  )}
                  <button className="btn" disabled={actingOn === b.id} onClick={() => cancelSession(b.id)}>
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
