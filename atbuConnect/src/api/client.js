// ── Core API client ──────────────────────────────────────────────
// Talks to the Django REST Framework backend. Handles JWT storage,
// automatic Authorization headers, and silent access-token refresh
// on 401 responses (one retry).

export const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

/** Normalize relative or http:// media URLs against the API origin so images render consistently everywhere. */
export function normalizeMediaUrl(url) {
  if (!url || typeof url !== "string") return null;
  let u = url.trim();
  if (!u) return null;
  if (u.startsWith("http://") && !u.includes("localhost") && !u.includes("127.0.0.1")) {
    u = "https://" + u.slice("http://".length);
  }
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("blob:") || u.startsWith("data:")) {
    return u;
  }
  const origin = API_BASE.replace(/\/api(\/v\d+)?\/?$/, "");
  return `${origin}${u.startsWith("/") ? "" : "/"}${u}`;
}

const ACCESS_KEY = "atbu_access";
const REFRESH_KEY = "atbu_refresh";

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: (access, refresh) => {
    if (access) localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
  isLoggedIn: () => !!localStorage.getItem(ACCESS_KEY),
};

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/** Sanitize any raw backend URL / technical error so users never see server hostnames or stack traces. */
function sanitizeErrorText(msg, fallback) {
  if (!msg || typeof msg !== "string") return fallback;
  const trimmed = msg.trim();
  if (
    /onrender\.com|https?:\/\/|failed to fetch|networkerror|load failed|err_connection|econnrefused|traceback|<!doctype|<html/i.test(trimmed)
  ) {
    return fallback;
  }
  return trimmed.length > 220 ? `${trimmed.slice(0, 217)}…` : trimmed;
}

/** Pulls the friendliest possible message out of a DRF error payload. */
function extractMessage(data, fallback) {
  if (!data) return fallback;
  if (typeof data === "string") return sanitizeErrorText(data, fallback);
  if (data.detail) return sanitizeErrorText(String(data.detail), fallback);
  // DRF validation errors: {"field": ["msg", ...]} — surface the first one.
  const firstKey = Object.keys(data)[0];
  if (firstKey) {
    const val = data[firstKey];
    const msg = Array.isArray(val) ? val[0] : val;
    if (typeof msg === "string") {
      return sanitizeErrorText(firstKey === "non_field_errors" ? msg : `${firstKey}: ${msg}`, fallback);
    }
  }
  return fallback;
}

let refreshPromise = null;

async function refreshAccessToken() {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return null;
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("refresh failed");
        const data = await res.json();
        tokenStore.set(data.access, data.refresh);
        return data.access;
      })
      .catch(() => {
        tokenStore.clear();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * Core request helper.
 * @param {string} path - path relative to API_BASE, e.g. "/questions/"
 * @param {object} opts - { method, body, isForm, auth }
 *   body: plain object (JSON-encoded) or a FormData instance (isForm: true)
 *   auth: "required" | "optional" (default) — "required" throws early if not logged in
 */
export async function apiRequest(path, opts = {}) {
  const { method = "GET", body, isForm = false, auth = "optional", _retried = false } = opts;

  if (auth === "required" && !tokenStore.isLoggedIn()) {
    throw new ApiError("You need to sign in first.", 401, null);
  }

  const headers = {};
  if (!isForm) headers["Content-Type"] = "application/json";
  const access = tokenStore.getAccess();
  if (access) headers["Authorization"] = `Bearer ${access}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("No internet connection. Please check your network and try again.", 0, null);
  }

  // Access token expired — try one silent refresh + retry.
  if (res.status === 401 && !_retried && tokenStore.getRefresh()) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      return apiRequest(path, { ...opts, _retried: true });
    }
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const defaultMsg =
      res.status >= 500
        ? "Something went wrong on our end. Please try again in a moment."
        : `Request failed (${res.status})`;
    throw new ApiError(extractMessage(data, defaultMsg), res.status, data);
  }
  return data;
}

/**
 * Multipart upload with progress + cancel (fetch can't report upload progress).
 * Same behaviour as apiRequest: bearer token, one silent refresh on 401, friendly errors.
 *   apiUpload("/questions/", formData, { onProgress: pct => ..., signal })
 */
export function apiUpload(path, form, { method = "POST", onProgress, signal } = {}) {
  const attempt = (retried) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_BASE}${path}`);
    const access = tokenStore.getAccess();
    if (access) xhr.setRequestHeader("Authorization", `Bearer ${access}`);
    if (onProgress) xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onerror = () => reject(new ApiError("Network error. Check your connection and try again.", 0, null));
    xhr.onabort = () => { const e = new ApiError("Upload cancelled.", 0, null); e.cancelled = true; reject(e); };
    xhr.onload = async () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { data = xhr.responseText || null; }
      if (xhr.status === 401 && !retried && tokenStore.getRefresh()) {
        const fresh = await refreshAccessToken();
        if (fresh) { attempt(true).then(resolve, reject); return; }
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(extractMessage(data, `Upload failed (${xhr.status})`), xhr.status, data));
    };
    if (signal) {
      if (signal.aborted) { xhr.abort(); return; }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
  return attempt(false);
}

export const api = {
  get: (path, opts = {}) => apiRequest(path, { method: "GET", ...opts }),
  post: (path, body, opts = {}) => apiRequest(path, { method: "POST", body, ...opts }),
  patch: (path, body, opts = {}) => apiRequest(path, { method: "PATCH", body, ...opts }),
  del: (path, opts = {}) => apiRequest(path, { method: "DELETE", ...opts }),
};

export { ApiError };
