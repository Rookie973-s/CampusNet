import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Ic from '../components/Ic';
import { useI18n } from '../i18n';
import { tokenStore } from '../api/client';
import heroImg from '../images/bggg.webp';
import BrandMark from '../components/BrandMark';

export const SEEN_KEY = "cc_seen";
export const markSeen = () => { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode */ } };

/** First-visit entry point: Log in / Sign up / Continue as guest. */
export default function LandingPage({ onLogin, onRegister }) {
  const { t } = useI18n();
  const navigate = useNavigate();

  useEffect(() => { if (tokenStore.isLoggedIn()) navigate("/", { replace: true }); }, [navigate]);

  const guest = () => { markSeen(); navigate("/", { replace: true }); };

  return (
    <main className="lp">
      <img className="lp-bg" src={heroImg} alt="" aria-hidden="true" />
      <div className="lp-card">
        <div className="lp-photo">
          <img className="lp-img" src={heroImg} alt="" fetchpriority="high" />
          <div className="lp-brand">
            <span className="lp-logo"><BrandMark size={74} bare /></span>
            <span className="lp-name">Campus<b>Network</b></span>
          </div>
        </div>
        <div className="lp-body">
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, margin: "0 auto", padding: "5px 12px", borderRadius: 999, background: "var(--surfH)", border: "1px solid var(--brd)", fontSize: 12, fontWeight: 700, color: "var(--mut)" }}>
            <Ic n="cap" s={13} c="var(--accent)" />
            <span>ATBU Bauchi</span>
            <span style={{ opacity: .45 }}>·</span>
            <span style={{ color: "var(--accent)" }}>More Schools Coming Soon</span>
          </div>
          <h1>{t("landing.title")}</h1>
          <p>{t("landing.sub")}</p>
          <div className="lp-actions">
            <button type="button" className="lp-btn lp-btn--pri" onClick={() => { markSeen(); onLogin(); }}>{t("nav.login")}</button>
            <button type="button" className="lp-btn lp-btn--sec" onClick={() => { markSeen(); onRegister(); }}>{t("nav.signup")}</button>
            <button type="button" className="lp-btn lp-btn--link" onClick={guest}>{t("landing.guest")} <Ic n="arrow" s={14} /></button>
          </div>
        </div>
      </div>
    </main>
  );
}
