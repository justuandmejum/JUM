"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DailyCall } from "@daily-co/daily-js";
import { useAdminAuth } from "../../../../lib/useAdminAuth";

interface CallStatus {
  bookingStatus: string;
  callMethod: string;
  sessionStatus: string | null;
  extensionMinutes: number;
  joinOpensAtMs: number;
  endsAtMs: number;
}

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function AdminCallPageClient({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const { csrfToken, checkedAuth } = useAdminAuth();

  const [status, setStatus] = useState<CallStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "joining" | "in-call">("loading");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const containerRef = useRef<HTMLDivElement>(null);
  const callFrameRef = useRef<DailyCall | null>(null);
  const endingRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/call/status`);
      const data = await res.json();
      if (!res.ok) {
        setStatusError(data.error ?? "Could not load this session.");
        return;
      }
      setStatus(data);
      setStatusError(null);
    } catch {
      setStatusError("Could not load this session.");
    }
  }, [bookingId]);

  useEffect(() => {
    if (!checkedAuth) return;
    fetchStatus();
    const interval = setInterval(fetchStatus, phase === "in-call" ? 15000 : 5000);
    return () => clearInterval(interval);
  }, [checkedAuth, fetchStatus, phase]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const endCallSession = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    try {
      await fetch(`/api/bookings/${bookingId}/call/end`, { method: "POST" });
    } catch {
      // best-effort
    }
    router.push("/admin");
  }, [bookingId, router]);

  const handleJoin = useCallback(async () => {
    setPhase("joining");
    setJoinError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/call/host-join`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken ?? "" },
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.error ?? "Could not join the call.");
        setPhase("ready");
        return;
      }

      const Daily = (await import("@daily-co/daily-js")).default;
      const frame = Daily.createFrame(containerRef.current!, {
        showLeaveButton: true,
        iframeStyle: { width: "100%", height: "480px", border: "0", borderRadius: "18px" },
      });
      callFrameRef.current = frame;
      frame.on("left-meeting", () => endCallSession());
      frame.on("error", () => endCallSession());

      await frame.join({ url: data.url, token: data.token });
      setPhase("in-call");
    } catch {
      setJoinError("Could not join the call.");
      setPhase("ready");
    }
  }, [bookingId, csrfToken, endCallSession]);

  useEffect(() => {
    if (phase !== "in-call" || !status) return;
    if (now >= status.endsAtMs) callFrameRef.current?.leave();
  }, [phase, status, now]);

  useEffect(() => {
    return () => {
      callFrameRef.current?.destroy();
    };
  }, []);

  if (!checkedAuth) {
    return (
      <section>
        <div className="wrap center">…</div>
      </section>
    );
  }

  const remainingMs = status ? status.endsAtMs - now : 0;

  return (
    <section>
      <div className="wrap">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="eyebrow">JUM Admin</div>
            <h2 style={{ margin: "4px 0" }}>Call</h2>
          </div>
          <Link className="btn" href="/admin">
            Back to Dashboard
          </Link>
        </div>

        {statusError && (
          <p className="note" style={{ border: "1.5px solid #b03a2e", color: "#8a2f2f", background: "#fbecec" }}>
            {statusError}
          </p>
        )}

        {status && status.callMethod !== "JUM" && <p className="lead">This booking uses {status.callMethod}, not JUM calling — nothing to join here.</p>}

        {status && status.callMethod === "JUM" && status.bookingStatus !== "CONFIRMED" && <p className="lead">This booking is {status.bookingStatus}, not CONFIRMED.</p>}

        {status && status.callMethod === "JUM" && status.bookingStatus === "CONFIRMED" && now < status.joinOpensAtMs && (
          <p className="lead">Joining opens 10 minutes before the scheduled start.</p>
        )}

        {status && status.callMethod === "JUM" && status.bookingStatus === "CONFIRMED" && now >= status.joinOpensAtMs && (
          <>
            {phase !== "in-call" && (
              <div className="panel callpanel" style={{ maxWidth: 480, margin: "22px 0" }}>
                {joinError && (
                  <p className="note" style={{ border: "1.5px solid #b03a2e", color: "#8a2f2f", background: "#fbecec" }}>
                    {joinError}
                  </p>
                )}
                <button className="btn primary" style={{ width: "100%" }} disabled={phase === "joining"} onClick={handleJoin}>
                  {phase === "joining" ? "Joining…" : "Join Call"}
                </button>
              </div>
            )}

            <div ref={containerRef} style={{ display: phase === "in-call" ? "block" : "none", marginTop: 18, maxWidth: 640 }} />

            {phase === "in-call" && (
              <div className="panel callpanel" style={{ maxWidth: 480 }}>
                <div className="timerwrap">
                  <div className="timer">{formatRemaining(remainingMs)}</div>
                  <div className="timerlabel">Time remaining</div>
                </div>
                <div className="callend">
                  <button type="button" className="btn" onClick={() => callFrameRef.current?.leave()}>
                    End Call
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
