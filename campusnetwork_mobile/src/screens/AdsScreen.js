/**
 * Website-Faithful Advertising Screen (mirrors AdsPage.jsx)
 * - Real campaign tracker KPIs (impressions, clicks, CTR, budget)
 * - Create Ad campaign with dynamic pricing strictly capped at ₦4,000
 * - Paystack Dedicated Virtual Account (Bank Transfer) + Checkout modal
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Linking, Modal, Pressable, ScrollView, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ClayButton, ClayCard, ClayInput, ClayPill } from "../components/ClayUI";
import { adsApi } from "../api";
import { RADII } from "../theme/tokens";

export default function AdsScreen({ theme, onBack, toast }) {
  const [tab, setTab] = useState("tracker"); // tracker | create
  const [campaigns, setCampaigns] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payModal, setPayModal] = useState(null);

  // Create form
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [desc, setDesc] = useState("");
  const [days, setDays] = useState("7");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, a] = await Promise.all([adsApi.list(), adsApi.analytics("30d")]);
      setCampaigns(c);
      setAnalytics(a);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const numDays = Math.max(1, parseInt(days, 10) || 1);
  const estPrice = Math.min(4000, Math.max(500, 500 + numDays * 250 + 800));

  const submitAd = async () => {
    if (!name.trim() || !headline.trim() || !desc.trim()) { toast && toast("Fill in campaign details.", "error"); return; }
    setBusy(true);
    try {
      const start = new Date();
      const end = new Date(start.getTime() + (numDays - 1) * 86400000);
      await adsApi.create({
        name: name.trim(),
        headline: headline.trim(),
        description: desc.trim(),
        targeting: { audience: "all" },
        placements: ["feed", "comments"],
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
        total_budget: String(estPrice),
        save_as: "pending",
      });
      setName(""); setHeadline(""); setDesc("");
      toast && toast("Ad campaign submitted for admin review!", "success");
      setTab("tracker");
      load();
    } catch (e) { toast && toast(e.message || "Could not create campaign.", "error"); }
    finally { setBusy(false); }
  };

  const openPay = async (id) => {
    try {
      const res = await adsApi.initiatePayment(id);
      if (res.enabled) setPayModal(res);
      else toast && toast(res.message || "Paystack not configured on server yet.", "info");
    } catch (e) { toast && toast(e.message, "error"); }
  };

  const s = analytics?.summary || {};

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 14, paddingBottom: 110, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {onBack ? <Pressable onPress={onBack}><Ionicons name="arrow-back" size={20} color={theme.accent} /></Pressable> : null}
          <Text style={{ color: theme.txt, fontSize: 21, fontWeight: "800" }}>Advertising</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <ClayPill theme={theme} label="My Ads" active={tab === "tracker"} onPress={() => setTab("tracker")} />
          <ClayPill theme={theme} label="Create" icon="add" active={tab === "create"} onPress={() => setTab("create")} />
        </View>
      </View>

      {tab === "tracker" ? (
        loading ? <ActivityIndicator color={theme.accent} style={{ marginTop: 32 }} /> : (
          <>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <ClayCard theme={theme} level={2} style={{ flex: 1, padding: 16, backgroundColor: "#1E3A8A" }}>
                <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 11.5, fontWeight: "700" }}>TOTAL BUDGET</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: 4 }}>₦{Number(s.total_budget || 0).toLocaleString()}</Text>
              </ClayCard>
              <ClayCard theme={theme} level={1} style={{ flex: 1, padding: 16 }}>
                <Text style={{ color: theme.faint, fontSize: 11.5, fontWeight: "700" }}>IMPRESSIONS / CLICKS</Text>
                <Text style={{ color: theme.txt, fontSize: 22, fontWeight: "900", marginTop: 4 }}>{s.total_impressions || 0} / {s.total_clicks || 0}</Text>
              </ClayCard>
            </View>

            {campaigns.length === 0 ? (
              <ClayCard theme={theme} level={1} style={{ padding: 28, alignItems: "center" }}>
                <Text style={{ color: theme.mut }}>No ad campaigns yet. Tap Create to launch one (max ₦4,000).</Text>
              </ClayCard>
            ) : campaigns.map((c) => (
              <ClayCard key={c.id} theme={theme} level={1} style={{ padding: 16, gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15.5, flex: 1 }}>{c.name}</Text>
                  <Text style={{ color: theme.accent, fontWeight: "800", fontSize: 11.5, textTransform: "uppercase" }}>{c.status}</Text>
                </View>
                <Text style={{ color: theme.mut, fontSize: 13 }}>{c.headline}</Text>
                <Text style={{ color: theme.faint, fontSize: 12 }}>₦{Number(c.total_budget || 0).toLocaleString()} · {c.impressions_count ?? 0} views · {c.clicks_count ?? 0} clicks</Text>
                {c.payment_status !== "paid" ? (
                  <ClayButton theme={theme} variant="pri" label="Pay with Paystack" compact onPress={() => openPay(c.id)} style={{ alignSelf: "flex-start", marginTop: 4 }} />
                ) : null}
              </ClayCard>
            ))}
          </>
        )
      ) : (
        <ClayCard theme={theme} level={2} style={{ padding: 18 }}>
          <Text style={{ color: theme.txt, fontSize: 18, fontWeight: "800", marginBottom: 12 }}>Create Ad Campaign</Text>
          <ClayInput theme={theme} label="Campaign Name *" value={name} onChangeText={setName} placeholder="e.g. ATBU Movie Week" />
          <ClayInput theme={theme} label="Ad Headline *" value={headline} onChangeText={setHeadline} placeholder="Catchy headline" />
          <ClayInput theme={theme} label="Description *" multiline value={desc} onChangeText={setDesc} placeholder="Tell students about your event or business…" />
          <ClayInput theme={theme} label="Duration (Days)" keyboardType="number-pad" value={days} onChangeText={setDays} />
          <View style={{ backgroundColor: theme.recessBg, padding: 14, borderRadius: RADII.md, marginBottom: 14 }}>
            <Text style={{ color: theme.faint, fontSize: 11.5, fontWeight: "700" }}>CALCULATED PRICE (MAX ₦4,000)</Text>
            <Text style={{ color: theme.txt, fontSize: 26, fontWeight: "900", marginTop: 2 }}>₦{estPrice.toLocaleString()}</Text>
          </View>
          <ClayButton theme={theme} variant="pri" label="Submit for Admin Review" loading={busy} onPress={submitAd} />
        </ClayCard>
      )}

      <Modal visible={!!payModal} transparent animationType="slide" onRequestClose={() => setPayModal(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end", padding: 14 }}>
          <ClayCard theme={theme} level={3} style={{ padding: 20, gap: 10 }}>
            <Text style={{ color: theme.txt, fontSize: 18, fontWeight: "800" }}>Pay ₦{Number(payModal?.amount_ngn || 0).toLocaleString()}</Text>
            <Text style={{ color: theme.mut, fontSize: 13.5 }}>{payModal?.message}</Text>
            {payModal?.account_number ? (
              <View style={{ backgroundColor: theme.recessBg, padding: 14, borderRadius: RADII.md, gap: 4 }}>
                <Text style={{ color: theme.faint, fontSize: 11 }}>BANK: <Text style={{ color: theme.txt, fontWeight: "800" }}>{payModal.bank_name}</Text></Text>
                <Text style={{ color: theme.faint, fontSize: 11 }}>ACCOUNT: <Text style={{ color: theme.txt, fontWeight: "900", fontSize: 16 }}>{payModal.account_number}</Text></Text>
                <Text style={{ color: theme.faint, fontSize: 11 }}>NAME: <Text style={{ color: theme.txt, fontWeight: "700" }}>{payModal.account_name}</Text></Text>
              </View>
            ) : null}
            {payModal?.checkout_url ? (
              <ClayButton theme={theme} variant="pri" label="Open Paystack Checkout" onPress={() => Linking.openURL(payModal.checkout_url)} />
            ) : null}
            <ClayButton theme={theme} variant="out" label="Close" onPress={() => setPayModal(null)} />
          </ClayCard>
        </View>
      </Modal>
    </ScrollView>
  );
}
