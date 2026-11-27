import { useState, useEffect, useCallback } from 'react';
import T from '../tokens';
import Ic from '../components/Ic';
import UserAvatar from '../components/ui/UserAvatar';
import VerifiedBadge from '../components/ui/VerifiedBadge';
import RichTextView from '../components/ui/RichTextView';
import RichComposer, { markupToHtml, stripMarkup } from '../components/ui/RichComposer';
import AuthorPopover from '../components/feed/AuthorPopover';
import MediaGrid from '../components/feed/MediaGrid';
import AdCard from '../components/ads/AdCard';
import QuickAskModal from '../modals/QuickAskModal';
import {
  getQuestion, listQuestionComments, answerQuestion, likeQuestion,
  voteAnswer, deleteAnswer, reportAnswer,
} from '../api/questions';
import { serveAds } from '../api/ads';
import { normalizeMediaUrl } from '../api/client';

const SORT_OPTIONS = [
  { key: "recent", label: "Most Recent" },
  { key: "liked", label: "Most Liked" },
  { key: "oldest", label: "Oldest First" },
  { key: "disliked", label: "Most Disliked" },
  { key: "recommended", label: "Recommended" },
];

/** Flatten arbitrarily nested replies onto a single uniform indented rail (no staircase squishing). */
function flattenReplies(root) {
  const out = [];
  const walk = (node, showReplyingTo) => {
    const parentHandle = node.username || node.user || "";
    const kids = node.replies || [];
    for (const child of kids) {
      out.push({
        item: child,
        replyingTo: showReplyingTo && parentHandle ? parentHandle : null,
      });
      walk(child, true);
    }
  };
  walk(root, false);
  return out;
}

