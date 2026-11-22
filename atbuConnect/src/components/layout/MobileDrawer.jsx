import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import T from '../../tokens';
import Ic from '../Ic';
import BrandMark from '../BrandMark';
import UserAvatar from '../ui/UserAvatar';
import VerifiedBadge from '../ui/VerifiedBadge';
import { TRENDING } from '../../data';
import { listTrendingTopics } from '../../api/questions';

function HamburgerIcon({ open }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <style>{`
        .hb-l1,.hb-l2,.hb-l3{
          transform-origin:11px center;
          transition:transform .3s cubic-bezier(.34,1.1,.64,1),opacity .2s;
        }
        .hb-open .hb-l1{transform:translateY(6px) rotate(45deg)}
        .hb-open .hb-l2{opacity:0;transform:scaleX(0)}
        .hb-open .hb-l3{transform:translateY(-6px) rotate(-45deg)}
      `}</style>
      <g className={open ? "hb-open" : ""}>
        <line className="hb-l1" x1="3" y1="5" x2="19" y2="5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        <line className="hb-l2" x1="3" y1="11" x2="19" y2="11" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        <line className="hb-l3" x1="3" y1="17" x2="19" y2="17" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/**
 * Focused mobile drawer:
 * Retains ONLY: User info (when signed in), SUG Access, Trending Now (topic-based discovery links),
 * Dark/Light theme toggle switch, and Sign Out button (when signed in).
 * Sign In / Join Free now live in the upper mobile TopNav instead of inside the drawer.
 */
function MobileDrawer({ open, onClose, page, onNav, user, onLogout, toggleTheme, theme, unread }) {
  const navigate = useNavigate();
  const [topics, setTopics] = useState([]);

  useEffect(() => {
    if (!open) return;
    listTrendingTopics()
      .then((res) => { if (res.length) setTopics(res); })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const displayTopics = topics.length > 0
    ? topics.map((it) => ({
        n: it.n,
        q: it.title,
        m: `${it.dept} · ${it.answers} answers`,
        discovery: it.discovery || it.title,
      }))
    : TRENDING.map((it) => ({ ...it, discovery: it.q }));

  const openDiscovery = (item) => {
    onClose();
    navigate(`/feed?discovery=${encodeURIComponent(item.discovery || item.q)}`);
  };

  const subtitle = [user?.username ? `@${user.username}` : null, user?.dept, user?.level].filter(Boolean).join(" · ");

  return (
    <div className="mob-drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mob-drawer" role="dialog" aria-modal="true" aria-label="Menu">
        {/* Drawer header */}
        <div style={{
          background: `linear-gradient(135deg,${T.navyD},${T.navyL})`,
          padding: "20px 20px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,.07)", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BrandMark size={36} />
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.1 }}>CampusNetwork</div>
              <div style={{ color: "rgba(255,255,255,.55)", fontSize: 11 }}>Cenet Student Hub</div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu"
            style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,.12)", border: "none", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ic n="x" s={15} />
          </button>
        </div>

        {/* Real User Info (only when logged in) */}
        {user && (
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--brd)", display: "flex", alignItems: "center", gap: 12, background: "var(--surfA)" }}>
            <UserAvatar src={user.avatarUrl} av={user.av || "?"} bg={user.bg} size={44} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.name}
                {user.isVerifiedStaff && <Ic n="shield" s={12} c={T.gold} />}
                {user.isVerifiedStudent && <VerifiedBadge size={14} />}
              </div>
              <div style={{ fontSize: 12, color: "var(--mut)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {subtitle || user.email}
              </div>
            </div>
            {unread > 0 && (
              <span style={{ background: "#EF4444", color: "#fff", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {unread}
              </span>
            )}
          </div>
        )}

        {/* Remaining menu content: SUG Access + Trending Now topic discovery */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          <button
            type="button"
            className={`mob-drawer-item${page === "apply" ? " on" : ""}`}
            onClick={() => { onNav("apply"); onClose(); }}
          >
            <span style={{ width: 34, height: 34, borderRadius: 9, background: page === "apply" ? "rgba(59,130,246,.14)" : "var(--surfA)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Ic n="cap" s={17} c={page === "apply" ? T.gold : "var(--mut)"} />
            </span>
            SUG Access
          </button>

          {/* Trending Now — Topic-based discovery links */}
          <div style={{ margin: "8px 0 0", borderTop: "1px solid var(--brd)", padding: "14px 20px 4px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: .8, color: "var(--faint)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <Ic n="trending" s={12} c={T.gold} /> Trending Now
            </div>
            {displayTopics.map((item) => (
              <button
                key={item.n}
                type="button"
                onClick={() => openDiscovery(item)}
                style={{ width: "100%", display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--brd)", cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ fontSize: 18, fontWeight: 800, color: T.gold, lineHeight: 1, flexShrink: 0, minWidth: 20, textAlign: "center" }}>{item.n}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 3, color: "var(--txt)" }}>{item.q}</div>
                  <div style={{ fontSize: 11, color: "var(--faint)" }}>{item.m} · Explore topic →</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom actions: Theme toggle switch + Sign Out */}
        <div style={{ borderTop: "1px solid var(--brd)", padding: "12px 14px", display: "flex", gap: 8, flexShrink: 0, background: "var(--surfA)" }}>
          <button type="button" onClick={toggleTheme}
            style={{ flex: 1, height: 42, borderRadius: 12, border: "1.5px solid var(--brdS)", background: "var(--surf)", color: "var(--txt)", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "inherit" }}>
            {theme === "dark" ? <Ic n="sun" s={15} /> : <Ic n="moon" s={15} />}
            {theme === "dark" ? "Light" : "Dark"} Mode
          </button>
          {user && (
            <button type="button" onClick={() => { onLogout(); onClose(); }}
              style={{ height: 42, padding: "0 16px", borderRadius: 12, border: "1.5px solid #FCA5A5", background: "transparent", color: "#EF4444", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit", flexShrink: 0 }}>
              <Ic n="logout" s={15} c="#EF4444" />Sign Out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { HamburgerIcon, MobileDrawer };
export default MobileDrawer;
