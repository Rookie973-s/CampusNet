import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Ic from '../components/Ic';
import LivenessScanner from '../components/ui/LivenessScanner';
import { listDepartments } from '../api/departments';
import { submitApplication, checkApplicationStatus, cancelSugStatus, cancelPendingSugApplication } from '../api/applications';
import { flattenMe } from '../api/auth';
import { ApiError } from '../api/client';
import { useI18n } from '../i18n';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-\s]{7,20}$/;
const MIN_TEXT = 20;

function PaperCut() {
  return (
    <svg className="sug-art-svg" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <filter id="pc" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="-4" dy="6" stdDeviation="7" floodColor="#020817" floodOpacity=".55" /></filter>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1E3A6E" /><stop offset="1" stopColor="#0B1B3A" /></linearGradient>
        <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2F5BA8" /><stop offset="1" stopColor="#173A74" /></linearGradient>
        <linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4A86D6" /><stop offset="1" stopColor="#2457A6" /></linearGradient>
        <linearGradient id="g4" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8DB8F2" /><stop offset="1" stopColor="#5C94E2" /></linearGradient>
      </defs>
      <rect width="400" height="600" fill="url(#g1)" />
      <path filter="url(#pc)" fill="url(#g2)" d="M400 0V600H120C60 520 140 470 90 400C40 330 140 300 110 220C80 140 150 60 120 0Z" />
      <path filter="url(#pc)" fill="url(#g3)" d="M400 70V600H210C170 540 240 500 200 440C160 380 250 350 225 285C200 220 270 150 245 70Z" />
      <path filter="url(#pc)" fill="url(#g4)" d="M400 190V600H300C275 550 325 520 300 470C275 420 335 395 318 340C300 285 345 240 335 190Z" />
      <g fill="#fff" opacity=".9"><circle cx="96" cy="520" r="3" /><circle cx="150" cy="70" r="2" /><circle cx="60" cy="240" r="2.5" /></g>
    </svg>
  );
}

function Field({ id, label, error, hint, children }) {
  return (
    <div className="sug-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <p className="sug-hint">{hint}</p>}
      {error && <p className="field-err" id={`${id}-err`} role="alert">{error}</p>}
    </div>
  );
}

