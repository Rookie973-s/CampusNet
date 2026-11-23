import { api, apiUpload } from "./client";

export function flattenProfile(p) {
  return {
    id: p.id,
    username: p.username || "",
    name: p.name,
    av: p.av,
    bg: p.bg,
    avatarUrl: p.avatar_url || null,
    dept: p.dept,
    staff: !!p.staff,
    isVerifiedStudent: !!p.is_verified_student,
    title: p.title || "",
    bio: p.bio || "",
    questions: p.questions || 0,
    answers: p.answers || 0,
    followers: p.followers || 0,
    following: p.following || 0,
    isFollowing: !!p.is_following,
    isMe: !!p.is_me,
    sugRating: p.sug_rating ?? 0,
    sugRatingsCount: p.sug_ratings_count ?? 0,
  };
}

export async function getPublicProfile(id) {
  return flattenProfile(await api.get(`/users/${id}/`));
}

export async function getPublicProfileByUsername(username) {
  return flattenProfile(await api.get(`/users/by-username/${encodeURIComponent(username)}/`));
}

export async function searchUsers(query) {
  if (!query || !query.trim()) return [];
  const data = await api.get(`/users/search/?q=${encodeURIComponent(query.trim())}`);
  return (Array.isArray(data) ? data : data.results || []).map((u) => ({
    id: u.id,
    username: u.username || "",
    name: u.name,
    av: u.av,
    bg: u.bg,
    avatarUrl: u.avatar_url || null,
    staff: !!u.staff,
    isVerifiedStudent: !!u.is_verified_student,
    dept: u.dept || null,
  }));
}

export async function followUser(id) {
  return api.post(`/users/${id}/follow/`, {}, { auth: "required" });
}

export async function unfollowUser(id) {
  return api.del(`/users/${id}/follow/`, { auth: "required" });
}

export async function getFollowers(id) {
  const data = await api.get(`/users/${id}/followers/`);
  return (Array.isArray(data) ? data : []).map(flattenProfile);
}

export async function getFollowing(id) {
  const data = await api.get(`/users/${id}/following/`);
  return (Array.isArray(data) ? data : []).map(flattenProfile);
}

export async function getSUGRatings(id) {
  return api.get(`/users/${id}/rate-sug/`);
}

export async function rateSUG(id, score, comment = "") {
  return api.post(`/users/${id}/rate-sug/`, { score, comment }, { auth: "required" });
}

// ── Student verification ──
export async function getVerificationStatus() {
  return api.get("/verification/status/", { auth: "required" });
}

export async function applyStudentVerification({ faculty, departmentName, level, reason, consent, document, livenessVideo }) {
  const form = new FormData();
  if (faculty) form.append("faculty", faculty);
  if (departmentName) form.append("department_name", departmentName);
  form.append("level", level);
  form.append("reason", reason || "");
  form.append("consent", consent ? "true" : "false");
  if (document) form.append("supporting_document", document);
  if (livenessVideo) form.append("liveness_video", livenessVideo);
  return apiUpload("/verification/apply/", form);
}

export async function listVerificationApplications(status = "") {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return api.get(`/verification/applications/${qs}`, { auth: "required" });
}

export async function decideVerification(id, decision, payload = {}) {
  return api.post(`/verification/applications/${id}/${decision}/`, payload, { auth: "required" });
}
