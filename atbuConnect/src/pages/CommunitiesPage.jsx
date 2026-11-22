import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Ic from "../components/Ic";
import { Modal, Skel } from "../components/ui/shared";
import {
  COMMUNITY_CATEGORIES, listCommunities, createCommunity, followCommunity, unfollowCommunity,
} from "../api/communities";

const ACCENTS = ["#2563EB", "#10B981", "#8B5CF6", "#F97316", "#EC4899", "#0EA5E9", "#14B8A6", "#EAB308"];

function CommunityCard({ c, user, onLogin, onToggleFollow, onOpen }) {
  const [busy, setBusy] = useState(false);

  const handleFollow = async (e) => {
    e.stopPropagation();
    if (!user) { onLogin("follow communities"); return; }
    if (busy) return;
    setBusy(true);
    try { await onToggleFollow(c); }
    finally { setBusy(false); }
  };

  return (
    <article className="comm-card raised" onClick={() => onOpen(c.slug)}>
      <div className="comm-card-top">
        <div className="comm-card-meta">
          <div className="comm-av" style={{ background: c.accent_color || "#2563EB" }}>
            {c.avatar_url
              ? <img src={c.avatar_url} alt={c.name} />
              : <span>{(c.name || "C")[0].toUpperCase()}</span>}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 className="comm-name">
              {c.name}
              {c.is_official && <span className="comm-official">Official</span>}
            </h3>
            <p className="comm-sub">
              {c.category} · {c.followers_count} {c.followers_count === 1 ? "follower" : "followers"}
              {c.last_activity ? ` · Active ${c.last_activity}` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          className={`comm-follow-btn${c.is_following ? " on" : ""}`}
          onClick={handleFollow}
          disabled={busy || c.my_role === "owner"}
        >
          {c.my_role === "owner" ? "Owner" : c.is_following ? "Following" : "Follow"}
        </button>
      </div>

      {/* Visual cover banner inspired by COMMUNITIES reference */}
      <div
        className="comm-cover"
        style={{
          background: c.cover_url
            ? undefined
            : `linear-gradient(135deg, ${c.accent_color || "#2563EB"}dd, #0E1A33)`,
        }}
      >
        {c.cover_url ? (
          <img src={c.cover_url} alt={`${c.name} cover`} loading="lazy" />
        ) : (
          <div className="comm-cover-fallback">
            <span>{c.category}</span>
            <strong>{c.name}</strong>
          </div>
        )}
      </div>

      <p className="comm-desc">{c.description}</p>
    </article>
  );
}

export default function CommunitiesPage({ user, onLogin, toast }) {
  const navigate = useNavigate();
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("popular");
  const [communities, setCommunities] = useState([]);
  const [myComms, setMyComms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form state
  const [form, setForm] = useState({
    name: "", slug: "", description: "", category: "Campus Life",
    visibility: "public", rules: "", accentColor: "#2563EB",
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const reqs = [listCommunities({ category, q: search, sort })];
    if (user) reqs.push(listCommunities({ mine: true }));
    Promise.all(reqs)
      .then(([allRes, mineRes]) => {
        setCommunities(allRes.results);
        if (mineRes) setMyComms(mineRes.results);
      })
      .catch(() => toast("Could not load communities.", "error"))
      .finally(() => setLoading(false));
  }, [category, search, sort, user, toast]);

  useEffect(() => {
    const t = setTimeout(load, search ? 240 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const toggleFollow = async (c) => {
    try {
      const res = c.is_following ? await unfollowCommunity(c.slug) : await followCommunity(c.slug);
      const patch = (arr) =>
        arr.map((x) => (x.slug === c.slug ? { ...x, is_following: res.is_following, followers_count: res.followers_count } : x));
      setCommunities(patch);
      if (res.is_following) {
        setMyComms((prev) => (prev.some((x) => x.slug === c.slug) ? patch(prev) : [{ ...c, is_following: true, followers_count: res.followers_count }, ...prev]));
        toast(`Following ${c.name}`, "success");
      } else {
        setMyComms((prev) => prev.filter((x) => x.slug !== c.slug));
        toast(`Unfollowed ${c.name}`, "info");
      }
    } catch (e) {
      toast(e.message || "Could not update follow status.", "error");
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || form.name.trim().length < 3) { toast("Community name must be at least 3 characters.", "error"); return; }
    if (!form.description.trim()) { toast("Add a brief description for your community.", "error"); return; }
    setCreating(true);
    try {
      const created = await createCommunity({
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
        avatar: avatarFile,
        coverImage: coverFile,
      });
      toast(`Community "${created.name}" created!`, "success");
      setCreateOpen(false);
      navigate(`/communities/${created.slug}`);
    } catch (err) {
      toast(err.message || "Could not create community.", "error");
    } finally { setCreating(false); }
  };

  const popular = communities.slice(0, 6);
  const recentlyActive = [...communities].filter((c) => c.last_activity).slice(0, 6);

  return (
    <div className="comm-page">
      {/* Header + Search + Create CTA */}
      <header className="comm-header fu">
        <div>
          <h1>Communities</h1>
          <p>Discover, follow, and connect around shared ATBU interests, tech groups, sports, and departmental updates.</p>
        </div>
        <button
          type="button"
          className="btn btn-navy"
          onClick={() => (user ? setCreateOpen(true) : onLogin("create a community"))}
        >
          <Ic n="plus" s={16} /> Create Community
        </button>
      </header>

      {/* Search + Sort bar */}
      <div className="comm-search-row raised fu">
        <div className="comm-search-wrap">
          <Ic n="search" s={17} c="var(--faint)" />
          <input
            type="search"
            className="comm-search-inp"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search communities, clubs, topics, departments…"
            aria-label="Search communities"
          />
        </div>
        <select className="inp comm-sort-sel" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort communities">
          <option value="popular">Popular</option>
          <option value="recent">Recently Active</option>
          <option value="newest">Newest</option>
        </select>
      </div>

      {/* Category Filter Pills (inspired by COMMUNITIES reference) */}
      <div className="comm-cats" role="tablist" aria-label="Community categories">
        {COMMUNITY_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={category === cat}
            className={`comm-cat-pill${category === cat ? " on" : ""}`}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* My Communities Horizontal Strip */}
      {user && myComms.length > 0 && category === "All" && !search && (
        <section className="comm-sec fu">
          <div className="comm-sec-head">
            <h2>My Communities</h2>
            <span>{myComms.length} followed</span>
          </div>
          <div className="comm-hscroll">
            {myComms.map((c) => (
              <button key={c.id} type="button" className="comm-mini-card raised" onClick={() => navigate(`/communities/${c.slug}`)}>
                <div className="comm-av" style={{ background: c.accent_color || "#2563EB", width: 46, height: 46 }}>
                  {c.avatar_url ? <img src={c.avatar_url} alt={c.name} /> : <span>{(c.name || "C")[0]}</span>}
                </div>
                <strong className="comm-mini-name">{c.name}</strong>
                <span className="comm-mini-cat">{c.category}</span>
                <span className="comm-mini-cnt">{c.followers_count} followers</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Main Discovery Grid */}
      <section className="comm-sec">
        <div className="comm-sec-head">
          <h2>{category === "All" ? (search ? `Results for “${search}”` : "Recommended & Popular Communities") : category}</h2>
          <span>{communities.length} {communities.length === 1 ? "community" : "communities"}</span>
        </div>

        {loading ? (
          <div className="comm-grid">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="raised" style={{ padding: 18 }}>
                <Skel h={16} w="55%" mb={8} /><Skel h={140} mb={10} /><Skel h={12} w="85%" />
              </div>
            ))}
          </div>
        ) : communities.length === 0 ? (
          <div className="raised lib-empty">
            <Ic n="compass" s={38} c="var(--faint)" />
            <h3>No communities found</h3>
            <p>Be the first to start a community in this category on CampusNetwork!</p>
            <button type="button" className="btn btn-navy" onClick={() => (user ? setCreateOpen(true) : onLogin("create a community"))}>
              Create Community
            </button>
          </div>
        ) : (
          <div className="comm-grid">
            {popular.map((c) => (
              <CommunityCard key={c.id} c={c} user={user} onLogin={onLogin} onToggleFollow={toggleFollow} onOpen={(slug) => navigate(`/communities/${slug}`)} />
            ))}
            {communities.slice(6).map((c) => (
              <CommunityCard key={c.id} c={c} user={user} onLogin={onLogin} onToggleFollow={toggleFollow} onOpen={(slug) => navigate(`/communities/${slug}`)} />
            ))}
          </div>
        )}
      </section>

      {recentlyActive.length > 0 && category === "All" && !search && (
        <section className="comm-sec">
          <div className="comm-sec-head">
            <h2>Recently Active</h2>
          </div>
          <div className="comm-grid">
            {recentlyActive.map((c) => (
              <CommunityCard key={`ra-${c.id}`} c={c} user={user} onLogin={onLogin} onToggleFollow={toggleFollow} onOpen={(slug) => navigate(`/communities/${slug}`)} />
            ))}
          </div>
        </section>
      )}

      {/* Create Community Modal */}
      {createOpen && (
        <Modal onClose={() => !creating && setCreateOpen(false)} maxW={560} showClose label="Create Community">
          <form onSubmit={handleCreate} style={{ padding: "26px 24px 22px", display: "flex", flexDirection: "column", gap: 13 }}>
            <h2 style={{ fontSize: 22 }}>Create a Community</h2>
            <p style={{ fontSize: 13.5, color: "var(--mut)", marginTop: -6 }}>
              You&apos;ll become the community owner and can publish official updates to your followers.
            </p>

            <div>
              <label className="lf-label" htmlFor="cm-name">Community Name *</label>
              <input id="cm-name" className="inp" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. ATBU Tech Community" maxLength={120} />
            </div>

            <div className="sug-2">
              <div>
                <label className="lf-label" htmlFor="cm-cat">Category *</label>
                <select id="cm-cat" className="inp" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                  {COMMUNITY_CATEGORIES.filter((c) => c !== "All").map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label className="lf-label" htmlFor="cm-vis">Visibility</label>
                <select id="cm-vis" className="inp" value={form.visibility} onChange={(e) => setForm((p) => ({ ...p, visibility: e.target.value }))}>
                  <option value="public">Public (Discoverable)</option>
                  <option value="private">Private</option>
                </select>
              </div>
            </div>

            <div>
              <label className="lf-label" htmlFor="cm-desc">Description *</label>
              <textarea id="cm-desc" className="inp" required style={{ minHeight: 82 }} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="What is this community about?" maxLength={1200} />
            </div>

            <div>
              <label className="lf-label" htmlFor="cm-rules">Community Rules / Guidelines (optional)</label>
              <textarea id="cm-rules" className="inp" style={{ minHeight: 68 }} value={form.rules} onChange={(e) => setForm((p) => ({ ...p, rules: e.target.value }))} placeholder="1. Be respectful…" maxLength={2000} />
            </div>

            <div className="sug-2">
              <div>
                <label className="lf-label" htmlFor="cm-av">Community Icon (optional)</label>
                <input id="cm-av" type="file" accept="image/*" className="inp" style={{ paddingTop: 10 }} onChange={(e) => setAvatarFile(e.target.files?.[0] || null)} />
              </div>
              <div>
                <label className="lf-label" htmlFor="cm-cv">Cover Image (optional)</label>
                <input id="cm-cv" type="file" accept="image/*" className="inp" style={{ paddingTop: 10 }} onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
              </div>
            </div>

            <div>
              <span className="lf-label">Theme Accent Color</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {ACCENTS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    aria-label={`Color ${col}`}
                    onClick={() => setForm((p) => ({ ...p, accentColor: col }))}
                    style={{
                      width: 28, height: 28, borderRadius: "50%", background: col,
                      border: form.accentColor === col ? "3px solid var(--txt)" : "2px solid transparent",
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <button type="button" className="btn btn-out" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</button>
              <button type="submit" className="btn btn-navy" disabled={creating}>{creating ? "Creating…" : "Create Community"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
