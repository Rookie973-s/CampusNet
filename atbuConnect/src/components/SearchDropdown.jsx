import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import UserAvatar from './ui/UserAvatar';
import VerifiedBadge from './ui/VerifiedBadge';
import Ic from './Ic';
import { universalSearch } from '../api/questions';
import { listStaff } from '../api/staff';
import { tokenStore } from '../api/client';

/* ── LIVE SEARCH DROPDOWN (Deep Keyword Search: People + Posts + Comments + Communities + Community Posts + SUG) ── */
function SearchDropdown({ query, onNavigate, onPickUser, onClose }) {
  const navigate = useNavigate();
  const [qHits, setQHits] = useState([]);
  const [uHits, setUHits] = useState([]);
  const [commentHits, setCommentHits] = useState([]);
  const [sHits, setSHits] = useState([]);
  const [cHits, setCHits] = useState([]);
  const [cpHits, setCpHits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const signedIn = tokenStore.isLoggedIn();
    const t = setTimeout(() => {
      Promise.all([
        universalSearch(query).catch(() => ({ people: [], posts: [], comments: [], communities: [], communityPosts: [] })),
        signedIn ? listStaff({ search: query }).catch(() => []) : Promise.resolve([]),
      ]).then(([res, st]) => {
        if (!alive) return;
        setUHits((res.people || []).slice(0, 4).map((u) => ({
          id: u.id,
          username: u.username,
          name: u.name,
          av: u.av,
          bg: u.bg,
          avatarUrl: u.avatar_url || null,
          staff: !!u.staff,
          isVerifiedStudent: !!u.is_verified_student,
          dept: u.dept || "",
        })));
        setQHits((res.posts || []).slice(0, 4));
        setCommentHits((res.comments || []).slice(0, 3));
        setCHits((res.communities || []).slice(0, 3));
        setCpHits((res.communityPosts || []).slice(0, 3));
        setSHits((st || []).slice(0, 3));
        setLoading(false);
      });
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [query]);

  // Prevent input onBlur from firing and unmounting dropdown BEFORE click executes!
  const keepFocus = (e) => e.preventDefault();

  if (loading) {
    return (
      <div className="sch-drop" onMouseDown={keepFocus} style={{ padding: "18px", textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
        Searching…
      </div>
    );
  }

  if (!qHits.length && !uHits.length && !commentHits.length && !sHits.length && !cHits.length && !cpHits.length) {
    return (
      <div className="sch-drop" onMouseDown={keepFocus} style={{ padding: "18px", textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
        No results for "<strong style={{ color: "var(--txt)" }}>{query}</strong>"
      </div>
    );
  }

  return (
    <div className="sch-drop" onMouseDown={keepFocus} style={{ maxHeight: "72vh", overflowY: "auto" }}>
      {uHits.length > 0 && (
        <>
          <div className="sch-sec">People</div>
          {uHits.map((u) => (
            <button
              key={`u-${u.id}`}
              type="button"
              className="sch-row"
              onClick={() => {
                if (onPickUser) onPickUser(u);
                else navigate(`/feed?search=${encodeURIComponent(u.username)}`);
                onClose();
              }}
            >
              <UserAvatar src={u.avatarUrl} av={u.av} bg={u.bg} size={32} border="none" />
              <div style={{ minWidth: 0 }}>
                <div className="sch-title" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {u.name}
                  {u.staff && <Ic n="shield" s={11} c="var(--accent)" />}
                  {u.isVerifiedStudent && <VerifiedBadge size={13} />}
                </div>
                <div className="sch-sub">@{u.username}{u.dept ? ` · ${u.dept}` : ""}</div>
              </div>
            </button>
          ))}
        </>
      )}

      {qHits.length > 0 && (
        <>
          <div className="sch-sec">Questions &amp; Posts</div>
          {qHits.map((q) => (
            <button
              key={`q-${q.id}`}
              type="button"
              className="sch-row"
              onClick={() => {
                if (onNavigate) onNavigate(q);
                else navigate(`/q/${q.publicId || q.id}`);
                onClose();
              }}
            >
              <span style={{ marginTop: 2, flexShrink: 0, color: "var(--accent)" }}>
                <Ic n="msg" s={14} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="sch-title">{q.title || q.body?.slice(0, 90)}</div>
                <div className="sch-sub">{q.dept} · {q.time}</div>
              </div>
            </button>
          ))}
        </>
      )}

      {commentHits.length > 0 && (
        <>
          <div className="sch-sec">Matching Comments</div>
          {commentHits.map((cm) => (
            <button
              key={`cm-${cm.id}`}
              type="button"
              className="sch-row"
              onClick={() => {
                navigate(`/q/${cm.question_public_id || cm.question_id}`);
                onClose();
              }}
            >
              <span style={{ marginTop: 2, flexShrink: 0, color: "#10B981" }}>
                <Ic n="msg" s={14} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="sch-title">{cm.body}</div>
                <div className="sch-sub">Comment by @{cm.author?.username || "student"} · on {cm.question_title}</div>
              </div>
            </button>
          ))}
        </>
      )}

      {cHits.length > 0 && (
        <>
          <div className="sch-sec">Communities</div>
          {cHits.map((c) => (
            <button
              key={`c-${c.id}`}
              type="button"
              className="sch-row"
              onClick={() => {
                navigate(`/communities/${c.slug}`);
                onClose();
              }}
            >
              <span style={{ width: 30, height: 30, borderRadius: 10, background: c.accent_color || "#2563EB", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                {c.name?.[0] || "C"}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="sch-title">{c.name}</div>
                <div className="sch-sub">{c.category} · {c.followers_count} followers</div>
              </div>
            </button>
          ))}
        </>
      )}

      {cpHits.length > 0 && (
        <>
          <div className="sch-sec">Community Posts</div>
          {cpHits.map((cp) => (
            <button
              key={`cp-${cp.id}`}
              type="button"
              className="sch-row"
              onClick={() => {
                navigate(`/communities/${cp.community_slug}`);
                onClose();
              }}
            >
              <span style={{ marginTop: 2, flexShrink: 0, color: "#8B5CF6" }}>
                <Ic n="users" s={14} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="sch-title">{cp.title || cp.body?.slice(0, 90)}</div>
                <div className="sch-sub">In {cp.community_name}</div>
              </div>
            </button>
          ))}
        </>
      )}

      {sHits.length > 0 && (
        <>
          <div className="sch-sec">SUG Representatives</div>
          {sHits.map((s) => (
            <button
              key={`s-${s.id}`}
              type="button"
              className="sch-row"
              onClick={() => {
                navigate(`/sug?selected=${s.id}`);
                onClose();
              }}
            >
              <UserAvatar src={s.avatarUrl} av={s.av} bg={s.bg} size={32} border="none" />
              <div style={{ minWidth: 0 }}>
                <div className="sch-title">{s.name}</div>
                <div className="sch-sub">{s.role}{s.username ? ` · @${s.username}` : ""}</div>
              </div>
            </button>
          ))}
        </>
      )}

      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--brd)" }}>
        <button
          type="button"
          onClick={() => {
            navigate(`/feed?discovery=${encodeURIComponent(query.trim())}`);
            onClose();
          }}
          style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}
        >
          Search all discussions for “{query}” →
        </button>
      </div>
    </div>
  );
}

export default SearchDropdown;
