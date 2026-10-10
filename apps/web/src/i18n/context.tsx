import React, { createContext, useContext, useEffect, useState } from "react";
import { en } from "./en.js";
import type { Language, Translations } from "./types.js";
import { zh } from "./zh.js";

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: Translations;
}

const dictionaries: Record<Language, Translations> = { en, zh };

function detectInitialLanguage(): Language {
  // 1. URL query override (?lang=en / ?lang=zh)
  try {
    const search = new URLSearchParams(window.location.search);
    const param = search.get("lang")?.toLowerCase();
    if (param === "zh" || param === "en") return param;
  } catch {}

  // 2. Local storage preference
  try {
    const saved = localStorage.getItem("statedock_lang")?.toLowerCase();
    if (saved === "zh" || saved === "en") return saved as Language;
  } catch {}

  // 3. Browser locale check (if user's browser is Chinese, default to Chinese, otherwise English)
  try {
    const navLang = navigator.language?.toLowerCase() || "";
    if (navLang.startsWith("zh")) return "zh";
  } catch {}

  // 4. English by default for global audience
  return "en";
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(detectInitialLanguage);

  const setLang = (next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem("statedock_lang", next);
      document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
      document.title =
        next === "zh"
          ? "StateDock — 人和 AI 共享的 Todo"
          : "StateDock — A Shared Todo for Humans & Coding Agents";
    } catch {}
  };

  const toggleLang = () => {
    setLang(lang === "en" ? "zh" : "en");
  };

  useEffect(() => {
    try {
      document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
      document.title =
        lang === "zh"
          ? "StateDock — 人和 AI 共享的 Todo"
          : "StateDock — A Shared Todo for Humans & Coding Agents";
    } catch {}
  }, [lang]);

  const value: I18nContextValue = {
    lang,
    setLang,
    toggleLang,
    t: dictionaries[lang],
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fallback if rendered outside provider
    return {
      lang: "en",
      setLang: () => {},
      toggleLang: () => {},
      t: en,
    };
  }
  return ctx;
}
