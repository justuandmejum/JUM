"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { useLanguage } from "../../lib/i18n/LanguageProvider";
import { buildFourteenDays, formatDayLabel, formatFullDateLabel, formatTimeOfDay, type CalendarDay } from "../../lib/i18n/bookingFormat";
import { DURATION_PRICING_INR } from "../../lib/pricing";
import { legalLinksToRealRoutes } from "../../lib/i18n/richText";
import { CallMethod } from "../../app/generated/prisma/enums";

const DURATIONS = Object.keys(DURATION_PRICING_INR).map(Number).sort((a, b) => a - b);

const CALL_METHODS: { value: CallMethod; icon: string; iconClass: string; labelKey?: string; label?: string }[] = [
  { value: CallMethod.JUM, icon: "jum", iconClass: "jum", labelKey: "form.callingJUM" },
  { value: CallMethod.GOOGLE_MEET, icon: "G", iconClass: "meet", label: "Google Meet" },
  { value: CallMethod.ZOOM, icon: "Z", iconClass: "zoom", label: "Zoom" },
  { value: CallMethod.TEAMS, icon: "T", iconClass: "teams", label: "Microsoft Teams" },
];

export default function BookPage() {
  const { t, lang } = useLanguage();
  const router = useRouter();

  const days = useMemo(() => buildFourteenDays(), []);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  const [availableTimes, setAvailableTimes] = useState<number[] | null>(null);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);

  const [sharePreference, setSharePreference] = useState<"anonymous" | "open">("anonymous");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [callMethod, setCallMethod] = useState<CallMethod | "">("");
  const [notes, setNotes] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Refetch available start times whenever date or duration changes.
  useEffect(() => {
    if (!selectedDay || !duration) {
      setAvailableTimes(null);
      return;
    }
    let cancelled = false;
    setLoadingTimes(true);
    setStartTime(null);
    fetch(`/api/availability?date=${selectedDay.dateStr}&duration=${duration}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setAvailableTimes(data.availableStartTimes ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoadingTimes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDay, duration]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!selectedDay || !duration || startTime === null) {
      setFormError(t("form.alertDateTime"));
      return;
    }
    if (!callMethod) {
      setFormError(t("form.alertCalling"));
      return;
    }
    if (!displayName.trim() || !email.trim()) {
      setFormError(t("form.alertDateTime"));
      return;
    }
    if (!ageConfirmed || !agreeTerms) {
      setFormError(t("form.alertDateTime"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          date: selectedDay.dateStr,
          startTime,
          duration,
          callMethod,
          sharedRealInfo: sharePreference === "open",
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Something went wrong. Please try again.");
        if (res.status === 409) {
          // Slot was taken between selection and submit — refresh times.
          setStartTime(null);
          setAvailableTimes((prev) => (prev ?? []).filter((t) => t !== startTime));
        }
        return;
      }
      router.push(`/book/${data.booking.id}/waiting`);
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Header />
      <section>
        <div className="wrap" style={{ maxWidth: 860 }}>
          <div className="center">
            <div className="eyebrow">{t("booking.eyebrow")}</div>
            <h2>{t("booking.h2")}</h2>
            <p className="lead">{t("booking.lead")}</p>
          </div>

          <div className="panel">
            <div className="tzbadge">{t("booking.timezone")}</div>

            <h3>{t("booking.step1")}</h3>
            <div className="calendar">
              {days.map((day, i) => {
                const label = formatDayLabel(day.date, lang);
                const active = selectedDay?.dateStr === day.dateStr;
                return (
                  <button
                    key={day.dateStr}
                    type="button"
                    className={active ? "active" : ""}
                    onClick={() => setSelectedDay(day)}
                  >
                    <b>{label.weekday}</b>
                    <br />
                    {label.day} {label.month}
                  </button>
                );
              })}
            </div>

            <h3>{t("booking.step2b")}</h3>
            <p className="mindur">{t("booking.durationHint")}</p>
            <div className="durations">
              {DURATIONS.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  className={`duropt ${duration === mins ? "active" : ""}`}
                  onClick={() => setDuration(mins)}
                >
                  <b>{t(`dur.${mins}`)}</b>
                  <span>₹{DURATION_PRICING_INR[mins]}</span>
                </button>
              ))}
            </div>

            <h3>{t("booking.step2")}</h3>
            <p className="mindur">{t("booking.minDuration")}</p>
            <div className="times">
              {!selectedDay || !duration ? (
                <span>{t("booking.selectDateFirst")}</span>
              ) : loadingTimes ? (
                <span className="skeleton" style={{ display: "inline-block", width: 120, height: 20 }} />
              ) : availableTimes && availableTimes.length > 0 ? (
                availableTimes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={startTime === m ? "active" : ""}
                    onClick={() => setStartTime(m)}
                  >
                    {formatTimeOfDay(m, lang)}
                  </button>
                ))
              ) : (
                <span>{t("declined.lead")}</span>
              )}
            </div>

            {selectedDay && startTime !== null && duration && (
              <p style={{ color: "#3f4c5e", fontWeight: 600 }}>
                {t("form.selectedPrefix")}
                {formatFullDateLabel(selectedDay.date, lang)}
                {t("form.selectedAt")}
                {formatTimeOfDay(startTime, lang)} · {t(`dur.${duration}`)}
              </p>
            )}

            <h3>{t("booking.step3")}</h3>
            <form className="formrow" onSubmit={handleSubmit}>
              <label>
                {t("form.privacyChoice")}
                <div className="callopts" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 6 }}>
                  <button
                    type="button"
                    className={`callopt jumopt ${sharePreference === "anonymous" ? "active" : ""}`}
                    style={{ justifyContent: "center" }}
                    onClick={() => setSharePreference("anonymous")}
                  >
                    <span>{t("form.stayAnon")}</span>
                  </button>
                  <button
                    type="button"
                    className={`callopt ${sharePreference === "open" ? "active" : ""}`}
                    style={{ justifyContent: "center" }}
                    onClick={() => setSharePreference("open")}
                  >
                    <span>{t("form.shareOpen")}</span>
                  </button>
                </div>
              </label>

              <label>
                <span>{sharePreference === "open" ? t("form.nameOpen") : t("form.nickname")}</span>
                <input className="field" required maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                <span className="anonnote">{sharePreference === "open" ? t("form.openNote") : t("form.anonNote")}</span>
              </label>

              <label>
                <span>{t("form.email")}</span>
                <input className="field" type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>

              <label>
                <span>{t("form.phone")}</span>
                <input className="field" type="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>

              <label>{t("form.calling")}</label>
              <div className="callopts callopts4">
                {CALL_METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    className={`callopt ${m.value === CallMethod.JUM ? "jumopt" : ""} ${callMethod === m.value ? "active" : ""}`}
                    onClick={() => setCallMethod(m.value)}
                  >
                    <span className={`callicon ${m.iconClass}`}>{m.icon === "jum" ? "" : m.icon}</span>
                    <span>{m.labelKey ? t(m.labelKey) : m.label}</span>
                  </button>
                ))}
              </div>
              <p className="anonnote">{t("form.callingNote")}</p>

              <label>
                <span>{t("form.notes")}</span>
                <textarea className="field" rows={4} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>

              <label>
                <input type="checkbox" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)} /> <span>{t("form.age")}</span>
              </label>
              <label>
                <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />{" "}
                <span dangerouslySetInnerHTML={{ __html: legalLinksToRealRoutes(t("form.agreeHtml")) }} />
              </label>

              {formError && <p className="note" style={{ border: "1.5px solid #b03a2e", color: "#8a2f2f", background: "#fbecec" }}>{formError}</p>}

              <button className="btn primary" type="submit" disabled={submitting}>
                {submitting ? "…" : t("form.submit")}
              </button>
            </form>
            <div className="note">{t("confirm.notifyNote")}</div>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
