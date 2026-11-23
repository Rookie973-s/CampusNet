import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import UserAvatar from './ui/UserAvatar';
import VerifiedBadge from './ui/VerifiedBadge';
import Ic from './Ic';
import { listQuestions } from '../api/questions';
import { listStaff } from '../api/staff';
import { searchUsers } from '../api/users';
import { listCommunities } from '../api/communities';
import { tokenStore } from '../api/client';

/* ── LIVE SEARCH DROPDOWN (Questions + Users + SUG + Communities) ── */
function SearchDropdown({ query, onNavigate, onPickUser, onClose }) {
  const navigate = useNavigate();
  const [qHits, setQHits] = useState([]);
  const [uHits, setUHits] = useState([]);
  const [sHits, setSHits] = useState([]);
  const [cHits, setCHits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const signedIn = tokenStore.isLoggedIn();
    const t = setTimeout(() => {
      Promise.all([
        listQuestions({ search: query }).catch(() => []),
        searchUsers(query).catch(() => []),
        signedIn ? listStaff({ search: query }).catch(() => []) : Promise.resolve([]),
        listCommunities({ q: query }).then((r) => r.results).catch(() => []),
      ]).then(([qs, us, st, cs]) => {
        if (!alive) return;
        setQHits(qs.slice(0, 4));
        setUHits(us.slice(0, 4));
        setSHits(st.slice(0, 3));
        setCHits(cs.slice(0, 3));
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

  if (!qHits.length && !uHits.length && !sHits.length && !cHits.length) {
    return (
      <div className="sch-drop" onMouseDown={keepFocus} style={{ padding: "18px", textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
        No results for "<strong style={{ color: "var(--txt)" }}>{query}</strong>"
      </div>
    );
  }

  return (
    <div className="sch-drop" onMouseDown={keepFocus} style={{ maxHeight: "70vh", overflowY: "auto" }}>
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
                <div className="sch-title">{q.title}</div>
                <div className="sch-sub">{q.dept} · {q.time}</div>
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
          Search all results for “{query}” →
        </button>
      </div>
    </div>
  );
}

export default SearchDropdown;
