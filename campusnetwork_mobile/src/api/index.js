/**
 * CampusNetwork (Cenet) Native Mobile API Client
 * 1:1 parity with website src/api/* + exact flattenQuestion / flattenAnswer serializers
 * so mobile never renders raw nested objects or mismatched count keys.
 */
import * as SecureStore from "expo-secure-store";

export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL || "https://campusnetwork-api.onrender.com/api";

export const WEB_ORIGIN = "https://campusnetwork-sooty.vercel.app";

const ACCESS_KEY = "cn_access";
const REFRESH_KEY = "cn_refresh";

export const tokenStore = {
  async getAccess() {
    try { return await SecureStore.getItemAsync(ACCESS_KEY); } catch { return null; }
  },
  async getRefresh() {
    try { return await SecureStore.getItemAsync(REFRESH_KEY); } catch { return null; }
  },
  async set(access, refresh) {
    if (access) await SecureStore.setItemAsync(ACCESS_KEY, String(access));
    if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, String(refresh));
  },
  async clear() {
    await SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
  },
};

let refreshPromise = null;
async function tryRefresh() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refresh = await tokenStore.getRefresh();
    if (!refresh) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (!res.ok) {
        await tokenStore.clear();
        return false;
      }
      const data = await res.json();
      await tokenStore.set(data.access, data.refresh || refresh);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

function extractError(data, fallback) {
  if (!data) return fallback;
  if (typeof data === "string") {
    if (data.trim().startsWith("<")) return fallback;
    return data.slice(0, 180);
  }
  if (data.detail) return data.detail;
  const k = Object.keys(data)[0];
  if (k) {
    const v = data[k];
    const m = Array.isArray(v) ? v[0] : v;
    if (typeof m === "string") return k === "non_field_errors" ? m : `${k}: ${m}`;
  }
  return fallback;
}

