import { useEffect, useRef, useState } from 'react';
import BrandMark from '../BrandMark';
import Ic from '../Ic';
import UserAvatar from '../ui/UserAvatar';
import NotifDropdown from './NotifDropdown';
import UserDropdown from './UserDropdown';
import { HamburgerIcon } from './MobileDrawer';
import { useI18n } from '../../i18n';

export const NAV_ITEMS = [
  { page: "home", labelKey: "nav.home" },
  { page: "feed", labelKey: "nav.feed" },
  { page: "media", labelKey: "nav.library" },
  { page: "sug", labelKey: "nav.sug" },
  { page: "profile", labelKey: "nav.me", needsAuth: true },
];

export default function TopNav({
  variant = "bar", page, onNav, user, onLogin, onRegister, onLogout,
  theme, toggleTheme, notifs, unread, onMarkAll, onMarkOne, drawerOpen, onToggleDrawer, search,
}) {
  const { t } = useI18n();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const wrap = useRef(null);
  const lastY = useRef(0);

  useEffect(() => {
    if (variant !== "bar") { setHidden(false); return; }
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        const delta = y - lastY.current;
        if (y < 56 || notifOpen || userOpen || drawerOpen) setHidden(false);
        else if (delta > 8) setHidden(true);
        else if (delta < -8) setHidden(false);
        lastY.current = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [variant, notifOpen, userOpen, drawerOpen]);

  useEffect(() => {
    const close = (e) => { if (wrap.current && !wrap.current.contains(e.target)) { setNotifOpen(false); setUserOpen(false); } };
    const esc = (e) => { if (e.key === "Escape") { setNotifOpen(false); setUserOpen(false); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, []);

  const go = (item) => {
    if (item.needsAuth && !user) { onLogin(); return; }
    onNav(item.page);
  };

  return (
    <header className={`tn tn--${variant}${variant === "bar" && hidden ? " tn--hidden" : ""}`} ref={wrap}>
      <button type="button" className="tn-brand" onClick={() => onNav("home")} aria-label="CampusNetwork (Cenet) — home">
        <BrandMark size={38} />
        <span className="tn-brand-text">Campus<b>Network</b></span>
      </button>

      <nav className="tn-links" aria-label="Primary">
        {NAV_ITEMS.map((it) => (
          <button key={it.page} type="button" className={`tn-link${page === it.page ? " on" : ""}`}
            aria-current={page === it.page ? "page" : undefined} onClick={() => go(it)}>
            {t(it.labelKey)}
          </button>
        ))}
      </nav>

      <div className="tn-actions">
        {!user && (
          <div className="tn-auth tn-auth--desktop">
            <button type="button" className="tn-btn tn-btn--ghost" onClick={onLogin}>{t("nav.login")}</button>
            <button type="button" className="tn-btn" onClick={onRegister}>{t("nav.signup")}</button>
          </div>
        )}
        {!user && (
          <div className="tn-auth tn-auth--mobile">
            <button type="button" className="tn-btn tn-btn--ghost tn-mob-auth" onClick={onLogin}>{t("nav.signin")}</button>
            <button type="button" className="tn-btn tn-btn--join tn-mob-auth" onClick={onRegister}>Join Free</button>
          </div>
        )}

        <div className="tn-right-cluster">
          {search}
          <button type="button" className="tn-ib tn-theme-btn" onClick={toggleTheme}
            aria-label={theme === "dark" ? t("nav.lightMode") : t("nav.darkMode")} title="Toggle theme">
            <Ic n={theme === "dark" ? "sun" : "moon"} s={17} />
          </button>

          {user && (
            <div className="tn-pop">
              <button type="button" className="tn-ib" aria-haspopup="true" aria-expanded={notifOpen}
                aria-label={unread > 0 ? t("nav.notificationsUnread", { n: unread }) : t("nav.notifications")}
                onClick={() => { setNotifOpen((p) => !p); setUserOpen(false); }}>
                <Ic n="bell" s={17} />
                {unread > 0 && <span className="tn-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
              </button>
              {notifOpen && (
                <NotifDropdown
                  notifs={notifs}
                  onMarkAll={onMarkAll}
                  onMarkOne={onMarkOne}
                  onClose={() => setNotifOpen(false)}
                />
              )}
            </div>
          )}

          {user && (
            <div className="tn-pop">
              <button type="button" className="tn-avatar" aria-haspopup="true" aria-expanded={userOpen}
                aria-label={t("nav.account")} onClick={() => { setUserOpen((p) => !p); setNotifOpen(false); }}
                style={{ padding: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <UserAvatar src={user.avatarUrl} av={user.av || (user.name || "?")[0]} bg={user.bg} size={40} border="none" />
              </button>
              {userOpen && (
                <UserDropdown
                  user={user}
                  onNavigate={(dest) => { onNav(dest); setUserOpen(false); }}
                  onLogout={() => { onLogout(); setUserOpen(false); }}
                />
              )}
            </div>
          )}

          <button type="button" className="tn-ib tn-burger" onClick={onToggleDrawer}
            aria-label={drawerOpen ? t("nav.closeMenu") : t("nav.openMenu")} aria-expanded={!!drawerOpen}>
            <HamburgerIcon open={drawerOpen} />
          </button>
        </div>
      </div>
    </header>
  );
}
