"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import en from "./en.json";
import te from "./te.json";

export type Lang = "en" | "te";

// The dictionaries are structurally identical (extracted from the same
// source) except `legal`, which is nested — everything else is a flat
// string map matching the prototype's I18N[lang][key] convention.
const DICTS = { en, te } as const;

export type LegalDoc = { title: string; intro: string; body: string };
export type LegalDicts = { terms: LegalDoc; privacy: LegalDoc; disclaimer: LegalDoc; refund: LegalDoc };

const STORAGE_KEY = "jum-lang";

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
  legal: LegalDicts;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "te") setLangState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.body.classList.toggle("lang-te", lang === "te");
  }, [lang]);

  function setLang(next: Lang) {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  function t(key: string): string {
    const dict = DICTS[lang] as unknown as Record<string, string>;
    return dict[key] ?? key;
  }

  const legal = DICTS[lang].legal as LegalDicts;

  return <LanguageContext.Provider value={{ lang, setLang, t, legal }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