export async function apiRequest(path, { method = "GET", body, auth = false, _retried = false } = {}) {
  const headers = { Accept: "application/json" };
  const isForm = body instanceof FormData;
  if (body && !isForm) headers["Content-Type"] = "application/json";

  const token = await tokenStore.getAccess();
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (auth) throw new Error("Please sign in to continue.");

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  if (res.status === 401 && !_retried && (await tokenStore.getRefresh())) {
    const ok = await tryRefresh();
    if (ok) return apiRequest(path, { method, body, auth, _retried: true });
  }

  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const err = new Error(extractError(data, `Request failed (${res.status})`));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ── Exact Website-Parity Serializers (fixes "Student", 0 counts & React child crash!) ──

export function flattenAnswer(a) {
  if (!a) return null;
  const u = typeof a.user === "object" && a.user ? a.user : null;
  return {
    id: a.id,
    question: a.question,
    parent: a.parent ?? null,
    userId: u?.id ?? a.userId ?? null,
    username: u?.username || a.username || "",
    user: u?.name || (typeof a.user === "string" ? a.user : "Unknown"),
    av: u?.av || a.av || "?",
    bg: u?.bg || a.bg || "#3B82F6",
    avatarUrl: u?.avatar_url || a.avatarUrl || null,
    staff: !!(u?.staff ?? a.staff),
    isVerifiedStudent: !!(u?.is_verified_student ?? a.isVerifiedStudent),
    time: a.time || "",
    createdAt: a.created_at || null,
    body: a.body || "",
    bodyHtml: a.body_html || "",
    imageUrl: a.image_url || null,
    likes: a.likes ?? 0,
    liked: !!a.liked,
    upvotes: a.upvotes ?? 0,
    downvotes: a.downvotes ?? 0,
    myVote: a.my_vote ?? a.myVote ?? null,
    canDelete: !!(a.can_delete ?? a.canDelete),
    replies: Array.isArray(a.replies) ? a.replies.map(flattenAnswer).filter(Boolean) : [],
  };
}

export function flattenQuestion(q) {
  if (!q) return null;
  const u = typeof q.user === "object" && q.user ? q.user : null;
  return {
    id: q.id,
    publicId: q.public_id || q.publicId || String(q.id),
    userId: u?.id ?? q.userId ?? null,
    username: u?.username || q.username || "",
    user: u?.name || (typeof q.user === "string" ? q.user : "Unknown"),
    av: u?.av || q.av || "?",
    bg: u?.bg || q.bg || "#3B82F6",
    avatarUrl: u?.avatar_url || q.avatarUrl || null,
    staff: !!(u?.staff ?? q.staff),
    isVerifiedStudent: !!(u?.is_verified_student ?? q.isVerifiedStudent),
    dept: (typeof q.dept === "string" ? q.dept : q.dept?.name) || u?.dept || "General",
    time: q.time || "",
    title: q.title || "",
    body: q.body || "",
    bodyHtml: q.body_html || "",
    tags: Array.isArray(q.tags) ? q.tags : [],
    likes: q.likes ?? 0,
    ans: q.ans ?? 0,
    views: q.views ?? 0,
    liked: !!q.liked,
    votes: q.votes ?? 0,
    voted: q.voted ?? null,
    saved: !!q.saved,
    answered: !!q.answered,
    answers: Array.isArray(q.answers) ? q.answers.map(flattenAnswer).filter(Boolean) : [],
    media: Array.isArray(q.media)
      ? q.media.map((m) => ({
          id: m.id,
          kind: m.kind || m.media_type || "image",
          url: m.url,
          width: m.width,
          height: m.height,
          duration: m.duration,
        }))
      : [],
    promoted: !!q.promoted,
    canDelete: !!(q.can_delete ?? q.canDelete),
    canEdit: !!(q.can_edit ?? q.canEdit),
    deleteDeadline: q.delete_deadline || null,
    pollOptions: Array.isArray(q.poll_options) ? q.poll_options : (q.pollOptions || []),
    pollTotalVotes: q.poll_total_votes ?? q.pollTotalVotes ?? 0,
    myPollOption: q.my_poll_option ?? q.myPollOption ?? null,
    createdAt: q.created_at || null,
    editedAt: q.edited_at || null,
  };
}

// ── Domain API Methods ────────────────────────────────────────────────────────

export const authApi = {
  login: async (username, password) => {
    const data = await apiRequest("/auth/login/", { method: "POST", body: { username, password } });
    await tokenStore.set(data.access, data.refresh);
    return data.user;
  },
  register: async (payload) => {
    const data = await apiRequest("/auth/register/", { method: "POST", body: payload });
    await tokenStore.set(data.access, data.refresh);
    return data.user;
  },
  logout: () => tokenStore.clear(),
  me: () => apiRequest("/auth/me/", { auth: true }),
  updateMe: (patch) => apiRequest("/auth/me/", { method: "PATCH", body: patch, auth: true }),
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append("avatar", file);
    return apiRequest("/auth/me/", { method: "PATCH", body: form, auth: true });
  },
  changePassword: (current_password, new_password, confirm_password) =>
    apiRequest("/auth/change-password/", {
      method: "POST",
      body: { current_password, new_password, confirm_password },
      auth: true,
    }),
  forgotPassword: (email) => apiRequest("/auth/forgot-password/", { method: "POST", body: { email } }),
  verifyResetCode: (email, code) => apiRequest("/auth/verify-reset-code/", { method: "POST", body: { email, code } }),
  resetPassword: (token, new_password, confirm_password) =>
    apiRequest("/auth/reset-password/", { method: "POST", body: { token, new_password, confirm_password } }),
  sendEmailVerification: () => apiRequest("/auth/send-verification/", { method: "POST", body: {}, auth: true }),
  verifyEmailCode: (code) => apiRequest("/auth/verify-email/", { method: "POST", body: { code }, auth: true }),
  deleteAccount: (password) => apiRequest("/auth/me/", { method: "DELETE", body: { password }, auth: true }),
};

export const departmentsApi = {
  list: () => apiRequest("/departments/").then((d) => (Array.isArray(d) ? d : d?.results || [])),
};

