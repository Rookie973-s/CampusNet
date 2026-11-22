import { api } from "./client";

export function flattenStaff(s) {
  return {
    id: s.id,
    username: s.username || "",
    name: s.name,
    role: s.role,
    dept: s.dept || "General",
    av: s.av,
    bg: s.bg,
    avatarUrl: s.avatar_url || null,
    online: !!s.online,
    rating: s.rating || 5,
    sugRating: s.sug_rating ?? 0,
    sugRatingsCount: s.sug_ratings_count ?? 0,
    mySugRating: s.my_sug_rating ?? null,
    answers: s.answers || 0,
    bio: s.bio,
    email: s.email,
    phone: s.phone,
  };
}

export async function listStaff({ search, department } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (department && department !== "All") params.set("department__name", department);
  const qs = params.toString();
  const data = await api.get(`/staff/${qs ? `?${qs}` : ""}`);
  return (data.results || data).map(flattenStaff);
}

export async function getStaff(id) {
  const data = await api.get(`/staff/${id}/`);
  return flattenStaff(data);
}
