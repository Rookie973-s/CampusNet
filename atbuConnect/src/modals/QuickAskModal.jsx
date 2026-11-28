import { useEffect, useMemo, useRef, useState } from 'react';
import Ic from '../components/Ic';
import RichComposer, { markupToHtml, stripMarkup } from '../components/ui/RichComposer';
import useDialog from '../hooks/useDialog';
import { listDepartments } from '../api/departments';
import { createQuestion, updateQuestion } from '../api/questions';
import { ApiError } from '../api/client';
import { useI18n } from '../i18n';

const MAX_IMAGES = 6;
const MAX_IMAGE_MB = 10;
const MAX_VIDEO_MB = 100;
const MAX_VIDEO_SECONDS = 5 * 60;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_RE = /\.(mp4|m4v|mov)$/i;

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function readDuration(url) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => resolve(null);
    v.src = url;
  });
}

/**
 * Post composer & editor — respects both light and dark themes, supports Bold/Italic/Underline
 * formatting, @username autocomplete, word limit per verification tier, and photos/video.
 */
function QuickAskModal({ onClose, user, onLogin, toast, onPosted, editingQuestion = null }) {
  const { t } = useI18n();
  const isEdit = !!editingQuestion;
  const maxWords = user?.entitlements?.max_post_words || (user?.isVerifiedStudent ? 1200 : 300);
  const maxChars = user?.entitlements?.max_post_chars || (user?.isVerifiedStudent ? 10000 : 2500);
  const canMultiMedia = !!(user?.isVerifiedStudent || user?.isVerifiedStaff || user?.role === "admin" || user?.entitlements?.can_upload_video);
  const maxImages = canMultiMedia ? MAX_IMAGES : 1;

  const [title, setTitle] = useState(editingQuestion?.title || "");
  const [q, setQ] = useState(editingQuestion?.body || "");
  const [dept, setDept] = useState(editingQuestion?.dept || "General");
  const [tags, setTags] = useState((editingQuestion?.tags || []).join(", "));
  const [depts, setDepts] = useState([]);
  const [images, setImages] = useState([]);
  const [video, setVideo] = useState(null);
  const [errs, setErrs] = useState({});
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const abort = useRef(null);
  const submitting = useRef(false);
  const imgInput = useRef(null);
  const vidInput = useRef(null);
  const { ref, closing, requestClose } = useDialog(() => { if (!busy) onClose(); }, { dismissible: !busy });

  useEffect(() => { listDepartments().then(setDepts).catch(() => {}); }, []);
  const urls = useRef([]);
  urls.current = [...images.map((i) => i.url), video?.url].filter(Boolean);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const setErr = (k, v) => setErrs((p) => ({ ...p, [k]: v }));

  const addImages = (files) => {
    if (video) { setErr("media", t("composer.err.mix")); return; }
    const next = [...images];
    let problem = "";
    for (const f of files) {
      if (!IMAGE_TYPES.includes(f.type)) { problem = t("composer.err.imageType"); continue; }
      if (f.size > MAX_IMAGE_MB * 1024 * 1024) { problem = t("composer.err.imageSize", { mb: MAX_IMAGE_MB }); continue; }
      if (next.length >= maxImages) {
        problem = canMultiMedia
          ? t("composer.err.imageCount", { n: maxImages })
          : "Non-verified accounts can attach 1 image per post. Get verified to attach multiple images & videos.";
        break;
      }
      next.push({ file: f, url: URL.createObjectURL(f) });
    }
    setImages(next);
    setErr("media", problem);
  };

  const addVideo = async (f) => {
    if (!f) return;
    if (!canMultiMedia) {
      setErr("media", "Only Verified Students and Verified SUG representatives can upload videos.");
      return;
    }
    if (images.length) { setErr("media", t("composer.err.mix")); return; }
    if (!(f.type.startsWith("video/") || VIDEO_RE.test(f.name)) || !VIDEO_RE.test(f.name)) { setErr("media", t("composer.err.videoType")); return; }
    if (f.size > MAX_VIDEO_MB * 1024 * 1024) { setErr("media", t("composer.err.videoSize", { mb: MAX_VIDEO_MB })); return; }
    const url = URL.createObjectURL(f);
    const duration = await readDuration(url);
    if (duration !== null && duration > MAX_VIDEO_SECONDS) {
      URL.revokeObjectURL(url);
      setErr("media", t("composer.err.videoLong", { min: MAX_VIDEO_SECONDS / 60 }));
      return;
    }
    if (video) URL.revokeObjectURL(video.url);
    setVideo({ file: f, url, duration });
    setErr("media", "");
  };

  const dropFiles = (files) => {
    const list = [...files];
    const vid = list.find((f) => VIDEO_RE.test(f.name));
    if (vid) addVideo(vid); else addImages(list);
  };

  const removeImage = (i) => { URL.revokeObjectURL(images[i].url); setImages(images.filter((_, n) => n !== i)); setErr("media", ""); };
  const removeVideo = () => { URL.revokeObjectURL(video.url); setVideo(null); setErr("media", ""); };

  const submit = async (e) => {
    e?.preventDefault();
    if (submitting.current) return;
    if (!user) { onLogin(t("guest.actions.post")); return; }
    const plainBody = stripMarkup(q).trim();
    if (!plainBody) { setErr("text", t("composer.err.text")); return; }
    const words = plainBody.split(/\s+/).filter(Boolean).length;
    if (words > maxWords) { setErr("text", `Exceeds your limit of ${maxWords} words.`); return; }

    submitting.current = true; setBusy(true); setProgress(0); setErrs({});
    abort.current = new AbortController();
    try {
      const chosen = depts.find((d) => d.name === dept);
      const htmlBody = markupToHtml(q.trim());
      const tagArr = tags.split(",").map((x) => x.trim()).filter(Boolean);
      const finalTitle = title.trim();

      let saved;
      if (isEdit) {
        saved = await updateQuestion(editingQuestion.id, {
          title: finalTitle,
          body: plainBody,
          body_html: htmlBody,
          department: chosen ? chosen.id : null,
          tags: tagArr,
        });
        toast("Post updated!", "success");
      } else {
        saved = await createQuestion({
          title: finalTitle,
          body: plainBody,
          bodyHtml: htmlBody,
          tags: tagArr,
          department: chosen ? chosen.id : null,
          images: images.map((i) => i.file),
          video: video?.file || null,
          onProgress: setProgress,
          signal: abort.current.signal,
        });
        toast(t("composer.posted"), "success");
      }
      onPosted && onPosted(saved);
      onClose();
    } catch (err) {
      if (err.cancelled) { toast(t("composer.cancelled"), "info"); }
      else {
        const d = err instanceof ApiError ? err.data : null;
        const first = (v) => (Array.isArray(v) ? v[0] : v);
        const map = {};
        if (d && typeof d === "object") {
          if (d.images) map.media = first(d.images);
          if (d.video) map.media = first(d.video);
          if (d.media) map.media = first(d.media);
          if (d.title || d.body) map.text = first(d.title || d.body);
        }
        setErrs(map);
        toast(err instanceof ApiError ? err.message : t("composer.err.generic"), "error");
      }
      submitting.current = false; setBusy(false);
    }
  };

  const hasMedia = images.length > 0 || !!video;
  const bar = useMemo(() => (progress < 100 ? t("composer.uploading", { pct: progress }) : t("composer.processing")), [progress, t]);

  return (
    <div className={`overlay${closing ? " closing" : ""}`} onClick={(e) => { if (!busy && e.target === e.currentTarget) requestClose(); }}>
      <div className="paper-stage" ref={ref} role="dialog" aria-modal="true" aria-labelledby="paper-title" tabIndex={-1}>
        <div className="paper-sheet paper-sheet--back" aria-hidden="true" />
        <div className="paper-sheet" aria-hidden="true"><span className="paper-holes" /></div>

        <form className="paper-content" onSubmit={submit} noValidate
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy && !isEdit) dropFiles(e.dataTransfer.files); }}>
          <div className="paper-head">
            <span className="paper-ic"><Ic n={isEdit ? "edit" : "book"} s={20} /></span>
            <div>
              <h2 id="paper-title">{isEdit ? "Edit Post" : t("composer.title")}</h2>
              <p>{isEdit ? "Update your CampusNetwork post." : `${t("composer.sub")} (Limit: ${maxWords} words)`}</p>
            </div>
            <button type="button" className="paper-x" onClick={requestClose} disabled={busy} aria-label={t("common.close")}><Ic n="x" s={18} /></button>
          </div>

          <div>
            <label htmlFor="paper-title-inp" className="paper-label">Headline (optional)</label>
            <input id="paper-title-inp" className="inp" style={{ height: 42 }} value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} placeholder="Leave blank or add a catchy headline…" maxLength={240} />
            <p style={{ fontSize: 12, color: "var(--mut)", marginTop: 5 }}>
              Tip: Adding a headline gives your post a much better chance of being seen &amp; discovered. Leave it blank to lead directly with your main text.
            </p>
          </div>

          <div>
            <label className="paper-label">{t("composer.question")}</label>
            <div className={drag ? "paper-drag" : ""}>
              <RichComposer
                value={q}
                onChange={(v) => { setQ(v); setErr("text", ""); }}
                placeholder="Write your post… Use Bold, Italic, Underline, or @mention classmates"
                disabled={busy}
                minHeight={130}
                maxWords={maxWords}
                maxChars={maxChars}
              />
            </div>
            {errs.text && <p className="field-err" role="alert">{errs.text}</p>}
          </div>

          {!isEdit && hasMedia && (
            <div className="paper-media" aria-label={t("composer.attachments")}>
              {images.map((im, i) => (
                <div key={im.url} className="pm-item">
                  <img src={im.url} alt={t("composer.imageN", { n: i + 1 })} />
                  <button type="button" className="pm-x" onClick={() => removeImage(i)} disabled={busy} aria-label={t("composer.removeImage", { n: i + 1 })}><Ic n="x" s={13} /></button>
                </div>
              ))}
              {video && (
                <div className="pm-item pm-video">
                  <video src={video.url} controls preload="metadata" playsInline aria-label={video.file.name} />
                  <span className="pm-dur">{video.duration !== null ? mmss(video.duration) : t("composer.noPreview")}</span>
                  <button type="button" className="pm-x" onClick={removeVideo} disabled={busy} aria-label={t("composer.removeVideo")}><Ic n="x" s={13} /></button>
                </div>
              )}
            </div>
          )}

          {!isEdit && (
            <div className="paper-attach">
              <button type="button" className="paper-chip" onClick={() => imgInput.current?.click()} disabled={busy || !!video || images.length >= maxImages}>
                <Ic n="image" s={16} />{t("composer.addPhotos")}<small>{images.length}/{maxImages}</small>
              </button>
              <button
                type="button"
                className="paper-chip"
                onClick={() => {
                  if (!canMultiMedia) {
                    setErr("media", "Only Verified Students and Verified SUG representatives can upload videos.");
                    return;
                  }
                  vidInput.current?.click();
                }}
                disabled={busy || !!video || images.length > 0}
                style={!canMultiMedia ? { opacity: 0.65 } : undefined}
                title={!canMultiMedia ? "Verified Students & SUG only" : t("composer.addVideo")}
              >
                <Ic n={canMultiMedia ? "video" : "lock"} s={15} />{t("composer.addVideo")}
                <small>{canMultiMedia ? `≤ ${MAX_VIDEO_SECONDS / 60} min` : "Verified only"}</small>
              </button>
              <input ref={imgInput} type="file" accept={IMAGE_TYPES.join(",")} multiple={canMultiMedia} hidden onChange={(e) => { addImages([...e.target.files]); e.target.value = ""; }} />
              <input ref={vidInput} type="file" accept="video/mp4,video/quicktime,.mp4,.m4v,.mov" hidden onChange={(e) => { addVideo(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          )}
          {errs.media && <p className="field-err" role="alert">{errs.media}</p>}

          <div className="paper-grid">
            <div>
              <label htmlFor="paper-d" className="paper-label">{t("composer.department")}</label>
              <select id="paper-d" className="inp" value={dept} onChange={(e) => setDept(e.target.value)} disabled={busy}>
                <option value="General">{t("composer.general")}</option>
                {depts.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="paper-t" className="paper-label">{t("composer.tags")}</label>
              <input id="paper-t" className="inp" value={tags} onChange={(e) => setTags(e.target.value)} disabled={busy} placeholder={t("composer.tagsPh")} />
            </div>
          </div>

          {busy && (
            <div className="paper-progress" role="status" aria-live="polite">
              <div className="lib-progress"><div style={{ width: `${progress}%` }} /></div>
              <span>{hasMedia ? bar : t("composer.posting")}</span>
            </div>
          )}

          <div className="paper-actions">
            {busy
              ? <button type="button" className="btn btn-out" onClick={() => abort.current?.abort()}>{t("composer.cancelUpload")}</button>
              : <button type="button" className="btn btn-out" onClick={requestClose}>{t("common.cancel")}</button>}
            <button type="submit" className="btn btn-navy" disabled={busy} aria-busy={busy}>
              {busy ? <><span className="auth-spinner" aria-hidden="true" />{t("composer.posting")}</> : <><Ic n="send" s={15} />{isEdit ? "Save Changes" : t("composer.post")}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default QuickAskModal;
