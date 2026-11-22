import { useEffect, useRef, useState } from 'react';
import Ic from '../Ic';
import { useI18n } from '../../i18n';

const ITEMS = [
  { page: "home",    icon: "home",  key: "nav.home" },
  { page: "feed",    icon: "feed",  key: "nav.feed" },
  { page: "media",   icon: "book",  key: "nav.library" },
  { page: "sug",     icon: "users", key: "nav.sug" },
  { page: "profile", icon: "user",  key: "nav.me", needsAuth: true },
];

/** Mobile/tablet bottom navigation. Floats above the page with its own safe-area gap, hides while scrolling down. */
const BottomNav = ({ page, onNav, onLogin, user, hidden }) => {
  const { t } = useI18n();
  const [scrollHide, setScrollHide] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 60) { setScrollHide(false); lastY.current = y; return; }
      if (y > lastY.current + 8) setScrollHide(true);
      else if (y < lastY.current - 8) setScrollHide(false);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`bnav${hidden || scrollHide ? " hide" : ""}`} aria-label="Primary">
      {ITEMS.map((it) => (
        <button key={it.page} type="button" className={`bnav-item${page === it.page ? " on" : ""}`}
          aria-current={page === it.page ? "page" : undefined}
          onClick={() => (it.needsAuth && !user ? onLogin() : onNav(it.page))}>
          <Ic n={it.icon} s={20} />
          <span>{t(it.key)}</span>
        </button>
      ))}
    </nav>
  );
};

export default BottomNav;
