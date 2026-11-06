"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

// A request is held for the customer for this long while it waits on JUM
// (lib/bookings.ts APPROVAL_WINDOW_MINUTES) — only used to size the countdown bar.
const APPROVAL_WINDOW_MS = 15 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;

function formatWhen(dateStr: string, startTime: number): string {
  return `${formatFullDateLabel(new Date(dateStr), "en")} at ${formatTimeOfDay(startTime, "en")}`;
}

function minutesLeft(isoExpiry: string, now: number): string {
  const ms = new Date(isoExpiry).getTime() - now;
  if (ms <= 0) return "expired";
  const totalSec = Math.floor(ms / 1000);
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
}

/** The session's start as a real instant (booking date + startTime are IST wall-clock). */
function sessionStartMs(dateIso: string, startTime: number): number {
  const d = new Date(dateIso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + startTime * 60_000 - IST_OFFSET_MS;
}

function untilLabel(ms: number): string {
  if (ms <= 0) return "now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `in ${h}h ${mins % 60}m`;
  const days = Math.floor(h / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

const AVATAR_COLORS = ["#102f5c", "#6d2f69", "#2f6b57", "#a2602a", "#3b5b92", "#8a3b4d"];
function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Counts up to `target` once, and again whenever it changes (skipped for reduced-motion). */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 650);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

function StatCard({ label, value, tone, delay, children }: { label: string; value: number; tone: "gold" | "navy" | "green"; delay: number; children: React.ReactNode }) {
  const shown = useCountUp(value);
  return (
    <div className={`adm-stat adm-rise tone-${tone}`} style={{ animationDelay: `${delay}ms` }}>
      <span className="adm-stat-icon">{children}</span>
      <div>
        <div className="adm-stat-num">{shown}</div>
        <div className="adm-stat-label">{label}</div>
      </div>
    </div>
  );
}

const icons = {
  hourglass: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h12M6 22h12M7 2c0 5 5 6 5 10s-5 5-5 10M17 2c0 5-5 6-5 10s5 5 5 10" />
    </svg>
  ),
  calendar: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  ),
  sun: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
};

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="adm-empty adm-rise">
      <svg className="adm-empty-art" width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r="28" fill="#f3e6c8" />
        <path d="M20 34c3 6 21 6 24 0" stroke="#c9a24a" strokeWidth="3" strokeLinecap="round" />
        <circle cx="24" cy="25" r="2.6" fill="#102f5c" />
        <circle cx="40" cy="25" r="2.6" fill="#102f5c" />
      </svg>
      <b>{title}</b>
      <span>{hint}</span>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { csrfToken, checkedAuth } = useAdminAuth();

  const [pending, setPending] = useState<PendingBooking[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingBooking[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [callbackSent, setCallbackSent] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(() => Date.now());
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const seenPending = useRef<Set<string> | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Highlight a request the moment it first shows up (not the ones already there on load).
  useEffect(() => {
    const ids = new Set(pending.map((b) => b.id));
    if (!loaded) return;
    if (seenPending.current === null) {
      seenPending.current = ids;
      return;
    }
    const fresh = [...ids].filter((id) => !seenPending.current!.has(id));
    seenPending.current = ids;
    if (fresh.length > 0) {
      setFlashIds((prev) => new Set([...prev, ...fresh]));
      setTimeout(() => setFlashIds((prev) => new Set([...prev].filter((id) => !fresh.includes(id)))), 2600);
    }
  }, [pending, loaded]);

  const refresh = useCallback(() => {
    Promise.all([
      fetch("/api/bookings/pending").then((res) => res.json()),
      fetch("/api/admin/bookings/upcoming").then((res) => res.json()),
    ])
      .then(([p, u]) => {
        setPending(p.bookings ?? []);
        setUpcoming(u.bookings ?? []);
        setLoaded(true);
      })
      .catch(() => {
        // keep showing the last good data; the next poll will retry
      });
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

  if (!checkedAuth) {
    return (
      <div className="adm-page">
        <div className="adm-skel adm-skel-title" />
        <div className="adm-stats">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="adm-skel adm-skel-stat" />
          ))}
        </div>
      </div>
    );
  }

  const todayIst = new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
  const todayCount = upcoming.filter((b) => b.date.slice(0, 10) === todayIst).length;
  const next = upcoming
    .map((b) => ({ b, at: sessionStartMs(b.date, b.startTime) }))
    .filter((x) => x.at + x.b.duration * 60_000 > now)
    .sort((a, z) => a.at - z.at)[0];

  return (
    <div className="adm-page">
      <div className="adm-head adm-rise">
        <div>
          <div className="adm-eyebrow">JUM Admin</div>
          <h1 className="adm-title">Dashboard</h1>
        </div>
        <div className="adm-live" title="This page refreshes by itself every few seconds">
          <span className="adm-dot" /> Live
        </div>
      </div>

      {actionError && <p className="adm-error">{actionError}</p>}

      <div className="adm-stats">
        <StatCard label="Waiting on you" value={pending.length} tone="gold" delay={60}>
          {icons.hourglass}
        </StatCard>
        <StatCard label="Upcoming sessions" value={upcoming.length} tone="navy" delay={120}>
          {icons.calendar}
        </StatCard>
        <StatCard label="Sessions today" value={todayCount} tone="green" delay={180}>
          {icons.sun}
        </StatCard>
        <div className="adm-stat adm-rise adm-next" style={{ animationDelay: "240ms" }}>
          <div>
            <div className="adm-stat-label">Next session</div>
            {next ? (
              <>
                <div className="adm-next-when">{untilLabel(next.at - now)}</div>
                <div className="adm-next-sub">
                  {next.b.user.displayName} · {formatTimeOfDay(next.b.startTime, "en")}
                </div>
              </>
            ) : (
              <div className="adm-next-sub">Nothing scheduled</div>
            )}
          </div>
        </div>
      </div>

      <h2 className="adm-h2 adm-rise" style={{ animationDelay: "280ms" }}>
        Pending requests <span className="adm-count">{pending.length}</span>
      </h2>
      {!loaded ? (
        <div className="adm-skel adm-skel-card" />
      ) : pending.length === 0 ? (
        <EmptyState title="Nothing waiting on you" hint="New booking requests appear here the moment they come in." />
      ) : (
        <div className="adm-list">
          {pending.map((b, i) => {
            const msLeft = new Date(b.holdExpiresAt).getTime() - now;
            const pct = Math.max(0, Math.min(100, (msLeft / APPROVAL_WINDOW_MS) * 100));
            const urgent = msLeft < 3 * 60_000;
            return (
              <article key={b.id} className={`adm-card adm-pending adm-rise${flashIds.has(b.id) ? " adm-flash" : ""}`} style={{ animationDelay: `${300 + i * 70}ms` }}>
                <div className="adm-avatar" style={{ background: avatarColor(b.user.displayName) }} aria-hidden="true">
                  {b.user.displayName.trim().charAt(0).toUpperCase() || "?"}
                </div>
                <div className="adm-card-body">
                  <div className="adm-card-top">
                    <b>{b.user.displayName}</b>
                    <span className="adm-chip soft">{b.sharedRealInfo ? "Real name" : "Nickname"}</span>
                  </div>
                  <div className="adm-when">{formatWhen(b.date, b.startTime)}</div>
                  <div className="adm-chips">
                    <span className="adm-chip">{b.duration} min</span>
                    <span className="adm-chip gold">₹{b.amountInr}</span>
                    <span className="adm-chip">{b.callMethod}</span>
                  </div>
                  <div className="adm-fine">
                    {b.user.email}
                    {b.user.phone ? ` · ${b.user.phone}` : ""}
                  </div>
                  {b.notes && <div className="adm-note">&ldquo;{b.notes}&rdquo;</div>}
                </div>
                <div className="adm-card-side">
                  <div className={`adm-timer${urgent ? " urgent" : ""}`}>
                    <span>Respond within</span>
                    <b>{minutesLeft(b.holdExpiresAt, now)}</b>
                  </div>
                  <div className="adm-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                    <i className={urgent ? "urgent" : ""} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="adm-actions">
                    <button className="adm-btn primary" disabled={actingOn === b.id} onClick={() => act(b.id, "approve")}>
                      Approve
                    </button>
                    <button className="adm-btn" disabled={actingOn === b.id} onClick={() => act(b.id, "decline")}>
                      Decline
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <h2 className="adm-h2 adm-rise" style={{ animationDelay: "340ms" }}>
        Upcoming confirmed sessions <span className="adm-count">{upcoming.length}</span>
      </h2>
      {!loaded ? (
        <div className="adm-skel adm-skel-card" />
      ) : upcoming.length === 0 ? (
        <EmptyState title="Nothing confirmed yet" hint="Approved and paid sessions will be listed here." />
      ) : (
        <div className="adm-list">
          {upcoming.map((b, i) => (
            <article key={b.id} className="adm-card adm-upcoming adm-rise" style={{ animationDelay: `${360 + i * 60}ms` }}>
              <div className="adm-avatar" style={{ background: avatarColor(b.user.displayName) }} aria-hidden="true">
                {b.user.displayName.trim().charAt(0).toUpperCase() || "?"}
              </div>
              <div className="adm-card-body">
                <div className="adm-card-top">
                  <b>{b.user.displayName}</b>
                  <span className="adm-chip soft">code {b.callCode}</span>
                </div>
                <div className="adm-when">{formatWhen(b.date, b.startTime)}</div>
                <div className="adm-chips">
                  <span className="adm-chip">{b.duration} min</span>
                  <span className="adm-chip">{b.callMethod}</span>
                </div>
              </div>
              <div className="adm-actions end">
                {b.callMethod === "JUM" && (
                  <>
                    <Link className="adm-btn primary" href={`/admin/call/${b.id}`}>
                      Join Call
                    </Link>
                    <button className="adm-btn" disabled={actingOn === b.id || callbackSent[b.id]} onClick={() => sendCallback(b.id)}>
                      {callbackSent[b.id] ? "Callback sent" : "Send Callback"}
                    </button>
                  </>
                )}
                <button className="adm-btn danger" disabled={actingOn === b.id} onClick={() => cancelSession(b.id)}>
                  Cancel
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
