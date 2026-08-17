"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "../../../components/Header";
import { Footer } from "../../../components/Footer";
import { useLanguage } from "../../../../lib/i18n/LanguageProvider";
import { useBookingStatus } from "../../../../lib/i18n/useBookingStatus";
import { formatFullDateLabel, formatTimeOfDay } from "../../../../lib/i18n/bookingFormat";

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function WaitingPageClient({ bookingId }: { bookingId: string }) {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const { booking, error } = useBookingStatus(bookingId);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!booking) return;
    if (booking.bookingStatus === "TEMPORARILY_HELD" || booking.bookingStatus === "PAYMENT_PENDING") {
      router.push(`/book/${bookingId}/pay`);
    } else if (booking.bookingStatus === "CONFIRMED") {
      router.push(`/book/${bookingId}/confirmed`);
    }
  }, [booking, bookingId, router]);

  if (error) {
    return (
      <>
        <Header />
        <section>
          <div className="wrap center" style={{ maxWidth: 640 }}>
            <h2>{error}</h2>
            <Link className="btn primary" href="/book">
              {t("declined.retry")}
            </Link>
          </div>
        </section>
        <Footer />
      </>
    );
  }

  if (booking?.bookingStatus === "BOOKING_FAILED") {
    return (
      <>
        <Header />
        <section>
          <div className="wrap center" style={{ maxWidth: 640 }}>
            <div className="eyebrow">{t("declined.eyebrow")}</div>
            <h2>{t("declined.h2")}</h2>
            <p className="lead">{t("declined.lead")}</p>
            <Link className="btn primary" href="/book">
              {t("declined.retry")}
            </Link>
          </div>
        </section>
        <Footer />
      </>
    );
  }

  const remainingMs = booking?.holdExpiresAt ? new Date(booking.holdExpiresAt).getTime() - now : null;

  return (
    <>
      <Header />
      <section>
        <div className="wrap center" style={{ maxWidth: 640 }}>
          <div className="eyebrow">{t("confirm.eyebrow")}</div>
          <h2>{t("confirm.h2")}</h2>
          {booking && (
            <p className="lead">
              {t("form.selectedPrefix")}
              {formatFullDateLabel(new Date(booking.date), lang)}
              {t("form.selectedAt")}
              {formatTimeOfDay(booking.startTime, lang)}
            </p>
          )}
          <div className="panel callpanel">
            <div className="timerwrap">
              <div className="timer">{remainingMs !== null ? formatCountdown(remainingMs) : "…"}</div>
              <div className="timerlabel">{t("confirm.timerLabel")}</div>
            </div>
            <p className="fine" style={{ textAlign: "center", margin: "10px 0 0" }}>
              {t("confirm.notifyNote")}
            </p>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
