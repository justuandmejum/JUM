"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import Link from "next/link";
import { Header } from "../../../components/Header";
import { Footer } from "../../../components/Footer";
import { useLanguage } from "../../../../lib/i18n/LanguageProvider";
import { useBookingStatus } from "../../../../lib/i18n/useBookingStatus";
import "../../../../lib/razorpayCheckout";

interface OrderInfo {
  orderId: string;
  amountInPaise: number;
  currency: string;
  keyId: string;
  holdExpiresAt: string;
}

export function PayPageClient({ bookingId }: { bookingId: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const { booking } = useBookingStatus(bookingId);

  const [scriptReady, setScriptReady] = useState(false);
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    if (booking?.bookingStatus === "CONFIRMED") {
      router.push(`/book/${bookingId}/confirmed`);
    }
  }, [booking, bookingId, router]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bookings/${bookingId}/payment/order`, { method: "POST" })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setOrderError(data.error ?? "Could not start payment.");
          return;
        }
        setOrder(data);
      })
      .catch(() => {
        if (!cancelled) setOrderError("Network error starting payment.");
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  function openCheckout() {
    if (!order || !window.Razorpay) return;
    setPayError(null);
    const rzp = new window.Razorpay({
      key: order.keyId,
      amount: order.amountInPaise,
      currency: order.currency,
      name: "JUM — Just U And Me",
      description: t("pay.eyebrow"),
      order_id: order.orderId,
      handler: async (response) => {
        setPaying(true);
        try {
          const res = await fetch(`/api/bookings/${bookingId}/payment/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });
          const data = await res.json();
          if (!res.ok) {
            setPayError(data.error ?? "Payment verification failed.");
            return;
          }
          router.push(`/book/${bookingId}/confirmed`);
        } catch {
          setPayError("Network error verifying payment. If money was deducted, contact hello@justuandme.in with your booking id.");
        } finally {
          setPaying(false);
        }
      },
      modal: {
        ondismiss: () => setPaying(false),
      },
      theme: { color: "#102f5c" },
    });
    rzp.open();
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

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" onLoad={() => setScriptReady(true)} />
      <Header />
      <section>
        <div className="wrap center" style={{ maxWidth: 640 }}>
          <div className="eyebrow">{t("pay.eyebrow")}</div>
          <h2>{t("pay.h2")}</h2>
          <div className="panel">
            <div className="payamount">
              <span>{t("pay.amountLabel")}</span>
              <b>{order ? `₹${order.amountInPaise / 100}` : "…"}</b>
            </div>

            {orderError && <p className="note" style={{ border: "1.5px solid #b03a2e", color: "#8a2f2f", background: "#fbecec" }}>{orderError}</p>}
            {payError && <p className="note" style={{ border: "1.5px solid #b03a2e", color: "#8a2f2f", background: "#fbecec" }}>{payError}</p>}

            <button className="btn primary" style={{ marginTop: 18, width: "100%" }} disabled={!order || !scriptReady || paying} onClick={openCheckout}>
              {paying ? "…" : t("pay.payButton")}
            </button>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
