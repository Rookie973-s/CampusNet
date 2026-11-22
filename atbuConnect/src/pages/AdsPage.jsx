import { useEffect, useState, useCallback } from "react";
import Ic from "../components/Ic";
import { Skel } from "../components/ui/shared";
import {
  listCampaigns, createCampaign, pauseCampaign, resumeCampaign,
  approveCampaign, rejectCampaign, initiateAdPayment, getAdAnalytics,
} from "../api/ads";
import { listDepartments } from "../api/departments";
import { COMMUNITY_CATEGORIES } from "../api/communities";

const STATUS_COLORS = {
  draft: { bg: "var(--surfH)", c: "var(--mut)" },
  pending: { bg: "rgba(245,158,11,.16)", c: "#D97706" },
  approved: { bg: "rgba(59,130,246,.16)", c: "#2563EB" },
  scheduled: { bg: "rgba(139,92,246,.16)", c: "#7C3AED" },
  active: { bg: "rgba(16,185,129,.16)", c: "#059669" },
  paused: { bg: "rgba(100,116,139,.18)", c: "var(--mut)" },
  rejected: { bg: "rgba(239,68,68,.16)", c: "#DC2626" },
  completed: { bg: "rgba(16,185,129,.12)", c: "#047857" },
};

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const LEVELS = ["100 Level", "200 Level", "300 Level", "400 Level", "500 Level", "Postgraduate"];

