import { api, apiUpload } from "./client";

export function flattenAnswer(a) {
  return {
    id: a.id,
    question: a.question,
    parent: a.parent ?? null,
    userId: a.user?.id ?? null,
    username: a.user?.username || "",
    user: a.user?.name || "Unknown",
    av: a.user?.av || "?",
    bg: a.user?.bg || "#3B82F6",
    avatarUrl: a.user?.avatar_url || null,
    staff: !!a.user?.staff,
    isVerifiedStudent: !!a.user?.is_verified_student,
    time: a.time,
    createdAt: a.created_at || null,
    body: a.body,
    bodyHtml: a.body_html || "",
    imageUrl: a.image_url || null,
    likes: a.likes || 0,
    liked: !!a.liked,
    upvotes: a.upvotes ?? 0,
    downvotes: a.downvotes ?? 0,
    myVote: a.my_vote || null,
    canDelete: !!a.can_delete,
    replies: (a.replies || []).map(flattenAnswer),
    reactions: a.reactions || { fire: 0, bulb: 0, clap: 0 },
    myReactions: a.myReactions || {},
  };
}

export function flattenQuestion(q) {
  return {
    id: q.id,
    publicId: q.public_id || String(q.id),
    userId: q.user?.id ?? null,
    username: q.user?.username || "",
    user: q.user?.name || "Unknown",
    av: q.user?.av || "?",
    bg: q.user?.bg || "#3B82F6",
    avatarUrl: q.user?.avatar_url || null,
    staff: !!q.user?.staff,
    isVerifiedStudent: !!q.user?.is_verified_student,
    dept: q.dept || q.user?.dept || "General",
    time: q.time,
    title: q.title,
    body: q.body,
    bodyHtml: q.body_html || "",
    tags: q.tags || [],
    likes: q.likes || 0,
    ans: q.ans || 0,
    views: q.views || 0,
    liked: !!q.liked,
    votes: q.votes || 0,
    voted: q.voted || null,
    saved: !!q.saved,
    answered: !!q.answered,
    answers: (q.answers || []).map(flattenAnswer),
    media: (q.media || []).map((m) => ({
      id: m.id, kind: m.kind, url: m.url, width: m.width, height: m.height, duration: m.duration,
    })),
    promoted: !!q.promoted,
    canDelete: !!q.can_delete,
    canEdit: !!q.can_edit,
    deleteDeadline: q.delete_deadline || null,
    createdAt: q.created_at || null,
    editedAt: q.edited_at || null,
  };
}

const ORDERING_MAP = {
  Trending: "trending",
  "Most Recent": "newest",
  Unanswered: "unanswered",
  Answered: "trending",
};

export async function listQuestionsPage({ filter = "Trending", topic, discovery, search, mine, saved, page = 1 } = {}) {
  const params = new URLSearchParams();
  params.set("ordering", ORDERING_MAP[filter] || "trending");
  if (topic && topic !== "All") params.set("topic", topic);
  if (discovery) params.set("discovery", discovery);
  if (search) params.set("search", search);
  if (mine) params.set("mine", "1");
  if (saved) params.set("saved", "1");
  if (page > 1) params.set("page", page);
  const data = await api.get(`/questions/?${params.toString()}`);
  let items = (data.results || data).map(flattenQuestion);
  if (filter === "Answered") items = items.filter((q) => q.answered);
  return { items, hasMore: !!data.next, count: data.count ?? items.length };
}

export async function listQuestions(opts = {}) {
  return (await listQuestionsPage(opts)).items;
}

export async function listTrendingTopics() {
  const data = await api.get("/questions/trending-topics/");
  return Array.isArray(data) ? data : [];
}

export async function getQuestion(id) {
  const data = await api.get(`/questions/${id}/`);
  return flattenQuestion(data);
}

export async function createQuestion({ title, body, bodyHtml = "", tags, department, images = [], video = null, onProgress, signal }) {
  const form = new FormData();
  form.append("title", title);
  form.append("body", body);
  if (bodyHtml) form.append("body_html", bodyHtml);
  if (department) form.append("department", department);
  (tags || []).forEach((t) => form.append("tags", t));
  images.forEach((f) => form.append("images", f));
  if (video) form.append("video", video);
  const data = await apiUpload("/questions/", form, { onProgress, signal });
  return flattenQuestion(data);
}

export async function updateQuestion(id, patch) {
  const data = await api.patch(`/questions/${id}/`, patch, { auth: "required" });
  return flattenQuestion(data);
}

export async function deleteQuestion(id) {
  return api.del(`/questions/${id}/`, { auth: "required" });
}

export async function voteQuestion(id, direction) {
  return api.post(`/questions/${id}/vote/`, { direction }, { auth: "required" });
}

export async function likeQuestion(id) {
  return api.post(`/questions/${id}/like/`, {}, { auth: "required" });
}

export async function bookmarkQuestion(id) {
  return api.post(`/questions/${id}/bookmark/`, {}, { auth: "required" });
}

export async function reportQuestion(id, reason) {
  return api.post(`/questions/${id}/report/`, { reason }, { auth: "required" });
}

export async function listQuestionComments(id, { sort = "recent", page = 1 } = {}) {
  const params = new URLSearchParams({ sort });
  if (page > 1) params.set("page", page);
  const data = await api.get(`/questions/${id}/comments/?${params.toString()}`);
  const items = (data.results || data).map(flattenAnswer);
  return { items, hasMore: !!data.next, count: data.count ?? items.length };
}

export async function answerQuestion(id, payload) {
  // Accept either plain string (backward compat) or rich object { body, bodyHtml, parent, image }
  if (typeof payload === "string") {
    const data = await api.post(`/questions/${id}/answer/`, { body: payload }, { auth: "required" });
    return flattenAnswer(data);
  }
  const { body = "", bodyHtml = "", parent = null, image = null } = payload || {};
  if (image) {
    const form = new FormData();
    form.append("body", body);
    if (bodyHtml) form.append("body_html", bodyHtml);
    if (parent) form.append("parent", parent);
    form.append("image", image);
    const data = await apiUpload(`/questions/${id}/answer/`, form);
    return flattenAnswer(data);
  }
  const reqBody = { body };
  if (bodyHtml) reqBody.body_html = bodyHtml;
  if (parent) reqBody.parent = parent;
  const data = await api.post(`/questions/${id}/answer/`, reqBody, { auth: "required" });
  return flattenAnswer(data);
}

export async function voteAnswer(id, direction) {
  return api.post(`/answers/${id}/vote/`, { direction }, { auth: "required" });
}

export async function deleteAnswer(id) {
  return api.del(`/answers/${id}/`, { auth: "required" });
}

export async function reportAnswer(id, reason) {
  return api.post(`/answers/${id}/report/`, { reason }, { auth: "required" });
}

export async function likeAnswer(id) {
  return api.post(`/answers/${id}/like/`, {}, { auth: "required" });
}

export async function reactAnswer(id, kind) {
  return api.post(`/answers/${id}/react/`, { kind }, { auth: "required" });
}
