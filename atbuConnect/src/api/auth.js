import { api, apiUpload, tokenStore } from "./client";

/** Flattens the Django MeSerializer shape into what the UI expects. */
export function flattenMe(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    av: u.av,
    bg: u.bg,
    avatarUrl: u.avatar_url || null,
    role: u.role,
    phone: u.phone || u.phone_number || "",
    phoneNumber: u.phone_number || u.phone || "",
    bio: u.bio,
    dept: u.dept?.name || null,
    deptId: u.dept?.id || null,
    matric: u.matric_number,
    level: u.level,
    staffId: u.staff_id,
    title: u.title,
    isVerifiedStaff: !!u.is_verified_staff,
    isVerifiedStudent: !!u.is_verified_student,
    emailVerified: !!u.email_verified,
    hideAds: !!u.hide_ads,
    hasUsablePassword: u.has_usable_password !== false,
    canChangeUsername: u.can_change_username !== false,
    nextUsernameChangeAt: u.next_username_change_at || null,
    entitlements: u.entitlements || {
      is_verified_student: !!u.is_verified_student,
      can_edit_own_posts: !!u.is_verified_student,
      can_delete_own_posts_anytime: !!u.is_verified_student,
      max_post_words: u.is_verified_student ? 1200 : 300,
      max_post_chars: u.is_verified_student ? 10000 : 2500,
      can_hide_ads: !!u.is_verified_student,
      hide_ads: !!u.hide_ads,
    },
    questions: u.questions ?? 0,
    answers: u.answers ?? 0,
    followers: u.followers ?? 0,
    following: u.following ?? 0,
    sugRating: u.sug_rating ?? 0,
    sugRatingsCount: u.sug_ratings_count ?? 0,
    language: u.language || "en",
  };
}

export async function login(identifier, password) {
  const data = await api.post("/auth/login/", { username: identifier, password });
  tokenStore.set(data.access, data.refresh);
  return flattenMe(data.user);
}

export async function register({
  firstName, lastName, phoneNumber, matric, username, email, password, confirmPassword, department,
}) {
  const payload = {
    first_name: firstName,
    last_name: lastName,
    phone_number: phoneNumber || "",
    phone: phoneNumber || "",
    email,
    password,
    confirm_password: confirmPassword,
    department: department || null,
  };
  if (username) payload.username = username;
  if (matric) payload.matric_number = matric;
  const data = await api.post("/auth/register/", payload);
  tokenStore.set(data.access, data.refresh);
  return flattenMe(data.user);
}

export function logout() {
  tokenStore.clear();
}

export async function fetchMe() {
  if (!tokenStore.isLoggedIn()) return null;
  const data = await api.get("/auth/me/");
  return flattenMe(data);
}

export async function updateMe(patch) {
  const data = await api.patch("/auth/me/", patch, { auth: "required" });
  return flattenMe(data);
}

export async function uploadAvatar(file) {
  const form = new FormData();
  form.append("avatar", file);
  const data = await apiUpload("/auth/me/avatar/", form);
  return flattenMe(data);
}

export async function removeAvatar() {
  const data = await api.del("/auth/me/avatar/", { auth: "required" });
  return flattenMe(data);
}

export async function changePassword(currentPassword, newPassword, confirmPassword) {
  const data = await api.post(
    "/auth/change-password/",
    { current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword },
    { auth: "required" },
  );
  if (data.access && data.refresh) tokenStore.set(data.access, data.refresh);
  return data;
}

export async function forgotPassword(email) {
  return api.post("/auth/forgot-password/", { email });
}

export async function verifyResetCode(email, code) {
  return api.post("/auth/verify-reset-code/", { email, code });
}

export async function resetPassword(token, newPassword, confirmPassword) {
  return api.post("/auth/reset-password/", {
    token,
    new_password: newPassword,
    confirm_password: confirmPassword,
  });
}

export async function sendEmailVerification() {
  return api.post("/auth/send-verification/", {}, { auth: "required" });
}

export async function verifyEmail({ token, code }) {
  return api.post("/auth/verify-email/", { token, code });
}

export async function deleteAccount(password) {
  return api.del("/auth/me/", { body: { password }, auth: "required" });
}

export async function googleLogin(credential) {
  const data = await api.post("/auth/google/", { credential });
  tokenStore.set(data.access, data.refresh);
  return flattenMe(data.user);
}

export async function fetchActivity(days = 84) {
  return api.get(`/auth/me/activity/?days=${days}`, { auth: "required" });
}
