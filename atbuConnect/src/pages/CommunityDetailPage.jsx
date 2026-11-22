import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Ic from "../components/Ic";
import { Modal, Skel } from "../components/ui/shared";
import UserAvatar from "../components/ui/UserAvatar";
import VerifiedBadge from "../components/ui/VerifiedBadge";
import RichTextView from "../components/ui/RichTextView";
import RichComposer, { markupToHtml, stripMarkup } from "../components/ui/RichComposer";
import AuthorPopover from "../components/feed/AuthorPopover";
import {
  getCommunity, followCommunity, unfollowCommunity, updateCommunityNotifs,
  listCommunityPosts, createCommunityPost, likeCommunityPost, deleteCommunityPost,
  listCommunityPostComments, createCommunityPostComment, reportCommunityPost,
  listCommunityMembers, setCommunityRole,
} from "../api/communities";

function CommunityPostCard({ post, user, onLogin, toast, onDeleted, onOpenProfile, onOpenMention }) {
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [cLoading, setCLoading] = useState(false);
  const [cDraft, setCDraft] = useState("");
  const [cBusy, setCBusy] = useState(false);
  const [cCount, setCCount] = useState(post.comments_count || 0);

  const toggleLike = async () => {
    if (!user) { onLogin("like community posts"); return; }
    setLiked((x) => !x);
    setLikes((n) => (liked ? n - 1 : n + 1));
    try {
      const r = await likeCommunityPost(post.id);
      setLiked(r.liked); setLikes(r.likes);
    } catch { toast("Could not update like.", "error"); }
  };

  const toggleComments = async () => {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next && comments.length === 0) {
      setCLoading(true);
      listCommunityPostComments(post.id).then(setComments).catch(() => {}).finally(() => setCLoading(false));
    }
  };

  const postComment = async () => {
    if (!user) { onLogin("comment on community posts"); return; }
    const plain = stripMarkup(cDraft).trim();
    if (!plain) return;
    setCBusy(true);
    try {
      const created = await createCommunityPostComment(post.id, { body: plain, bodyHtml: markupToHtml(cDraft.trim()) });
      setComments((prev) => [created, ...prev]);
      setCCount((n) => n + 1);
      setCDraft("");
    } catch (e) { toast(e.message || "Could not post comment.", "error"); }
    finally { setCBusy(false); }
  };

  const handleReport = async () => {
    if (!user) { onLogin("report content"); return; }
    const reason = window.prompt("Why are you reporting this community post?");
    if (!reason || reason.trim().length < 5) return;
    try { await reportCommunityPost(post.id, reason.trim()); toast("Reported for moderation.", "success"); }
    catch (e) { toast(e.message || "Could not report.", "error"); }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this community post?")) return;
    try { await deleteCommunityPost(post.id); onDeleted(post.id); toast("Post deleted.", "success"); }
    catch (e) { toast(e.message || "Could not delete.", "error"); }
  };

  return (
    <article className="fcard fu">
      <header className="fcard-head">
        <button type="button" onClick={(e) => post.user?.id && onOpenProfile({ userId: post.user.id, anchor: e.currentTarget })}>
          <UserAvatar src={post.user?.avatar_url} av={post.user?.av} bg={post.user?.bg} size={42} />
        </button>
        <div className="fcard-who">
          <button type="button" className="fcard-name" onClick={(e) => post.user?.id && onOpenProfile({ userId: post.user.id, anchor: e.currentTarget })}>
            {post.user?.name}
            {post.user?.staff && <Ic n="shield" s={12} c="var(--accent)" />}
            {post.user?.is_verified_student && <VerifiedBadge size={14} />}
            {post.user?.username && <span style={{ fontWeight: 500, fontSize: 12, color: "var(--faint)" }}>@{post.user.username}</span>}
          </button>
          <div className="fcard-meta">{post.time}</div>
        </div>
        <div className="fcard-badges">
          {post.is_important && <span className="badge-promo">Announcement</span>}
          {post.can_manage && (
            <button type="button" className="qa-icon" onClick={handleDelete} aria-label="Delete post"><Ic n="trash" s={15} c="#DC2626" /></button>
          )}
        </div>
      </header>

      {post.title && <h3 style={{ fontSize: 17, fontFamily: "'DM Sans',sans-serif", fontWeight: 800, marginBottom: 6 }}>{post.title}</h3>}
      <RichTextView body={post.body} bodyHtml={post.body_html} onMention={onOpenMention} style={{ fontSize: 14.5, color: "var(--txt)", lineHeight: 1.65 }} />
      {post.image_url && (
        <div style={{ marginTop: 12, borderRadius: 14, overflow: "hidden", background: "var(--surfH)" }}>
          <img src={post.image_url} alt={post.title || "Community post media"} style={{ width: "100%", maxHeight: 440, objectFit: "contain" }} loading="lazy" />
        </div>
      )}

      <footer className="fcard-foot">
        <div className="fcard-actions">
          <button type="button" className={`qa-btn${liked ? " liked" : ""}`} onClick={toggleLike}>
            <Ic n="heart" s={14} c={liked ? "#EF4444" : "currentColor"} /> {likes}
          </button>
          <button type="button" className="qa-btn" onClick={toggleComments}>
            <Ic n="msg" s={14} /> {cCount}
          </button>
        </div>
        <button type="button" className="qa-btn" onClick={handleReport} title="Report post">
          <Ic n="flag" s={13} /> Report
        </button>
      </footer>

      {commentsOpen && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--brd)" }}>
          {user && (
            <div style={{ marginBottom: 12 }}>
              <RichComposer value={cDraft} onChange={setCDraft} placeholder="Write a comment…" submitLabel="Comment" submitting={cBusy} onSubmit={postComment} minHeight={60} compact />
            </div>
          )}
          {cLoading ? <p style={{ fontSize: 13, color: "var(--mut)" }}>Loading comments…</p> : comments.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--mut)" }}>No comments yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {comments.map((cm) => (
                <div key={cm.id} style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 12, background: "var(--surfH)" }}>
                  <UserAvatar src={cm.user?.avatar_url} av={cm.user?.av} bg={cm.user?.bg} size={30} border="none" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{cm.user?.name} <span style={{ fontWeight: 500, fontSize: 11.5, color: "var(--faint)" }}>@{cm.user?.username} · {cm.time}</span></div>
                    <RichTextView body={cm.body} bodyHtml={cm.body_html} onMention={onOpenMention} style={{ fontSize: 13.5, marginTop: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function CommunityDetailPage({ user, onLogin, toast }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [comm, setComm] = useState(null);
  const [posts, setPosts] = useState([]);
  const [sort, setSort] = useState("recent");
  const [loading, setLoading] = useState(true);
  const [membersOpen, setMembersOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [profileTarget, setProfileTarget] = useState(null);

  // Admin publisher composer
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postImg, setPostImg] = useState(null);
  const [postImportant, setPostImportant] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const loadAll = useCallback(() => {
    setLoading(true);
    Promise.all([getCommunity(slug), listCommunityPosts(slug, { sort })])
      .then(([c, p]) => { setComm(c); setPosts(p.results); })
      .catch(() => { toast("Community not found.", "error"); navigate("/communities"); })
      .finally(() => setLoading(false));
  }, [slug, sort, navigate, toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const toggleFollow = async () => {
    if (!user) { onLogin("follow this community"); return; }
    try {
      const res = comm.is_following ? await unfollowCommunity(comm.slug) : await followCommunity(comm.slug);
      setComm((p) => ({ ...p, is_following: res.is_following, followers_count: res.followers_count, notif_level: res.notif_level || p.notif_level }));
      toast(res.is_following ? `Following ${comm.name}` : `Unfollowed ${comm.name}`, "success");
    } catch (e) { toast(e.message || "Could not update follow.", "error"); }
  };

  const changeNotif = async (lvl) => {
    try {
      const res = await updateCommunityNotifs(comm.slug, lvl);
      setComm((p) => ({ ...p, notif_level: res.notif_level }));
      toast("Notification preference saved.", "success");
    } catch (e) { toast(e.message || "Could not save preference.", "error"); }
  };

  const publishPost = async () => {
    const plain = stripMarkup(postBody).trim();
    if (!plain) { toast("Write your post content first.", "error"); return; }
    setPublishing(true);
    try {
      const created = await createCommunityPost(comm.slug, {
        title: postTitle.trim(),
        body: plain,
        bodyHtml: markupToHtml(postBody.trim()),
        isImportant: postImportant,
        image: postImg,
      });
      setPosts((prev) => [created, ...prev]);
      setPostTitle(""); setPostBody(""); setPostImg(null); setPostImportant(false);
      toast("Published to community!", "success");
    } catch (e) { toast(e.message || "Could not publish post.", "error"); }
    finally { setPublishing(false); }
  };

  const openMembers = async () => {
    setMembersOpen(true);
    listCommunityMembers(comm.slug).then(setMembers).catch(() => setMembers([]));
  };

  const changeRole = async (uid, role) => {
    try {
      await setCommunityRole(comm.slug, uid, role);
      setMembers((prev) => prev.map((m) => (m.user.id === uid ? { ...m, role } : m)));
      toast("Member role updated.", "success");
    } catch (e) { toast(e.message || "Could not update role.", "error"); }
  };

  if (loading || !comm) {
    return (
      <div className="comm-page">
        <div className="raised" style={{ padding: 28 }}><Skel h={160} mb={16} /><Skel h={24} w="45%" mb={8} /><Skel h={14} w="75%" /></div>
      </div>
    );
  }

  return (
    <div className="comm-page">
      <button type="button" className="btn btn-ghost" style={{ marginBottom: 12 }} onClick={() => navigate("/communities")}>
        <Ic n="arrowL" s={15} /> All Communities
      </button>

      {/* Community Hero Card */}
      <section className="raised fu" style={{ overflow: "hidden", marginBottom: 20 }}>
        <div
          style={{
            height: 170,
            background: comm.cover_url ? undefined : `linear-gradient(135deg, ${comm.accent_color || "#2563EB"}, #0E1A33)`,
            position: "relative",
          }}
        >
          {comm.cover_url && <img src={comm.cover_url} alt={comm.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        </div>

        <div style={{ padding: "0 22px 22px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginTop: -36, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
              <div className="comm-av" style={{ width: 76, height: 76, fontSize: 28, border: "4px solid var(--surf)", background: comm.accent_color || "#2563EB" }}>
                {comm.avatar_url ? <img src={comm.avatar_url} alt={comm.name} /> : <span>{(comm.name || "C")[0]}</span>}
              </div>
              <div style={{ paddingBottom: 4 }}>
                <h1 style={{ fontSize: "clamp(20px,3vw,26px)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {comm.name}
                  {comm.is_official && <span className="comm-official">Official</span>}
                </h1>
                <div style={{ fontSize: 13, color: "var(--mut)" }}>
                  {comm.category} · {comm.followers_count} followers · {comm.posts_count} posts
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {comm.is_following && (
                <select
                  className="inp"
                  style={{ height: 40, width: "auto", fontSize: 13, padding: "0 32px 0 12px" }}
                  value={comm.notif_level || "all"}
                  onChange={(e) => changeNotif(e.target.value)}
                  aria-label="Community notification preferences"
                >
                  <option value="all">Notifs: All posts</option>
                  <option value="important">Notifs: Important only</option>
                  <option value="none">Notifs: Muted</option>
                </select>
              )}
              <button type="button" className="btn btn-out" style={{ height: 40 }} onClick={openMembers}>
                <Ic n="users" s={15} /> Followers
              </button>
              {comm.my_role !== "owner" && (
                <button type="button" className={`btn ${comm.is_following ? "btn-out" : "btn-navy"}`} style={{ height: 40 }} onClick={toggleFollow}>
                  {comm.is_following ? "Following" : "Follow"}
                </button>
              )}
            </div>
          </div>

          <p style={{ fontSize: 14.5, color: "var(--mut)", lineHeight: 1.65 }}>{comm.description}</p>
        </div>
      </section>

      <div className="pf-grid">
        <div style={{ minWidth: 0 }}>
          {/* Channel-style publishing: ONLY visible to authorized owners/admins/moderators */}
          {comm.can_publish ? (
            <div className="raised" style={{ padding: 18, marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <strong style={{ fontSize: 15 }}>Publish Official Community Post</strong>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--mut)", cursor: "pointer" }}>
                  <input type="checkbox" checked={postImportant} onChange={(e) => setPostImportant(e.target.checked)} />
                  Mark as Important Announcement
                </label>
              </div>
              <input className="inp" style={{ height: 42, marginBottom: 10 }} placeholder="Optional post headline…" value={postTitle} onChange={(e) => setPostTitle(e.target.value)} />
              <RichComposer
                value={postBody}
                onChange={setPostBody}
                placeholder={`Share an update with ${comm.name} followers…`}
                allowImage
                image={postImg}
                onImageChange={setPostImg}
                submitLabel="Publish"
                submitting={publishing}
                onSubmit={publishPost}
                minHeight={84}
              />
            </div>
          ) : (
            <div className="raised" style={{ padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "var(--mut)", display: "flex", alignItems: "center", gap: 8 }}>
              <Ic n="info" s={15} c="var(--accent)" />
              <span>Channel mode: Community administrators publish official posts here. Followers can like, comment, and join the discussion below each post.</span>
            </div>
          )}

          {/* Posts sort bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 18 }}>Community Updates</h2>
            <select className="cmt-sort-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort community posts">
              <option value="recent">Most Recent</option>
              <option value="popular">Most Liked</option>
              <option value="important">Announcements Only</option>
            </select>
          </div>

          {posts.length === 0 ? (
            <div className="raised lib-empty">
              <Ic n="msg" s={34} c="var(--faint)" />
              <h3>No posts yet</h3>
              <p>{comm.can_publish ? "Publish the first announcement above!" : "Check back soon for updates from the community admins."}</p>
            </div>
          ) : (
            posts.map((p) => (
              <CommunityPostCard
                key={p.id}
                post={p}
                user={user}
                onLogin={onLogin}
                toast={toast}
                onDeleted={(pid) => setPosts((prev) => prev.filter((x) => x.id !== pid))}
                onOpenProfile={setProfileTarget}
                onOpenMention={(handle, anchor) => setProfileTarget({ username: handle, anchor })}
              />
            ))
          )}
        </div>

        {/* Sidebar: Community Rules & Info */}
        <aside className="pf-side">
          <section className="raised pf-card">
            <h2>About &amp; Guidelines</h2>
            <p className="pf-card-sub">{comm.category} · {comm.visibility === "private" ? "Private" : "Public"} Community</p>
            {comm.rules ? (
              <p style={{ fontSize: 13.5, color: "var(--mut)", whiteSpace: "pre-line", lineHeight: 1.65 }}>{comm.rules}</p>
            ) : (
              <p style={{ fontSize: 13.5, color: "var(--mut)" }}>Follow CampusNetwork community standards: be respectful, stay on-topic, and support fellow students.</p>
            )}
          </section>
        </aside>
      </div>

      {/* Followers & Role Management Modal */}
      {membersOpen && (
        <Modal onClose={() => setMembersOpen(false)} maxW={480} showClose label="Community Followers">
          <div style={{ padding: "24px 20px" }}>
            <h3 style={{ fontSize: 19, marginBottom: 14 }}>Followers ({comm.followers_count})</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 380, overflowY: "auto" }}>
              {members.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 12, background: "var(--surfH)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <UserAvatar src={m.user.avatar_url} av={m.user.av} bg={m.user.bg} size={36} border="none" />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.user.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--mut)" }}>@{m.user.username} · {m.role}</div>
                    </div>
                  </div>
                  {comm.my_role === "owner" && m.role !== "owner" && (
                    <select
                      className="cmt-sort-select"
                      value={m.role}
                      onChange={(e) => changeRole(m.user.id, e.target.value)}
                      aria-label={`Role for ${m.user.name}`}
                    >
                      <option value="follower">Follower</option>
                      <option value="moderator">Moderator</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {profileTarget && (
        <AuthorPopover
          userId={profileTarget.userId}
          username={profileTarget.username}
          anchor={profileTarget.anchor}
          viewer={user}
          toast={toast}
          onGuest={(a) => { setProfileTarget(null); onLogin(a); }}
          onClose={() => setProfileTarget(null)}
        />
      )}
    </div>
  );
}
