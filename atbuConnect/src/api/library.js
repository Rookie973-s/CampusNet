import { api, apiUpload, API_BASE, tokenStore } from "./client";

/** Shape the Django serializer into what the UI uses. */
export function flattenDoc(d) {
  return {
    id: d.id, title: d.title, description: d.description || "",
    courseId: d.course, courseCode: d.course_code, courseTitle: d.course_title,
    level: d.level, facultyId: d.faculty, facultyName: d.faculty_name,
    departmentId: d.department, departmentName: d.department_name,
    originalName: d.original_name, sizeBytes: d.size_bytes, uploader: d.uploader,
    isFlagged: !!d.is_flagged, securityWarnings: d.security_warnings || [],
    createdAt: d.created_at, canManage: !!d.can_manage,
  };
}

export function flattenFolder(f) {
  return {
    id: f.id, code: f.code, title: f.title, level: f.level,
    facultyId: f.faculty, facultyName: f.faculty_name,
    departmentId: f.department, departmentName: f.department_name,
    count: f.document_count, previews: f.previews || [],
  };
}

export const flattenCourse = (c) => ({
  id: c.id, code: c.code, title: c.title, level: c.level,
  facultyId: c.faculty, facultyName: c.faculty_name, departmentId: c.department, departmentName: c.department_name,
});

const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && String(v).trim() !== "" && v !== false) p.set(k, v === true ? "1" : String(v).trim()); });
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const getCatalog = () => api.get("/library/catalog/");

/** Guests get { can_upload:false }; reps also get the class they may upload for. */
export async function getMyPermissions() {
  try { return await api.get("/library/permissions/"); }
  catch { return { can_upload: false, scope: null }; }
}

export async function getFolders({ level, faculty, department, q, page = 1 } = {}) {
  const d = await api.get(`/library/folders/${qs({ level, faculty, department, q, page: page > 1 ? page : "" })}`);
  return { count: d.count ?? 0, hasMore: !!d.next, results: (d.results || []).map(flattenFolder) };
}

export async function listDocuments({ level, faculty, department, course, q, page = 1, mine } = {}) {
  const d = await api.get(`/library/documents/${qs({ level, faculty, department, course, q, mine, page: page > 1 ? page : "" })}`);
  return { count: d.count ?? 0, hasMore: !!d.next, results: (d.results || []).map(flattenDoc) };
}

export async function getCourses(filters = {}) {
  return (await api.get(`/library/courses/${qs(filters)}`)).map(flattenCourse);
}

export async function createCourse({ code, title, level, department }) {
  return flattenCourse(await api.post("/library/courses/", { code, title, level, department }, { auth: "required" }));
}

export const deleteDocument = (id) => api.del(`/library/documents/${id}/`, { auth: "required" });

/** Upload with progress + cancel. Fields: title, description, course, file. */
export async function uploadDocument(fields, { onProgress, signal } = {}) {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null) form.append(k, v); });
  return flattenDoc(await apiUpload("/library/documents/", form, { onProgress, signal }));
}

/** Fetch the PDF with the bearer token and return a blob URL (iframes can't send auth headers). */
export async function fetchDocumentBlob(id, { download = false } = {}) {
  const url = `${API_BASE}/library/documents/${id}/file/${download ? "?download=1" : ""}`;
  const go = (token) => fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  let res = await go(tokenStore.getAccess());
  if (res.status === 401 && tokenStore.getRefresh()) {
    try { await api.get("/auth/me/", { auth: "required" }); res = await go(tokenStore.getAccess()); } catch { /* fall through */ }
  }
  if (!res.ok) {
    throw Object.assign(new Error(res.status === 401 ? "SIGN_IN" : res.status === 404 ? "GONE" : `HTTP_${res.status}`), { status: res.status });
  }
  return URL.createObjectURL(await res.blob());
}

export function formatBytes(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
