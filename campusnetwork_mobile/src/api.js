import * as SecureStore from "expo-secure-store";

export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL || "https://campusnetwork-api.onrender.com/api";

const ACCESS_KEY = "cn_access";
const REFRESH_KEY = "cn_refresh";

export const tokenStore = {
  async getAccess() {
    try { return await SecureStore.getItemAsync(ACCESS_KEY); } catch { return null; }
  },
  async set(access, refresh) {
    if (access) await SecureStore.setItemAsync(ACCESS_KEY, access);
    if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh);
  },
  async clear() {
    await SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
  },
};

export async function apiRequest(path, { method = "GET", body, auth = false } = {}) {
  const headers = { Accept: "application/json" };
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const token = await tokenStore.getAccess();
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (auth) throw new Error("Please sign in first.");

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const firstKey = Object.keys(data || {})[0];
    const msg =
      data?.detail ||
      (firstKey ? (Array.isArray(data[firstKey]) ? data[firstKey][0] : String(data[firstKey])) : null) ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
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
  me: () => apiRequest("/auth/me/", { auth: true }),
  feed: (ordering = "trending") => apiRequest(`/questions/?ordering=${ordering}`),
  createPost: (payload) => apiRequest("/questions/", { method: "POST", body: payload, auth: true }),
  communities: () => apiRequest("/communities/"),
  sug: () => apiRequest("/staff/", { auth: true }),
  libraryFolders: () => apiRequest("/library/folders/", { auth: true }),
  notifications: () => apiRequest("/notifications/", { auth: true }),
};
