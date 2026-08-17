"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import type { DailyCall } from "@daily-co/daily-js";
import { Header } from "../../../components/Header";
import { Footer } from "../../../components/Footer";
import { useLanguage } from "../../../../lib/i18n/LanguageProvider";
import "../../../../lib/razorpayCheckout";

interface CallStatus {
  bookingStatus: string;
  callMethod: string;
  sessionStatus: string | null;
  extensionMinutes: number;
  joinOpensAtMs: number;
  endsAtMs: number;
}

interface ExtensionOption {
  minutes: number;
  priceInr: number;
}

const EXTEND_PROMPT_MS = 5 * 60 * 1000; // matches the prototype's <=300s trigger
const STATUS_POLL_MS = 5000;
const STATUS_POLL_MS_IN_CALL = 15000; // still catches an extension paid from elsewhere, just less eagerly

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function CallPageClient({ bookingId }: { bookingId: string }) {
  const { t } = useLanguage();
  const router = useRouter();

  const [status, setStatus] = useState<CallStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "joining" | "in-call">("loading");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendOptions, setExtendOptions] = useState<ExtensionOption[] | null>(null);
  const [extendPending, setExtendPending] = useState<ExtensionOption | null>(null);
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const callFrameRef = useRef<DailyCall | null>(null);
  const endingRef = useRef(false); // guards against double-firing end-session on rapid leave/error events

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/call/status`);
      const data = await res.json();
      if (!res.ok) {
        setStatusError(data.error ?? t("call.loadError"));
        return;
      }
      setStatus(data);
      setStatusError(null);
    } catch {
      setStatusError(t("call.loadError"));
    }
  }, [bookingId, t]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, phase === "in-call" ? STATUS_POLL_MS_IN_CALL : STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchStatus, phase]);

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
      // best-effort — the call is over regardless from the customer's perspective
    }
    router.push(`/book/${bookingId}/feedback`);
  }, [bookingId, router]);

  const handleJoin = useCallback(async () => {
    setPhase("joining");
    setJoinError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/call/join`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.error ?? t("call.joinError"));
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
      setJoinError(t("call.joinError"));
      setPhase("ready");
    }
  }, [bookingId, endCallSession, t]);

  // Auto-end once the scheduled (+ any paid extension) time actually runs out.
  useEffect(() => {
    if (phase !== "in-call" || !status) return;
    if (now >= status.endsAtMs) {
      callFrameRef.current?.leave();
    }
  }, [phase, status, now]);

  useEffect(() => {
    return () => {
      callFrameRef.current?.destroy();
    };
  }, []);

  async function openExtend() {
    setExtendError(null);
    setExtendModalOpen(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/call/extension-options`);
      const data = await res.json();
      if (res.ok) setExtendOptions(data.options);
    } catch {
      setExtendOptions([]);
    }
  }

  function closeExtend() {
    setExtendModalOpen(false);
    setExtendPending(null);
  }

  function selectExtendOption(opt: ExtensionOption) {
    setExtendPending(opt);
    setExtendModalOpen(false);
  }

  function payForExtension() {
    if (!extendPending || !window.Razorpay) return;
    setExtending(true);
    setExtendError(null);

    fetch(`/api/bookings/${bookingId}/call/extension/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes: extendPending.minutes }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setExtendError(data.error ?? t("call.joinError"));
          setExtending(false);
          return;
        }
        const rzp = new window.Razorpay({
          key: data.keyId,
          amount: data.amountInPaise,
          currency: data.currency,
          name: "JUM — Just U And Me",
          description: t("call.extendTitle"),
          order_id: data.orderId,
          handler: async (response) => {
            try {
              const verifyRes = await fetch(`/api/bookings/${bookingId}/call/extension/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...response, minutes: extendPending.minutes }),
              });
              const verifyData = await verifyRes.json();
              if (!verifyRes.ok) {
                setExtendError(verifyData.error ?? t("call.joinError"));
                return;
              }
              await fetchStatus();
              setExtendPending(null);
            } catch {
              setExtendError(t("call.joinError"));
            } finally {
              setExtending(false);
            }
          },
          modal: { ondismiss: () => setExtending(false) },
          theme: { color: "#102f5c" },
        });
        rzp.open();
      })
      .catch(() => {
        setExtendError(t("call.joinError"));
        setExtending(false);
      });
  }

  const remainingMs = status ? status.endsAtMs - now : 0;
  const showExtendPrompt = phase === "in-call" && status && remainingMs > 0 && remainingMs <= EXTEND_PROMPT_MS;

  if (statusError) {
    return (
      <>
        <Header />
        <section>
          <div className="wrap center">
            <p className="lead">{statusError}</p>
          </div>
        </section>
        <Footer />
      </>
    );
  }

  if (!status) {
    return (
      <>
        <Header />
        <section>
          <div className="wrap center">
            <p className="lead">…</p>
          </div>
        </section>
        <Footer />
      </>
    );
  }

  if (status.callMethod !== "JUM") {
    return (
      <>
        <Header />
        <section>
          <div className="wrap center" style={{ maxWidth: 640 }}>
            <div className="eyebrow">{t("call.eyebrow")}</div>
            <p className="lead">{t("call.externalPlatform").replace("{platform}", status.callMethod)}</p>
          </div>
        </section>
        <Footer />
      </>
    );
  }

  if (status.bookingStatus !== "CONFIRMED") {
    return (
      <>
        <Header />
        <section>
          <div className="wrap center" style={{ maxWidth: 640 }}>
            <div className="eyebrow">{t("call.eyebrow")}</div>
            <p className="lead">{t("call.notConfirmedYet")}</p>
          </div>
        </section>
        <Footer />
      </>
    );
  }

  if (status.sessionStatus === "COMPLETED" || (phase !== "in-call" && now > status.endsAtMs)) {
    return (
      <>
        <Header />
        <section>
          <div className="wrap center" style={{ maxWidth: 640 }}>
            <div className="eyebrow">{t("call.eyebrow")}</div>
            <p className="lead">{t("call.ended")}</p>
          </div>
        </section>
        <Footer />
      </>
    );
  }

  if (now < status.joinOpensAtMs) {
    const mins = Math.ceil((status.joinOpensAtMs - now) / 60000);
    return (
      <>
        <Header />
        <section>
          <div className="wrap center" style={{ maxWidth: 640 }}>
            <div className="eyebrow">{t("call.eyebrow")}</div>
            <p className="lead">{t("call.opensIn").replace("{mins}", String(mins))}</p>
          </div>
        </section>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" onLoad={() => setScriptReady(true)} />
      <Header />
      <section>
        <div className="wrap center" style={{ maxWidth: 640 }}>
          <div className="eyebrow">{t("call.eyebrow")}</div>
          <h2>{t("call.h2")}</h2>

          {phase !== "in-call" && (
            <div className="panel callpanel">
              {joinError && (
                <p className="note" style={{ border: "1.5px solid #b03a2e", color: "#8a2f2f", background: "#fbecec" }}>
                  {joinError}
                </p>
              )}
              <button className="btn primary" style={{ width: "100%" }} disabled={phase === "joining"} onClick={handleJoin}>
                {phase === "joining" ? t("call.joining") : t("call.joinBtn")}
              </button>
            </div>
          )}

          <div ref={containerRef} style={{ display: phase === "in-call" ? "block" : "none", marginTop: 18 }} />

          {phase === "in-call" && (
            <div className="panel callpanel">
              <div className="timerwrap">
                <div className="timer">{formatRemaining(remainingMs)}</div>
                <div className="timerlabel">{t("call.timerLabel")}</div>
              </div>

              {showExtendPrompt && (
                <div className="extendprompt">
                  <span>{t("call.endingSoon")}</span>
                  <button type="button" className="btn primary" onClick={openExtend}>
                    {t("call.extendBtn")}
                  </button>
                </div>
              )}

              <div className="callend">
                <button type="button" className="btn" onClick={() => callFrameRef.current?.leave()}>
                  {t("call.endBtn")}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {extendModalOpen && (
        <div className="modalbg">
          <div className="modalbox">
            <h3>{t("call.extendTitle")}</h3>
            {extendOptions === null ? (
              <p className="fine">…</p>
            ) : extendOptions.length === 0 ? (
              <p className="fine">{t("call.noOptionsInWindow")}</p>
            ) : (
              <div className="durations" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
                {extendOptions.map((opt) => (
                  <button key={opt.minutes} type="button" className="duropt" onClick={() => selectExtendOption(opt)}>
                    <b>
                      {opt.minutes} {t("call.min")}
                    </b>
                    <span>₹{opt.priceInr}</span>
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="btn" style={{ marginTop: 16, width: "100%" }} onClick={closeExtend}>
              {t("call.cancel")}
            </button>
          </div>
        </div>
      )}

      {extendPending && (
        <div className="modalbg">
          <div className="modalbox">
            <h3>{t("call.payTitle")}</h3>
            <div className="payamount">
              <span>{t("pay.amountLabel")}</span>
              <b>₹{extendPending.priceInr}</b>
            </div>
            {extendError && (
              <p className="note" style={{ border: "1.5px solid #b03a2e", color: "#8a2f2f", background: "#fbecec" }}>
                {extendError}
              </p>
            )}
            <button
              type="button"
              className="btn primary"
              style={{ width: "100%" }}
              disabled={extending || !scriptReady}
              onClick={payForExtension}
            >
              {extending ? "…" : t("call.payConfirm")}
            </button>
            <button type="button" className="btn" style={{ marginTop: 10, width: "100%" }} disabled={extending} onClick={() => setExtendPending(null)}>
              {t("call.cancel")}
            </button>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}
