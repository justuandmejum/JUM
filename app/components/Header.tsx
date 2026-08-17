"use client";

import Image from "next/image";
import Link from "next/link";
import { useLanguage, type Lang } from "../../lib/i18n/LanguageProvider";

export function Header() {
  const { lang, setLang, t } = useLanguage();

  return (
    <header>
      <div className="wrap">
        <nav className="nav">
          <Link className="brand" href="/">
            <div className="brand-lockup">
              <Image className="logo-mark" src="/images/jum-logo.png" alt="JUM — Just U And Me" width={1816} height={1500} priority />
            </div>
            <span className="brand-tagline">{t("hero.tagline")}</span>
          </Link>
          <div className="links">
            <Link href="/">{t("nav.home")}</Link>
            <Link href="/#how">{t("nav.how")}</Link>
            <Link href="/#faq">{t("nav.faq")}</Link>
          </div>
          <div className="right-nav">
            <div className="langbox">
              <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label="Language">
                <option value="en">English</option>
                <option value="te">తెలుగు</option>
              </select>
            </div>
            <Link className="btn primary" href="/book">
              {t("nav.book")}
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
