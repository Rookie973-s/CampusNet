import { useState, useId, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Ic from '../components/Ic';
import BrandMark from '../components/BrandMark';
import useDialog from '../hooks/useDialog';
import GoogleButton, { googleEnabled } from '../components/GoogleButton';
import { useI18n } from '../i18n';
import { login, register, forgotPassword, verifyResetCode, resetPassword } from '../api/auth';
import { checkApplicationStatus } from '../api/applications';
import { ApiError } from '../api/client';

function SocialRow({ onUser, onError, label }) {
  if (!googleEnabled) return null;
  return (
    <div style={{ margin: "10px 0 12px" }}>
      <GoogleButton onUser={onUser} onError={onError} />
      <div className="auth-or"><span>{label || "or"}</span></div>
    </div>
  );
}

function Field({ id, label, error, rightSlot, ...inputProps }) {
  return (
    <div>
      {label && <label className="auth-label" htmlFor={id}>{label}</label>}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          id={id}
          className={`auth-inp${error ? " err" : ""}`}
          style={rightSlot ? { paddingRight: 44 } : undefined}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          {...inputProps}
        />
        {rightSlot}
      </div>
      {error && <div id={`${id}-err`} className="auth-err" role="alert">{error}</div>}
    </div>
  );
}

function PasswordEyeBtn({ shown, onToggle }) {
  return (
    <button
      type="button"
      className="auth-eye"
      onClick={onToggle}
      aria-label={shown ? "Hide password" : "Show password"}
      title={shown ? "Hide password" : "Show password"}
    >
      <Ic n={shown ? "eyeOff" : "eye"} s={17} />
    </button>
  );
}

function Spinner() { return <span className="auth-spinner" aria-hidden="true" />; }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;

function AuthModal({ tab: initTab, initialResetToken = "", onClose, onSuccess }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const uid = useId();

  // mode: "auth" | "forgot" | "sug-status"
  const [mode, setMode] = useState(initialResetToken ? "forgot" : "auth");
  const [active, setActive] = useState(initTab === "register");
  const [form, setForm] = useState({
    id: "", pass: "", fname: "", lname: "", username: "", email: "", rpass: "",
  });
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [showRegPw, setShowRegPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [fe, setFe] = useState({});

  // Forgot password state (step 1: email, step 2: 6-digit code, step 3: new password)
  const [fpStep, setFpStep] = useState(initialResetToken ? 3 : 1);
  const [fpEmail, setFpEmail] = useState("");
  const [fpCode, setFpCode] = useState("");
  const [fpToken, setFpToken] = useState(initialResetToken || "");
  const [fpNew, setFpNew] = useState("");
  const [fpConfirm, setFpConfirm] = useState("");
  const [showFpPw, setShowFpPw] = useState(false);

  // SUG status check without logging in
  const [sugEmail, setSugEmail] = useState("");
  const [sugStatus, setSugStatus] = useState(null);

  const { ref, closing, requestClose } = useDialog(onClose);

  useEffect(() => {
    if (initialResetToken) {
      setMode("forgot");
      setFpStep(3);
      setFpToken(initialResetToken);
    }
  }, [initialResetToken]);

  const finish = (u) => onSuccess(u);
  const upd = (k, v) => { setForm((p) => ({ ...p, [k]: v })); if (fe[k]) setFe((p) => ({ ...p, [k]: "" })); };
  const switchTo = (reg) => { setError(""); setInfo(""); setFe({}); setMode("auth"); setActive(reg); };

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (loading) return;
    setError(""); setInfo("");
    const errs = {};
    if (!form.id.trim()) errs.id = "Enter your username or email.";
    if (!form.pass) errs.pass = t("auth.err.pass");
    setFe(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      onSuccess(await login(form.id.trim(), form.pass));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.err.signin"));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e?.preventDefault();
    if (loading) return;
    setError(""); setInfo("");
    const errs = {};
    const uname = form.username.trim();
    if (!form.fname.trim()) errs.fname = t("auth.err.required");
    if (!form.lname.trim()) errs.lname = t("auth.err.required");
    if (!uname) errs.username = "Choose a username.";
    else if (!USERNAME_RE.test(uname)) errs.username = "3–30 chars: letters, numbers, _, ., or - only.";
    if (!form.email.trim()) errs.email = t("auth.err.email");
    else if (!EMAIL_RE.test(form.email.trim())) errs.email = t("auth.err.emailBad");
    if (!form.rpass) errs.rpass = t("auth.err.rpass");
    else if (form.rpass.length < 8) errs.rpass = "Password must be at least 8 characters.";
    setFe(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      onSuccess(await register({
        firstName: form.fname.trim(),
        lastName: form.lname.trim(),
        username: uname,
        email: form.email.trim(),
        password: form.rpass,
        confirmPassword: form.rpass,
      }));
    } catch (err) {
      const d = err instanceof ApiError ? err.data : null;
      if (d && typeof d === "object") {
        const fieldMap = {};
        if (d.username) fieldMap.username = Array.isArray(d.username) ? d.username[0] : String(d.username);
        if (d.email) fieldMap.email = Array.isArray(d.email) ? d.email[0] : String(d.email);
        if (d.password) fieldMap.rpass = Array.isArray(d.password) ? d.password[0] : String(d.password);
        if (Object.keys(fieldMap).length) setFe(fieldMap);
      }
      setError(err instanceof ApiError ? err.message : t("auth.err.register"));
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password handlers
  const handleSendCode = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(fpEmail.trim())) { setError("Enter a valid registered email address."); return; }
    setLoading(true); setError(""); setInfo("");
    try {
      const res = await forgotPassword(fpEmail.trim());
      setInfo(res.detail || "Verification code sent to your email.");
      setFpStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send reset code.");
    } finally { setLoading(false); }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (fpCode.trim().length < 6) { setError("Enter the 6-digit verification code."); return; }
    setLoading(true); setError(""); setInfo("");
    try {
      const res = await verifyResetCode(fpEmail.trim(), fpCode.trim());
      setFpToken(res.token);
      setInfo("Code verified! Create your new password.");
      setFpStep(3);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid or expired code.");
    } finally { setLoading(false); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (fpNew.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (fpNew !== fpConfirm) { setError("Passwords do not match."); return; }
    setLoading(true); setError(""); setInfo("");
    try {
      const res = await resetPassword(fpToken, fpNew, fpConfirm);
      setInfo(res.detail || "Password updated! You can now sign in.");
      setMode("auth");
      setActive(false);
      setFpStep(1);
      setFpCode("");
      setFpNew("");
      setFpConfirm("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset password.");
    } finally { setLoading(false); }
  };

  const handleCheckSug = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(sugEmail.trim())) { setError("Enter the email you used to apply."); return; }
    setLoading(true); setError(""); setSugStatus(null);
    try {
      const res = await checkApplicationStatus(sugEmail.trim());
      setSugStatus(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not check application status.");
    } finally { setLoading(false); }
  };

  const goAbout = () => { requestClose(); navigate("/about#privacy"); };
  const goApplySug = () => { requestClose(); navigate("/apply"); };

  const titleId = `${uid}-title`;

  return (
    <div
      className={`overlay auth-modal-overlay${closing ? " closing" : ""}`}
      style={{ zIndex: 2000 }}
      onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <div className="auth-shadow-wrap">
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`auth-outer${active && mode === "auth" ? " active" : ""}${mode !== "auth" ? " auth-single" : ""}`}
        >
          <button type="button" className="auth-close" onClick={requestClose} aria-label={t("auth.close")}>
            <Ic n="x" s={18} stroke={2.5} />
          </button>

          {/* Stylized mobile-only artistic hero banner (inspired by Mobile Login/Signup reference) */}
          <div className="auth-mob-hero" aria-hidden="true">
            <span className="auth-blob auth-blob--1" />
            <span className="auth-blob auth-blob--2" />
            <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", zIndex: 2 }}>
              <BrandMark size={38} />
              <div className="auth-mob-hero-txt">
                {mode === "forgot"
                  ? "Reset Password"
                  : mode === "sug-status"
                    ? "SUG Verification"
                    : active
                      ? "Create an account"
                      : "Welcome back"}
              </div>
            </div>
          </div>

          {mode === "forgot" ? (
            <div className="auth-inner auth-inner--single">
              <div className="auth-single-body">
                <h2 id={titleId} style={{ fontSize: 22, marginBottom: 4, fontFamily: "'Playfair Display',serif" }}>
                  Forgot Password
                </h2>
                <p style={{ fontSize: 13, color: "var(--mut)", marginBottom: 16 }}>
                  {fpStep === 1 && "Enter your registered email to receive a single-use 6-digit verification code."}
                  {fpStep === 2 && "Enter the 6-digit code sent to your email (expires in 15 minutes)."}
                  {fpStep === 3 && "Choose a strong new password for your CampusNetwork account."}
                </p>

                {error && <div className="auth-alert" role="alert">{error}</div>}
                {info && <div className="auth-info" role="status">{info}</div>}

                {fpStep === 1 && (
                  <form onSubmit={handleSendCode} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <Field id={`${uid}-fpe`} label="Registered Email" type="email" value={fpEmail}
                      onChange={(e) => setFpEmail(e.target.value)} placeholder="student@atbu.edu.ng" disabled={loading} />
                    <button className="auth-btn" type="submit" disabled={loading}>
                      {loading ? <><Spinner />Sending code…</> : "Send Verification Code"}
                    </button>
                  </form>
                )}

                {fpStep === 2 && (
                  <form onSubmit={handleVerifyCode} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <Field id={`${uid}-fpc`} label="6-Digit Verification Code" value={fpCode}
                      onChange={(e) => setFpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="123456" inputMode="numeric" disabled={loading} />
                    <button className="auth-btn" type="submit" disabled={loading}>
                      {loading ? <><Spinner />Verifying…</> : "Verify Code"}
                    </button>
                    <button type="button" className="auth-link" onClick={() => { setFpStep(1); setError(""); }}>
                      Use a different email
                    </button>
                  </form>
                )}

                {fpStep === 3 && (
                  <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <Field id={`${uid}-fpn`} label="New Password" type={showFpPw ? "text" : "password"} value={fpNew}
                      onChange={(e) => setFpNew(e.target.value)} placeholder="At least 8 characters" disabled={loading}
                      rightSlot={<PasswordEyeBtn shown={showFpPw} onToggle={() => setShowFpPw((s) => !s)} />} />
                    <Field id={`${uid}-fpnc`} label="Confirm New Password" type={showFpPw ? "text" : "password"} value={fpConfirm}
                      onChange={(e) => setFpConfirm(e.target.value)} placeholder="Repeat new password" disabled={loading} />
                    <button className="auth-btn" type="submit" disabled={loading}>
                      {loading ? <><Spinner />Resetting…</> : "Reset Password"}
                    </button>
                  </form>
                )}

                <p style={{ marginTop: 14, fontSize: 13, color: "var(--mut)" }}>
                  Remembered your password?{" "}
                  <button type="button" className="auth-link" onClick={() => switchTo(false)}>Back to Sign In</button>
                </p>
              </div>
            </div>
          ) : mode === "sug-status" ? (
            <div className="auth-inner auth-inner--single">
              <div className="auth-single-body">
                <h2 id={titleId} style={{ fontSize: 22, marginBottom: 4, fontFamily: "'Playfair Display',serif" }}>
                  SUG Application Status
                </h2>
                <p style={{ fontSize: 13, color: "var(--mut)", marginBottom: 16 }}>
                  Check your SUG verification status without signing in, or submit a new application.
                </p>
                {error && <div className="auth-alert" role="alert">{error}</div>}
                <form onSubmit={handleCheckSug} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <Field id={`${uid}-sge`} label="Application Email" type="email" value={sugEmail}
                    onChange={(e) => setSugEmail(e.target.value)} placeholder="your.email@atbu.edu.ng" disabled={loading} />
                  <button className="auth-btn" type="submit" disabled={loading}>
                    {loading ? <><Spinner />Checking…</> : "Check Status"}
                  </button>
                </form>

                {sugStatus && (
                  <div className="auth-info" style={{ marginTop: 14, textAlign: "left" }}>
                    {!sugStatus.found ? (
                      <p>No SUG application found for this email yet.</p>
                    ) : (
                      <>
                        <p><strong>Status:</strong> {sugStatus.status.toUpperCase()}</p>
                        <p><strong>Role:</strong> {sugStatus.role_title}</p>
                        {sugStatus.review_note && <p><strong>Note:</strong> {sugStatus.review_note}</p>}
                      </>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="auth-link" onClick={goApplySug}>Apply for SUG Access →</button>
                  <button type="button" className="auth-link" onClick={() => switchTo(false)}>Back to Sign In</button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="auth-inner">
                {/* ── LOGIN PANEL ── */}
                <form className="auth-form-panel auth-login" onSubmit={handleLogin} noValidate inert={active}>
                  <div style={{ width: "100%", maxWidth: 330 }}>
                    <div className="auth-desktop-head" style={{ marginBottom: 16, textAlign: "center" }}>
                      <h2 id={active ? undefined : titleId} style={{ fontSize: 22, marginBottom: 4, fontFamily: "'Playfair Display',serif" }}>
                        {t("auth.welcomeBack")}
                      </h2>
                      <p style={{ fontSize: 13, color: "var(--mut)" }}>Sign in to CampusNetwork (Cenet)</p>
                    </div>

                    {!active && error && <div className="auth-alert" role="alert">{error}</div>}
                    {!active && info && <div className="auth-info" role="status">{info}</div>}

                    <SocialRow label="or" onUser={finish} onError={setError} />

                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
                      <Field id={`${uid}-lid`} label="Username or email" value={form.id} error={fe.id}
                        onChange={(e) => upd("id", e.target.value)} placeholder="username or email" autoComplete="username" disabled={loading}
                        data-autofocus={initTab !== "register" ? "" : undefined} />
                      <Field id={`${uid}-lpw`} label={t("auth.password")} type={showLoginPw ? "text" : "password"} value={form.pass} error={fe.pass}
                        onChange={(e) => upd("pass", e.target.value)} placeholder={t("auth.passwordPh")} autoComplete="current-password" disabled={loading}
                        rightSlot={<PasswordEyeBtn shown={showLoginPw} onToggle={() => setShowLoginPw((s) => !s)} />} />
                    </div>

                    <div style={{ textAlign: "right", marginBottom: 12 }}>
                      <button type="button" className="auth-link" style={{ fontSize: 12.5, padding: "2px 0" }}
                        onClick={() => { setError(""); setInfo(""); setMode("forgot"); setFpStep(1); }}>
                        Forgot Password?
                      </button>
                    </div>

                    <button className="auth-btn auth-btn--pill" type="submit" disabled={loading} aria-busy={loading && !active}>
                      {loading && !active ? <><Spinner />{t("auth.signingIn")}</> : t("auth.signinBtn")}
                    </button>

                    <p className="auth-switch-mobile" style={{ textAlign: "center" }}>
                      {t("auth.newHere")} <button type="button" className="auth-link" onClick={() => switchTo(true)}>{t("auth.createLink")}</button>
                    </p>

                    <div className="auth-sug-row">
                      <span>SUG Representative?</span>{" "}
                      <button type="button" className="auth-link" onClick={goApplySug}>Apply for SUG</button>
                      {" · "}
                      <button type="button" className="auth-link" onClick={() => { setError(""); setSugStatus(null); setMode("sug-status"); }}>Verify Status</button>
                    </div>
                  </div>
                </form>

                {/* ── REGISTER PANEL ── */}
                <form className="auth-form-panel auth-register" onSubmit={handleRegister} noValidate inert={!active}>
                  <div style={{ width: "100%", maxWidth: 330 }}>
                    <div className="auth-desktop-head" style={{ marginBottom: 12, textAlign: "center" }}>
                      <h2 id={active ? titleId : undefined} style={{ fontSize: 22, marginBottom: 4, fontFamily: "'Playfair Display',serif" }}>
                        {t("auth.createTitle")}
                      </h2>
                      <p style={{ fontSize: 13, color: "var(--mut)" }}>Join the CampusNetwork (Cenet) community</p>
                    </div>

                    {active && error && <div className="auth-alert" role="alert">{error}</div>}

                    <SocialRow label="or" onUser={finish} onError={setError} />

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <Field id={`${uid}-fn`} label={t("auth.first")} value={form.fname} error={fe.fname} autoComplete="given-name"
                          placeholder="First Name" data-autofocus={initTab === "register" ? "" : undefined}
                          disabled={loading} onChange={(e) => upd("fname", e.target.value)} />
                        <Field id={`${uid}-ln`} label={t("auth.last")} value={form.lname} error={fe.lname} autoComplete="family-name"
                          placeholder="Last Name" disabled={loading} onChange={(e) => upd("lname", e.target.value)} />
                      </div>
                      <Field id={`${uid}-un`} label="Username" value={form.username} error={fe.username}
                        placeholder="e.g. amina_cs" autoComplete="username"
                        disabled={loading} onChange={(e) => upd("username", e.target.value.replace(/\s+/g, ""))} />
                      <Field id={`${uid}-em`} label={t("auth.email")} type="email" value={form.email} error={fe.email}
                        placeholder="Email address" autoComplete="email" inputMode="email"
                        disabled={loading} onChange={(e) => upd("email", e.target.value)} />
                      <Field id={`${uid}-rp`} label={t("auth.password")} type={showRegPw ? "text" : "password"} value={form.rpass} error={fe.rpass}
                        autoComplete="new-password" placeholder="Create a strong password" disabled={loading}
                        onChange={(e) => upd("rpass", e.target.value)}
                        rightSlot={<PasswordEyeBtn shown={showRegPw} onToggle={() => setShowRegPw((s) => !s)} />} />
                    </div>

                    <button className="auth-btn auth-btn--pill" type="submit" disabled={loading} aria-busy={loading && active}>
                      {loading && active ? <><Spinner />{t("auth.creating")}</> : "Create account"}
                    </button>

                    <p className="auth-legal">
                      Signing up for a CampusNetwork account means you agree to the{" "}
                      <button type="button" className="auth-legal-link" onClick={goAbout}>Privacy Policy</button> and{" "}
                      <button type="button" className="auth-legal-link" onClick={goAbout}>Terms of Service</button>.
                    </p>

                    <p className="auth-switch-mobile" style={{ textAlign: "center" }}>
                      Have an account? <button type="button" className="auth-link" onClick={() => switchTo(false)}>Log in here</button>
                    </p>

                    <div className="auth-sug-row">
                      <span>SUG official?</span>{" "}
                      <button type="button" className="auth-link" onClick={goApplySug}>Apply for SUG Access</button>
                    </div>
                  </div>
                </form>
              </div>

              {/* ── TOGGLE OVERLAY (desktop only) ── */}
              <div className="auth-toggle-box">
                <div className="auth-toggle-panel auth-toggle-left">
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(59,130,246,.18)", border: "1.5px solid rgba(59,130,246,.35)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                    <Ic n="cap" s={26} c="#3B82F6" />
                  </div>
                  <h2 style={{ fontSize: 20, fontFamily: "'Playfair Display',serif", marginBottom: 8, color: "#fff" }}>{t("auth.helloTitle")}</h2>
                  <p style={{ fontSize: 13, opacity: .85, marginBottom: 22, lineHeight: 1.6, maxWidth: 200, color: "#fff" }}>
                    {t("auth.helloBody")}
                  </p>
                  <button type="button" className="auth-toggle-btn" tabIndex={active ? -1 : 0} onClick={() => switchTo(true)}>{t("auth.registerNow")}</button>
                </div>
                <div className="auth-toggle-panel auth-toggle-right">
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(59,130,246,.18)", border: "1.5px solid rgba(59,130,246,.35)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                    <Ic n="user" s={26} c="#3B82F6" />
                  </div>
                  <h2 style={{ fontSize: 20, fontFamily: "'Playfair Display',serif", marginBottom: 8, color: "#fff" }}>{t("auth.backTitle")}</h2>
                  <p style={{ fontSize: 13, opacity: .85, marginBottom: 22, lineHeight: 1.6, maxWidth: 200, color: "#fff" }}>
                    {t("auth.backBody")}
                  </p>
                  <button type="button" className="auth-toggle-btn" tabIndex={active ? 0 : -1} onClick={() => switchTo(false)}>{t("nav.signin")}</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthModal;