export const questionsApi = {
  list: ({ filter = "Trending", topic, discovery, search, mine, saved, page = 1 } = {}) => {
    const map = { Trending: "trending", "Most Recent": "newest", Unanswered: "unanswered", Answered: "trending" };
    const p = new URLSearchParams();
    p.set("ordering", map[filter] || "trending");
    if (topic && topic !== "All") p.set("topic", topic);
    if (discovery) p.set("discovery", discovery);
    if (search) p.set("search", search);
    if (mine) p.set("mine", "1");
    if (saved) p.set("saved", "1");
    if (page > 1) p.set("page", String(page));
    return apiRequest(`/questions/?${p.toString()}`).then((d) => {
      const raw = d?.results || (Array.isArray(d) ? d : []);
      let results = raw.map(flattenQuestion).filter(Boolean);
      if (filter === "Answered") results = results.filter((q) => q.answered);
      return { results, count: d?.count ?? results.length, hasMore: !!d?.next };
    });
  },
  get: (idOrSlug) => apiRequest(`/questions/${encodeURIComponent(idOrSlug)}/`).then(flattenQuestion),
  create: (payload) => apiRequest("/questions/", { method: "POST", body: payload, auth: true }).then(flattenQuestion),
  delete: (id) => apiRequest(`/questions/${id}/`, { method: "DELETE", auth: true }),
  vote: (id, direction) => apiRequest(`/questions/${id}/vote/`, { method: "POST", body: { direction }, auth: true }),
  like: (id) => apiRequest(`/questions/${id}/like/`, { method: "POST", body: {}, auth: true }),
  bookmark: (id) => apiRequest(`/questions/${id}/bookmark/`, { method: "POST", body: {}, auth: true }),
  hide: (id) => apiRequest(`/questions/${id}/hide/`, { method: "POST", body: {}, auth: true }),
  report: (id, reason = "Inappropriate content") =>
    apiRequest(`/questions/${id}/report/`, { method: "POST", body: { reason }, auth: true }),
  likers: (id) => apiRequest(`/questions/${id}/likers/`, { auth: true }),
  votePoll: (id, optionId) =>
    apiRequest(`/questions/${id}/vote-poll/`, { method: "POST", body: { option_id: optionId }, auth: true }),
  trendingTopics: () => apiRequest("/questions/trending-topics/").then((d) => (Array.isArray(d) ? d : [])),
  comments: (id, sort = "recommended") =>
    apiRequest(`/questions/${id}/comments/?sort=${encodeURIComponent(sort)}`).then((d) => {
      const raw = d?.results || (Array.isArray(d) ? d : []);
      return raw.map(flattenAnswer).filter(Boolean);
    }),
  addComment: (id, { body, parent = null }) =>
    apiRequest(`/questions/${id}/answer/`, {
      method: "POST",
      body: parent ? { body, parent } : { body },
      auth: true,
    }).then(flattenAnswer),
  voteComment: (answerId, direction) =>
    apiRequest(`/answers/${answerId}/vote/`, { method: "POST", body: { direction }, auth: true }),
  deleteComment: (answerId) =>
    apiRequest(`/answers/${answerId}/`, { method: "DELETE", auth: true }),
  reportComment: (answerId, reason = "Inappropriate content") =>
    apiRequest(`/answers/${answerId}/report/`, { method: "POST", body: { reason }, auth: true }),
};

