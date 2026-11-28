import { api, apiUpload } from "./client";

export async function listCampaigns({ all = false, status = "" } = {}) {
  const params = new URLSearchParams();
  if (all) params.set("all", "1");
  if (status) params.set("status", status);
  const qs = params.toString();
  const data = await api.get(`/ads/${qs ? `?${qs}` : ""}`, { auth: "required" });
  return data.results || data;
}

export async function createCampaign({
  name, headline, description, image, destinationUrl, ctaText,
  targeting, placements, startDate, endDate, activeDays,
  currency = "NGN", totalBudget, dailyBudget, saveAs = "pending",
}) {
  const form = new FormData();
  form.append("name", name);
  form.append("headline", headline);
  form.append("description", description);
  if (image) form.append("image", image);
  if (destinationUrl) form.append("destination_url", destinationUrl);
  form.append("cta_text", ctaText || "Learn More");
  form.append("targeting", JSON.stringify(targeting || {}));
  form.append("placements", JSON.stringify(placements || ["feed"]));
  form.append("start_date", startDate);
  form.append("end_date", endDate);
  form.append("active_days", JSON.stringify(activeDays || []));
  form.append("currency", currency);
  form.append("total_budget", String(totalBudget));
  if (dailyBudget) form.append("daily_budget", String(dailyBudget));
  form.append("save_as", saveAs);
  return apiUpload("/ads/", form);
}

export async function pauseCampaign(id) {
  return api.post(`/ads/${id}/pause/`, {}, { auth: "required" });
}

export async function resumeCampaign(id) {
  return api.post(`/ads/${id}/resume/`, {}, { auth: "required" });
}

export async function submitCampaign(id) {
  return api.post(`/ads/${id}/submit/`, {}, { auth: "required" });
}

export async function approveCampaign(id, note = "") {
  return api.post(`/ads/${id}/approve/`, { note }, { auth: "required" });
}

export async function rejectCampaign(id, note) {
  return api.post(`/ads/${id}/reject/`, { note }, { auth: "required" });
}

export async function takedownCampaign(id, reason) {
  return api.post(`/ads/${id}/takedown/`, { reason }, { auth: "required" });
}

export async function initiateAdPayment(id) {
  return api.post(`/ads/${id}/initiate-payment/`, {}, { auth: "required" });
}

export async function estimateAdPrice({ startDate, endDate, targeting, placements }) {
  return api.post("/ads/estimate/", {
    start_date: startDate,
    end_date: endDate,
    targeting: targeting || {},
    placements: placements || ["feed"],
  }, { auth: "required" });
}

export async function initiateVerificationPayment() {
  return api.post("/verification/initiate-payment/", {}, { auth: "required" });
}

export async function verifyPaystackPayment(reference) {
  return api.post("/payments/verify/", { reference }, { auth: "required" });
}

export async function getAdAnalytics({ range = "30d", campaignId = "", all = false } = {}) {
  const params = new URLSearchParams({ range });
  if (campaignId) params.set("campaign_id", campaignId);
  if (all) params.set("all", "1");
  return api.get(`/ads/analytics/?${params.toString()}`, { auth: "required" });
}

export async function serveAds(placement = "feed") {
  const data = await api.get(`/ads/serve/?placement=${encodeURIComponent(placement)}`).catch(() => []);
  return Array.isArray(data) ? data : [];
}

export async function recordAdImpression(id, placement = "feed") {
  return api.post(`/ads/${id}/impression/`, { placement }).catch(() => {});
}

export async function recordAdClick(id, placement = "feed") {
  return api.post(`/ads/${id}/click/`, { placement }).catch(() => {});
}