function ApplyPage({ user, onUserUpdate, toast }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ fname: "", lname: "", email: "", phone: "", dept: "", subDept: "", role: "", bio: "", why: "", refs: "" });
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [livenessVideo, setLivenessVideo] = useState(null);
  const [errs, setErrs] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [depts, setDepts] = useState([]);
  const [statusEmail, setStatusEmail] = useState("");
  const [statusResult, setStatusResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [myPending, setMyPending] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const head = useRef(null);
  const photoInput = useRef(null);
  const sending = useRef(false);

  useEffect(() => { listDepartments().then(setDepts).catch(() => {}); }, []);
  useEffect(() => {
    if (!user?.email || user?.isVerifiedStaff) { setMyPending(null); return; }
    checkApplicationStatus(user.email)
      .then((r) => { if (r?.found && r.status === "pending") setMyPending(r); else setMyPending(null); })
      .catch(() => setMyPending(null));
  }, [user?.email, user?.isVerifiedStaff]);
  useEffect(() => { head.current?.focus({ preventScroll: true }); }, [step]);
  useEffect(() => {
    if (!photo) { setPhotoPreview(null); return; }
    const u = URL.createObjectURL(photo);
    setPhotoPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  const steps = [t("sug.step.personal"), t("sug.step.academic"), t("sug.step.statement"), t("sug.step.review")];
  const upd = (k, v) => { setForm((p) => ({ ...p, [k]: v })); if (errs[k]) setErrs((p) => ({ ...p, [k]: "" })); };
  const ic = (k) => ({
    id: `sug-${k}`, className: `inp${errs[k] ? " err" : ""}`, value: form[k], onChange: (e) => upd(k, e.target.value), disabled: submitting,
    "aria-invalid": errs[k] ? "true" : undefined, "aria-describedby": errs[k] ? `sug-${k}-err` : undefined,
  });

  const validate = (s) => {
    const e = {};
    if (s === 0) {
      if (!form.fname.trim()) e.fname = t("sug.err.required");
      if (!form.lname.trim()) e.lname = t("sug.err.required");
      if (!form.email.trim()) e.email = t("sug.err.email");
      else if (!EMAIL_RE.test(form.email.trim())) e.email = t("auth.err.emailBad");
      if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) e.phone = t("sug.err.phone");
    }
    if (s === 1) {
      if (!form.dept) e.dept = t("sug.err.dept");
      if (!form.role.trim()) e.role = t("sug.err.required");
      if (!docFile) e.doc = "Please upload your Admission Form or Student ID Card.";
      if (!livenessVideo) e.liveness = "Please complete the quick camera blink & nod scan.";
    }
    if (s === 2) {
      if (form.bio.trim().length < MIN_TEXT) e.bio = t("sug.err.short", { n: MIN_TEXT });
      if (form.why.trim().length < MIN_TEXT) e.why = t("sug.err.short", { n: MIN_TEXT });
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validate(step)) setStep((p) => p + 1); };

  const submit = async () => {
    if (sending.current) return;
    for (const s of [0, 1, 2]) if (!validate(s)) { setStep(s); return; }
    sending.current = true; setSubmitting(true);
    try {
      const chosen = depts.find((d) => d.name === form.dept);
      await submitApplication({
        fname: form.fname.trim(), lname: form.lname.trim(), email: form.email.trim(), phone: form.phone.trim(),
        departmentId: chosen ? chosen.id : null, academicDepartmentName: form.subDept.trim(),
        role: form.role.trim(), bio: form.bio.trim(), why: form.why.trim(), refs: form.refs.trim(),
        profilePicture: photo, supportingDocument: docFile, livenessVideo,
      });
      toast(t("sug.submitted"), "success");
      setSubmitted(true);
    } catch (e) {
      const d = e instanceof ApiError ? e.data : null;
      const map = { first_name: "fname", last_name: "lname", email: "email", phone: "phone", staff_id: "staffId", department: "dept", role_title: "role", bio: "bio", why: "why", profile_picture: "photo" };
      const inStep = { fname: 0, lname: 0, email: 0, phone: 0, photo: 0, staffId: 1, dept: 1, role: 1, bio: 2, why: 2 };
      const found = {};
      if (d && typeof d === "object") Object.entries(map).forEach(([sk, fk]) => { if (d[sk]) found[fk] = Array.isArray(d[sk]) ? d[sk][0] : String(d[sk]); });
      if (Object.keys(found).length) { setErrs(found); setStep(Math.min(...Object.keys(found).map((k) => inStep[k]))); }
      toast(e instanceof ApiError ? e.message : t("sug.err.generic"), "error");
      sending.current = false;
    } finally { setSubmitting(false); }
  };

  const handleCheckStatus = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(statusEmail.trim())) { toast("Enter a valid email address", "error"); return; }
    setChecking(true);
    try {
      setStatusResult(await checkApplicationStatus(statusEmail.trim()));
    } catch { toast("Could not check status.", "error"); }
    finally { setChecking(false); }
  };

  const handleCancelSug = async () => {
    if (!window.confirm("Are you sure you want to cancel your Verified SUG status? You will lose your SUG badge and directory listing until re-approved.")) return;
    setCancelling(true);
    try {
      const res = await cancelSugStatus();
      if (res.user && onUserUpdate) onUserUpdate(flattenMe(res.user));
      toast(res.detail || "SUG status cancelled.", "info");
    } catch (e) {
      toast(e.message || "Could not cancel SUG status.", "error");
    } finally { setCancelling(false); }
  };

  const handleCancelPending = async () => {
    if (!window.confirm("Withdraw your pending SUG application?")) return;
    setCancelling(true);
    try {
      const res = await cancelPendingSugApplication();
      setMyPending(null);
      toast(res.detail || "Pending application withdrawn.", "info");
    } catch (e) {
      toast(e.message || "Could not withdraw application.", "error");
    } finally { setCancelling(false); }
  };

  if (user?.isVerifiedStaff) return (
    <div className="sug-wrap">
      <div className="sug-card sug-done fu" role="status">
        <span className="sug-tick" style={{ background: "rgba(37,99,235,.16)" }}><Ic n="shield" s={38} c="var(--accent)" /></span>
        <h1>You Already Have Verified SUG Status</h1>
        <p>
          Your account (<strong>@{user.username}</strong>) is already verified as an SUG Representative on CampusNetwork.
          You cannot submit another SUG application unless you cancel your current SUG status first.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
          <button type="button" className="btn btn-navy" onClick={() => navigate("/sug")}>View SUG Directory</button>
          <button type="button" className="btn btn-out" style={{ color: "#DC2626" }} onClick={handleCancelSug} disabled={cancelling}>
            {cancelling ? "Cancelling…" : "Cancel My SUG Status"}
          </button>
        </div>
      </div>
    </div>
  );

  if (myPending) return (
    <div className="sug-wrap">
      <div className="sug-card sug-done fu" role="status">
        <span className="sug-tick" style={{ background: "rgba(245,158,11,.18)" }}><Ic n="clock" s={38} c="#D97706" /></span>
        <h1>SUG Application Already Pending</h1>
        <p>
          Your application for <strong>{myPending.role_title}</strong> is currently under review by the CampusNetwork administrators.
          You cannot submit a duplicate application unless you withdraw this one first.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
          <button type="button" className="btn btn-navy" onClick={() => navigate("/")}>Go Home</button>
          <button type="button" className="btn btn-out" style={{ color: "#DC2626" }} onClick={handleCancelPending} disabled={cancelling}>
            {cancelling ? "Withdrawing…" : "Withdraw Application"}
          </button>
        </div>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="sug-wrap">
      <div className="sug-card sug-done fu" role="status">
        <span className="sug-tick"><Ic n="check" s={38} c="#10B981" /></span>
        <h1>{t("sug.doneTitle")}</h1>
        <p>{t("sug.doneBody", { name: form.fname })}</p>
        <button type="button" className="btn btn-navy" onClick={() => navigate("/")}><Ic n="home" s={15} />{t("common.goHome")}</button>
      </div>
    </div>
  );

  return (
    <div className="sug-wrap apply-wrap">
      <div className="sug-card fu">
        <div className="sug-form">
          <h1 ref={head} tabIndex={-1}>{t("sug.apply")}</h1>
          <p className="sug-lead">{t("sug.lead")}</p>

          <p className="sug-stepline" aria-live="polite">{t("sug.stepOf", { n: step + 1, total: steps.length, name: steps[step] })}</p>
          <ol className="sug-steps" aria-label={t("sug.progress")}>
            {steps.map((s, i) => (
              <li key={s} className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
                <span>{i < step ? <Ic n="check" s={13} c="#fff" /> : i + 1}</span><em>{s}</em>
              </li>
            ))}
          </ol>

          <div className="sug-body" key={step}>
            {step === 0 && (
              <>
                {/* Profile picture upload for SUG card */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, borderRadius: 16, background: "var(--surfH)" }}>
                  <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--surfA)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "2px solid var(--brdS)" }}>
                    {photoPreview
                      ? <img src={photoPreview} alt="SUG profile preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <Ic n="camera" s={22} c="var(--faint)" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 3 }}>Profile Picture (displayed on your SUG Card)</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" className="btn btn-out" style={{ height: 34, minHeight: 34, padding: "0 12px", fontSize: 12.5 }} onClick={() => photoInput.current?.click()}>
                        <Ic n="upload" s={13} /> {photo ? "Change Photo" : "Upload Photo"}
                      </button>
                      {photo && (
                        <button type="button" className="btn btn-ghost" style={{ height: 34, minHeight: 34, padding: "0 10px", fontSize: 12.5, color: "#EF4444" }} onClick={() => setPhoto(null)}>
                          Remove
                        </button>
                      )}
                    </div>
                    <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setPhoto(f);
                      e.target.value = "";
                    }} />
                    {errs.photo && <p className="field-err">{errs.photo}</p>}
                  </div>
                </div>

                <div className="sug-2">
                  <Field id="sug-fname" label={`${t("sug.first")} *`} error={errs.fname}><input {...ic("fname")} autoComplete="given-name" /></Field>
                  <Field id="sug-lname" label={`${t("sug.last")} *`} error={errs.lname}><input {...ic("lname")} autoComplete="family-name" /></Field>
                </div>
                <Field id="sug-email" label={`${t("sug.email")} *`} error={errs.email}><input {...ic("email")} type="email" inputMode="email" autoComplete="email" /></Field>
                <Field id="sug-phone" label={t("sug.phone")} error={errs.phone}><input {...ic("phone")} type="tel" inputMode="tel" autoComplete="tel" /></Field>
              </>
            )}
            {step === 1 && (() => {
              const selFac = depts.find((d) => d.name === form.dept);
              const subDepts = selFac?.sub_departments || [];
              return (
                <>
                  <Field id="sug-dept" label="Academic Faculty *" error={errs.dept}>
                    <select {...ic("dept")} onChange={(e) => { upd("dept", e.target.value); upd("subDept", ""); }}>
                      <option value="">Select Academic Faculty</option>
                      {depts.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                    </select>
                  </Field>
                  <Field id="sug-subDept" label="Department">
                    {subDepts.length > 0 ? (
                      <select {...ic("subDept")}>
                        <option value="">Select Department</option>
                        {subDepts.map((sd) => <option key={sd.id} value={sd.name}>{sd.name}</option>)}
                      </select>
                    ) : (
                      <input {...ic("subDept")} placeholder={form.dept ? "Enter your department" : "Select a faculty first"} />
                    )}
                  </Field>
                  <Field id="sug-role" label={`${t("sug.role")} *`} error={errs.role}><input {...ic("role")} placeholder={t("sug.rolePh")} /></Field>
                  <Field id="sug-doc" label="Admission Form or Student ID Card *" error={errs.doc}>
                    <input id="sug-doc" type="file" accept="image/*,.pdf" className="inp" style={{ paddingTop: 9 }} onChange={(e) => { setDocFile(e.target.files?.[0] || null); setErrs((p) => ({ ...p, doc: "" })); }} />
                  </Field>
                  <LivenessScanner
                    videoFile={livenessVideo}
                    onComplete={(f) => { setLivenessVideo(f); setErrs((p) => ({ ...p, liveness: "" })); }}
                    disabled={submitting}
                  />
                  {errs.liveness && <p className="field-err" role="alert">{errs.liveness}</p>}
                  <Field id="sug-refs" label={t("sug.refs")} error={errs.refs}><input {...ic("refs")} /></Field>
                </>
              );
            })()}
            {step === 2 && (
              <>
                <Field id="sug-bio" label={`${t("sug.bio")} *`} error={errs.bio} hint={t("sug.hint", { n: MIN_TEXT, c: form.bio.trim().length })}>
                  <textarea {...ic("bio")} className={`inp${errs.bio ? " err" : ""}`} style={{ minHeight: 96 }} maxLength={2000} />
                </Field>
                <Field id="sug-why" label={`${t("sug.why")} *`} error={errs.why} hint={t("sug.hint", { n: MIN_TEXT, c: form.why.trim().length })}>
                  <textarea {...ic("why")} className={`inp${errs.why ? " err" : ""}`} style={{ minHeight: 120 }} maxLength={2000} />
                </Field>
              </>
            )}
            {step === 3 && (
              <>
                <dl className="sug-review">
                  {[
                    [t("sug.first") + " / " + t("sug.last"), `${form.fname} ${form.lname}`],
                    [t("sug.email"), form.email],
                    [t("sug.phone"), form.phone],
                    ["Academic Faculty", form.dept],
                    ["Department", form.subDept],
                    [t("sug.role"), form.role],
                    ["ID / Admission Document", docFile ? docFile.name : "Missing"],
                    ["Camera Liveness Scan", livenessVideo ? "Recorded ✓" : "Missing"],
                    [t("sug.refs"), form.refs],
                    ["Profile photo", photo ? photo.name : "Not uploaded (initials will be used)"],
                  ].map(([l, v]) => (
                    <div key={l}><dt>{l}</dt><dd>{v || "—"}</dd></div>
                  ))}
                  <div className="sug-review-long"><dt>{t("sug.bio")}</dt><dd>{form.bio}</dd></div>
                  <div className="sug-review-long"><dt>{t("sug.why")}</dt><dd>{form.why}</dd></div>
                </dl>
                <p className="sug-consent">{t("sug.consent")}</p>
              </>
            )}
          </div>

          <div className="sug-actions">
            <button type="button" className="btn btn-out" onClick={() => setStep((p) => Math.max(0, p - 1))} disabled={submitting} style={{ visibility: step === 0 ? "hidden" : "visible" }}>
              <Ic n="arrowL" s={15} />{t("common.previous")}
            </button>
            {step < 3
              ? <button type="button" className="btn btn-navy" onClick={next}>{t("common.continue")}<Ic n="arrow" s={15} /></button>
              : <button type="button" className="btn btn-navy" onClick={submit} disabled={submitting} aria-busy={submitting}>
                  {submitting ? <><span className="auth-spinner" aria-hidden="true" />{t("sug.submitting")}</> : <><Ic n="check" s={15} />{t("sug.submit")}</>}
                </button>}
          </div>

          {/* Public status check without logging in */}
          <div style={{ marginTop: 26, paddingTop: 18, borderTop: "1px solid var(--brd)" }}>
            <h3 style={{ fontSize: 15, fontFamily: "'DM Sans',sans-serif", fontWeight: 800, marginBottom: 8 }}>Already Applied? Check Your SUG Status</h3>
            <form onSubmit={handleCheckStatus} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input className="inp" style={{ flex: 1, minWidth: 180, height: 42 }} type="email" placeholder="Enter application email…" value={statusEmail} onChange={(e) => setStatusEmail(e.target.value)} />
              <button type="submit" className="btn btn-out" style={{ height: 42 }} disabled={checking}>{checking ? "Checking…" : "Check Status"}</button>
            </form>
            {statusResult && (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: "var(--surfH)", fontSize: 13 }}>
                {!statusResult.found
                  ? "No application found for this email."
                  : <>Status: <strong>{statusResult.status.toUpperCase()}</strong> ({statusResult.role_title}){statusResult.review_note ? ` — ${statusResult.review_note}` : ""}</>}
              </div>
            )}
          </div>
        </div>

        <aside className="sug-art" aria-hidden="true">
          <PaperCut />
          <div className="sug-art-copy"><strong>Campus<b>Network</b></strong><span>{t("sug.artLine")}</span></div>
        </aside>
      </div>
    </div>
  );
}

export default ApplyPage;
