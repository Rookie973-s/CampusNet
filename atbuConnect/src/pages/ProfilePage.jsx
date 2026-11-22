import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Ic from '../components/Ic';
import { Skel, Modal } from '../components/ui/shared';
import UserAvatar from '../components/ui/UserAvatar';
import VerifiedBadge from '../components/ui/VerifiedBadge';
import ActivityChart from '../components/profile/ActivityChart';
import { listQuestions, deleteQuestion } from '../api/questions';
import {
  updateMe, fetchActivity, uploadAvatar, removeAvatar,
  changePassword, sendEmailVerification, verifyEmail, deleteAccount,
} from '../api/auth';
import {
  getFollowers, getFollowing, getVerificationStatus, applyStudentVerification,
  listVerificationApplications, decideVerification,
} from '../api/users';
import { listCommunities } from '../api/communities';
import { listDocuments, getMyPermissions, formatBytes } from '../api/library';
import { listDepartments } from '../api/departments';
import { useI18n, LANGUAGES } from '../i18n';

const TABS = ["communities", "questions", "saved", "uploads", "verification", "settings"];

function ProfilePage({ user, toast, onUserUpdate, onLogin, onLogout }) {
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState(TABS.includes(initialTab) ? initialTab : "communities");

  const [myComms, setMyComms] = useState([]);
  const [myQs, setMyQs] = useState([]);
  const [savedQs, setSavedQs] = useState([]);
  const [myDocs, setMyDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [perm, setPerm] = useState({ can_upload: false, scope: null });
  const [activity, setActivity] = useState({ state: "loading", series: [] });
  const [depts, setDepts] = useState([]);

  // Settings form
  const [form, setForm] = useState({ username: "", firstName: "", lastName: "", phone: "", bio: "", matric: "" });
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInput = useRef(null);

  // Password change state
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);

  // Email verification state
  const [verifyCode, setVerifyCode] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  // Followers / Following modal
  const [socialModal, setSocialModal] = useState(null); // null | "followers" | "following"
  const [socialList, setSocialList] = useState([]);
  const [socialLoading, setSocialLoading] = useState(false);

  // Student Verification state
  const [verStatus, setVerStatus] = useState(null);
  const [verForm, setVerForm] = useState({ faculty: "", departmentName: "", level: "200 Level", matricNumber: "", reason: "", consent: false, document: null });
  const [verBusy, setVerBusy] = useState(false);
  const [adminVerApps, setAdminVerApps] = useState([]);

  // Delete post & Delete account modals
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [delAccOpen, setDelAccOpen] = useState(false);
  const [delAccPw, setDelAccPw] = useState("");
  const [delAccBusy, setDelAccBusy] = useState(false);

  // Auto-handle ?verify_email=<token> query link
  useEffect(() => {
    const token = searchParams.get("verify_email");
    if (!token) return;
    verifyEmail({ token })
      .then(() => {
        toast("Your email address is now verified!", "success");
        if (user) onUserUpdate && onUserUpdate({ ...user, emailVerified: true });
        const next = new URLSearchParams(searchParams);
        next.delete("verify_email");
        setSearchParams(next, { replace: true });
      })
      .catch((e) => toast(e.message || "Verification link expired or invalid.", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab && TABS.includes(urlTab)) setTab(urlTab);
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    setForm({
      username: user.username || "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      phone: user.phoneNumber || user.phone || "",
      bio: user.bio || "",
      matric: user.matric || "",
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    getMyPermissions().then(setPerm);
    listDepartments().then(setDepts).catch(() => {});
    fetchActivity(84).then((a) => setActivity({ state: "ok", series: a.series })).catch(() => setActivity({ state: "error", series: [] }));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const done = () => setLoading(false);
    if (tab === "communities") listCommunities({ mine: true }).then((r) => setMyComms(r.results)).catch(() => setMyComms([])).finally(done);
    else if (tab === "questions") listQuestions({ mine: true }).then(setMyQs).catch(() => setMyQs([])).finally(done);
    else if (tab === "saved") listQuestions({ saved: true }).then(setSavedQs).catch(() => setSavedQs([])).finally(done);
    else if (tab === "uploads") listDocuments({ mine: true }).then((r) => setMyDocs(r.results)).catch(() => setMyDocs([])).finally(done);
    else if (tab === "verification") {
      const reqs = [getVerificationStatus().then(setVerStatus).catch(() => setVerStatus(null))];
      if (user.role === "admin") reqs.push(listVerificationApplications().then(setAdminVerApps).catch(() => setAdminVerApps([])));
      Promise.all(reqs).finally(done);
    } else done();
  }, [tab, user?.id, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAvatarPick = async (file) => {
    if (!file) return;
    setAvatarBusy(true);
    try {
      const updated = await uploadAvatar(file);
      onUserUpdate && onUserUpdate(updated);
      toast("Profile picture updated!", "success");
    } catch (e) { toast(e.message || "Could not upload profile picture.", "error"); }
    finally { setAvatarBusy(false); }
  };

  const handleRemoveAvatar = async () => {
    setAvatarBusy(true);
    try {
      const updated = await removeAvatar();
      onUserUpdate && onUserUpdate(updated);
      toast("Profile picture removed.", "info");
    } catch (e) { toast(e.message || "Could not remove picture.", "error"); }
    finally { setAvatarBusy(false); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const patch = {
        username: form.username.trim(),
        first_name: form.firstName,
        last_name: form.lastName,
        phone: form.phone,
        phone_number: form.phone,
        bio: form.bio,
      };
      if (!user.matric && form.matric.trim()) patch.matric_number = form.matric.trim();
      const updated = await updateMe(patch);
      onUserUpdate && onUserUpdate(updated);
      toast(t("profile.saved"), "success");
    } catch (e) { toast(e?.message || t("profile.saveFail"), "error"); }
    finally { setSaving(false); }
  };

  const toggleHideAds = async () => {
    try {
      const updated = await updateMe({ hide_ads: !user.hideAds });
      onUserUpdate && onUserUpdate(updated);
      toast(updated.hideAds ? "Ads hidden (Verified Student perk active)" : "Ads restored", "success");
    } catch (e) { toast(e.message || "Only verified students can hide ads.", "error"); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!pw.next || pw.next.length < 8) { toast("New password must be at least 8 characters.", "error"); return; }
    if (pw.next !== pw.confirm) { toast("New passwords do not match.", "error"); return; }
    setPwBusy(true);
    try {
      await changePassword(pw.current, pw.next, pw.confirm);
      setPw({ current: "", next: "", confirm: "" });
      if (!user.hasUsablePassword) onUserUpdate && onUserUpdate({ ...user, hasUsablePassword: true });
      toast("Password updated successfully!", "success");
    } catch (err) { toast(err.message || "Could not change password.", "error"); }
    finally { setPwBusy(false); }
  };

  const handleResendVerification = async () => {
    setEmailBusy(true);
    try {
      const res = await sendEmailVerification();
      toast(res.detail || "Verification email sent!", "success");
    } catch (e) { toast(e.message || "Could not send verification email.", "error"); }
    finally { setEmailBusy(false); }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (verifyCode.trim().length < 6) { toast("Enter the 6-digit code from your email.", "error"); return; }
    setEmailBusy(true);
    try {
      await verifyEmail({ code: verifyCode.trim() });
      onUserUpdate && onUserUpdate({ ...user, emailVerified: true });
      setVerifyCode("");
      toast("Email address verified!", "success");
    } catch (err) { toast(err.message || "Invalid or expired code.", "error"); }
    finally { setEmailBusy(false); }
  };

  const handleApplyVerification = async (e) => {
    e.preventDefault();
    if (!verForm.matricNumber.trim()) { toast("Enter your ATBU matric number (e.g. 21/62525/U).", "error"); return; }
    if (!verForm.consent) { toast("Please agree to the verification consent.", "error"); return; }
    setVerBusy(true);
    try {
      await applyStudentVerification(verForm);
      toast("Student verification application submitted!", "success");
      const fresh = await getVerificationStatus();
      setVerStatus(fresh);
    } catch (err) { toast(err.message || "Could not submit application.", "error"); }
    finally { setVerBusy(false); }
  };

  const openSocialModal = async (mode) => {
    setSocialModal(mode);
    setSocialLoading(true);
    try {
      const data = mode === "followers" ? await getFollowers(user.id) : await getFollowing(user.id);
      setSocialList(data);
    } catch { setSocialList([]); }
    finally { setSocialLoading(false); }
  };

  const chooseLang = async (code) => {
    if (code === lang) return;
    setLang(code);
    if (user) updateMe({ language: code }).then((u) => onUserUpdate && onUserUpdate(u)).catch(() => {});
  };

  const confirmDelete = async () => {
    if (!toDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteQuestion(toDelete.id);
      setMyQs((p) => p.filter((q) => q.id !== toDelete.id));
      onUserUpdate && onUserUpdate({ ...user, questions: Math.max(0, (user.questions || 1) - 1) });
      toast(t("feed.deleted"), "success");
    } catch (e) {
      toast(e.message || t("feed.err.delete"), "error");
      listQuestions({ mine: true }).then(setMyQs).catch(() => {});
    } finally { setDeleting(false); setToDelete(null); }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setDelAccBusy(true);
    try {
      await deleteAccount(delAccPw);
      toast("Your account has been permanently deleted.", "info");
      setDelAccOpen(false);
      onLogout && onLogout();
      navigate("/");
    } catch (err) { toast(err.message || "Could not delete account.", "error"); }
    finally { setDelAccBusy(false); }
  };

  if (!user) return (
    <div className="pf-wrap"><div className="raised lib-empty fu">
      <Ic n="user" s={44} c="var(--faint)" />
      <h2>{t("profile.signInTitle")}</h2>
      <p>{t("profile.signInBody")}</p>
      <button type="button" className="btn btn-navy" onClick={() => onLogin()}>{t("nav.signin")}</button>
    </div></div>
  );

  const first = user.firstName || (user.name || "").split(" ")[0] || user.name;
  const subtitle = [user.username ? `@${user.username}` : null, user.dept, user.level].filter(Boolean).join(" · ");
  const rows = tab === "questions" ? myQs : savedQs;
  const tabLabel = {
    communities: "Communities",
    questions: t("profile.tab.questions"),
    saved: t("profile.tab.saved"),
    uploads: t("profile.tab.uploads"),
    verification: "Verification",
    settings: t("profile.tab.settings"),
  };

  return (
    <div className="pf-wrap">
      {/* Header Banner — Waving-hand emoji replaced with professional UI icon + Profile Picture Upload */}
      <section className="pf-hello raised fu">
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", flex: 1 }}>
          <div style={{ position: "relative" }}>
            <UserAvatar src={user.avatarUrl} av={user.av} bg={user.bg} size={82} border="4px solid var(--surf)" />
            <button
              type="button"
              onClick={() => avatarInput.current?.click()}
              disabled={avatarBusy}
              aria-label="Upload profile picture"
              title="Change profile picture"
              style={{
                position: "absolute", bottom: -2, right: -2, width: 32, height: 32, borderRadius: "50%",
                background: "var(--accent)", color: "#fff", border: "2px solid var(--surf)",
                display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--sh-1)",
              }}
            >
              <Ic n="camera" s={14} />
            </button>
            <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleAvatarPick(f);
              e.target.value = "";
            }} />
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>{t("profile.hello", { name: first })}</span>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 10, background: "rgba(37,99,235,.12)", color: "var(--accent)" }}>
                <Ic n="sparkle" s={18} />
              </span>
              {user.isVerifiedStudent && <VerifiedBadge size={20} showLabel />}
            </h1>
            <p>{subtitle || t("profile.helloSub")}</p>
            <div className="pf-badges">
              {user.matric && <span className="chip" style={{ cursor: "default" }}>{user.matric}</span>}
              {user.isVerifiedStaff && <span className="chip" style={{ cursor: "default" }}><Ic n="shield" s={12} /> Verified SUG / Staff</span>}
              {perm.can_upload && <span className="chip" style={{ cursor: "default" }}><Ic n="file" s={12} />{t("profile.classRep")}</span>}
              <span className="chip" style={{ cursor: "default", color: user.emailVerified ? "#059669" : "#D97706" }}>
                <Ic n={user.emailVerified ? "check" : "mail"} s={12} />
                {user.emailVerified ? "Email Verified" : "Email Unverified"}
              </span>
              {user.avatarUrl && (
                <button type="button" className="chip" style={{ color: "#DC2626" }} onClick={handleRemoveAvatar} disabled={avatarBusy}>
                  Remove Photo
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="pf-grid">
        <div className="pf-main">
          {/* 4-column Stats including clickable Followers & Following */}
          <div className="pf-stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))" }}>
            <button type="button" className="raised pf-stat fu" style={{ textAlign: "left" }} onClick={() => openSocialModal("followers")}>
              <strong>{user.followers ?? 0}</strong><span>Followers</span>
            </button>
            <button type="button" className="raised pf-stat fu" style={{ textAlign: "left" }} onClick={() => openSocialModal("following")}>
              <strong>{user.following ?? 0}</strong><span>Following</span>
            </button>
            <div className="raised pf-stat fu"><strong>{user.questions ?? 0}</strong><span>{t("profile.questionsPosted")}</span></div>
            <div className="raised pf-stat fu"><strong>{user.answers ?? 0}</strong><span>{t("profile.answersGiven")}</span></div>
          </div>

          <div className="raised pf-panel">
            <div className="pf-tabs" role="tablist" aria-label={t("profile.sections")}>
              {TABS.map((id) => (
                <button key={id} type="button" role="tab" id={`pf-tab-${id}`} aria-selected={tab === id} aria-controls="pf-panel" className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{tabLabel[id]}</button>
              ))}
            </div>

            <div id="pf-panel" role="tabpanel" aria-labelledby={`pf-tab-${tab}`} className="pf-tabbody">
              {(tab === "communities" || tab === "questions" || tab === "saved" || tab === "uploads") && loading && [1, 2, 3].map((i) => (
                <div key={i} className="pf-row"><Skel h={16} w="65%" mb={8} /><Skel h={12} w="35%" mb={0} /></div>
              ))}

              {/* MY COMMUNITIES TAB (Centerpiece of My Profile) */}
              {tab === "communities" && !loading && (
                <>
                  {myComms.length === 0 ? (
                    <div className="pf-empty">
                      <Ic n="compass" s={34} c="var(--faint)" />
                      <p>You haven&apos;t followed any communities yet.</p>
                      <button type="button" className="btn btn-navy" onClick={() => navigate("/communities")}>Explore Communities</button>
                    </div>
                  ) : (
                    myComms.map((c) => (
                      <div key={c.id} className="pf-row">
                        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                          <div className="comm-av" style={{ width: 42, height: 42, background: c.accent_color || "#2563EB" }}>
                            {c.avatar_url ? <img src={c.avatar_url} alt={c.name} /> : <span>{(c.name || "C")[0]}</span>}
                          </div>
                          <div className="pf-row-main">
                            <strong>{c.name}{c.is_official ? " · Official" : ""}</strong>
                            <span>{c.category} · {c.followers_count} followers · Role: {c.my_role || "follower"}</span>
                          </div>
                        </div>
                        <button type="button" className="btn btn-out" style={{ height: 38, padding: "0 14px" }} onClick={() => navigate(`/communities/${c.slug}`)}>Open</button>
                      </div>
                    ))
                  )}
                  <div style={{ paddingTop: 12, textAlign: "right" }}>
                    <button type="button" className="btn btn-navy" style={{ height: 38 }} onClick={() => navigate("/communities")}>Discover More Communities →</button>
                  </div>
                </>
              )}

              {/* QUESTIONS & SAVED TABS */}
              {(tab === "questions" || tab === "saved") && !loading && rows.length === 0 && (
                <div className="pf-empty"><Ic n={tab === "saved" ? "bookmark" : "msg"} s={34} c="var(--faint)" />
                  <p>{tab === "saved" ? t("profile.noSaved") : t("profile.noQuestions")}</p>
                  <button type="button" className="btn btn-out" onClick={() => navigate("/feed")}>{t("hero.browse")}</button></div>
              )}
              {(tab === "questions" || tab === "saved") && !loading && rows.map((q) => (
                <div key={q.id} className="pf-row">
                  <div className="pf-row-main">
                    <strong>{q.title}</strong>
                    <span>{q.dept} · {q.time} · {t("feed.answersN", { n: q.ans })} · {t("feed.likesN", { n: q.likes })}</span>
                    {tab === "questions" && q.promoted && <span className="badge-promo" style={{ alignSelf: "flex-start" }}>{t("feed.promoted")}</span>}
                  </div>
                  <div className="pf-row-actions">
                    <button type="button" className="btn btn-navy" style={{ height: 40, padding: "0 16px" }} onClick={() => navigate(`/q/${q.id}`)}>{t("library.view")}</button>
                    {tab === "questions" && q.canDelete && (
                      <button type="button" className="btn btn-out" style={{ height: 40, width: 44, padding: 0 }} onClick={() => setToDelete(q)} aria-label={t("feed.deleteAria", { title: q.title })}><Ic n="trash" s={15} c="#DC2626" /></button>
                    )}
                  </div>
                </div>
              ))}

              {/* UPLOADS TAB */}
              {tab === "uploads" && !loading && myDocs.length === 0 && (
                <div className="pf-empty"><Ic n="file" s={34} c="var(--faint)" /><p>{perm.can_upload ? t("profile.noUploads") : t("profile.uploadsLimited")}</p>
                  {perm.can_upload && <button type="button" className="btn btn-out" onClick={() => navigate("/library")}>{t("library.upload")}</button>}</div>
              )}
              {tab === "uploads" && !loading && myDocs.map((d) => (
                <div key={d.id} className="pf-row">
                  <div className="pf-row-main"><strong>{d.title}</strong><span>{d.courseCode} · {d.level} {t("library.levelWord")} · {d.departmentName} · {formatBytes(d.sizeBytes)}</span></div>
                  <div className="pf-row-actions"><button type="button" className="btn btn-out" style={{ height: 40, padding: "0 16px" }} onClick={() => navigate(`/library?course=${d.courseId}`)}>{t("library.view")}</button></div>
                </div>
              ))}

              {/* MODULE 6 & 7: STUDENT VERIFICATION TAB */}
              {tab === "verification" && (
                <div className="pf-settings">
                  <div style={{ padding: 16, borderRadius: 16, background: "var(--surfH)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                      <strong style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                        ATBU Student Verification Badge <VerifiedBadge size={18} />
                      </strong>
                      <span className="chip" style={{ cursor: "default", textTransform: "uppercase", fontSize: 11 }}>
                        Status: {(verStatus?.status || (user.isVerifiedStudent ? "approved" : "not_applied")).replace("_", " ")}
                      </span>
                    </div>
                    <p style={{ fontSize: 13.5, color: "var(--mut)", lineHeight: 1.6 }}>
                      Verified ATBU Students receive a unique animated checkmark badge (distinct from SUG shield badges) plus exclusive platform benefits:
                      <strong> edit your own posts, delete your posts anytime (no 24h limit), longer posts up to 1,200 words, unlimited username changes, prioritized comments, and optional ad-free browsing!</strong>
                    </p>
                  </div>

                  {user.isVerifiedStudent ? (
                    <div style={{ padding: 16, borderRadius: 16, background: "rgba(16,185,129,.12)", border: "1px solid rgba(16,185,129,.3)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                      <div>
                        <strong style={{ color: "#059669" }}>Your Student Verification is Active!</strong>
                        <p style={{ fontSize: 13, color: "var(--mut)", marginTop: 2 }}>All verified student perks are automatically enforced across CampusNetwork.</p>
                      </div>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                        <input type="checkbox" checked={user.hideAds} onChange={toggleHideAds} />
                        Hide In-Feed &amp; Comment Ads
                      </label>
                    </div>
                  ) : verStatus?.status === "pending" ? (
                    <div style={{ padding: 16, borderRadius: 16, background: "rgba(245,158,11,.12)", fontSize: 14 }}>
                      <strong>Application Pending Review:</strong> Your verification request for matric number <strong>{verStatus.application?.matric_number}</strong> is being reviewed by an administrator. If a verification fee applies, a payment link will be emailed to you upon confirmation (administrators may also verify eligible students directly).
                    </div>
                  ) : (
                    <form onSubmit={handleApplyVerification} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {verStatus?.application?.review_note && (
                        <div className="auth-alert">Reviewer feedback: {verStatus.application.review_note}</div>
                      )}
                      <div className="sug-2">
                        <div className="sug-field">
                          <label htmlFor="sv-fac">Faculty</label>
                          <select id="sv-fac" className="inp" value={verForm.faculty} onChange={(e) => setVerForm((p) => ({ ...p, faculty: e.target.value }))}>
                            <option value="">Select Faculty</option>
                            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </div>
                        <div className="sug-field">
                          <label htmlFor="sv-dep">Department</label>
                          <input id="sv-dep" className="inp" value={verForm.departmentName} onChange={(e) => setVerForm((p) => ({ ...p, departmentName: e.target.value }))} placeholder="e.g. Computer Science" />
                        </div>
                      </div>
                      <div className="sug-2">
                        <div className="sug-field">
                          <label htmlFor="sv-lvl">Academic Level *</label>
                          <select id="sv-lvl" className="inp" value={verForm.level} onChange={(e) => setVerForm((p) => ({ ...p, level: e.target.value }))}>
                            {["100 Level", "200 Level", "300 Level", "400 Level", "500 Level", "Postgraduate"].map((l) => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </div>
                        <div className="sug-field">
                          <label htmlFor="sv-mat">Matric Number * (e.g. 21/62525/U)</label>
                          <input id="sv-mat" className="inp" required value={verForm.matricNumber} onChange={(e) => setVerForm((p) => ({ ...p, matricNumber: e.target.value }))} placeholder="21/62525/U" />
                        </div>
                      </div>
                      <div className="sug-field">
                        <label htmlFor="sv-doc">Supporting ID / Registration Document (optional, stored privately)</label>
                        <input id="sv-doc" type="file" accept="image/*,.pdf" className="inp" style={{ paddingTop: 10 }} onChange={(e) => setVerForm((p) => ({ ...p, document: e.target.files?.[0] || null }))} />
                      </div>
                      <div className="sug-field">
                        <label htmlFor="sv-rsn">Short Note (optional)</label>
                        <textarea id="sv-rsn" className="inp" style={{ minHeight: 68 }} value={verForm.reason} onChange={(e) => setVerForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Anything helpful for reviewers…" />
                      </div>
                      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "var(--mut)", cursor: "pointer" }}>
                        <input type="checkbox" checked={verForm.consent} onChange={(e) => setVerForm((p) => ({ ...p, consent: e.target.checked }))} style={{ marginTop: 3 }} />
                        <span>I confirm my student details are accurate and consent to CampusNetwork reviewing my verification application under its Privacy Policy.</span>
                      </label>
                      <button type="submit" className="btn btn-navy" style={{ alignSelf: "flex-start" }} disabled={verBusy}>
                        {verBusy ? "Submitting…" : "Apply for Student Verification"}
                      </button>
                    </form>
                  )}

                  {/* Admin review panel for student verification */}
                  {user.role === "admin" && adminVerApps.length > 0 && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--brd)" }}>
                      <h3 style={{ fontSize: 16, marginBottom: 10 }}>Admin Verification Review Queue</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {adminVerApps.map((a) => (
                          <div key={a.id} style={{ padding: 12, borderRadius: 12, background: "var(--surfH)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <div>
                              <strong>{a.user_info?.name} (@{a.user_info?.username})</strong> · <span style={{ fontSize: 12, color: "var(--accent)" }}>{a.status.toUpperCase()}</span>
                              <div style={{ fontSize: 12.5, color: "var(--mut)" }}>Matric: {a.matric_number} · {a.level} · {a.department_name || a.faculty_name}</div>
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              {a.status !== "approved" && (
                                <button type="button" className="btn btn-pri" style={{ height: 34, minHeight: 34, padding: "0 12px", fontSize: 12 }} onClick={() => decideVerification(a.id, "approve").then(() => { toast("Student verified!", "success"); listVerificationApplications().then(setAdminVerApps); }).catch((e) => toast(e.message, "error"))}>
                                  Approve
                                </button>
                              )}
                              {a.status === "pending" && (
                                <button type="button" className="btn btn-out" style={{ height: 34, minHeight: 34, padding: "0 12px", fontSize: 12, color: "#DC2626" }} onClick={() => {
                                  const note = window.prompt("Rejection note:") || "";
                                  decideVerification(a.id, "reject", { note }).then(() => { toast("Rejected.", "info"); listVerificationApplications().then(setAdminVerApps); });
                                }}>
                                  Reject
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MODULE 5: SETTINGS (Profile, Username Cooldown, Email Verification, Change Password, Ad-Free, Delete Account) */}
              {tab === "settings" && (
                <div className="pf-settings">
                  <div className="sug-2">
                    <div className="sug-field"><label htmlFor="pf-fn">{t("sug.first")}</label><input id="pf-fn" className="inp" value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} /></div>
                    <div className="sug-field"><label htmlFor="pf-ln">{t("sug.last")}</label><input id="pf-ln" className="inp" value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} /></div>
                  </div>

                  <div className="sug-field">
                    <label htmlFor="pf-un">Username (@handle)</label>
                    <input id="pf-un" className="inp" value={form.username} disabled={!user.canChangeUsername} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} />
                    <p className="sug-hint">
                      {user.isVerifiedStudent
                        ? "Verified Student perk: you can update your username anytime."
                        : user.canChangeUsername
                          ? "Ordinary accounts may change username once every 14 days."
                          : `Next username change available on ${new Date(user.nextUsernameChangeAt).toLocaleDateString()}.`}
                    </p>
                  </div>

                  <div className="sug-field"><label htmlFor="pf-ph">{t("sug.phone")}</label><input id="pf-ph" className="inp" type="tel" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
                  <div className="sug-field"><label htmlFor="pf-mt">{t("auth.matric")}</label>
                    <input id="pf-mt" className="inp" value={form.matric} disabled={!!user.matric} style={user.matric ? { opacity: .6, cursor: "not-allowed" } : undefined} onChange={(e) => setForm((p) => ({ ...p, matric: e.target.value }))} />
                    {user.matric && <p className="sug-hint">{t("profile.matricLocked")}</p>}
                  </div>
                  <div className="sug-field"><label htmlFor="pf-bio">{t("profile.bio")}</label><textarea id="pf-bio" className="inp" style={{ minHeight: 84 }} value={form.bio} onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))} /></div>
                  <button type="button" className="btn btn-navy" style={{ alignSelf: "flex-start" }} onClick={saveSettings} disabled={saving} aria-busy={saving}>
                    {saving ? <><span className="auth-spinner" aria-hidden="true" />{t("common.saving")}</> : t("profile.saveChanges")}
                  </button>

                  {/* Email Verification Section */}
                  <div style={{ marginTop: 12, padding: 16, borderRadius: 16, background: "var(--surfH)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                      <strong style={{ fontSize: 15 }}>Email Confirmation</strong>
                      <span style={{ fontSize: 12, fontWeight: 800, color: user.emailVerified ? "#059669" : "#D97706" }}>
                        {user.emailVerified ? "Verified ✓" : "Not Verified"}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: "var(--mut)", marginBottom: 10 }}>{user.email}</p>
                    {!user.emailVerified && (
                      <form onSubmit={handleVerifyCode} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input className="inp" style={{ width: 160, height: 40 }} placeholder="6-digit code" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
                        <button type="submit" className="btn btn-pri" style={{ height: 40 }} disabled={emailBusy}>Verify Email</button>
                        <button type="button" className="btn btn-out" style={{ height: 40 }} onClick={handleResendVerification} disabled={emailBusy}>Send Verification Email</button>
                      </form>
                    )}
                  </div>

                  {/* Change Password Section */}
                  <form onSubmit={handleChangePassword} style={{ padding: 16, borderRadius: 16, background: "var(--surfH)", display: "flex", flexDirection: "column", gap: 10 }}>
                    <strong style={{ fontSize: 15 }}>{user.hasUsablePassword ? "Change Password" : "Set Account Password (Google Sign-In Account)"}</strong>
                    {user.hasUsablePassword && (
                      <input type="password" className="inp" style={{ height: 42 }} placeholder="Current password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} autoComplete="current-password" />
                    )}
                    <div className="sug-2">
                      <input type="password" className="inp" style={{ height: 42 }} placeholder="New password (8+ chars)" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} autoComplete="new-password" />
                      <input type="password" className="inp" style={{ height: 42 }} placeholder="Confirm new password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} autoComplete="new-password" />
                    </div>
                    <button type="submit" className="btn btn-out" style={{ alignSelf: "flex-start", height: 40 }} disabled={pwBusy}>
                      {pwBusy ? "Updating…" : "Update Password"}
                    </button>
                  </form>

                  {/* Danger Zone: NDPA Account Deletion */}
                  <div style={{ padding: 16, borderRadius: 16, border: "1px solid rgba(220,38,38,.3)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <strong style={{ fontSize: 14, color: "#DC2626" }}>Delete Account</strong>
                      <p style={{ fontSize: 12.5, color: "var(--mut)" }}>Permanently delete your account and associated personal data (NDPA right to erasure).</p>
                    </div>
                    <button type="button" className="btn btn-out" style={{ color: "#DC2626", borderColor: "rgba(220,38,38,.4)", height: 38 }} onClick={() => setDelAccOpen(true)}>
                      Delete Account
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="pf-side">
          <section className="raised pf-card">
            <h2>{t("profile.yourActivity")}</h2>
            <p className="pf-card-sub">{t("profile.activitySub")}</p>
            {activity.state === "loading" && <Skel h={190} mb={0} />}
            {activity.state === "error" && <p className="field-err" role="alert">{t("profile.activityError")}</p>}
            {activity.state === "ok" && <ActivityChart series={activity.series} />}
          </section>

          <section className="raised pf-card" aria-labelledby="pf-lang">
            <h2 id="pf-lang">{t("profile.language")}</h2>
            <p className="pf-card-sub">{t("profile.languageSub")}</p>
            <div className="pf-lang" role="radiogroup" aria-label={t("profile.language")}>
              {LANGUAGES.map((l) => (
                <button key={l.code} type="button" role="radio" aria-checked={lang === l.code} className={lang === l.code ? "on" : ""} onClick={() => chooseLang(l.code)}>
                  {lang === l.code && <Ic n="check" s={14} />}{l.label}
                </button>
              ))}
            </div>
            {lang === "ha" && <p className="pf-card-sub" style={{ marginTop: 10 }}>{t("profile.hausaNote")}</p>}
          </section>
        </aside>
      </div>

      {/* Followers / Following List Modal */}
      {socialModal && (
        <Modal onClose={() => setSocialModal(null)} maxW={440} showClose label={socialModal}>
          <div style={{ padding: "24px 20px" }}>
            <h3 style={{ fontSize: 19, marginBottom: 14, textTransform: "capitalize" }}>
              {socialModal} ({socialModal === "followers" ? user.followers : user.following})
            </h3>
            {socialLoading ? <p style={{ color: "var(--mut)" }}>Loading…</p> : socialList.length === 0 ? (
              <p style={{ color: "var(--mut)", fontSize: 14 }}>No users here yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" }}>
                {socialList.map((u) => (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: "var(--surfH)" }}>
                    <UserAvatar src={u.avatarUrl} av={u.av} bg={u.bg} size={38} border="none" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 4 }}>
                        {u.name} {u.isVerifiedStudent && <VerifiedBadge size={13} />}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--mut)" }}>@{u.username}{u.dept ? ` · ${u.dept}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Delete Post Modal */}
      {toDelete && (
        <Modal onClose={() => !deleting && setToDelete(null)} maxW={420} label={t("feed.deleteTitle")} dismissible={!deleting} showClose>
          <div style={{ padding: "30px 24px 24px" }}>
            <h3 style={{ fontSize: 20, marginBottom: 8, paddingRight: 36 }}>{t("feed.deleteTitle")}</h3>
            <p style={{ color: "var(--mut)", fontSize: 14.5, marginBottom: 6, overflowWrap: "anywhere" }}>“{toDelete.title}”</p>
            <p style={{ color: "var(--mut)", fontSize: 13.5, marginBottom: 20 }}>
              {user.isVerifiedStudent ? "This post will be permanently deleted." : t("feed.deleteBody")}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-out" onClick={() => setToDelete(null)} disabled={deleting} data-autofocus>{t("common.cancel")}</button>
              <button type="button" className="btn" style={{ background: "#DC2626", color: "#fff" }} onClick={confirmDelete} disabled={deleting} aria-busy={deleting}>{deleting ? t("common.deleting") : t("feed.delete")}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Account Confirmation Modal */}
      {delAccOpen && (
        <Modal onClose={() => !delAccBusy && setDelAccOpen(false)} maxW={420} showClose label="Confirm Account Deletion">
          <form onSubmit={handleDeleteAccount} style={{ padding: "26px 22px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ fontSize: 20, color: "#DC2626" }}>Permanently Delete Account?</h3>
            <p style={{ fontSize: 13.5, color: "var(--mut)", lineHeight: 1.6 }}>
              This action cannot be undone and will remove your profile, posts, messages, and personal data.
            </p>
            {user.hasUsablePassword && (
              <input type="password" className="inp" required placeholder="Enter current password to confirm" value={delAccPw} onChange={(e) => setDelAccPw(e.target.value)} />
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-out" onClick={() => setDelAccOpen(false)} disabled={delAccBusy}>Cancel</button>
              <button type="submit" className="btn" style={{ background: "#DC2626", color: "#fff" }} disabled={delAccBusy}>
                {delAccBusy ? "Deleting…" : "Delete Permanently"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default ProfilePage;