export const usersApi = {
  profile: (id) => apiRequest(`/users/${id}/`),
  profileByUsername: (username) => apiRequest(`/users/by-username/${encodeURIComponent(username)}/`),
  search: (q) => apiRequest(`/users/search/?q=${encodeURIComponent(q)}`).then((d) => (Array.isArray(d) ? d : d?.results || [])),
  follow: (id) => apiRequest(`/users/${id}/follow/`, { method: "POST", body: {}, auth: true }),
  unfollow: (id) => apiRequest(`/users/${id}/follow/`, { method: "DELETE", auth: true }),
  followers: (id) => apiRequest(`/users/${id}/followers/`).then((d) => (Array.isArray(d) ? d : [])),
  following: (id) => apiRequest(`/users/${id}/following/`).then((d) => (Array.isArray(d) ? d : [])),
  sugRatings: (id) => apiRequest(`/users/${id}/rate-sug/`, { auth: true }),
  rateSug: (id, score, comment = "") =>
    apiRequest(`/users/${id}/rate-sug/`, { method: "POST", body: { score, comment }, auth: true }),
  verificationStatus: () => apiRequest("/verification/status/", { auth: true }),
  applyVerification: (payload) => apiRequest("/verification/apply/", { method: "POST", body: payload, auth: true }),
};

export const staffApi = {
  list: () => apiRequest("/staff/", { auth: true }).then((d) => d?.results || (Array.isArray(d) ? d : [])),
  checkStatus: (email) => apiRequest(`/applications/status/?email=${encodeURIComponent(email)}`),
  apply: (payload) => apiRequest("/applications/", { method: "POST", body: payload }),
  cancelSug: () => apiRequest("/applications/cancel-sug/", { method: "POST", body: {}, auth: true }),
  cancelPending: () => apiRequest("/applications/cancel-pending/", { method: "POST", body: {}, auth: true }),
};

export const libraryApi = {
  permissions: () => apiRequest("/library/permissions/", { auth: true }),
  catalog: () => apiRequest("/library/catalog/", { auth: true }),
  folders: ({ level, faculty, department, q, page = 1 } = {}) => {
    const p = new URLSearchParams();
    if (level) p.set("level", level);
    if (faculty) p.set("faculty", faculty);
    if (department) p.set("department", department);
    if (q) p.set("q", q);
    if (page > 1) p.set("page", String(page));
    return apiRequest(`/library/folders/?${p.toString()}`, { auth: true });
  },
  documents: ({ course, q, mine, page = 1 } = {}) => {
    const p = new URLSearchParams();
    if (course) p.set("course", course);
    if (q) p.set("q", q);
    if (mine) p.set("mine", "1");
    if (page > 1) p.set("page", String(page));
    return apiRequest(`/library/documents/?${p.toString()}`, { auth: true });
  },
  uploadDocument: (formData) => apiRequest("/library/documents/", { method: "POST", body: formData, auth: true }),
  deleteDocument: (id) => apiRequest(`/library/documents/${id}/`, { method: "DELETE", auth: true }),
};

export const communitiesApi = {
  list: ({ category = "All", q = "", mine = false, sort = "popular" } = {}) => {
    const p = new URLSearchParams({ sort });
    if (category && category !== "All") p.set("category", category);
    if (q) p.set("q", q);
    if (mine) p.set("mine", "1");
    return apiRequest(`/communities/?${p.toString()}`).then((d) => d?.results || (Array.isArray(d) ? d : []));
  },
  get: (slug) => apiRequest(`/communities/${encodeURIComponent(slug)}/`),
  create: (payload) => apiRequest("/communities/", { method: "POST", body: payload, auth: true }),
  update: (slug, payload) => apiRequest(`/communities/${encodeURIComponent(slug)}/`, { method: "PATCH", body: payload, auth: true }),
  follow: (slug) => apiRequest(`/communities/${encodeURIComponent(slug)}/follow/`, { method: "POST", body: {}, auth: true }),
  unfollow: (slug) => apiRequest(`/communities/${encodeURIComponent(slug)}/follow/`, { method: "DELETE", auth: true }),
  followers: (slug) => apiRequest(`/communities/${encodeURIComponent(slug)}/followers/`).then((d) => d?.results || (Array.isArray(d) ? d : [])),
  setNotifications: (slug, level) =>
    apiRequest(`/communities/${encodeURIComponent(slug)}/notifications/`, { method: "PATCH", body: { notifications: level }, auth: true }),
  posts: (slug, sort = "recent") =>
    apiRequest(`/communities/${encodeURIComponent(slug)}/posts/?sort=${encodeURIComponent(sort)}`).then((d) => d?.results || (Array.isArray(d) ? d : [])),
  createPost: (slug, payload) => apiRequest(`/communities/${encodeURIComponent(slug)}/posts/`, { method: "POST", body: payload, auth: true }),
  likePost: (postId) => apiRequest(`/community-posts/${postId}/like/`, { method: "POST", body: {}, auth: true }),
  postComments: (postId) => apiRequest(`/community-posts/${postId}/comments/`).then((d) => d?.results || (Array.isArray(d) ? d : [])),
  addPostComment: (postId, body) => apiRequest(`/community-posts/${postId}/comments/`, { method: "POST", body: { body }, auth: true }),
};