function todayIso(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Responsive SVG performance chart inspired by ADS TRACKER reference */
function AdPerformanceChart({ daily = [] }) {
  if (!daily.length) {
    return <div style={{ padding: 28, textAlign: "center", color: "var(--mut)", fontSize: 13.5 }}>No delivery activity recorded in this time range yet.</div>;
  }
  const W = 600, H = 190, PAD = 26;
  const maxVal = Math.max(1, ...daily.map((d) => Math.max(d.impressions, d.clicks * 5)));
  const stepX = daily.length > 1 ? (W - PAD * 2) / (daily.length - 1) : 0;

  const impPoints = daily.map((d, i) => [PAD + i * stepX, H - PAD - (d.impressions / maxVal) * (H - PAD * 2)]);
  const clkPoints = daily.map((d, i) => [PAD + i * stepX, H - PAD - ((d.clicks * 5) / maxVal) * (H - PAD * 2)]);
  const linePath = (pts) => pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = impPoints.length
    ? `${linePath(impPoints)} L${impPoints[impPoints.length - 1][0].toFixed(1)},${H - PAD} L${impPoints[0][0].toFixed(1)},${H - PAD} Z`
    : "";

  const statusColor = (st) => ({
    active: "#10B981", paused: "#F59E0B", scheduled: "#8B5CF6", completed: "#3B82F6", idle: "var(--brdS)",
  }[st] || "var(--brdS)");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Campaign impressions and clicks over time">
        <defs>
          <linearGradient id="adImpGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => {
          const y = H - PAD - f * (H - PAD * 2);
          return <line key={f} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="var(--brd)" strokeDasharray="3 4" />;
        })}
        {areaPath && <path d={areaPath} fill="url(#adImpGrad)" />}
        {impPoints.length > 1 && <path d={linePath(impPoints)} fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" />}
        {clkPoints.length > 1 && <path d={linePath(clkPoints)} fill="none" stroke="#10B981" strokeWidth="2" strokeDasharray="4 3" />}
        {impPoints.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={daily.length <= 14 ? 3.5 : 2} fill="#3B82F6" />
        ))}
      </svg>

      {/* Daily campaign status timeline strip */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>
          Daily Activity Status
        </div>
        <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 26 }}>
          {daily.map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${d.status} (${d.impressions} imp, ${d.clicks} clicks)`}
              style={{
                flex: 1,
                height: d.status === "idle" ? 6 : 22,
                borderRadius: 4,
                background: statusColor(d.status),
                opacity: d.status === "idle" ? 0.35 : 0.9,
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: "var(--mut)", marginTop: 8 }}>
          <span><b style={{ color: "#10B981" }}>●</b> Active</span>
          <span><b style={{ color: "#F59E0B" }}>●</b> Paused</span>
          <span><b style={{ color: "#8B5CF6" }}>●</b> Scheduled</span>
          <span><b style={{ color: "#3B82F6" }}>●</b> Completed</span>
        </div>
      </div>
    </div>
  );
}

export default function AdsPage({ user, onLogin, toast }) {
  const isAdmin = user && (user.role === "admin");
  const [tab, setTab] = useState("tracker"); // tracker | create | admin
  const [campaigns, setCampaigns] = useState([]);
  const [adminCampaigns, setAdminCampaigns] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [range, setRange] = useState("30d");
  const [selectedCamp, setSelectedCamp] = useState("");
  const [loading, setLoading] = useState(true);
  const [depts, setDepts] = useState([]);

  // Multi-step Ad Creation Wizard (5 steps)
  const [step, setStep] = useState(0);
  const [wiz, setWiz] = useState({
    name: "", headline: "", description: "", destinationUrl: "", ctaText: "Learn More",
    image: null, imagePreview: null,
    audienceType: "broad", faculties: [], levels: [], interests: [],
    placements: ["feed", "comments"], startDate: todayIso(0), endDate: todayIso(7), activeDays: [...DAYS],
    currency: "NGN", totalBudget: "5000", dailyBudget: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(() => {
    if (!user) return;
    setLoading(true);
    const reqs = [
      listCampaigns(),
      getAdAnalytics({ range, campaignId: selectedCamp }),
    ];
    if (isAdmin) reqs.push(listCampaigns({ all: true }));
    Promise.all(reqs)
      .then(([camps, an, allCamps]) => {
        setCampaigns(Array.isArray(camps) ? camps : []);
        setAnalytics(an);
        if (allCamps) setAdminCampaigns(Array.isArray(allCamps) ? allCamps : []);
      })
      .catch(() => toast("Could not load advertising dashboard.", "error"))
      .finally(() => setLoading(false));
  }, [user, range, selectedCamp, isAdmin, toast]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { listDepartments().then(setDepts).catch(() => {}); }, []);

  if (!user) {
    return (
      <div className="comm-page">
        <div className="raised lib-empty fu">
          <Ic n="megaphone" s={42} c="var(--accent)" />
          <h2>CampusNetwork Advertising</h2>
          <p>Sign in to create, manage, and track advertisements across CampusNetwork (Cenet).</p>
          <button type="button" className="btn btn-navy" onClick={() => onLogin("manage advertisements")}>Sign In</button>
        </div>
      </div>
    );
  }

  const toggleArr = (key, val) => {
    setWiz((p) => {
      const cur = p[key] || [];
      return { ...p, [key]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val] };
    });
  };

  const handleCreateCampaign = async (saveAs = "pending") => {
    if (!wiz.name.trim() || !wiz.headline.trim() || !wiz.description.trim()) {
      toast("Complete campaign name, headline, and description first.", "error"); setStep(0); return;
    }
    if (!wiz.totalBudget || Number(wiz.totalBudget) <= 0) {
      toast("Enter a valid campaign budget.", "error"); setStep(3); return;
    }
    setSubmitting(true);
    try {
      await createCampaign({
        name: wiz.name.trim(),
        headline: wiz.headline.trim(),
        description: wiz.description.trim(),
        image: wiz.image,
        destinationUrl: wiz.destinationUrl.trim(),
        ctaText: wiz.ctaText.trim() || "Learn More",
        targeting: {
          audience_type: wiz.audienceType,
          faculties: wiz.faculties,
          levels: wiz.levels,
          interests: wiz.interests,
        },
        placements: wiz.placements,
        startDate: wiz.startDate,
        endDate: wiz.endDate,
        activeDays: wiz.activeDays,
        currency: wiz.currency,
        totalBudget: wiz.totalBudget,
        dailyBudget: wiz.dailyBudget || null,
        saveAs,
      });
      toast(saveAs === "draft" ? "Draft saved!" : "Campaign submitted for admin review!", "success");
      setStep(0);
      setTab("tracker");
      loadData();
    } catch (e) {
      toast(e.message || "Could not submit campaign.", "error");
    } finally { setSubmitting(false); }
  };

  const handlePaymentClick = async (id) => {
    try {
      const res = await initiateAdPayment(id);
      toast(res.message || "Payment Coming Soon!", "info");
    } catch (e) { toast(e.message || "Payment gateway coming soon.", "info"); }
  };

  const s = analytics?.summary || {};
  const STEPS = ["1. Ad Content", "2. Audience", "3. Schedule", "4. Budget", "5. Review"];

  return (
    <div className="comm-page">
      <header className="comm-header fu">
        <div>
          <h1>CampusNetwork Advertising</h1>
          <p>Promote campus events, student businesses, and announcements with real-time impression &amp; click analytics.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className={`pill${tab === "tracker" ? " on" : ""}`} onClick={() => setTab("tracker")}>
            <Ic n="barChart" s={14} /> Track &amp; My Ads
          </button>
          <button type="button" className={`pill${tab === "create" ? " on" : ""}`} onClick={() => setTab("create")}>
            <Ic n="plus" s={14} /> Create Ad
          </button>
          {isAdmin && (
            <button type="button" className={`pill${tab === "admin" ? " on" : ""}`} onClick={() => setTab("admin")}>
              <Ic n="shield" s={14} /> Admin Review ({adminCampaigns.filter((c) => c.status === "pending").length})
            </button>
          )}
        </div>
      </header>

      {/* ── TRACKER & MY ADS TAB (inspired by ADS TRACKER reference) ── */}
      {tab === "tracker" && (
        <div className="fu">
          {/* Payment Coming Soon Notice Banner */}
          <div className="raised" style={{ padding: "14px 18px", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", background: "linear-gradient(135deg, rgba(37,99,235,.1), rgba(16,185,129,.08))" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Ic n="info" s={18} c="var(--accent)" />
              <div style={{ fontSize: 13.5 }}>
                <strong>Payment Coming Soon (Paystack &amp; Dynamic Bank Transfer):</strong>{" "}
                <span style={{ color: "var(--mut)" }}>You can create and submit campaigns for admin review now. Paid billing activation will launch once Paystack is enabled.</span>
              </div>
            </div>
            <span className="badge-promo">Payment Coming Soon</span>
          </div>

          {loading ? (
            <div className="ad-kpi-grid">{[1, 2, 3, 4].map((i) => <div key={i} className="raised" style={{ padding: 20 }}><Skel h={14} w="50%" mb={10} /><Skel h={28} w="70%" /></div>)}</div>
          ) : (
            <>
              {/* KPI Summary Cards */}
              <div className="ad-kpi-grid">
                <div className="raised ad-kpi-card ad-kpi--accent">
                  <span>Total Budget ({analytics?.currency || "NGN"})</span>
                  <strong>₦{Number(s.total_budget || 0).toLocaleString()}</strong>
                  <small>Remaining: ₦{Number(s.remaining_budget || 0).toLocaleString()}</small>
                </div>
                <div className="raised ad-kpi-card">
                  <span>Amount Spent</span>
                  <strong>₦{Number(s.amount_spent || 0).toLocaleString()}</strong>
                  <small>{analytics?.pricing_configured ? "Actual recorded delivery" : "Billing policy pending"}</small>
                </div>
                <div className="raised ad-kpi-card">
                  <span>Total Impressions</span>
                  <strong>{Number(s.total_impressions || 0).toLocaleString()}</strong>
                  <small>{s.active_campaigns || 0} active campaign(s)</small>
                </div>
                <div className="raised ad-kpi-card">
                  <span>Total Clicks &amp; CTR</span>
                  <strong>{Number(s.total_clicks || 0).toLocaleString()} <em style={{ fontSize: 14, color: "#10B981", fontStyle: "normal" }}>({s.ctr ?? 0}%)</em></strong>
                  <small>Real deduplicated tracking</small>
                </div>
              </div>

              {/* Performance Chart Card */}
              <section className="raised" style={{ padding: 20, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                  <div>
                    <h2 style={{ fontSize: 18 }}>Campaign Performance</h2>
                    <p style={{ fontSize: 12.5, color: "var(--mut)" }}>Real recorded impressions &amp; clicks (zero fabricated metrics)</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {campaigns.length > 0 && (
                      <select className="cmt-sort-select" value={selectedCamp} onChange={(e) => setSelectedCamp(e.target.value)} aria-label="Filter by campaign">
                        <option value="">All My Campaigns</option>
                        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                    {["7d", "30d", "90d"].map((r) => (
                      <button key={r} type="button" className={`pill${range === r ? " on" : ""}`} style={{ padding: "6px 12px", minHeight: 32, fontSize: 12 }} onClick={() => setRange(r)}>
                        {r.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <AdPerformanceChart daily={analytics?.daily || []} />
              </section>

              {/* My Campaigns List */}
              <section className="raised" style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h2 style={{ fontSize: 18 }}>My Campaigns ({campaigns.length})</h2>
                  <button type="button" className="btn btn-navy" style={{ height: 38, minHeight: 38 }} onClick={() => setTab("create")}>
                    <Ic n="plus" s={14} /> New Campaign
                  </button>
                </div>

                {campaigns.length === 0 ? (
                  <div className="pf-empty">
                    <Ic n="megaphone" s={36} c="var(--faint)" />
                    <p>You haven&apos;t created any ad campaigns yet.</p>
                    <button type="button" className="btn btn-navy" onClick={() => setTab("create")}>Create Your First Ad</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {campaigns.map((c) => {
                      const st = STATUS_COLORS[c.status] || STATUS_COLORS.draft;
                      return (
                        <div key={c.id} className="ad-camp-row">
                          <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 220 }}>
                            <div className="ad-thumb">
                              {c.image_url ? <img src={c.image_url} alt={c.name} /> : <Ic n="megaphone" s={18} c="var(--accent)" />}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <strong style={{ fontSize: 15 }}>{c.name}</strong>
                                <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", padding: "3px 9px", borderRadius: 99, background: st.bg, color: st.c }}>
                                  {c.status}
                                </span>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "var(--surfA)", color: "var(--mut)" }}>
                                  Payment Coming Soon
                                </span>
                              </div>
                              <div style={{ fontSize: 12.5, color: "var(--mut)", marginTop: 2 }}>
                                {c.start_date} → {c.end_date} · Budget: ₦{Number(c.total_budget).toLocaleString()} · Spent: ₦{Number(c.amount_spent).toLocaleString()}
                              </div>
                              {c.review_note && <div style={{ fontSize: 12, color: "#DC2626", marginTop: 3 }}>Reviewer note: {c.review_note}</div>}
                            </div>
                          </div>

                          <div className="ad-camp-metrics">
                            <div><strong>{c.impressions_count}</strong><span>Imp</span></div>
                            <div><strong>{c.clicks_count}</strong><span>Clicks</span></div>
                            <div><strong>{c.ctr}%</strong><span>CTR</span></div>
                          </div>

                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {c.status === "active" && (
                              <button type="button" className="btn btn-out" style={{ height: 34, minHeight: 34, padding: "0 12px", fontSize: 12 }} onClick={() => pauseCampaign(c.id).then(loadData).catch((e) => toast(e.message, "error"))}>
                                Pause
                              </button>
                            )}
                            {c.status === "paused" && (
                              <button type="button" className="btn btn-pri" style={{ height: 34, minHeight: 34, padding: "0 12px", fontSize: 12 }} onClick={() => resumeCampaign(c.id).then(loadData).catch((e) => toast(e.message, "error"))}>
                                Resume
                              </button>
                            )}
                            <button type="button" className="btn btn-out" style={{ height: 34, minHeight: 34, padding: "0 12px", fontSize: 12 }} onClick={() => handlePaymentClick(c.id)}>
                              Pay (Coming Soon)
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {/* ── MULTI-STEP AD CREATION WIZARD (inspired by ADS PLACEMENT reference) ── */}
      {tab === "create" && (
        <section className="raised fu" style={{ padding: "clamp(18px,3vw,30px)" }}>
          <ol className="sug-steps" style={{ marginBottom: 22 }}>
            {STEPS.map((label, i) => (
              <li key={label} className={i === step ? "on" : i < step ? "done" : ""}>
                <span>{i < step ? <Ic n="check" s={12} c="#fff" /> : i + 1}</span>
                <em>{label}</em>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label className="lf-label">Campaign Name *</label>
                  <input className="inp" value={wiz.name} onChange={(e) => setWiz((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. ATBU Tech Week 2026" />
                </div>
                <div>
                  <label className="lf-label">Advertisement Headline *</label>
                  <input className="inp" value={wiz.headline} onChange={(e) => setWiz((p) => ({ ...p, headline: e.target.value }))} placeholder="Short catchy headline…" maxLength={160} />
                </div>
                <div>
                  <label className="lf-label">Ad Copy / Description *</label>
                  <textarea className="inp" style={{ minHeight: 84 }} value={wiz.description} onChange={(e) => setWiz((p) => ({ ...p, description: e.target.value }))} placeholder="Describe your event, offer, or announcement…" maxLength={1000} />
                </div>
                <div className="sug-2">
                  <div>
                    <label className="lf-label">Destination URL (optional)</label>
                    <input className="inp" type="url" value={wiz.destinationUrl} onChange={(e) => setWiz((p) => ({ ...p, destinationUrl: e.target.value }))} placeholder="https://…" />
                  </div>
                  <div>
                    <label className="lf-label">Call-to-Action Text</label>
                    <input className="inp" value={wiz.ctaText} onChange={(e) => setWiz((p) => ({ ...p, ctaText: e.target.value }))} placeholder="Learn More" maxLength={40} />
                  </div>
                </div>
                <div>
                  <label className="lf-label">Creative Image (optional)</label>
                  <input type="file" accept="image/*" className="inp" style={{ paddingTop: 10 }} onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setWiz((p) => ({ ...p, image: f, imagePreview: f ? URL.createObjectURL(f) : null }));
                  }} />
                </div>
              </div>

              {/* Live Preview */}
              <div>
                <div className="lf-label">Live Preview on CampusNetwork</div>
                <div className="ad-card raised">
                  <div className="ad-card-head">
                    <span className="ad-pill"><Ic n="megaphone" s={11} /> Sponsored</span>
                    <span style={{ fontSize: 11, color: "var(--faint)" }}>CampusNetwork Ads</span>
                  </div>
                  <div className="ad-card-body">
                    {wiz.imagePreview && <img src={wiz.imagePreview} alt="Preview" className="ad-card-img" />}
                    <div>
                      <h4 style={{ fontSize: 16, fontFamily: "'DM Sans',sans-serif", fontWeight: 800, marginBottom: 4 }}>
                        {wiz.headline || "Your Ad Headline Appears Here"}
                      </h4>
                      <p style={{ fontSize: 13.5, color: "var(--mut)", lineHeight: 1.55, marginBottom: 10 }}>
                        {wiz.description || "Your advertisement description will look clean and native between CampusNetwork posts and comments."}
                      </p>
                      <span className="btn btn-pri" style={{ height: 34, minHeight: 34, padding: "0 14px", fontSize: 12.5 }}>
                        {wiz.ctaText || "Learn More"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label className="lf-label">Audience Scope</label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {[["broad", "All ATBU Students (Broad)"], ["targeted", "Specific Faculties / Levels / Interests"]].map(([k, l]) => (
                    <button key={k} type="button" className={`pill${wiz.audienceType === k ? " on" : ""}`} onClick={() => setWiz((p) => ({ ...p, audienceType: k }))}>{l}</button>
                  ))}
                </div>
              </div>

              {wiz.audienceType === "targeted" && (
                <>
                  <div>
                    <span className="lf-label">Faculties</span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {depts.map((d) => (
                        <button key={d.id} type="button" className={`pill${wiz.faculties.includes(d.name) ? " on" : ""}`} onClick={() => toggleArr("faculties", d.name)}>{d.name}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="lf-label">Academic Levels</span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {LEVELS.map((lv) => (
                        <button key={lv} type="button" className={`pill${wiz.levels.includes(lv) ? " on" : ""}`} onClick={() => toggleArr("levels", lv)}>{lv}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="lf-label">Community Interests</span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {COMMUNITY_CATEGORIES.filter((c) => c !== "All").map((cat) => (
                        <button key={cat} type="button" className={`pill${wiz.interests.includes(cat) ? " on" : ""}`} onClick={() => toggleArr("interests", cat)}>{cat}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <span className="lf-label">Placements (where your ad displays)</span>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {[["feed", "Q&A Feed (between posts)"], ["comments", "Comments Section"], ["communities", "Communities Discovery"]].map(([k, l]) => (
                    <button key={k} type="button" className={`pill${wiz.placements.includes(k) ? " on" : ""}`} onClick={() => toggleArr("placements", k)}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="sug-2">
                <div>
                  <label className="lf-label">Start Date *</label>
                  <input type="date" className="inp" min={todayIso(0)} value={wiz.startDate} onChange={(e) => setWiz((p) => ({ ...p, startDate: e.target.value }))} />
                </div>
                <div>
                  <label className="lf-label">End Date *</label>
                  <input type="date" className="inp" min={wiz.startDate} value={wiz.endDate} onChange={(e) => setWiz((p) => ({ ...p, endDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <span className="lf-label">Active Days</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {DAYS.map((d) => (
                    <button key={d} type="button" className={`pill${wiz.activeDays.includes(d) ? " on" : ""}`} onClick={() => toggleArr("activeDays", d)} style={{ textTransform: "uppercase" }}>{d}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 520 }}>
              <div className="sug-2">
                <div>
                  <label className="lf-label">Total Campaign Budget (NGN) *</label>
                  <input type="number" min="500" step="100" className="inp" value={wiz.totalBudget} onChange={(e) => setWiz((p) => ({ ...p, totalBudget: e.target.value }))} />
                </div>
                <div>
                  <label className="lf-label">Daily Cap (optional, NGN)</label>
                  <input type="number" min="100" step="100" className="inp" value={wiz.dailyBudget} onChange={(e) => setWiz((p) => ({ ...p, dailyBudget: e.target.value }))} placeholder="No daily cap" />
                </div>
              </div>
              <div style={{ padding: 16, borderRadius: 14, background: "var(--surfH)", fontSize: 13.5, color: "var(--mut)", lineHeight: 1.65 }}>
                <strong style={{ color: "var(--txt)", display: "block", marginBottom: 4 }}>Transparent Billing &amp; Payment Notice</strong>
                Payment processing via Paystack &amp; Dynamic Bank Transfer is <strong>Coming Soon</strong>. Submitting a campaign does not charge you or auto-activate delivery—an administrator reviews every submission first. No guaranteed impressions or conversions are promised until official ad rates are published.
              </div>
            </div>
          )}

          {step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <dl className="sug-review">
                <div><dt>Campaign Name</dt><dd>{wiz.name || "—"}</dd></div>
                <div><dt>Headline</dt><dd>{wiz.headline || "—"}</dd></div>
                <div><dt>Audience</dt><dd>{wiz.audienceType === "broad" ? "All ATBU Students" : `${wiz.faculties.join(", ") || "Any faculty"} · ${wiz.levels.join(", ") || "Any level"}`}</dd></div>
                <div><dt>Placements</dt><dd>{wiz.placements.join(", ")}</dd></div>
                <div><dt>Schedule</dt><dd>{wiz.startDate} to {wiz.endDate}</dd></div>
                <div><dt>Total Budget</dt><dd>₦{Number(wiz.totalBudget || 0).toLocaleString()} ({wiz.currency})</dd></div>
                <div><dt>Payment Gateway</dt><dd>Payment Coming Soon (Review Required)</dd></div>
              </dl>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-out" onClick={() => handleCreateCampaign("draft")} disabled={submitting}>Save as Draft</button>
                <button type="button" className="btn btn-navy" onClick={() => handleCreateCampaign("pending")} disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit for Admin Review"}
                </button>
              </div>
            </div>
          )}

          <div className="sug-actions" style={{ marginTop: 22 }}>
            <button type="button" className="btn btn-out" onClick={() => setStep((s) => Math.max(0, s - 1))} style={{ visibility: step === 0 ? "hidden" : "visible" }}>
              <Ic n="arrowL" s={15} /> Previous
            </button>
            {step < 4 && (
              <button type="button" className="btn btn-navy" onClick={() => setStep((s) => Math.min(4, s + 1))}>
                Continue <Ic n="arrow" s={15} />
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── ADMIN REVIEW TAB ── */}
      {tab === "admin" && isAdmin && (
        <section className="raised fu" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 19, marginBottom: 14 }}>Ad Campaign Moderation Queue</h2>
          {adminCampaigns.length === 0 ? (
            <p style={{ color: "var(--mut)" }}>No campaigns submitted yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {adminCampaigns.map((c) => (
                <div key={c.id} className="ad-camp-row">
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <strong>{c.name}</strong> <span style={{ fontSize: 12, color: "var(--mut)" }}>by {c.advertiser_name} · {c.status.toUpperCase()}</span>
                    <div style={{ fontSize: 13.5, marginTop: 3 }}>{c.headline} — {c.description}</div>
                    <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 2 }}>
                      {c.start_date} → {c.end_date} · ₦{Number(c.total_budget).toLocaleString()} · Placements: {(c.placements || []).join(", ")}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {c.status !== "active" && (
                      <button type="button" className="btn btn-pri" style={{ height: 36, minHeight: 36, padding: "0 14px", fontSize: 12.5 }} onClick={() => approveCampaign(c.id).then(() => { toast("Approved!", "success"); loadData(); }).catch((e) => toast(e.message, "error"))}>
                        Approve
                      </button>
                    )}
                    {c.status !== "rejected" && (
                      <button type="button" className="btn btn-out" style={{ height: 36, minHeight: 36, padding: "0 14px", fontSize: 12.5, color: "#DC2626" }} onClick={() => {
                        const note = window.prompt("Rejection reason:");
                        if (!note) return;
                        rejectCampaign(c.id, note).then(() => { toast("Rejected.", "info"); loadData(); }).catch((e) => toast(e.message, "error"));
                      }}>
                        Reject
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
