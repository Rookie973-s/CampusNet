import { useEffect, useRef, useState } from 'react';
import Ic from '../Ic';
import { Modal } from '../ui/shared';
import { createCourse, getCourses, uploadDocument, formatBytes } from '../../api/library';
import { useI18n } from '../../i18n';

const MAX_MB = 15; // UI hint only; the server enforces the real, configurable limit and checks the file's content

/**
 * Upload dialog for class representatives. The class (level / faculty / department) comes from the
 * server-side grant, so a rep can only add material for their own class; the server re-checks every upload.
 */
export default function UploadPanel({ scope, defaultCourse, onClose, onUploaded, toast }) {
  const { t } = useI18n();
  const [courses, setCourses] = useState(null);
  const [course, setCourse] = useState(defaultCourse || "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [errs, setErrs] = useState({});
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [drag, setDrag] = useState(false);
  const [newCourse, setNewCourse] = useState({ code: "", title: "" });
  const [addingCourse, setAddingCourse] = useState(false);
  const input = useRef(null);
  const abort = useRef(null);
  const submitting = useRef(false);

  const loadCourses = () => getCourses({ level: scope.level, department: scope.department }).then(setCourses).catch(() => setCourses([]));
  useEffect(() => { loadCourses(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setErrs((p) => ({ ...p, [k]: v }));

  const pick = (f) => {
    if (!f) return;
    let e = "";
    if (!/\.pdf$/i.test(f.name)) e = t("upload.err.type");
    else if (f.size === 0) e = t("upload.err.empty");
    else if (f.size > MAX_MB * 1024 * 1024) e = t("upload.err.size", { mb: MAX_MB });
    set("file", e);
    setFailed(false);
    setFile(e ? null : f);
    if (!e && !title) setTitle(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").slice(0, 200));
  };

  const saveCourse = async () => {
    const code = newCourse.code.trim();
    if (!code) { set("newCourse", t("upload.err.courseCode")); return; }
    try {
      const c = await createCourse({ code, title: newCourse.title.trim(), level: scope.level, department: scope.department });
      await loadCourses();
      setCourse(String(c.id)); setAddingCourse(false); setNewCourse({ code: "", title: "" }); set("newCourse", "");
    } catch (e) {
      const d = e.data || {};
      set("newCourse", (Array.isArray(d.non_field_errors) ? d.non_field_errors[0] : null) || e.message || t("upload.err.generic"));
    }
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (submitting.current) return;
    const e = {};
    if (!course) e.course = t("upload.err.course");
    if (title.trim().length < 3) e.title = t("upload.err.title");
    if (!file) e.file = errs.file || t("upload.err.file");
    setErrs(e);
    if (Object.keys(e).length) return;
    submitting.current = true; setBusy(true); setProgress(0); setFailed(false);
    abort.current = new AbortController();
    try {
      const doc = await uploadDocument({ title: title.trim(), description: description.trim(), course, file }, { onProgress: setProgress, signal: abort.current.signal });
      if (doc.isFlagged && doc.securityWarnings?.length) {
        toast(`Uploaded with security notice: ${doc.securityWarnings[0]}`, "info");
      } else {
        toast(t("upload.done"), "success");
      }
      onUploaded(doc);
      onClose();
    } catch (err) {
      if (err.cancelled) toast(t("composer.cancelled"), "info");
      else {
        const d = err.data || {}, map = {};
        ["title", "course", "file", "description"].forEach((k) => { if (d[k]) map[k] = Array.isArray(d[k]) ? d[k][0] : String(d[k]); });
        setErrs(map);
        setFailed(true);
        toast(err.status === 403 ? t("upload.err.forbidden") : (err.message || t("upload.err.generic")), "error");
      }
      submitting.current = false; setBusy(false);
    }
  };

  const Err = ({ k }) => (errs[k] ? <div className="field-err" role="alert" id={`up-${k}-err`}>{errs[k]}</div> : null);

  return (
    <Modal onClose={busy ? () => {} : onClose} maxW={560} label={t("upload.title")} dismissible={!busy} showClose>
      <form onSubmit={submit} noValidate className="upl">
        <h3>{t("upload.title")}</h3>
        <p className="up-sub">{t("upload.sub", { mb: MAX_MB })}</p>
        <div className="up-scope" aria-label={t("upload.yourClass")}>
          <span className="chip">{scope.level} {t("library.levelWord")}</span><span className="chip">{scope.faculty_name}</span><span className="chip">{scope.department_name}</span>
        </div>

        <div className={`up-drop${drag ? " drag" : ""}`} role="button" tabIndex={0} aria-label={t("upload.choose")} aria-describedby={errs.file ? "up-file-err" : undefined}
          onClick={() => !busy && input.current?.click()}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); input.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) pick(e.dataTransfer.files?.[0]); }}>
          <span className="up-orb"><Ic n="upload" s={26} /></span>
          <strong>{t("upload.drop")}</strong>
          <small>{t("upload.dropHint", { mb: MAX_MB })}</small>
          <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <Err k="file" />

        {file && (
          <div className="up-file">
            <span className="lib-icon" aria-hidden="true">PDF</span>
            <div className="up-file-info">
              <strong>{file.name}</strong>
              <span>PDF · {formatBytes(file.size)}{busy ? ` · ${progress < 100 ? `${progress}%` : t("composer.processing")}` : ""}</span>
              <div className="lib-progress" aria-hidden={!busy}><div style={{ width: `${busy ? progress : failed ? 0 : 0}%` }} /></div>
            </div>
            <button type="button" className="up-x" onClick={() => { setFile(null); setFailed(false); }} disabled={busy} aria-label={t("upload.remove")}><Ic n="x" s={16} /></button>
          </div>
        )}

        <div className="up-field">
          <label htmlFor="up-course">{t("upload.course")} <span aria-hidden="true">*</span></label>
          <select id="up-course" className={`inp${errs.course ? " err" : ""}`} value={course} disabled={busy || courses === null}
            onChange={(e) => { setCourse(e.target.value); set("course", ""); }} aria-invalid={errs.course ? "true" : undefined}>
            <option value="">{courses === null ? t("common.loading") : t("upload.selectCourse")}</option>
            {(courses || []).map((c) => <option key={c.id} value={c.id}>{c.code}{c.title ? ` — ${c.title}` : ""}</option>)}
          </select>
          <Err k="course" />
          {!addingCourse
            ? <button type="button" className="auth-link" onClick={() => setAddingCourse(true)} disabled={busy}>+ {t("upload.addCourse")}</button>
            : (
              <div className="up-newcourse">
                <input className="inp" aria-label={t("upload.courseCode")} placeholder="BIO 111" value={newCourse.code} onChange={(e) => setNewCourse((p) => ({ ...p, code: e.target.value }))} />
                <input className="inp" aria-label={t("upload.courseTitle")} placeholder={t("upload.courseTitle")} value={newCourse.title} onChange={(e) => setNewCourse((p) => ({ ...p, title: e.target.value }))} />
                <button type="button" className="btn btn-navy" onClick={saveCourse}>{t("common.save")}</button>
                <button type="button" className="btn btn-out" onClick={() => setAddingCourse(false)}>{t("common.cancel")}</button>
                {errs.newCourse && <div className="field-err" role="alert" style={{ gridColumn: "1/-1" }}>{errs.newCourse}</div>}
              </div>
            )}
        </div>

        <div className="up-field">
          <label htmlFor="up-title">{t("upload.docTitle")} <span aria-hidden="true">*</span></label>
          <input id="up-title" className={`inp${errs.title ? " err" : ""}`} value={title} maxLength={200} disabled={busy}
            onChange={(e) => { setTitle(e.target.value); set("title", ""); }} placeholder={t("upload.titlePh")} aria-invalid={errs.title ? "true" : undefined} />
          <Err k="title" />
        </div>
        <div className="up-field">
          <label htmlFor="up-desc">{t("upload.desc")} <span style={{ fontWeight: 500, color: "var(--mut)" }}>({t("common.optional")})</span></label>
          <textarea id="up-desc" className="inp" style={{ minHeight: 72 }} maxLength={2000} value={description} disabled={busy} onChange={(e) => setDescription(e.target.value)} placeholder={t("upload.descPh")} />
        </div>

        <div className="up-actions">
          {busy
            ? <button type="button" className="btn btn-out" onClick={() => abort.current?.abort()}>{t("composer.cancelUpload")}</button>
            : <button type="button" className="btn btn-out" onClick={onClose}>{t("common.cancel")}</button>}
          <button type="submit" className="btn btn-navy" disabled={busy} aria-busy={busy}>
            {busy ? <><span className="auth-spinner" aria-hidden="true" />{t("upload.uploading")}</> : <><Ic n="upload" s={15} />{failed ? t("common.retry") : t("upload.submit")}</>}
          </button>
        </div>
      </form>
    </Modal>
  );
}
