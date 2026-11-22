import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en from "./en";
import ha from "./ha";

/**
 * Tiny translation layer. English is the source of truth; any key missing from Hausa
 * falls back to the English text (never to a blank or the raw key), so a partly translated
 * screen stays readable. `coverage()` reports how much of the dictionary Hausa covers.
 */
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ha", label: "Hausa" },
];
const DICTS = { en, ha };
const KEY = "cc_lang";

const I18nContext = createContext(null);

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { const s = localStorage.getItem(KEY); return DICTS[s] ? s : "en"; } catch { return "en"; }
  });

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = useCallback((code) => {
    if (!DICTS[code]) return;
    setLangState(code);
    try { localStorage.setItem(KEY, code); } catch { /* private mode */ }
  }, []);

  const t = useCallback((key, vars) => {
    const raw = DICTS[lang][key] ?? en[key];
    if (raw === undefined) return key;
    return interpolate(raw, vars);
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** { total, translated, missing[] } for a language - used by the coverage test. */
export function coverage(code) {
  const keys = Object.keys(en);
  const missing = keys.filter((k) => DICTS[code][k] === undefined);
  return { total: keys.length, translated: keys.length - missing.length, missing };
}
