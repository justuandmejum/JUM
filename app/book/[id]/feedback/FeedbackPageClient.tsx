"use client";

import { useState } from "react";
import Script from "next/script";
import { Header } from "../../../components/Header";
import { Footer } from "../../../components/Footer";
import { useLanguage } from "../../../../lib/i18n/LanguageProvider";
import { useBookingStatus } from "../../../../lib/i18n/useBookingStatus";
import "../../../../lib/razorpayCheckout";

const MAX_COMMENT_LEN = 2000;

export function FeedbackPageClient({ bookingId }: { bookingId: string }) {
  const { t } = useLanguage();
  const { booking } = useBookingStatus(bookingId, 15000);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [donationAmount, setDonationAmount] = useState("");
  const [donating, setDonating] = useState(false);
  const [donationError, setDonationError] = useState<string | null>(null);
  const [donated, setDonated] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);

  async function submitFeedback() {
    if (rating < 1) {
      setSubmitError(t("feedback.ratingRequired"));
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      if (res.status === 409) {
        // Already submitted (the only other 409 case — not COMPLETED — is
        // already ruled out by the gate below before this form renders).
        setSubmitted(true);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? t("feedback.submitError"));
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError(t("feedback.submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  function payDonation() {
    const amountInr = Math.floor(Number(donationAmount));
    if (!amountInr || amountInr < 1) {
      setDonationError(t("feedback.tipAlertAmount"));
      return;
    }
    if (!window.Razorpay) return;
    setDonating(true);
    setDonationError(null);

    fetch(`/api/bookings/${bookingId}/donation/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountInr }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setDonationError(data.error ?? t("feedback.donationError"));
          setDonating(false);
          return;
        }
        const rzp = new window.Razorpay({
          key: data.keyId,
          amount: data.amountInPaise,
          currency: data.currency,
          name: "JUM — Just U And Me",
          description: t("feedback.tipTitle"),
          order_id: data.orderId,
          handler: async (response) => {
            try {
              const verifyRes = await fetch(`/api/bookings/${bookingId}/donation/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(response),
              });
              const verifyData = await verifyRes.json();
              if (!verifyRes.ok) {
                setDonationError(verifyData.error ?? t("feedback.donationError"));
                return;
              }
              setDonated(true);
            } catch {
              setDonationError(t("feedback.donationError"));
            } finally {
              setDonating(false);
            }
          },
          modal: { ondismiss: () => setDonating(false) },
          theme: { color: "#102f5c" },
        });
        rzp.open();
      })
      .catch(() => {
        setDonationError(t("feedback.donationError"));
        setDonating(false);
      });
  }

  if (booking && booking.bookingStatus !== "COMPLETED") {
    return (
      <>
        <Header />
        <section>
          <div className="wrap center">
            <div className="eyebrow">{t("feedback.eyebrow")}</div>
            <p className="lead">{t("feedback.notReady")}</p>
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
        <div className="wrap center">
          <div className="eyebrow">{t("feedback.eyebrow")}</div>
          <h2>{t("feedback.h2")}</h2>
          <p className="lead">{t("feedback.lead")}</p>

          <div className="panel">
            {submitted ? (
              <p style={{ margin: 0, fontWeight: 700 }}>{t("feedback.thanks")}</p>
            ) : (
              <>
                <div className="stars">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setRating(n)} aria-label={String(n)}>
                      {n <= rating ? "★" : "☆"}
                    </button>
                  ))}
                </div>
                <textarea
                  className="field"
                  rows={6}
                  maxLength={MAX_COMMENT_LEN}
                  placeholder={t("feedback.placeholder")}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <br />
                {submitError && (
                  <p className="note" style={{ border: "1.5px solid #b03a2e", color: "#8a2f2f", background: "#fbecec" }}>
                    {submitError}
                  </p>
                )}
                <button className="btn primary" disabled={submitting} onClick={submitFeedback}>
                  {submitting ? "…" : t("feedback.submit")}
                </button>
              </>
            )}
          </div>

          <div className="panel">
            {donated ? (
              <p className="note">{t("feedback.tipThanks")}</p>
            ) : (
              <>
                <h3>{t("feedback.tipTitle")}</h3>
                <p className="mindur">{t("feedback.tipHint")}</p>
                <label>
                  <span>{t("feedback.tipAmountLabel")}</span>
                  <input
                    className="field"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="e.g. 100"
                    value={donationAmount}
                    onChange={(e) => setDonationAmount(e.target.value)}
                  />
                </label>
                {donationError && (
                  <p className="note" style={{ border: "1.5px solid #b03a2e", color: "#8a2f2f", background: "#fbecec" }}>
                    {donationError}
                  </p>
                )}
                <button
                  type="button"
                  className="btn primary"
                  style={{ marginTop: 14, width: "100%" }}
                  disabled={donating || !scriptReady}
                  onClick={payDonation}
                >
                  {donating ? "…" : t("feedback.tipPayNow")}
                </button>
              </>
            )}
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
