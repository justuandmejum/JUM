"use client";

import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "../../lib/i18n/LanguageProvider";

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer>
      <div className="wrap footer-grid">
        <div>
          <div className="brand">
            <Image className="logo-mark" src="/images/jum-logo.png" alt="JUM — Just U And Me" width={1816} height={1500} />
            <div>
              <small className="brandtag">{t("brandtag")}</small>
              <span className="brand-tagline">{t("hero.tagline")}</span>
            </div>
          </div>
          <p className="fine">{t("footer.tag")}</p>
        </div>
        <div>
          <div className="foot-title">{t("footer.quickLinks")}</div>
          <div className="footlinks">
            <Link href="/">{t("nav.home")}</Link>
            <Link href="/#how">{t("nav.how")}</Link>
            <Link href="/#what">{t("what.eyebrow")}</Link>
            <Link href="/book">{t("nav.book")}</Link>
          </div>
        </div>
        <div>
          <div className="foot-title">{t("footer.policies")}</div>
          <div className="footlinks">
            <Link className="legallink" href="/legal/terms">
              {t("footer.terms")}
            </Link>
            <Link className="legallink" href="/legal/privacy">
              {t("footer.privacy")}
            </Link>
            <Link className="legallink" href="/legal/disclaimer">
              {t("footer.disclaimer")}
            </Link>
            <Link className="legallink" href="/legal/refund">
              {t("footer.refund")}
            </Link>
          </div>
          <p className="fine">hello@justuandme.in</p>
        </div>
      </div>
      <div className="wrap" style={{ borderTop: "1px solid #ffffff18", marginTop: 30, paddingTop: 18 }}>
        <p className="fine">{t("footer.disclaimerLine")}</p>
        <p className="fine">{t("footer.copyright")}</p>
      </div>
    </footer>
  );
}
