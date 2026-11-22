import { useEffect, useRef, useState } from "react";
import Ic from "../Ic";
import UserAvatar from "./UserAvatar";
import { searchUsers } from "../../api/users";

const QUICK_EMOJIS = ["👍", "🔥", "🎉", "👏", "💡", "📚", "🎓", "❤️", "😊", "🙏", "💯", "✅", "🤔", "🚀", "⚡", "👀"];

/**
 * Reusable Rich Composer with Bold / Italic / Underline formatting, Emoji Picker,
 * @username autocomplete, optional image attachment, and live word/char counter.
 * Produces both plain text (`body`) and sanitized-ready HTML (`bodyHtml`) without
 * needing fragile contentEditable hacks.
 */
export function markupToHtml(text) {
  if (!text) return "";
  // Escape HTML first, then convert simple safe tags / markers
  let s = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/__([^_\n]+)__/g, "<u>$1</u>");
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<i>$1</i>");
  s = s.replace(/\n/g, "<br/>");
  return s;
}

export function stripMarkup(text) {
  return String(text || "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1");
}

export default function RichComposer({
  value,
  onChange,
  placeholder = "Add comment…",
  disabled = false,
  minHeight = 82,
  maxWords = null,
  maxChars = 4000,
  allowImage = false,
  image = null,
  onImageChange = null,
  submitLabel = "Submit",
  submitting = false,
  onSubmit = null,
  compact = false,
  autoFocus = false,
  footerLeft = null,
}) {
  const taRef = useRef(null);
  const fileRef = useRef(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionHits, setMentionHits] = useState([]);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [imgPreview, setImgPreview] = useState(null);

  useEffect(() => {
    if (!image) { setImgPreview(null); return; }
    const url = URL.createObjectURL(image);
    setImgPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  useEffect(() => {
    if (mentionQuery === null) { setMentionHits([]); return; }
    if (mentionQuery.length < 1) { setMentionHits([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      searchUsers(mentionQuery)
        .then((u) => { if (alive) { setMentionHits(u.slice(0, 6)); setMentionIdx(0); } })
        .catch(() => { if (alive) setMentionHits([]); });
    }, 180);
    return () => { alive = false; clearTimeout(t); };
  }, [mentionQuery]);

  const detectMention = (val, cursor) => {
    const before = val.slice(0, cursor);
    const m = before.match(/(?:^|\s)@([A-Za-z0-9_.-]{0,30})$/);
    setMentionQuery(m ? m[1] : null);
  };

  const handleChange = (e) => {
    const next = e.target.value;
    onChange(next);
    detectMention(next, e.target.selectionStart);
  };

  const wrapSelection = (before, after) => {
    const el = taRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || "text";
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 10);
  };

  const insertAtCursor = (snippet) => {
    const el = taRef.current;
    if (!el) { onChange(value + snippet); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    setTimeout(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
      detectMention(next, pos);
    }, 10);
  };

  const pickMention = (u) => {
    const el = taRef.current;
    const cursor = el?.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const replaced = before.replace(/@[A-Za-z0-9_.-]*$/, `@${u.username} `);
    const next = replaced + value.slice(cursor);
    onChange(next);
    setMentionQuery(null);
    setMentionHits([]);
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(replaced.length, replaced.length);
    }, 10);
  };

  const handleKeyDown = (e) => {
    if (mentionHits.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionHits.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx((i) => (i - 1 + mentionHits.length) % mentionHits.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(mentionHits[mentionIdx]); return; }
      if (e.key === "Escape") { setMentionQuery(null); setMentionHits([]); return; }
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); wrapSelection("**", "**"); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") { e.preventDefault(); wrapSelection("*", "*"); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "u") { e.preventDefault(); wrapSelection("__", "__"); }
  };

  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const overWords = maxWords && words > maxWords;
  const overChars = maxChars && value.length > maxChars;

  return (
    <div className={`rc-box${compact ? " rc-compact" : ""}`}>
      <textarea
        ref={taRef}
        className="rc-ta"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(e) => detectMention(e.target.value, e.target.selectionStart)}
        placeholder={placeholder}
        disabled={disabled || submitting}
        autoFocus={autoFocus}
        style={{ minHeight }}
      />

      {/* @mention live autocomplete dropdown */}
      {mentionHits.length > 0 && (
        <div className="rc-mentions" role="listbox" aria-label="Mention a user">
          {mentionHits.map((u, idx) => (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={idx === mentionIdx}
              className={`rc-mention-row${idx === mentionIdx ? " on" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); pickMention(u); }}
            >
              <UserAvatar src={u.avatarUrl} av={u.av} bg={u.bg} size={28} border="none" />
              <div style={{ minWidth: 0, textAlign: "left" }}>
                <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--mut)" }}>@{u.username}{u.dept ? ` · ${u.dept}` : ""}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Attached image preview */}
      {imgPreview && (
        <div className="rc-img-prev">
          <img src={imgPreview} alt="Attachment preview" />
          <button type="button" className="rc-img-x" onClick={() => onImageChange && onImageChange(null)} aria-label="Remove image">
            <Ic n="x" s={12} />
          </button>
        </div>
      )}

      {/* Formatting toolbar */}
      <div className="rc-bar">
        <div className="rc-tools">
          <button type="button" className="rc-tool" title="Bold (Ctrl+B)" aria-label="Bold" onClick={() => wrapSelection("**", "**")} disabled={disabled}>
            <strong>B</strong>
          </button>
          <button type="button" className="rc-tool" title="Italic (Ctrl+I)" aria-label="Italic" onClick={() => wrapSelection("*", "*")} disabled={disabled}>
            <em style={{ fontFamily: "Georgia,serif" }}>I</em>
          </button>
          <button type="button" className="rc-tool" title="Underline (Ctrl+U)" aria-label="Underline" onClick={() => wrapSelection("__", "__")} disabled={disabled}>
            <u>U</u>
          </button>
          <span className="rc-sep" aria-hidden="true" />
          {allowImage && (
            <>
              <button type="button" className="rc-tool" title="Attach image" aria-label="Attach image" onClick={() => fileRef.current?.click()} disabled={disabled}>
                <Ic n="image" s={15} />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  if (f && onImageChange) onImageChange(f);
                  e.target.value = "";
                }}
              />
            </>
          )}
          <div style={{ position: "relative" }}>
            <button type="button" className="rc-tool" title="Insert emoji" aria-label="Insert emoji" onClick={() => setEmojiOpen((o) => !o)} disabled={disabled}>
              <Ic n="smile" s={15} />
            </button>
            {emojiOpen && (
              <div className="rc-emoji-pop" role="menu">
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className="rc-emoji-btn"
                    onClick={() => { insertAtCursor(em); setEmojiOpen(false); }}
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="rc-tool" title="Mention a user (@username)" aria-label="Mention user" onClick={() => insertAtCursor("@")} disabled={disabled}>
            <Ic n="at" s={15} />
          </button>
          {footerLeft}
        </div>

        <div className="rc-right">
          <span className={`rc-counter${overWords || overChars ? " err" : ""}`}>
            {maxWords ? `${words}/${maxWords} words` : `${value.length}/${maxChars}`}
          </span>
          {onSubmit && (
            <button
              type="button"
              className="btn btn-navy rc-submit"
              disabled={submitting || disabled || overWords || overChars || (!value.trim() && !image)}
              onClick={onSubmit}
            >
              {submitting ? <span className="auth-spinner" aria-hidden="true" /> : submitLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
