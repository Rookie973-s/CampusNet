import { api, apiUpload } from "./client";

export const COMMUNITY_CATEGORIES = [
  "All",
  "Academics",
  "Technology",
  "Sports",
  "Entertainment",
  "Arts and Culture",
  "Entrepreneurship",
  "Campus Life",
  "Faculty and Departments",
  "Other Interests",
];

export async function listCommunities({ category = "All", q = "", mine = false, sort = "popular", page = 1 } = {}) {
  const params = new URLSearchParams();
  if (category && category !== "All") params.set("category", category);
  if (q && q.trim()) params.set("q", q.trim());
  if (mine) params.set("mine", "1");
  if (sort) params.set("sort", sort);
  if (page > 1) params.set("page", page);
  const data = await api.get(`/communities/?${params.toString()}`);
  const results = data.results || data;
  return { results: Array.isArray(results) ? results : [], hasMore: !!data.next, count: data.count ?? results.length };
}

export async function getCommunity(slug) {
  return api.get(`/communities/${encodeURIComponent(slug)}/`);
}

export async function createCommunity({ name, slug, description, category, visibility, rules, accentColor, avatar, coverImage }) {
  const form = new FormData();
  form.append("name", name);
  if (slug) form.append("slug", slug);
  form.append("description", description);
  form.append("category", category);
  form.append("visibility", visibility || "public");
  form.append("rules", rules || "");
  if (accentColor) form.append("accent_color", accentColor);
  if (avatar) form.append("avatar", avatar);
  if (coverImage) form.append("cover_image", coverImage);
  return apiUpload("/communities/", form);
}

export async function updateCommunity(slug, patch) {
  return api.patch(`/communities/${encodeURIComponent(slug)}/`, patch, { auth: "required" });
}

export async function followCommunity(slug) {
  return api.post(`/communities/${encodeURIComponent(slug)}/follow/`, {}, { auth: "required" });
}

export async function unfollowCommunity(slug) {
  return api.del(`/communities/${encodeURIComponent(slug)}/follow/`, { auth: "required" });
}

export async function updateCommunityNotifs(slug, notifLevel) {
  return api.patch(`/communities/${encodeURIComponent(slug)}/notifications/`, { notif_level: notifLevel }, { auth: "required" });
}

export async function listCommunityMembers(slug) {
  return api.get(`/communities/${encodeURIComponent(slug)}/members/`);
}

export async function setCommunityRole(slug, userId, role) {
  return api.post(`/communities/${encodeURIComponent(slug)}/roles/`, { user_id: userId, role }, { auth: "required" });
}

export async function listCommunityPosts(slug, { sort = "recent", page = 1 } = {}) {
  const params = new URLSearchParams({ sort });
  if (page > 1) params.set("page", page);
  const data = await api.get(`/communities/${encodeURIComponent(slug)}/posts/?${params.toString()}`);
  const results = data.results || data;
  return { results: Array.isArray(results) ? results : [], hasMore: !!data.next };
}

export async function createCommunityPost(slug, { title = "", body, bodyHtml = "", isImportant = false, image = null }) {
  const form = new FormData();
  if (title) form.append("title", title);
  form.append("body", body);
  if (bodyHtml) form.append("body_html", bodyHtml);
  form.append("is_important", isImportant ? "true" : "false");
  if (image) form.append("image", image);
  return apiUpload(`/communities/${encodeURIComponent(slug)}/posts/`, form);
}

export async function likeCommunityPost(postId) {
  return api.post(`/community-posts/${postId}/like/`, {}, { auth: "required" });
}

export async function deleteCommunityPost(postId) {
  return api.del(`/community-posts/${postId}/`, { auth: "required" });
}

export async function listCommunityPostComments(postId) {
  return api.get(`/community-posts/${postId}/comments/`);
}

export async function createCommunityPostComment(postId, { body, bodyHtml = "", parent = null }) {
  return api.post(`/community-posts/${postId}/comments/`, { body, body_html: bodyHtml, parent }, { auth: "required" });
}

export async function reportCommunityPost(postId, reason) {
  return api.post(`/community-posts/${postId}/report/`, { reason }, { auth: "required" });
}
