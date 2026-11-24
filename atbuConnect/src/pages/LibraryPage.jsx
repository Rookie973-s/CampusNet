import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Ic from '../components/Ic';
import { Skel } from '../components/ui/shared';
import FolderCard from '../components/library/FolderCard';
import PdfViewer from '../components/library/PdfViewer';
import UploadPanel from '../components/library/UploadPanel';
import AdCard from '../components/ads/AdCard';
import { serveAds } from '../api/ads';
import {
  getCatalog, getMyPermissions, getFolders, listDocuments, getCourses, deleteDocument,
  fetchDocumentBlob, formatBytes,
} from '../api/library';
import { useI18n } from '../i18n';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
const isAuthErr = (e) => e.status === 401 || e.status === 403;

/**
 * PDF library. Default view = course folders (real courses that have documents). Filters
 * (level / faculty / department / search) narrow the folders; opening a folder lists its PDFs.
 * Everything is driven by the URL so views are shareable and the back button works.
 */
function LibraryPage({ user, onLogin, toast }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const level = params.get("level") || "";
  const faculty = params.get("faculty") || "";
  const department = params.get("department") || "";
  const urlQ = params.get("q") || "";
  const courseId = params.get("course") || "";

  const [catalog, setCatalog] = useState({ levels: [], faculties: [] });
  const [catalogState, setCatalogState] = useState("loading");
  const [perm, setPerm] = useState({ can_upload: false, scope: null });
  const [q, setQ] = useState(urlQ);
  const [items, setItems] = useState([]);       // folders or documents, depending on the view
  const [course, setCourse] = useState(null);   // the open folder's details
  const [count, setCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [state, setState] = useState("loading"); // loading | ok | error
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [libAds, setLibAds] = useState([]);
  const reqId = useRef(0);

  useEffect(() => {
    serveAds("library").then((a) => setLibAds(Array.isArray(a) ? a : [])).catch(() => {});
  }, [user]);

  const setFilter = useCallback((patch) => {
    if ("course" in patch) {
      setItems([]);
      setState("loading");
    }
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: false });
  }, [params, setParams]);

  useEffect(() => {
    if (!user) { setCatalogState("ok"); return; }
    setCatalogState("loading");
    getCatalog().then((c) => { setCatalog({ levels: c.levels || [], faculties: c.faculties || [] }); setCatalogState("ok"); })
      .catch(() => setCatalogState("error"));
  }, [user]);
  useEffect(() => { if (user) getMyPermissions().then(setPerm); else setPerm({ can_upload: false, scope: null }); }, [user]);

  useEffect(() => { setQ(urlQ); }, [urlQ]);
  useEffect(() => {
    if (q === urlQ) return;
    const id = setTimeout(() => setFilter({ q: q.trim() }), 300);
    return () => clearTimeout(id);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const deptOptions = useMemo(() => catalog.faculties.find((x) => String(x.id) === faculty)?.departments || [], [catalog, faculty]);

  // A parent change must never leave an invalid child selected.
  useEffect(() => {
    if (catalogState !== "ok") return;
    if (faculty && !catalog.faculties.some((x) => String(x.id) === faculty)) setFilter({ faculty: "", department: "" });
    else if (department && !deptOptions.some((d) => String(d.id) === department)) setFilter({ department: "" });
  }, [catalogState, catalog, faculty, department, deptOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback((pg = 1) => {
    const id = ++reqId.current;
    if (pg === 1) setState("loading"); else setLoadingMore(true);
    const run = courseId
      ? listDocuments({ course: courseId, q: urlQ, page: pg })
      : getFolders({ level, faculty, department, q: urlQ, page: pg });
    run.then((r) => {
      if (id !== reqId.current) return;
      setItems((prev) => (pg === 1 ? r.results : [...prev, ...r.results]));
      setCount(r.count); setHasMore(r.hasMore); setPage(pg); setState("ok");
    }).catch(() => { if (id === reqId.current) setState("error"); })
      .finally(() => { if (id === reqId.current) setLoadingMore(false); });
  }, [level, faculty, department, urlQ, courseId]);

  useEffect(() => { if (user) load(1); }, [load, user]);

  useEffect(() => {
    if (!user || !courseId) { setCourse(null); return; }
    getCourses({ course: courseId }).then((c) => setCourse(c[0] || null)).catch(() => setCourse(null));
  }, [courseId, user]);

  const clearAll = () => { setQ(""); setParams(new URLSearchParams()); };
  const hasFilters = !!(level || faculty || department || urlQ);

  const remove = async (d) => {
    if (!window.confirm(t("library.confirmDelete", { title: d.title }))) return;
    try {
      await deleteDocument(d.id);
      setItems((p) => p.filter((x) => x.id !== d.id)); setCount((c) => Math.max(0, c - 1));
      toast(t("library.deleted"), "success");
    } catch { toast(t("library.deleteFail"), "error"); }
  };

  const downloadDoc = async (d) => {
    try {
      const u = await fetchDocumentBlob(d.id, { download: true });
      const a = document.createElement("a"); a.href = u; a.download = d.originalName || `${d.title}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
    } catch (e) { if (e.message === "SIGN_IN") onLogin(t("guest.actions.download")); else toast(t("library.downloadFail"), "error"); }
  };

  const openDoc = (d) => { if (!user) { onLogin(t("guest.actions.open")); return; } setViewing(d); };

  const chips = [
    level && { k: "level", label: `${level} ${t("library.levelWord")}` },
    faculty && { k: "faculty", label: catalog.faculties.find((x) => String(x.id) === faculty)?.name || t("library.faculty") },
    department && { k: "department", label: deptOptions.find((d) => String(d.id) === department)?.name || t("library.department") },
    urlQ && { k: "q", label: `“${urlQ}”` },
  ].filter(Boolean);
  const onChip = (k) => { if (k === "q") setQ(""); setFilter(k === "faculty" ? { faculty: "", department: "" } : { [k]: "" }); };

  const Label = ({ htmlFor, children }) => <label htmlFor={htmlFor} className="lf-label">{children}</label>;

  if (!user) {
    return (
      <div className="media-wrap lib-page" style={{ paddingTop: 28 }}>
        <div className="raised lib-empty fu">
          <Ic n="lock" s={42} c="var(--accent)" />
          <h2>Sign in to Access the PDF Library</h2>
          <p>
            Course notes, handouts, and past question PDFs are exclusively available to registered CampusNetwork (Cenet) members.
          </p>
          <button type="button" className="btn btn-navy" onClick={() => onLogin("browse the PDF Library")}>
            Sign In / Create Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="media-wrap lib-page">
      <div className="lib-head">
        <div>
          <h1>{t("library.title")}</h1>
          <p>{t("library.sub")}</p>
        </div>
        {perm.can_upload && (
          <button type="button" className="btn btn-navy" onClick={() => setUploadOpen(true)}><Ic n="upload" s={15} />{t("library.upload")}</button>
        )}
      </div>

      <section className="raised lib-filterbox" aria-label={t("library.filters")}>
        <div className="lib-search">
          <label htmlFor="lib-q" className="sr-only">{t("library.search")}</label>
          <span aria-hidden="true"><Ic n="search" s={17} /></span>
          <input id="lib-q" className="inp" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("library.searchPh")} />
        </div>
        <div className="lib-filters">
          <div>
            <Label htmlFor="f-level">{t("library.level")}</Label>
            <select id="f-level" className="inp" value={level} onChange={(e) => setFilter({ level: e.target.value, course: "" })} disabled={catalogState !== "ok"}>
              <option value="">{t("library.allLevels")}</option>
              {catalog.levels.map((l) => <option key={l} value={l}>{l} {t("library.levelWord")}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="f-fac">{t("library.faculty")}</Label>
            <select id="f-fac" className="inp" value={faculty} onChange={(e) => setFilter({ faculty: e.target.value, department: "", course: "" })} disabled={catalogState !== "ok"}>
              <option value="">{t("library.allFaculties")}</option>
              {catalog.faculties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="f-dep">{t("library.department")}</Label>
            <select id="f-dep" className="inp" value={department} onChange={(e) => setFilter({ department: e.target.value, course: "" })} disabled={!faculty}>
              <option value="">{faculty ? t("library.allDepartments") : t("library.pickFaculty")}</option>
              {deptOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="lib-clear">
            <button type="button" className="btn btn-out" onClick={clearAll} disabled={!hasFilters && !courseId}>{t("library.clearAll")}</button>
          </div>
        </div>
        {chips.length > 0 && (
          <div className="lib-chips" aria-label={t("library.activeFilters")}>
            {chips.map((c) => (
              <button key={c.k} type="button" className="chip" onClick={() => onChip(c.k)} aria-label={t("library.removeFilter", { name: c.label })}>
                {c.label}<span className="chip-x"><Ic n="x" s={12} stroke={3} /></span>
              </button>
            ))}
          </div>
        )}
      </section>

      {courseId && (
        <nav className="lib-crumb" aria-label="Breadcrumb">
          <button type="button" onClick={() => setFilter({ course: "" })}><Ic n="arrowL" s={14} />{t("library.allFolders")}</button>
          <span aria-hidden="true">/</span>
          <strong>{course ? `${course.code}${course.title ? ` — ${course.title}` : ""}` : "…"}</strong>
        </nav>
      )}

      <p className="lib-count" role="status" aria-live="polite">
        {state === "ok"
          ? courseId ? t("library.docsN", { n: count }) : t("library.foldersN", { n: count })
          : "\u00A0"}
      </p>

      {state === "loading" && (
        <div className="folder-grid">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="raised" style={{ padding: 18, height: 150 }}><Skel h={16} w="60%" /><Skel h={12} w="40%" /></div>)}</div>
      )}

      {state === "error" && (
        <div className="raised lib-empty" role="alert">
          <Ic n="file" s={36} c="var(--faint)" />
          <h3>{t("library.loadFailed")}</h3>
          <p>{t("common.checkConnection")}</p>
          <button type="button" className="btn btn-navy" onClick={() => load(1)}>{t("common.retry")}</button>
        </div>
      )}

      {state === "ok" && items.length === 0 && (
        <div className="raised lib-empty">
          <Ic n="folder" s={38} c="var(--faint)" />
          <h3>{hasFilters || courseId ? t("library.noMatch") : t("library.empty")}</h3>
          <p>{hasFilters || courseId ? t("library.noMatchHint") : perm.can_upload ? t("library.emptyRep") : t("library.emptyStudent")}</p>
          {(hasFilters || courseId) && <button type="button" className="btn btn-out" onClick={clearAll}>{t("library.clearAll")}</button>}
          {!hasFilters && !courseId && perm.can_upload && <button type="button" className="btn btn-navy" onClick={() => setUploadOpen(true)}>{t("library.upload")}</button>}
        </div>
      )}

      {state === "ok" && items.length > 0 && !courseId && (
        <>
          {libAds[0] && <div style={{ marginBottom: 16 }}><AdCard ad={libAds[0]} placement="library" /></div>}
          <ul className="folder-grid" style={{ listStyle: "none" }}>
            {items.map((f) => <li key={f.id}><FolderCard f={f} onOpen={(x) => setFilter({ course: x.id })} /></li>)}
          </ul>
        </>
      )}

      {state === "ok" && items.length > 0 && courseId && (
        <ul className="lib-grid" style={{ listStyle: "none" }}>
          {items.map((d, i) => (
            <li key={d.id}>
              <article className="card lib-card fu" style={{ animationDelay: `${Math.min(i, 8) * 0.04}s`, height: "100%" }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <div className="lib-icon" aria-hidden="true">PDF</div>
                  <div style={{ minWidth: 0 }}>
                    <h3>{d.title}</h3>
                    <p style={{ fontSize: 12, color: "var(--mut)", marginTop: 3 }}>
                      {d.uploader ? `${d.uploader} · ` : ""}{fmtDate(d.createdAt)}{d.sizeBytes ? ` · PDF · ${formatBytes(d.sizeBytes)}` : ""}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span className="tag">{d.courseCode}</span><span className="tag">{d.level} {t("library.levelWord")}</span>
                  <span className="tag">{d.facultyName}</span><span className="tag">{d.departmentName}</span>
                </div>
                {d.description && <p className="lib-desc">{d.description}</p>}
                {d.isFlagged && (
                  <div style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(245,158,11,.14)", border: "1px solid rgba(245,158,11,.35)", fontSize: 12, color: "#B45309", display: "flex", gap: 7, alignItems: "flex-start" }} role="note">
                    <Ic n="alert" s={14} c="#D97706" />
                    <span>{d.securityWarnings?.[0] || "Contains embedded or obfuscated PDF structures. Viewed in sandbox mode for safety."}</span>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-navy" style={{ flex: 1, minWidth: 110 }} onClick={() => openDoc(d)}><Ic n="eye" s={15} />{t("library.view")}</button>
                  <button type="button" className="btn btn-out" style={{ flex: 1, minWidth: 110 }} onClick={() => (user ? downloadDoc(d) : onLogin(t("guest.actions.download")))}><Ic n="download" s={15} />{t("library.download")}</button>
                  {d.canManage && (
                    <button type="button" className="btn btn-out" style={{ width: 46, padding: 0 }} aria-label={t("library.deleteAria", { title: d.title })} onClick={() => remove(d)}><Ic n="trash" s={15} c="#DC2626" /></button>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {state === "ok" && hasMore && (
        <div style={{ textAlign: "center", margin: "22px 0 8px" }}>
          <button type="button" className="btn btn-out" onClick={() => load(page + 1)} disabled={loadingMore} aria-busy={loadingMore}>
            {loadingMore ? t("common.loading") : t("common.loadMore")}
          </button>
        </div>
      )}

      {uploadOpen && perm.scope && (
        <UploadPanel scope={perm.scope} defaultCourse={courseId} onClose={() => setUploadOpen(false)} onUploaded={() => load(1)} toast={toast} />
      )}
      {viewing && <PdfViewer doc={viewing} onClose={() => setViewing(null)} onNeedLogin={() => onLogin(t("guest.actions.open"))} toast={toast} />}
    </div>
  );
}

export default LibraryPage;
