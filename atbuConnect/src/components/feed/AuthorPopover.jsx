import { useEffect, useRef, useState } from 'react';
import Ic from '../Ic';
import UserAvatar from '../ui/UserAvatar';
import VerifiedBadge from '../ui/VerifiedBadge';
import { getPublicProfile, getPublicProfileByUsername, followUser, unfollowUser, getFollowers, getFollowing } from '../../api/users';
import { useI18n } from '../../i18n';

/**
 * Public profile card for any author, commenter, search hit, or @mention.
 * Shows profile picture, @username, badges, followers/following stats + accessible lists, and Follow button.
 */
export default function AuthorPopover({ userId, username, anchor, viewer, onGuest, onClose, toast }) {
  const { t } = useI18n();
  const [p, setP] = useState(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listMode, setListMode] = useState(null); // null | "followers" | "following"
  const [listUsers, setListUsers] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    let live = true;
    setP(null); setErr(false); setListMode(null);
    const req = userId ? getPublicProfile(userId) : getPublicProfileByUsername(username);
    req.then((d) => live && setP(d)).catch(() => live && setErr(true));
    return () => { live = false; };
  }, [userId, username, viewer?.id]);

  useEffect(() => {
    const out = (e) => { if (ref.current && !ref.current.contains(e.target) && !anchor?.contains?.(e.target)) onClose(); };
    const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); anchor?.focus?.(); } };
    document.addEventListener("pointerdown", out);
    document.addEventListener("keydown", esc);
    ref.current?.focus();
    return () => { document.removeEventListener("pointerdown", out); document.removeEventListener("keydown", esc); };
  }, [onClose, anchor]);

  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!anchor) { setPos(null); return; }
    const r = anchor.getBoundingClientRect();
    const w = Math.min(340, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
    const below = window.innerHeight - r.bottom > 340;
    setPos(window.innerWidth < 560 ? null : { left, width: w, ...(below ? { top: r.bottom + 8 } : { bottom: window.innerHeight - r.top + 8 }) });
  }, [anchor]);

  const toggleFollow = async () => {
    if (!viewer) { onGuest(t("guest.actions.follow")); return; }
    if (busy || !p) return;
    setBusy(true);
    const was = p.isFollowing;
    setP((x) => ({ ...x, isFollowing: !was, followers: x.followers + (was ? -1 : 1) }));
    try {
      const r = was ? await unfollowUser(p.id) : await followUser(p.id);
      setP((x) => ({ ...x, isFollowing: r.is_following, followers: r.followers }));
    } catch (e) {
      setP((x) => ({ ...x, isFollowing: was, followers: x.followers + (was ? 1 : -1) }));
      toast && toast(e.message || t("profile.followFail"), "error");
    } finally { setBusy(false); }
  };

  const openList = async (mode) => {
    if (!p) return;
    setListMode(mode);
    setListLoading(true);
    try {
      const data = mode === "followers" ? await getFollowers(p.id) : await getFollowing(p.id);
      setListUsers(data);
    } catch { setListUsers([]); }
    finally { setListLoading(false); }
  };

  return (
    <>
      <div className="ap-backdrop" onClick={onClose} aria-hidden="true" />
      <div className={`ap${pos ? "" : " ap--center"}`} style={pos || undefined} ref={ref} role="dialog" aria-modal="false" aria-label={p ? t("profile.card", { name: p.name }) : t("profile.cardLoading")} tabIndex={-1}>
        <button type="button" className="ap-x" onClick={onClose} aria-label={t("common.close")}><Ic n="x" s={14} /></button>
        {!p && !err && <div className="ap-load" role="status"><span className="auth-spinner" aria-hidden="true" />{t("common.loading")}</div>}
        {err && <p className="ap-err" role="alert">{t("profile.cardError")}</p>}

        {p && !listMode && (
          <>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
              <UserAvatar src={p.avatarUrl} av={p.av} bg={p.bg} size={76} border="4px solid var(--surf)" />
            </div>
            <h3 className="ap-name">
              {p.name}
              {p.staff && <Ic n="shield" s={14} c="var(--accent)" />}
              {p.isVerifiedStudent && <VerifiedBadge size={15} />}
            </h3>
            {p.username && <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent)", marginTop: 2 }}>@{p.username}</div>}
            <p className="ap-sub">{[p.title, p.dept].filter(Boolean).join(" · ") || "\u00A0"}</p>
            {p.bio && <p className="ap-bio">{p.bio}</p>}

            <dl className="ap-stats" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              <div>
                <button type="button" className="ap-stat-btn" onClick={() => openList("followers")}>
                  <dt>{t("profile.followers")}</dt><dd>{p.followers}</dd>
                </button>
              </div>
              <div>
                <button type="button" className="ap-stat-btn" onClick={() => openList("following")}>
                  <dt>{t("profile.following")}</dt><dd>{p.following}</dd>
                </button>
              </div>
              <div><dt>Posts</dt><dd>{p.questions}</dd></div>
              <div><dt>Ans</dt><dd>{p.answers}</dd></div>
            </dl>

            {!p.isMe && (
              <button type="button" className={`btn ${p.isFollowing ? "btn-out" : "btn-navy"}`} style={{ width: "100%" }} onClick={toggleFollow}
                disabled={busy} aria-pressed={p.isFollowing}>
                <Ic n={p.isFollowing ? "check" : "userPlus"} s={15} />{p.isFollowing ? t("profile.following") : t("profile.follow")}
              </button>
            )}
          </>
        )}

        {p && listMode && (
          <div style={{ textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, paddingRight: 28 }}>
              <button type="button" className="btn btn-ghost" style={{ height: 32, minHeight: 32, padding: "0 8px" }} onClick={() => setListMode(null)}>
                <Ic n="arrowL" s={14} /> Back
              </button>
              <strong style={{ fontSize: 14, textTransform: "capitalize" }}>{listMode} ({listMode === "followers" ? p.followers : p.following})</strong>
            </div>
            {listLoading ? (
              <div className="ap-load"><span className="auth-spinner" /> Loading…</div>
            ) : listUsers.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--mut)", textAlign: "center", padding: "18px 0" }}>No users here yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                {listUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => { setP(u); setListMode(null); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px", borderRadius: 12, background: "var(--surfH)", width: "100%", textAlign: "left" }}
                  >
                    <UserAvatar src={u.avatarUrl} av={u.av} bg={u.bg} size={34} border="none" />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, display: "flex", alignItems: "center", gap: 4 }}>
                        {u.name}
                        {u.isVerifiedStudent && <VerifiedBadge size={13} />}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--mut)" }}>@{u.username}{u.dept ? ` · ${u.dept}` : ""}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
