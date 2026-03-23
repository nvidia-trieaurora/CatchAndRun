import { en, type TranslationKey } from "./en";
import { vi } from "./vi";

export type Language = "en" | "vi";

const translations: Record<Language, Record<TranslationKey, string>> = { en, vi };

const STORAGE_KEY = "catchandrun_language";

let currentLang: Language = (localStorage.getItem(STORAGE_KEY) as Language) || "en";

const listeners: (() => void)[] = [];

export function t(key: TranslationKey): string {
  return translations[currentLang][key] ?? translations.en[key] ?? key;
}

export function getLang(): Language {
  return currentLang;
}

export function setLang(lang: Language) {
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  for (const fn of listeners) fn();
}

export function onLangChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}
