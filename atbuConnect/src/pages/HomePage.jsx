import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Ic from '../components/Ic';
import FeatureCarousel from '../components/home/FeatureCarousel';
import FacultyStrip from '../components/home/FacultyStrip';
import { useI18n } from '../i18n';
import bg1 from '../images/bg.webp';
import bg2 from '../images/bgg.webp';
import bg3 from '../images/bggg.webp';
import bg4 from '../images/bgggg.webp';

/* Existing Campus Connect hero assets (re-encoded as WebP: ~9 MB of PNG became ~0.5 MB). */
const SLIDES = [bg1, bg2, bg3, bg4];

/**
 * Homepage = a large hero (nav inside, headline, floating feature carousel, two actions)
 * + a light faculty strip. Everything else that used to live here (Discover, promo
 * sections, the staff banner, the ask button) is intentionally gone from this page; the
 * features themselves still exist elsewhere in the app.
 */
function HomePage({ nav, onNav }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [slide, setSlide] = useState(0);

  // Slow background cross-fade; skipped for reduced-motion users and hidden tabs.
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => { if (!document.hidden) setSlide((s) => (s + 1) % SLIDES.length); }, 7000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="home-shell">
      <section className="hero" aria-labelledby="hero-title">
        {SLIDES.map((src, i) => (
          <img key={src} src={src} alt="" aria-hidden="true" className={`hero-bg${i === slide ? " on" : ""}`}
            width="1536" height="1024" decoding="async" fetchpriority={i === 0 ? "high" : "low"} loading={i === 0 ? "eager" : "lazy"} />
        ))}

        {nav}

        <div className="hero-inner">
          <div className="hero-copy">
            <span className="hero-chip"><Ic n="cap" s={15} />Abubakar Tafawa Balewa University</span>
            <h1 id="hero-title">{t("hero.title")}</h1>
            <p className="hero-sub">{t("hero.sub")}</p>
            <div className="hero-actions">
              <button type="button" className="hb hb--pri" onClick={() => onNav("feed")}>
                <Ic n="msg" s={18} />{t("hero.browse")}
              </button>
              <button type="button" className="hb hb--sec" onClick={() => navigate("/sug")}>
                <Ic n="users" s={18} />{t("hero.sug")}
              </button>
            </div>
          </div>

          <FeatureCarousel onNav={onNav} />
        </div>

        <div className="hero-dots" aria-hidden="true">
          {SLIDES.map((_, i) => <button key={i} tabIndex={-1} className={i === slide ? "on" : ""} onClick={() => setSlide(i)} />)}
        </div>
      </section>

      <FacultyStrip />
    </div>
  );
}

export default HomePage;
