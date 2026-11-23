import T from '../../tokens';
import Ic from '../Ic';
import UserAvatar from '../ui/UserAvatar';
import VerifiedBadge from '../ui/VerifiedBadge';

/**
 * Top-right avatar dropdown:
 * - Communities (replaced My Profile; My Profile stays accessible in BottomNav & desktop TopNav)
 * - Chats (replaced Saved Questions; Saved Questions lives inside Profile page)
 * - Place Ads (Advertising dashboard)
 * - Settings (Profile settings tab)
 * - Sign Out
 */
function UserDropdown({ user, unread = 0, onOpenNotifs, onNavigate, onLogout }) {
  const name = user?.name || "Account";
  const av = user?.av || (name[0] || "U").toUpperCase();
  const bg = user?.bg || T.gold;
  const subtitle = [user?.username ? `@${user.username}` : null, user?.dept].filter(Boolean).join(" · ") || user?.role || "";

  const items = [
    { ic: "compass", l: "Communities", dest: "communities" },
    { ic: "chat", l: "Chats", dest: "chats" },
    { ic: "megaphone", l: "Place Ads", dest: "ads" },
    { ic: "settings", l: "Settings", dest: "profile-settings" },
  ];

  return (
    <div className="ud-menu" role="menu">
      <div className="ud-head">
        <UserAvatar src={user?.avatarUrl} av={av} bg={bg} size={42} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
            {user?.isVerifiedStudent && <VerifiedBadge size={14} />}
          </div>
          <div style={{ fontSize: 12, color: "var(--mut)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>
        </div>
      </div>

      {onOpenNotifs && (
        <button type="button" role="menuitem" className="ud-item ud-item--mob-notif" onClick={onOpenNotifs}>
          <Ic n="bell" s={15} c="var(--mut)" />
          <span style={{ flex: 1, textAlign: "left" }}>Notifications</span>
          {unread > 0 && (
            <span style={{ background: "#EF4444", color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: 11, fontWeight: 800 }}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}

      {items.map(({ ic, l, dest }) => (
        <button key={l} type="button" role="menuitem" className="ud-item" onClick={() => onNavigate(dest)}>
          <Ic n={ic} s={15} c="var(--mut)" />{l}
        </button>
      ))}

      <div style={{ height: 1, background: "var(--brd)", margin: "4px 0" }} />
      <button type="button" role="menuitem" className="ud-item ud-item--danger" onClick={onLogout}>
        <Ic n="logout" s={15} c="#EF4444" />Sign Out
      </button>
    </div>
  );
}

export default UserDropdown;
