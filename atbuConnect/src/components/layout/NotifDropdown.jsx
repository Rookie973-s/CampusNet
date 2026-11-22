import { useNavigate } from 'react-router-dom';
import T from '../../tokens';
import Ic from '../Ic';

const TYPE_STYLE = {
  like: { icon: "heart", bg: "rgba(239,68,68,.14)", c: "#EF4444" },
  follow: { icon: "userPlus", bg: "rgba(59,130,246,.14)", c: "#3B82F6" },
  mention: { icon: "at", bg: "rgba(139,92,246,.15)", c: "#8B5CF6" },
  answer: { icon: "msg", bg: "rgba(16,185,129,.15)", c: "#10B981" },
  comment: { icon: "msg", bg: "rgba(16,185,129,.15)", c: "#10B981" },
  welcome: { icon: "sparkle", bg: "rgba(245,158,11,.15)", c: "#F59E0B" },
  staff: { icon: "shield", bg: "rgba(59,130,246,.15)", c: "#2563EB" },
  class_rep: { icon: "file", bg: "rgba(16,185,129,.15)", c: "#059669" },
  verification: { icon: "check", bg: "rgba(16,185,129,.15)", c: "#10B981" },
  community: { icon: "compass", bg: "rgba(99,102,241,.15)", c: "#6366F1" },
  chat: { icon: "chat", bg: "rgba(14,165,233,.15)", c: "#0EA5E9" },
  followed_post: { icon: "feed", bg: "rgba(59,130,246,.15)", c: "#3B82F6" },
  system: { icon: "bell", bg: "rgba(100,116,139,.15)", c: "var(--mut)" },
};

function NotifDropdown({ notifs, onMarkAll, onMarkOne, onClose }) {
  const navigate = useNavigate();
  const unread = notifs.filter((n) => n.unread).length;

  const openNotif = (n) => {
    if (n.unread && onMarkOne) onMarkOne(n.id);
    if (onClose) onClose();
    if (n.link && n.link.startsWith("/")) navigate(n.link);
  };

  return (
    <div style={{
      position: "fixed", top: 68, right: 16, width: "min(340px,calc(100vw - 32px))",
      maxHeight: "min(72vh, 480px)", display: "flex", flexDirection: "column",
      background: "var(--surf)", border: "1px solid var(--brd)", borderRadius: 18,
      boxShadow: "var(--sh-3)", zIndex: 1200, overflow: "hidden",
      animation: "popIn .25s cubic-bezier(.34,1.56,.64,1)",
    }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--brd)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surfA)", flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          Notifications {unread > 0 && <span style={{ background: T.error, color: "#fff", borderRadius: 10, padding: "2px 7px", fontSize: 11, marginLeft: 6 }}>{unread}</span>}
        </span>
        {unread > 0 && (
          <button type="button" onClick={onMarkAll} style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>
            Mark all read
          </button>
        )}
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {notifs.length === 0 ? (
          <div style={{ padding: "28px 18px", textAlign: "center", color: "var(--mut)", fontSize: 13 }}>
            No notifications yet.
          </div>
        ) : (
          notifs.map((n, i) => {
            const st = TYPE_STYLE[n.type] || TYPE_STYLE.system;
            return (
              <button
                key={n.id || i}
                type="button"
                onClick={() => openNotif(n)}
                style={{
                  width: "100%", textAlign: "left", padding: "13px 16px",
                  display: "flex", gap: 12, alignItems: "flex-start",
                  borderBottom: "1px solid var(--brd)",
                  background: n.unread ? "rgba(59,130,246,.07)" : "transparent",
                  cursor: "pointer", transition: "background .15s",
                }}
              >
                <div style={{ width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: st.bg, flexShrink: 0 }}>
                  <Ic n={st.icon} s={15} c={st.c} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 13, lineHeight: 1.48, marginBottom: 3, color: "var(--txt)", overflowWrap: "anywhere" }}>
                    {n.text}
                  </p>
                  <span style={{ fontSize: 11, color: "var(--faint)" }}>{n.time}</span>
                </div>
                {n.unread && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", marginTop: 6, flexShrink: 0 }} />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default NotifDropdown;
