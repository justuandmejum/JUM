"use client";

import Link from "next/link";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { useLanguage } from "../lib/i18n/LanguageProvider";

function BotanicalAccent({ className }: { className: string }) {
  return (
    <svg className={`botanical-accent ${className}`} viewBox="0 0 100 140" width="80" height="112" aria-hidden="true">
      <path d="M50,138 Q46,90 50,42" fill="none" stroke="#c9a24a" strokeWidth="2" opacity=".45" />
      <path d="M50,95 Q30,86 23,66" fill="none" stroke="#9bcbe0" strokeWidth="2" opacity=".4" />
      <ellipse cx="21" cy="62" rx="11" ry="5.5" fill="#9bcbe0" opacity=".3" transform="rotate(-32 21 62)" />
      <path d="M50,72 Q70,63 78,44" fill="none" stroke="#c9a24a" strokeWidth="2" opacity=".4" />
      <ellipse cx="80" cy="41" rx="11" ry="5.5" fill="#c9a24a" opacity=".28" transform="rotate(28 80 41)" />
      <circle cx="50" cy="40" r="7" fill="#c9a24a" opacity=".3" />
      <circle cx="50" cy="40" r="3" fill="#fdf6ea" opacity=".45" />
    </svg>
  );
}

export default function Home() {
  const { t } = useLanguage();

  return (
    <>
      <Header />

      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <div className="eyebrow">{t("hero.eyebrow")}</div>
            <h1>{t("hero.h1")}</h1>
            <div className="hero-tagline">{t("hero.tagline")}</div>
            <p>{t("hero.p")}</p>
            <div className="actions">
              <Link className="btn primary" href="/book">
                {t("hero.cta1")}
              </Link>
              <Link className="btn" href="/#what">
                {t("hero.cta2")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="what">
        <div className="wrap center">
          <BotanicalAccent className="tl" />
          <div className="eyebrow">{t("what.eyebrow")}</div>
          <h2>{t("what.h2")}</h2>
          <p className="lead">{t("what.lead")}</p>
          <div className="cards">
            {[1, 2, 3, 4, 5].map((n) => (
              <div className="card" key={n}>
                <h3>{t(`card${n}.h`)}</h3>
                <p>{t(`card${n}.p`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="conversation">
        <div className="wrap center">
          <div className="eyebrow">{t("conv.eyebrow")}</div>
          <h2>{t("conv.h2")}</h2>
          <p className="quote">{t("conv.quote")}</p>
          <div className="topics">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <span className="topic" key={n}>
                {t(`topic${n}`)}
              </span>
            ))}
          </div>
          <p className="lead" style={{ marginTop: 19 }}>
            {t("conv.lead2")}
          </p>
        </div>
      </section>

      <section className="boundary">
        <div className="wrap">
          <BotanicalAccent className="br" />
          <div className="boundary-grid">
            <div>
              <div className="eyebrow">{t("boundary.eyebrow")}</div>
              <h2 style={{ font: "600 38px 'Fraunces',Georgia,serif" }}>{t("boundary.h2")}</h2>
              <p style={{ color: "#43566f" }}>{t("boundary.p")}</p>
            </div>
            <div className="not">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div className="not-item" key={n}>
                  {t(`not${n}`)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="dark">
        <div className="wrap center">
          <div className="eyebrow" style={{ color: "#d9b56a" }}>
            {t("how.eyebrow")}
          </div>
          <h2>{t("how.h2")}</h2>
          <div className="steps">
            {[1, 2, 3, 4].map((n) => (
              <div className="step" key={n}>
                <div className="num">{String(n).padStart(2, "0")}</div>
                <h3>{t(`step${n}.h`)}</h3>
                <p>{t(`step${n}.p`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="device">
        <div className="wrap center">
          <div className="eyebrow">{t("device.eyebrow")}</div>
          <h2>{t("device.h2")}</h2>
          <p className="lead">{t("device.lead")}</p>
          <div className="device-box" style={{ marginTop: 28, textAlign: "left" }}>
            <div className="device-card">
              <div className="device-icon">
                <svg viewBox="0 0 100 92" width="76" height="70" style={{ display: "block" }} aria-hidden="true">
                  <path d="M12,48 A38,38 0 0 1 88,48" fill="none" stroke="#102f5c" strokeWidth="6" strokeLinecap="round" />
                  <rect x="4" y="42" width="16" height="30" rx="8" fill="#102f5c" />
                  <rect x="80" y="42" width="16" height="30" rx="8" fill="#c9a24a" />
                  <path d="M88,66 Q90,82 72,82" fill="none" stroke="#c9a24a" strokeWidth="4" strokeLinecap="round" />
                  <circle cx="72" cy="82" r="4.5" fill="#c9a24a" />
                </svg>
              </div>
              <h3 style={{ font: "600 26px 'Fraunces',Georgia,serif" }}>{t("device.card.h")}</h3>
              <p style={{ color: "#3f4c5e", fontWeight: 500 }}>{t("device.card.p")}</p>
              <div className="callopts callopts4" style={{ marginTop: 16 }}>
                <div className="callopt jumopt" style={{ cursor: "default" }}>
                  <span className="callicon jum">
                    <svg viewBox="0 0 60 66" width="16" height="18">
                      <path d="M5,0 L5,40 C5,56 14,66 30,66 L30,54 C22,54 17,48 17,38 L17,0 Z" fill="#fff" />
                      <path d="M55,0 L55,40 C55,56 46,66 30,66 L30,54 C38,54 43,48 43,38 L43,0 Z" fill="#e8cf9a" />
                    </svg>
                  </span>
                  <span>{t("form.callingJUM")}</span>
                </div>
                <div className="callopt" style={{ cursor: "default" }}>
                  <span className="callicon meet">G</span>
                  <span>Google Meet</span>
                </div>
                <div className="callopt" style={{ cursor: "default" }}>
                  <span className="callicon zoom">Z</span>
                  <span>Zoom</span>
                </div>
                <div className="callopt" style={{ cursor: "default" }}>
                  <span className="callicon teams">T</span>
                  <span>Microsoft Teams</span>
                </div>
              </div>
            </div>
            <div className="device-list">
              <div>{t("device.list1")}</div>
              <div>{t("device.list2")}</div>
              <div>{t("device.list3")}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="comingsoon">
        <div className="wrap center">
          <BotanicalAccent className="tr" />
          <div className="eyebrow">{t("soon.eyebrow")}</div>
          <h2>{t("soon.h2")}</h2>
          <p className="lead">{t("soon.lead")}</p>
          <div className="comingsoon-card">
            <div className="icon">
              <svg viewBox="0 0 220 140" width="170" height="108" aria-hidden="true">
                <path d="M18,124 Q60,100 96,66" fill="none" stroke="#102f5c" strokeWidth="24" strokeLinecap="round" />
                <path d="M202,124 Q160,100 124,66" fill="none" stroke="#c9a24a" strokeWidth="24" strokeLinecap="round" />
                <ellipse cx="96" cy="66" rx="20" ry="15" fill="#e8cf9a" transform="rotate(-18 96 66)" />
                <ellipse cx="124" cy="66" rx="20" ry="15" fill="#f3e6c8" transform="rotate(18 124 66)" />
              </svg>
            </div>
            <div>
              <span className="badge">{t("soon.badge")}</span>
              <p>{t("soon.body1")}</p>
              <p>{t("soon.body2")}</p>
              <details>
                <summary>{t("soon.moreInfo")}</summary>
                <ul className="details-list">
                  <li>{t("soon.price")}</li>
                  <li>{t("soon.duration")}</li>
                  <li>{t("soon.notBookable")}</li>
                </ul>
              </details>
              <a className="btn primary" style={{ marginTop: 20, display: "inline-flex" }} href="mailto:hello@justuandme.in">
                {t("soon.cta")}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="faq">
        <div className="wrap center">
          <div className="eyebrow">{t("faq.eyebrow")}</div>
          <h2>{t("faq.h2")}</h2>
          <div className="faq">
            {[1, 2, 3, 4, 5].map((n) => (
              <details key={n}>
                <summary>{t(`faq${n}.q`)}</summary>
                <p>{t(`faq${n}.a`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="wrap center">
          <div className="eyebrow">{t("hero.eyebrow")}</div>
          <h2>{t("cta.h2")}</h2>
          <p className="lead">{t("cta.lead")}</p>
          <div style={{ marginTop: 23 }}>
            <Link className="btn primary" href="/book">
              {t("hero.cta1")}
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
