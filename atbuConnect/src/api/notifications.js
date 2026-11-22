import { api } from "./client";

export function flattenNotif(n) {
  return { id: n.id, type: n.type, text: n.text, time: n.time, unread: !n.read, link: n.link };
}

export async function listNotifications() {
  const data = await api.get("/notifications/", { auth: "required" }).catch(() => ({ results: [] }));
  return (data.results || data).map(flattenNotif);
}

export async function markAllRead() {
  return api.post("/notifications/mark_all_read/", {}, { auth: "required" });
}

export async function markRead(id) {
  return api.post(`/notifications/${id}/read/`, {}, { auth: "required" });
}
