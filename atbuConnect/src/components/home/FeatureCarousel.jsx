import { useCallback, useEffect, useRef, useState } from 'react';
import Ic from '../Ic';
import { useI18n } from '../../i18n';

/** The floating feature carousel in the hero. Content = real, existing platform features. */
const FEATURES = [
  { key: "ask", icon: "msg", to: "feed" },
  { key: "verified", icon: "shield", to: "sug" },
  { key: "library", icon: "book", to: "media" },
  { key: "community", icon: "users", to: "feed" },
];
const AUTOPLAY_MS = 6000;

export default function FeatureCarousel({ onNav }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useRef(typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const root = useRef(null);

  const go = useCallback((n) => setI((n + FEATURES.length) % FEATURES.length), []);

  // Gentle autoplay; stops on hover, keyboard focus, hidden tab and for reduced-motion users.
  useEffect(() => {
    if (paused || reduce.current) return;
    const id = setInterval(() => { if (!document.hidden) setI((x) => (x + 1) % FEATURES.length); }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [paused]);

  const onKey = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
  };

  const autoplaying = !paused && !reduce.current;

  return (
    <div className="fc" ref={root} role="region" aria-roledescription="carousel" aria-label={t("home.carouselLabel")}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={(e) => { if (!root.current?.contains(e.relatedTarget)) setPaused(false); }}
      onKeyDown={onKey}>
      <div className="fc-label"><span>Campus Connect</span></div>

      <div className="fc-viewport" aria-live={autoplaying ? "off" : "polite"}>
        <div className="fc-track" style={{ "--i": i }}>
          {FEATURES.map((f, n) => (
            <article key={f.key} className={`fc-card${n === i ? " on" : ""}`} role="group" aria-roledescription="slide"
              aria-label={`${n + 1} / ${FEATURES.length}`} aria-hidden={n === i ? undefined : "true"}>
              <span className="fc-ic"><Ic n={f.icon} s={22} /></span>
              <h3>{t(`home.f.${f.key}.title`)}</h3>
              <p>{t(`home.f.${f.key}.desc`)}</p>
              <button type="button" className="fc-go" tabIndex={n === i ? 0 : -1} onClick={() => onNav(f.to)}>
                {t(`home.f.${f.key}.cta`)} <Ic n="arrow" s={14} />
              </button>
            </article>
          ))}
        </div>
      </div>

      <div className="fc-ctrl">
        <button type="button" className="fc-arrow" onClick={() => go(i - 1)} aria-label={t("home.prev")}><Ic n="arrowL" s={16} /></button>
        <div className="fc-dots" role="tablist" aria-label={t("home.carouselLabel")}>
          {FEATURES.map((f, n) => (
            <button key={f.key} type="button" role="tab" aria-selected={n === i} aria-label={`${n + 1} / ${FEATURES.length}`}
              className={n === i ? "on" : ""} onClick={() => go(n)} />
          ))}
        </div>
        <button type="button" className="fc-arrow" onClick={() => go(i + 1)} aria-label={t("home.next")}><Ic n="arrow" s={16} /></button>
      </div>
    </div>
  );
}
