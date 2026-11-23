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

const clip = { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" };

export default function QuestionCard({
  q, index, expanded, onToggle, onVote, onLike, onSave, onOpen, onTag, onAuthor, onMention, onEdit, onDelete, toast,
}) {
  const { t } = useI18n();
  const authorBtn = useRef(null);
  const [menu, setMenu] = useState(false);
  const long = q.body.length > 260 || q.body.split("\n").length > 4;
  const url = `${window.location.origin}/q/${q.publicId || q.id}`;

  const deadline = q.deleteDeadline ? new Date(q.deleteDeadline) : null;
  const deadlineText = deadline ? deadline.toLocaleString(undefined, { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }) : "";

  return (
    <article className="fcard fu" style={{ animationDelay: `${Math.min(index, 6) * 0.05}s` }} aria-labelledby={`q-${q.id}-t`}>
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
          {(q.canDelete || q.canEdit) && (
            <span className="fcard-more">
              <button type="button" className="qa-icon" aria-haspopup="menu" aria-expanded={menu} aria-label={t("feed.moreActions")} onClick={() => setMenu((m) => !m)}>
                <Ic n="more" s={18} />
              </button>
              {menu && (
                <div className="fcard-menu" role="menu" onMouseLeave={() => setMenu(false)}>
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
          )}
        </div>
      </header>

      <h3 id={`q-${q.id}-t`} className="fcard-title">
        <button type="button" onClick={() => onOpen(q)}>{q.title}</button>
      </h3>
      {q.body && (
        <>
          <RichTextView
            body={q.body}
            bodyHtml={q.bodyHtml}
            onMention={onMention}
            className="fcard-body"
            style={expanded ? undefined : clip}
          />
          {long && (
            <button type="button" className="fcard-more-btn" onClick={() => onToggle(q.id)} aria-expanded={!!expanded}>
              {expanded ? t("feed.showLess") : t("feed.readMore")}
            </button>
          )}
        </>
      )}

      <MediaGrid media={q.media} title={q.title} />

      {q.tags.length > 0 && (
        <div className="fcard-tags">
          {q.tags.map((tg) => <button key={tg} type="button" className="tag" onClick={() => onTag(tg)}>#{tg}</button>)}
        </div>
      )}

      <footer className="fcard-foot">
        <div className="fcard-actions">
          <VoteButtons votes={q.votes} voted={q.voted} onVote={(d) => onVote(q.id, d)} />
          <button type="button" className={`qa-btn${q.liked ? " liked" : ""}`} onClick={() => onLike(q.id)} aria-pressed={q.liked} aria-label={t("feed.like")}>
            <Ic n="heart" s={14} c={q.liked ? "#EF4444" : "currentColor"} />{q.likes}
          </button>
          <button type="button" className="qa-btn" onClick={() => onOpen(q)} aria-label={t("feed.answersN", { n: q.ans })}>
            <Ic n="msg" s={14} />{q.ans}
          </button>
          <ShareFan url={url} text={q.title} toast={toast} label={q.title} />
        </div>
        <div className="fcard-actions">
          <span className="qa-views" title={t("feed.views")}><Ic n="eye" s={13} />{q.views}</span>
          <button type="button" className={`qa-btn${q.saved ? " saved" : ""}`} onClick={() => onSave(q.id)} aria-pressed={q.saved}>
            <Ic n="bookmark" s={14} c={q.saved ? T.gold : "currentColor"} />{q.saved ? t("feed.saved") : t("feed.save")}
          </button>
        </div>
      </footer>
    </article>
  );
}
