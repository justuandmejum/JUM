"use client";

import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";
import { useLanguage } from "../../../lib/i18n/LanguageProvider";
import { legalLinksToRealRoutes } from "../../../lib/i18n/richText";
import type { LegalSlug } from "./page";

export function LegalPageClient({ slug }: { slug: LegalSlug }) {
  const { t, legal } = useLanguage();
  const doc = legal[slug];

  return (
    <>
      <Header />
      <section className="legal">
        <div className="wrap" style={{ maxWidth: 850, margin: "40px auto" }}>
          <h1>{doc.title}</h1>
          <p className="note">
            <strong>{t("legal.important")}</strong> {t("legal.importantText")}
          </p>
          <div dangerouslySetInnerHTML={{ __html: legalLinksToRealRoutes(doc.body) }} />
        </div>
      </section>
      <Footer />
    </>
  );
}
