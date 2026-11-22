import { api, apiUpload } from "./client";

export async function listConversations({ search = "" } = {}) {
  const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  const data = await api.get(`/chats/${qs}`, { auth: "required" });
  return Array.isArray(data) ? data : data.results || [];
}

export async function startConversation(sugId, message = "") {
  return api.post("/chats/start/", { sug_id: sugId, message }, { auth: "required" });
}

export async function getMessages(convoId) {
  const data = await api.get(`/chats/${convoId}/messages/`, { auth: "required" });
  return Array.isArray(data) ? data : data.results || [];
}

export async function sendMessage(convoId, { body = "", attachment = null }) {
  if (attachment) {
    const form = new FormData();
    form.append("body", body);
    form.append("attachment", attachment);
    return apiUpload(`/chats/${convoId}/messages/`, form);
  }
  return api.post(`/chats/${convoId}/messages/`, { body }, { auth: "required" });
}

export async function markConversationRead(convoId) {
  return api.post(`/chats/${convoId}/read/`, {}, { auth: "required" });
}

export async function toggleSaveChatMessage(msgId, note = "") {
  return api.post(`/chats/messages/${msgId}/save/`, { note }, { auth: "required" });
}

export async function listSavedChatQuestions() {
  const data = await api.get("/chats/saved/", { auth: "required" });
  return Array.isArray(data) ? data : data.results || [];
}