export const chatApi = {
  conversations: (search = "") => {
    const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    return apiRequest(`/chats/${qs}`, { auth: true }).then((d) => d?.results || (Array.isArray(d) ? d : []));
  },
  start: (sugId, message = "") =>
    apiRequest("/chats/start/", { method: "POST", body: { sug_id: sugId, message }, auth: true }),
  messages: (id) =>
    apiRequest(`/chats/${id}/messages/`, { auth: true }).then((d) => d?.results || (Array.isArray(d) ? d : [])),
  send: (id, body, attachment = null) => {
    if (attachment) {
      const form = new FormData();
      form.append("body", body || "");
      form.append("attachment", attachment);
      return apiRequest(`/chats/${id}/messages/`, { method: "POST", body: form, auth: true });
    }
    return apiRequest(`/chats/${id}/messages/`, { method: "POST", body: { body }, auth: true });
  },
  markRead: (id) => apiRequest(`/chats/${id}/read/`, { method: "POST", body: {}, auth: true }),
  toggleSave: (msgId, note = "") =>
    apiRequest(`/chats/messages/${msgId}/save/`, { method: "POST", body: { note }, auth: true }),
  saved: () => apiRequest("/chats/saved/", { auth: true }).then((d) => d?.results || (Array.isArray(d) ? d : [])),
};

export const adsApi = {
  list: () => apiRequest("/ads/", { auth: true }).then((d) => d?.results || (Array.isArray(d) ? d : [])),
  analytics: (range = "30d") => apiRequest(`/ads/analytics/?range=${range}`, { auth: true }),
  create: (payload) => apiRequest("/ads/", { method: "POST", body: payload, auth: true }),
  serve: (placement = "feed") =>
    apiRequest(`/ads/serve/?placement=${encodeURIComponent(placement)}`).then((d) => (Array.isArray(d) ? d : [])),
  impression: (id, placement = "feed") =>
    apiRequest(`/ads/${id}/impression/`, { method: "POST", body: { placement } }).catch(() => {}),
  click: (id, placement = "feed") =>
    apiRequest(`/ads/${id}/click/`, { method: "POST", body: { placement } }).catch(() => {}),
  initiatePayment: (id) => apiRequest(`/ads/${id}/initiate-payment/`, { method: "POST", body: {}, auth: true }),
  initiateVerificationPayment: () => apiRequest("/verification/initiate-payment/", { method: "POST", body: {}, auth: true }),
  verifyPayment: (reference) => apiRequest("/payments/verify/", { method: "POST", body: { reference }, auth: true }),
};

export const notificationsApi = {
  list: () => apiRequest("/notifications/", { auth: true }).then((d) => d?.results || (Array.isArray(d) ? d : [])),
  markAllRead: () => apiRequest("/notifications/mark_all_read/", { method: "POST", body: {}, auth: true }),
  markRead: (id) => apiRequest(`/notifications/${id}/read/`, { method: "POST", body: {}, auth: true }),
  clearAll: () => apiRequest("/notifications/clear_all/", { method: "DELETE", auth: true }),
  registerDeviceToken: (token, platform = "android") =>
    apiRequest("/notifications/device-token/", { method: "POST", body: { token, platform }, auth: true }),
  unregisterDeviceToken: (token) =>
    apiRequest("/notifications/device-token/", { method: "DELETE", body: { token }, auth: true }),
};
