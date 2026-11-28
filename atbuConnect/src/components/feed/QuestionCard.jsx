import { useRef, useState } from 'react';
import T from '../../tokens';
import Ic from '../Ic';
import { VoteButtons, ReadingTime } from '../ui/shared';
import UserAvatar from '../ui/UserAvatar';
import VerifiedBadge from '../ui/VerifiedBadge';
import RichTextView from '../ui/RichTextView';
import MediaGrid from './MediaGrid';
import ShareFan from './ShareFan';
import { useI18n } from '../../i18n';
import { getQuestionLikers, hideQuestion, reportQuestion, votePoll } from '../../api/questions';

const clip = { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" };

export default function QuestionCard({
  q, index, expanded, onToggle, onVote, onLike, onSave, onOpen, onOpenCommunity, onTag, onAuthor, onMention, onEdit, onDelete, toast,
}) {
  const { t } = useI18n();
  const authorBtn = useRef(null);
  const [menu, setMenu] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [pollState, setPollState] = useState({
    options: q.pollOptions || [],
    total: q.pollTotalVotes || 0,
    myOpt: q.myPollOption ?? null,
  });
  const long = q.body.length > 260 || q.body.split("\n").length > 4;
  const isComm = !!q.isCommunityPost;
  const url = isComm
    ? `${window.location.origin}/communities/${q.communitySlug}`
    : `${window.location.origin}/q/${q.publicId || q.id}`;

  if (hidden) return null;

  const handleSeeLess = async () => {
    setMenu(false);
    try {
      await hideQuestion(q.id);
      setHidden(true);
      toast && toast("We'll show you less like this.", "info");
    } catch (e) { toast && toast(e.message || "Sign in to customize your feed.", "error"); }
  };

  const handleReport = async () => {
    setMenu(false);
    const reason = window.prompt("Why are you reporting this post? (min 5 characters)");
    if (!reason || reason.trim().length < 5) return;
    try {
      await reportQuestion(q.id, reason.trim());
      toast && toast("Post reported to moderators.", "success");
    } catch (e) { toast && toast(e.message || "Could not submit report.", "error"); }
  };

  const handleOpenAnalytics = async () => {
    setMenu(false);
    setAnalyticsBusy(true);
    try {
      const data = await getQuestionLikers(q.id);
      setAnalytics(data);
    } catch (e) {
      toast && toast(e.message || "Only the post author can view analytics.", "error");
    } finally { setAnalyticsBusy(false); }
  };

  const handleVotePoll = async (optId) => {
    try {
      const res = await votePoll(q.id, optId);
      setPollState({ options: res.poll_options || [], total: res.poll_total_votes || 0, myOpt: res.my_poll_option });
    } catch (e) { toast && toast(e.message || "Sign in to vote in polls.", "error"); }
  };

  const deadline = q.deleteDeadline ? new Date(q.deleteDeadline) : null;
  const deadlineText = deadline ? deadline.toLocaleString(undefined, { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }) : "";

  const hasTitle = Boolean((q.title || "").trim());

  return (
    <article
      className={`fcard fu${menu ? " fcard--menu-open" : ""}`}
      style={{ animationDelay: `${Math.min(index, 6) * 0.05}s` }}
      aria-labelledby={hasTitle ? `q-${q.feedKey || q.id}-t` : undefined}
    >
      {isComm && q.communityName && (
        <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => onOpenCommunity && onOpenCommunity(q.communitySlug)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 11px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              background: `${q.communityAccentColor || "#2563EB"}1A`,
              color: q.communityAccentColor || "var(--accent)",
              border: `1px solid ${q.communityAccentColor || "#2563EB"}44`,
              cursor: "pointer",
            }}
          >
            <Ic n="users" s={12} c={q.communityAccentColor || "var(--accent)"} />
            <span>From {q.communityName}</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
      )}
      <header className="fcard-head">
        <button
          ref={authorBtn}
          type="button"
          className="fcard-av"
          style={{ padding: 0, background: "transparent", border: "none", boxShadow: "none" }}
          onClick={() => q.userId && onAuthor(q.userId, authorBtn.current)}
          aria-label={t("feed.viewProfile", { name: q.user })}
          aria-haspopup="dialog"
        >
          <UserAvatar src={q.avatarUrl} av={q.av} bg={q.bg} size={46} border="3px solid var(--surf)" />
        </button>
        <div className="fcard-who">
          <button
            type="button"
            className="fcard-name"
            onClick={() => q.userId && onAuthor(q.userId, authorBtn.current)}
            aria-haspopup="dialog"
          >
            <span>{q.user}</span>
            {q.staff && <Ic n="shield" s={12} c={T.gold} />}
            {q.isVerifiedStudent && <VerifiedBadge size={14} />}
            {q.username && <span style={{ fontWeight: 500, fontSize: 12.5, color: "var(--faint)" }}>@{q.username}</span>}
          </button>
          <div className="fcard-meta">
            {q.dept} · {q.time}{q.editedAt ? " · Edited" : ""} · <ReadingTime text={q.body} />
          </div>
        </div>

        <div className="fcard-badges">
          {q.promoted && <span className="badge-promo">{t("feed.promoted")}</span>}
          <span className={`badge-state${q.answered ? " ok" : ""}`}>{q.answered ? t("feed.answered") : t("feed.open")}</span>
          <span className="fcard-more">
            <button type="button" className="qa-icon" aria-haspopup="menu" aria-expanded={menu} aria-label={t("feed.moreActions")} onClick={() => setMenu((m) => !m)}>
              <Ic n="more" s={18} />
            </button>
            {menu && (
              <div className="fcard-menu" role="menu" onMouseLeave={() => setMenu(false)}>
                {(q.canEdit || q.canDelete) && (
                  <button type="button" role="menuitem" onClick={handleOpenAnalytics} disabled={analyticsBusy}>
                    <Ic n="eye" s={14} /> Analytics &amp; Liked By
                  </button>
                )}
                <button type="button" role="menuitem" onClick={() => { setMenu(false); navigator.clipboard?.writeText(url); toast && toast("Link copied!", "success"); }}>
                  <Ic n="link" s={14} /> Copy link
                </button>
                <button type="button" role="menuitem" onClick={handleSeeLess}>
                  <Ic n="eyeOff" s={14} /> See less of this
                </button>
                <button type="button" role="menuitem" onClick={handleReport}>
                  <Ic n="flag" s={14} /> Report post
                </button>
                {q.canEdit && onEdit && (
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); onEdit(q); }}>
                    <Ic n="edit" s={14} /> Edit post
                  </button>
                )}
                {q.canDelete && (
                  <button type="button" role="menuitem" className="danger" onClick={() => { setMenu(false); onDelete(q); }}>
                    <Ic n="trash" s={14} />{t("feed.delete")}
                  </button>
                )}
                {deadlineText && <p>{t("feed.deleteUntil", { time: deadlineText })}</p>}
              </div>
            )}
          </span>
        </div>
      </header>

      {hasTitle && (
        <h3 id={`q-${q.feedKey || q.id}-t`} className="fcard-title">
          <button type="button" onClick={() => onOpen(q)}>{q.title}</button>
        </h3>
      )}
      {q.body && (
        <>
          <div onClick={!hasTitle ? () => onOpen(q) : undefined}>
            <RichTextView
              body={q.body}
              bodyHtml={q.bodyHtml}
              onMention={onMention}
              className={`fcard-body${!hasTitle ? " fcard-body--lead" : ""}`}
              style={expanded ? undefined : clip}
            />
          </div>
          {long && (
            <button type="button" className="fcard-more-btn" onClick={() => onToggle(q.feedKey || q.id)} aria-expanded={!!expanded}>
              {expanded ? t("feed.showLess") : t("feed.readMore")}
            </button>
          )}
        </>
      )}

      <MediaGrid media={q.media} title={q.title} />

      {pollState.options.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "10px 0 4px" }}>
          {pollState.options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleVotePoll(opt.id)}
              style={{
                position: "relative",
                overflow: "hidden",
                textAlign: "left",
                padding: "10px 14px",
                borderRadius: 12,
                border: opt.voted ? "1.5px solid var(--accent)" : "1px solid var(--brd)",
                background: "var(--surfH)",
                color: "var(--txt)",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontWeight: opt.voted ? 700 : 500,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${opt.percent || 0}%`,
                  background: opt.voted ? "rgba(59,130,246,0.22)" : "rgba(148,163,184,0.14)",
                  pointerEvents: "none",
                }}
              />
              <span style={{ position: "relative" }}>{opt.text}</span>
              <span style={{ position: "relative", fontSize: 12.5, color: "var(--mut)" }}>{opt.percent || 0}%</span>
            </button>
          ))}
          <span style={{ fontSize: 12, color: "var(--faint)" }}>{pollState.total} vote{pollState.total === 1 ? "" : "s"}</span>
        </div>
      )}

      {analytics && (
        <div
          style={{
            marginTop: 10,
            padding: 14,
            borderRadius: 14,
            background: "var(--surfH)",
            border: "1px solid var(--brd)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ fontSize: 13.5 }}>Post Analytics &amp; Liked By</strong>
            <button type="button" className="qa-icon" onClick={() => setAnalytics(null)}><Ic n="x" s={14} /></button>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, color: "var(--mut)", marginBottom: 10 }}>
            <span>Views: <strong>{analytics.views}</strong></span>
            <span>Likes: <strong>{analytics.likes}</strong></span>
            <span>Upvotes: <strong>{analytics.upvotes}</strong></span>
            <span>Comments: <strong>{analytics.comments}</strong></span>
            <span>Saved: <strong>{analytics.bookmarks}</strong></span>
          </div>
          {analytics.likers?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
              {analytics.likers.map((u) => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <UserAvatar src={u.avatar_url} av={u.av} bg={u.bg} size={26} />
                  <strong>{u.name}</strong>
                  <span style={{ color: "var(--faint)" }}>@{u.username}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12.5, color: "var(--faint)", margin: 0 }}>No likes yet.</p>
          )}
        </div>
      )}

      {q.tags.length > 0 && (
        <div className="fcard-tags">
          {q.tags.map((tg) => <button key={tg} type="button" className="tag" onClick={() => onTag(tg)}>#{tg}</button>)}
        </div>
      )}

      <footer className="fcard-foot">
        <div className="fcard-actions">
          {!isComm && <VoteButtons votes={q.votes} voted={q.voted} onVote={(d) => onVote(q.id, d)} />}
          <button type="button" className={`qa-btn${q.liked ? " liked" : ""}`} onClick={() => onLike(q)} aria-pressed={q.liked} aria-label={t("feed.like")}>
            <Ic n="heart" s={14} c={q.liked ? "#EF4444" : "currentColor"} />{q.likes}
          </button>
          <button type="button" className="qa-btn" onClick={() => onOpen(q)} aria-label={t("feed.answersN", { n: q.ans })}>
            <Ic n="msg" s={14} />{q.ans}
          </button>
          <ShareFan url={url} text={q.title || q.body.slice(0, 80)} toast={toast} label={q.title || "Post"} />
        </div>
        {!isComm && (
          <div className="fcard-actions">
            <span className="qa-views" title={t("feed.views")}><Ic n="eye" s={13} />{q.views}</span>
            <button type="button" className={`qa-btn${q.saved ? " saved" : ""}`} onClick={() => onSave(q.id)} aria-pressed={q.saved}>
              <Ic n="bookmark" s={14} c={q.saved ? T.gold : "currentColor"} />{q.saved ? t("feed.saved") : t("feed.save")}
            </button>
          </div>
        )}
      </footer>
    </article>
  );
}