function CommentItem({
  c, depth = 0, replyingTo = null, user, onLogin, toast, onOpenProfile, onOpenMention, onVote, onReplySubmit, onDelete, onReport,
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyImg, setReplyImg] = useState(null);
  const [replyBusy, setReplyBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const exactDate = c.createdAt ? new Date(c.createdAt).toLocaleString() : "";

  const sendReply = async () => {
    if (!user) { onLogin("reply to comments"); return; }
    const plain = stripMarkup(replyText).trim();
    if (!plain && !replyImg) { toast("Write a reply first", "error"); return; }
    setReplyBusy(true);
    try {
      await onReplySubmit(c.id, {
        body: plain,
        bodyHtml: markupToHtml(replyText.trim()),
        parent: c.id,
        image: replyImg,
      });
      setReplyText("");
      setReplyImg(null);
      setReplyOpen(false);
      setCollapsed(false);
    } finally { setReplyBusy(false); }
  };

  return (
    <div className={`cmt-node${depth > 0 ? " cmt-reply" : ""}`}>
      <div className="cmt-row">
        <button
          type="button"
          className="cmt-av-btn"
          onClick={(e) => c.userId && onOpenProfile({ userId: c.userId, anchor: e.currentTarget })}
          aria-label={`View ${c.user}'s profile`}
        >
          <UserAvatar src={c.avatarUrl} av={c.av} bg={c.bg} size={depth > 0 ? 32 : 38} border="2px solid var(--surf)" />
        </button>

        <div className="cmt-main">
          <div className="cmt-head">
            <button
              type="button"
              className="cmt-author"
              onClick={(e) => c.userId && onOpenProfile({ userId: c.userId, anchor: e.currentTarget })}
            >
              <span>{c.user}</span>
              {c.staff && <span className="cmt-staff-pill"><Ic n="shield" s={10} c={T.gold} /> SUG</span>}
              {c.isVerifiedStudent && <VerifiedBadge size={14} />}
              {c.username && <span className="cmt-handle">@{c.username}</span>}
            </button>
            <span className="cmt-time" title={exactDate}>{c.time}</span>
          </div>

          {replyingTo && (
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 3 }}>
              Replying to @{replyingTo}
            </div>
          )}

          <RichTextView
            body={c.body}
            bodyHtml={c.bodyHtml}
            onMention={onOpenMention}
            className="cmt-body"
          />

          {c.imageUrl && (
            <div className="cmt-img-wrap">
              <img
                src={normalizeMediaUrl(c.imageUrl)}
                alt="Comment attachment"
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            </div>
          )}

          {/* Upvote ^, Downvote v, Reply, Overflow Menu */}
          <div className="cmt-actions">
            <button
              type="button"
              className={`cmt-act${c.myVote === "up" ? " up-on" : ""}`}
              onClick={() => onVote(c.id, "up")}
              aria-pressed={c.myVote === "up"}
              aria-label="Upvote comment"
            >
              <Ic n="up" s={15} stroke={2.6} /> <span>{c.upvotes ?? 0}</span>
            </button>

            <button
              type="button"
              className={`cmt-act${c.myVote === "down" ? " down-on" : ""}`}
              onClick={() => onVote(c.id, "down")}
              aria-pressed={c.myVote === "down"}
              aria-label="Downvote comment"
            >
              <Ic n="down" s={15} stroke={2.6} /> <span>{c.downvotes ?? 0}</span>
            </button>

            {depth < 3 && (
              <button
                type="button"
                className="cmt-act"
                onClick={() => {
                  if (!user) { onLogin("reply to comments"); return; }
                  setReplyOpen((o) => !o);
                }}
              >
                <Ic n="msg" s={13} /> Reply
              </button>
            )}

            <div style={{ position: "relative" }}>
              <button type="button" className="cmt-act" onClick={() => setMenuOpen((o) => !o)} aria-label="More comment actions">
                <Ic n="more" s={14} />
              </button>
              {menuOpen && (
                <div className="fcard-menu" style={{ left: 0, right: "auto", minWidth: 160 }} onMouseLeave={() => setMenuOpen(false)}>
                  {c.canDelete && (
                    <button type="button" className="danger" onClick={() => { setMenuOpen(false); onDelete(c.id); }}>
                      <Ic n="trash" s={13} /> Delete
                    </button>
                  )}
                  <button type="button" onClick={() => { setMenuOpen(false); onReport(c.id); }}>
                    <Ic n="flag" s={13} /> Report
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Inline threaded reply composer */}
          {replyOpen && (
            <div style={{ marginTop: 10 }}>
              <RichComposer
                value={replyText}
                onChange={setReplyText}
                placeholder={`Reply to @${c.username || c.user}…`}
                allowImage
                image={replyImg}
                onImageChange={setReplyImg}
                submitLabel="Reply"
                submitting={replyBusy}
                onSubmit={sendReply}
                minHeight={64}
                compact
                autoFocus
              />
            </div>
          )}

          {/* All replies rendered on ONE uniform indented straight-line rail (depth === 0 only) */}
          {depth === 0 && (() => {
            const flat = flattenReplies(c);
            if (!flat.length) return null;
            return (
              <div className="cmt-thread">
                {flat.length > 2 && (
                  <button type="button" className="cmt-collapse-btn" onClick={() => setCollapsed((x) => !x)}>
                    {collapsed ? `Show ${flat.length} replies` : `Hide ${flat.length} replies`}
                  </button>
                )}
                {!collapsed && flat.map(({ item, replyingTo: toHandle }) => (
                  <CommentItem
                    key={item.id}
                    c={item}
                    depth={1}
                    replyingTo={toHandle}
                    user={user}
                    onLogin={onLogin}
                    toast={toast}
                    onOpenProfile={onOpenProfile}
                    onOpenMention={onOpenMention}
                    onVote={onVote}
                    onReplySubmit={onReplySubmit}
                    onDelete={onDelete}
                    onReport={onReport}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function updateCommentTree(list, targetId, updater) {
  return list.map((c) => {
    if (c.id === targetId) return updater(c);
    if (c.replies && c.replies.length > 0) {
      return { ...c, replies: updateCommentTree(c.replies, targetId, updater) };
    }
    return c;
  });
}

function removeFromTree(list, targetId) {
  return list
    .filter((c) => c.id !== targetId)
    .map((c) => (c.replies?.length ? { ...c, replies: removeFromTree(c.replies, targetId) } : c));
}

function QuestionPage({ q: initial, onBack, user, onLogin, toast }) {
  const [q, setQ] = useState(initial);
  const [comments, setComments] = useState(initial.answers || []);
  const [totalComments, setTotalComments] = useState(initial.ans || (initial.answers || []).length);
  const [sort, setSort] = useState("recent");
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [draft, setDraft] = useState("");
  const [draftImg, setDraftImg] = useState(null);
  const [posting, setPosting] = useState(false);

  const [profileTarget, setProfileTarget] = useState(null); // { userId?, username?, anchor }
  const [editOpen, setEditOpen] = useState(false);
  const [commentAds, setCommentAds] = useState([]);

  useEffect(() => {
    getQuestion(initial.id)
      .then((full) => { setQ(full); })
      .catch(() => {});
    if (!user?.hideAds) {
      serveAds("comments").then(setCommentAds).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id, user?.hideAds]);

  const loadComments = useCallback((pg = 1, srt = sort) => {
    if (pg === 1) setLoading(true);
    listQuestionComments(initial.id, { sort: srt, page: pg })
      .then(({ items, hasMore: more, count }) => {
        setComments((prev) => (pg === 1 ? items : [...prev, ...items]));
        setHasMore(more);
        setPage(pg);
        setTotalComments(count);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [initial.id, sort]);

  useEffect(() => { loadComments(1, sort); }, [loadComments, sort]);

  const toggleQuestionLike = () => {
    if (!user) { onLogin("like posts"); return; }
    setQ((p) => ({ ...p, liked: !p.liked, likes: p.liked ? p.likes - 1 : p.likes + 1 }));
    likeQuestion(q.id).catch(() => toast("Could not update like.", "error"));
  };

  const postTopComment = async () => {
    if (!user) { onLogin("post a comment"); return; }
    const plain = stripMarkup(draft).trim();
    if (!plain && !draftImg) { toast("Write your comment first", "error"); return; }
    setPosting(true);
    try {
      const created = await answerQuestion(q.id, {
        body: plain,
        bodyHtml: markupToHtml(draft.trim()),
        image: draftImg,
      });
      setComments((prev) => (sort === "oldest" ? [...prev, created] : [created, ...prev]));
      setTotalComments((n) => n + 1);
      setQ((p) => ({ ...p, ans: (p.ans || 0) + 1, answered: true }));
      setDraft("");
      setDraftImg(null);
      toast("Comment posted!", "success");
    } catch (e) {
      toast(e.message || "Could not post your comment.", "error");
    } finally { setPosting(false); }
  };

  const handleReplySubmit = async (parentId, payload) => {
    try {
      const created = await answerQuestion(q.id, payload);
      setComments((prev) =>
        updateCommentTree(prev, parentId, (node) => ({
          ...node,
          replies: [...(node.replies || []), created],
        })),
      );
      setQ((p) => ({ ...p, ans: (p.ans || 0) + 1, answered: true }));
      toast("Reply posted!", "success");
    } catch (e) {
      toast(e.message || "Could not post reply.", "error");
      throw e;
    }
  };

  const handleVoteComment = async (cid, dir) => {
    if (!user) { onLogin("vote on comments"); return; }
    try {
      const res = await voteAnswer(cid, dir);
      setComments((prev) =>
        updateCommentTree(prev, cid, (node) => ({
          ...node,
          upvotes: res.upvotes,
          downvotes: res.downvotes,
          myVote: res.my_vote,
        })),
      );
    } catch { toast("Could not update vote.", "error"); }
  };

  const handleDeleteComment = async (cid) => {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await deleteAnswer(cid);
      setComments((prev) => removeFromTree(prev, cid));
      setTotalComments((n) => Math.max(0, n - 1));
      toast("Comment deleted.", "success");
    } catch (e) { toast(e.message || "Could not delete comment.", "error"); }
  };

  const handleReportComment = async (cid) => {
    if (!user) { onLogin("report content"); return; }
    const reason = window.prompt("Why are you reporting this comment?");
    if (!reason || reason.trim().length < 5) return;
    try {
      await reportAnswer(cid, reason.trim());
      toast("Report submitted for moderation.", "success");
    } catch (e) { toast(e.message || "Could not submit report.", "error"); }
  };

  const openMention = (handle, anchor) => setProfileTarget({ username: handle, anchor });

  return (
    <div style={{ maxWidth: 780, margin: "0 auto" }}>
      <button type="button" className="btn btn-ghost" style={{ marginBottom: 14 }} onClick={onBack}>
        <Ic n="arrowL" s={16} /> Back to Feed
      </button>

      {/* Main Question Card */}
      <article className="card fu" style={{ padding: "clamp(18px,3vw,28px)", marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              onClick={(e) => q.userId && setProfileTarget({ userId: q.userId, anchor: e.currentTarget })}
              aria-label={`View ${q.user}'s profile`}
            >
              <UserAvatar src={q.avatarUrl} av={q.av} bg={q.bg} size={48} border="3px solid var(--surf)" />
            </button>
            <div>
              <button
                type="button"
                className="fcard-name"
                onClick={(e) => q.userId && setProfileTarget({ userId: q.userId, anchor: e.currentTarget })}
              >
                <span>{q.user}</span>
                {q.staff && <Ic n="shield" s={13} c={T.gold} />}
                {q.isVerifiedStudent && <VerifiedBadge size={15} />}
                {q.username && <span style={{ fontWeight: 500, fontSize: 12.5, color: "var(--faint)" }}>@{q.username}</span>}
              </button>
              <div style={{ fontSize: 12, color: "var(--faint)" }}>
                {q.dept} · {q.time}{q.editedAt ? " · Edited" : ""}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {q.canEdit && (
              <button type="button" className="btn btn-out" style={{ height: 34, minHeight: 34, padding: "0 12px", fontSize: 12.5 }} onClick={() => setEditOpen(true)}>
                <Ic n="edit" s={13} /> Edit
              </button>
            )}
            <span className={`badge-state${q.answered ? " ok" : ""}`}>{q.answered ? "Answered" : "Open"}</span>
          </div>
        </div>

        <h1 style={{ fontSize: "clamp(20px,3vw,25px)", lineHeight: 1.32, marginBottom: 12 }}>{q.title}</h1>
        <RichTextView body={q.body} bodyHtml={q.bodyHtml} onMention={openMention} style={{ fontSize: 15, color: "var(--mut)", lineHeight: 1.75, marginBottom: 16 }} />
        <MediaGrid media={q.media || []} title={q.title} />

        {q.tags && q.tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "14px 0 18px" }}>
            {q.tags.map((tg) => <span key={tg} className="tag">#{tg}</span>)}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 14, borderTop: "1px solid var(--brd)" }}>
          <button type="button" onClick={toggleQuestionLike} className={`qa-btn${q.liked ? " liked" : ""}`}>
            <Ic n="heart" s={16} c={q.liked ? "#EF4444" : "currentColor"} /> {q.likes}
          </button>
          <span style={{ fontSize: 13.5, color: "var(--faint)", display: "flex", alignItems: "center", gap: 5 }}>
            <Ic n="eye" s={14} /> {q.views} views
          </span>
        </div>
      </article>

      {/* ── MODULE 2: REDESIGNED COMMENTS SECTION (Composer at TOP!) ── */}
      <section className="raised cmt-section" aria-label="Comments">
        {/* Persistent Top Composer */}
        <div className="cmt-top-composer">
          {user ? (
            <RichComposer
              value={draft}
              onChange={setDraft}
              placeholder="Add comment… (Supports Bold, Italic, Underline, images, emojis & @mentions)"
              allowImage
              image={draftImg}
              onImageChange={setDraftImg}
              submitLabel="Submit"
              submitting={posting}
              onSubmit={postTopComment}
              minHeight={82}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 14px", borderRadius: 16, background: "var(--surfH)" }}>
              <span style={{ fontSize: 14, color: "var(--mut)" }}>Sign in to join the conversation and upvote helpful answers.</span>
              <button type="button" className="btn btn-navy" style={{ height: 38, minHeight: 38 }} onClick={() => onLogin("post a comment")}>Sign In</button>
            </div>
          )}
        </div>

        {/* Comments Header + Count Pill + Sorting Dropdown */}
        <div className="cmt-list-head">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ fontSize: 16, fontFamily: "'DM Sans',sans-serif", fontWeight: 800 }}>Comments</h3>
            <span className="cmt-count-pill">{q.ans ?? totalComments}</span>
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--mut)" }}>
            <span className="sr-only">Sort comments</span>
            <select
              className="cmt-sort-select"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort comments"
            >
              {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
        </div>

        {loading && <p style={{ padding: "18px 0", color: "var(--mut)", fontSize: 13.5 }}>Loading comments…</p>}

        {!loading && comments.length === 0 && (
          <div style={{ textAlign: "center", padding: "28px 12px", color: "var(--mut)", fontSize: 14 }}>
            No comments yet. Start the discussion above!
          </div>
        )}

        <div className="cmt-list">
          {comments.map((c, idx) => (
            <div key={c.id}>
              <CommentItem
                c={c}
                depth={0}
                user={user}
                onLogin={onLogin}
                toast={toast}
                onOpenProfile={setProfileTarget}
                onOpenMention={openMention}
                onVote={handleVoteComment}
                onReplySubmit={handleReplySubmit}
                onDelete={handleDeleteComment}
                onReport={handleReportComment}
              />
              {!user?.hideAds && commentAds.length > 0 && idx === 1 && (
                <div style={{ margin: "12px 0" }}>
                  <AdCard ad={commentAds[0]} placement="comments" />
                </div>
              )}
            </div>
          ))}
        </div>

        {hasMore && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button type="button" className="btn btn-out" onClick={() => loadComments(page + 1, sort)}>
              Load more comments
            </button>
          </div>
        )}
      </section>

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

      {editOpen && (
        <QuickAskModal
          editingQuestion={q}
          user={user}
          onLogin={onLogin}
          toast={toast}
          onClose={() => setEditOpen(false)}
          onPosted={(updated) => { if (updated) setQ((p) => ({ ...p, ...updated })); }}
        />
      )}
    </div>
  );
}

export default QuestionPage;
