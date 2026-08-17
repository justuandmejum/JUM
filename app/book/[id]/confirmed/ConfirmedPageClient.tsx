"use client";

import { Header } from "../../../components/Header";
import { Footer } from "../../../components/Footer";
import { useLanguage } from "../../../../lib/i18n/LanguageProvider";
import { useBookingStatus } from "../../../../lib/i18n/useBookingStatus";
import { formatFullDateLabel, formatTimeOfDay } from "../../../../lib/i18n/bookingFormat";

export function ConfirmedPageClient({ bookingId }: { bookingId: string }) {
  const { t, lang } = useLanguage();
  const { booking, error } = useBookingStatus(bookingId, 8000);

  return (
    <>
      <Header />
      <section>
        <div className="wrap center">
          <div className="eyebrow">{t("sent.eyebrow")}</div>
          <h2>{t("sent.h2")}</h2>
          {error && <p className="lead">{error}</p>}
          {booking && booking.bookingStatus !== "CONFIRMED" && <p className="lead">Still finalizing your payment — this updates automatically.</p>}
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
        </div>
      </section>
      <Footer />
    </>
  );
}
