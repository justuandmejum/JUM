"use client";

import { useState } from "react";
import Link from "next/link";
import { Header } from "../../../components/Header";
import { Footer } from "../../../components/Footer";
import { useLanguage } from "../../../../lib/i18n/LanguageProvider";
import { useBookingStatus } from "../../../../lib/i18n/useBookingStatus";
import { formatFullDateLabel, formatTimeOfDay } from "../../../../lib/i18n/bookingFormat";

interface CancelResult {
  refundPercent: number;
  refundedInr: number;
}

export function ConfirmedPageClient({ bookingId }: { bookingId: string }) {
  const { t, lang } = useLanguage();
  const { booking, error } = useBookingStatus(bookingId, 8000);

  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelResult, setCancelResult] = useState<CancelResult | null>(null);

  async function handleCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setCancelError(data.error ?? t("cancel.error"));
        return;
      }
      setCancelResult({ refundPercent: data.refundPercent, refundedInr: data.refundedInr });
      setConfirming(false);
    } catch {
      setCancelError(t("cancel.error"));
    } finally {
      setCancelling(false);
    }
  }

  const isConfirmed = booking?.bookingStatus === "CONFIRMED";
  const isCancelled = booking?.bookingStatus === "CUSTOMER_CANCELLED" || cancelResult !== null;

  return (
    <>
      <Header />
      <section>
        <div className="wrap center">
          <div className="eyebrow">{t("sent.eyebrow")}</div>
          <h2>{t("sent.h2")}</h2>
          {error && <p className="lead">{error}</p>}
          {booking && booking.bookingStatus !== "CONFIRMED" && !isCancelled && <p className="lead">Still finalizing your payment — this updates automatically.</p>}
          {booking && (
            <p className="lead">
              {t("form.selectedPrefix")}
              {formatFullDateLabel(new Date(booking.date), lang)}
              {t("form.selectedAt")}
              {formatTimeOfDay(booking.startTime, lang)}
            </p>
          )}
          <div className="panel" style={{ maxWidth: 420, textAlign: "center", margin: "22px auto" }}>
            <p className="fine" style={{ margin: "0 0 8px" }}>
              {t("sent.callCodeLabel")}
            </p>
            <p style={{ font: "700 28px 'Fraunces',Georgia,serif", color: "#102f5c", letterSpacing: 2, margin: 0 }}>
              {booking?.callCode ?? "…"}
            </p>
            <p className="fine" style={{ margin: "8px 0 0" }}>
              {t("sent.callCodeNote")}
            </p>
          </div>
          <div className="panel">
            <h3>{t("sent.flowTitle")}</h3>
            <p>{t("sent.flow")}</p>
          </div>

          {isConfirmed && !isCancelled && (
            <div className="panel" style={{ maxWidth: 480, margin: "22px auto" }}>
              {!confirming ? (
                <button className="btn" onClick={() => setConfirming(true)}>
                  {t("cancel.button")}
                </button>
              ) : (
                <div>
                  <p style={{ margin: "0 0 12px" }}>{t("cancel.confirmPrompt")}</p>
                  <p className="fine" style={{ margin: "0 0 14px" }}>
                    <Link className="legallink" href="/legal/refund" target="_blank" rel="noopener noreferrer">
                      {t("footer.refund")}
                    </Link>
                  </p>
                  {cancelError && (
                    <p className="note" style={{ border: "1.5px solid #b03a2e", color: "#8a2f2f", background: "#fbecec" }}>
                      {cancelError}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                    <button className="btn primary" disabled={cancelling} onClick={handleCancel}>
                      {cancelling ? "…" : t("cancel.confirmYes")}
                    </button>
                    <button className="btn" disabled={cancelling} onClick={() => setConfirming(false)}>
                      {t("cancel.confirmNo")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isCancelled && (
            <div className="panel" style={{ maxWidth: 480, margin: "22px auto" }}>
              <p style={{ margin: "0 0 8px", fontWeight: 700 }}>{t("cancel.success")}</p>
              {cancelResult && (
                <p className="fine">
                  {cancelResult.refundPercent > 0
                    ? t("cancel.refundInfo").replace("{amount}", String(cancelResult.refundedInr)).replace("{percent}", String(cancelResult.refundPercent))
                    : t("cancel.noRefund")}
                </p>
              )}
            </div>
          )}
        </div>
      </section>
      <Footer />
    </>
  );
}
