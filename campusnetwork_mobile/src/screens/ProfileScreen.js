/**
 * Website-Faithful Profile & Dashboard Screen (mirrors ProfilePage.jsx)
 * - ALL 6 website tabs: Communities, Questions, Saved, Uploads, Verification, Settings
 * - Zero horizontal clipping (edge-to-edge ScrollView + auto-scroll selected tab into view)
 * - Complete 5-Stage Student Verification Workflow:
 *   1. Academic Info (Faculty -> dependent Department -> Level -> Note)
 *   2. Student Documentation (Document/Image Picker; skipped on renewal if existing doc)
 *   3. Live Camera Verification (Blink & Nod via expo-camera)
 *   4. Review & Confirmation
 *   5. Verification Consent Agreement + Paystack ₦1,500 Payment + Verified Submit
 * - Profile photo picker & upload + PDF Library Uploads tab + About/Help shortcut
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform,
  Pressable, ScrollView, Switch, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import {
  ClayButton, ClayCard, ClayInput, ClayPill, UserAvatar, VerifiedBadge,
} from "../components/ClayUI";
import NativeLivenessCamera from "../components/NativeLivenessCamera";
import {
  adsApi, authApi, communitiesApi, departmentsApi, libraryApi, questionsApi, usersApi,
} from "../api";

const BASE_TABS = [
  { id: "notifications", label: "Notifications", icon: "notifications-outline" },
  { id: "communities", label: "Communities", icon: "compass-outline" },
  { id: "questions", label: "Questions", icon: "help-circle-outline" },
  { id: "saved", label: "Saved", icon: "bookmark-outline" },
  { id: "verification", label: "Verification", icon: "shield-checkmark-outline" },
  { id: "settings", label: "Settings", icon: "settings-outline" },
];

const LEVELS = ["100L", "200L", "300L", "400L", "500L", "PG"];
const VERIF_STEPS = [
  "Academic Info",
  "Student ID",
  "Live Scan",
  "Review",
  "Pay & Submit",
];

export default function ProfileScreen({
  theme, mode, onToggleTheme, user, unread = 0, onUserUpdate, onLogout,
  onRequireAuth, onOpenQuestion, onOpenAbout, onOpenNotifications, onOpenCommunities, onScroll, toast,
}) {
  const [tab, setTab] = useState("questions");
  const [myCommunities, setMyCommunities] = useState([]);
  const [myQuestions, setMyQuestions] = useState([]);
  const [savedQuestions, setSavedQuestions] = useState([]);
  const [myUploads, setMyUploads] = useState([]);
  const [uploadPerm, setUploadPerm] = useState(null);
  const [verifStatus, setVerifStatus] = useState(null);
  const [depts, setDepts] = useState([]);
  const [loadingTab, setLoadingTab] = useState(false);

  // Horizontal tab auto-scroll ref
  const tabScrollRef = useRef(null);
  const tabPositions = useRef({});

  // 5-Stage Student Verification State
  const [vStep, setVStep] = useState(1);
  const [vFaculty, setVFaculty] = useState(null);
  const [vDeptName, setVDeptName] = useState("");
  const [vLevel, setVLevel] = useState("200L");
  const [vReason, setVReason] = useState("");
  const [vDoc, setVDoc] = useState(null);
  const [vLiveness, setVLiveness] = useState(null);
  const [vConsent, setVConsent] = useState(false);
  const [vPayRef, setVPayRef] = useState("");
  const [vPaid, setVPaid] = useState(false);
  const [vBusy, setVBusy] = useState(false);

  // Settings form
  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [savingProfile, setSavingProfile] = useState(false);

  // Email verification inline code
  const [verifyCode, setVerifyCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  useEffect(() => {
    setFirstName(user?.first_name || "");
    setLastName(user?.last_name || "");
    setBio(user?.bio || "");
  }, [user]);

  useEffect(() => {
    departmentsApi.list().then(setDepts).catch(() => {});
    if (user) {
      libraryApi.permissions().then(setUploadPerm).catch(() => setUploadPerm(null));
    }
  }, [user]);

  // Role-restricted Uploads tab: visible ONLY to backend-authorized uploaders (Class Reps / Admins)
  const visibleTabs = uploadPerm?.can_upload
    ? [
        ...BASE_TABS.slice(0, 4),
        { id: "uploads", label: "Uploads", icon: "cloud-upload-outline" },
        ...BASE_TABS.slice(4),
      ]
    : BASE_TABS;

  const loadTabData = useCallback(async () => {
    if (!user) return;
    setLoadingTab(true);
    try {
      if (tab === "communities") {
        setMyCommunities(await communitiesApi.list({ mine: true }));
      } else if (tab === "questions") {
        const res = await questionsApi.list({ mine: true });
        setMyQuestions(res.results || []);
      } else if (tab === "saved") {
        const res = await questionsApi.list({ saved: true });
        setSavedQuestions(res.results || []);
      } else if (tab === "uploads") {
        const [perm, docs] = await Promise.all([
          libraryApi.permissions().catch(() => null),
          libraryApi.documents({ mine: true }).catch(() => ({ results: [] })),
        ]);
        setUploadPerm(perm);
        setMyUploads(docs?.results || (Array.isArray(docs) ? docs : []));
      } else if (tab === "verification") {
        const st = await usersApi.verificationStatus();
        setVerifStatus(st);
        if (st?.payment_verified) setVPaid(true);
      }
    } catch {
      // keep existing
    } finally {
      setLoadingTab(false);
    }
  }, [user, tab]);

  useEffect(() => { loadTabData(); }, [loadTabData]);

  const selectTab = (id) => {
    if (id === "notifications") {
      onOpenNotifications && onOpenNotifications();
      return;
    }
    if (id === "communities") {
      onOpenCommunities && onOpenCommunities();
      return;
    }
    setTab(id);
    const x = tabPositions.current[id];
    if (typeof x === "number" && tabScrollRef.current) {
      tabScrollRef.current.scrollTo({ x: Math.max(0, x - 24), animated: true });
    }
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, padding: 20, justifyContent: "center" }}>
        <ClayCard theme={theme} level={2} style={{ padding: 26, alignItems: "center", gap: 10 }}>
          <Ionicons name="person-circle-outline" size={52} color={theme.accent} />
          <Text style={{ color: theme.txt, fontSize: 20, fontWeight: "800" }}>Your Campus Profile</Text>
          <Text style={{ color: theme.mut, fontSize: 13.5, textAlign: "center", lineHeight: 20 }}>
            Sign in to view your questions, saved posts, uploads, student verification, and settings.
          </Text>
          <ClayButton theme={theme} variant="pri" label="Sign In / Register" onPress={() => onRequireAuth("view your profile")} />
        </ClayCard>
      </View>
    );
  }

  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username;
  const initials = ((user.first_name?.[0] || "") + (user.last_name?.[0] || "") || user.username?.slice(0, 2) || "CN").toUpperCase();
  const selectedFacultyObj = depts.find((d) => String(d.id) === String(vFaculty));
  const subDepts = selectedFacultyObj?.academic_departments || [];
  const hasExistingDoc = !!verifStatus?.has_existing_document;

  const handlePickAvatar = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const updated = await authApi.uploadAvatar({
        uri: asset.uri,
        name: asset.fileName || `avatar_${Date.now()}.jpg`,
        type: asset.mimeType || "image/jpeg",
      });
      onUserUpdate && onUserUpdate(updated);
      toast && toast("Profile photo updated!", "success");
    } catch (e) {
      toast && toast(e.message || "Could not update photo.", "error");
    }
  };

  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const file = res.assets[0];
      setVDoc({
        uri: file.uri,
        name: file.name || `student_id_${Date.now()}.pdf`,
        type: file.mimeType || "application/pdf",
      });
      toast && toast(`Attached ${file.name || "document"}`, "success");
    } catch (e) {
      toast && toast("Could not open file picker.", "error");
    }
  };

  const handlePickDocPhoto = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const img = res.assets[0];
      setVDoc({
        uri: img.uri,
        name: img.fileName || `student_id_${Date.now()}.jpg`,
        type: img.mimeType || "image/jpeg",
      });
      toast && toast("Student ID photo attached!", "success");
    } catch {
      toast && toast("Could not pick photo.", "error");
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const updated = await authApi.updateMe({ first_name: firstName.trim(), last_name: lastName.trim(), bio: bio.trim() });
      onUserUpdate && onUserUpdate(updated);
      toast && toast("Profile saved!", "success");
    } catch (e) { toast && toast(e.message, "error"); }
    finally { setSavingProfile(false); }
  };

  const handleSendEmailCode = async () => {
    try {
      await authApi.sendEmailVerification();
      setCodeSent(true);
      toast && toast("Verification code sent to your email!", "success");
    } catch (e) { toast && toast(e.message, "error"); }
  };

  const handleVerifyEmail = async () => {
    if (!verifyCode.trim()) return;
    try {
      const res = await authApi.verifyEmailCode(verifyCode.trim());
      if (res?.user) onUserUpdate && onUserUpdate(res.user);
      setCodeSent(false);
      setVerifyCode("");
      toast && toast("Email verified!", "success");
    } catch (e) { toast && toast(e.message, "error"); }
  };

  const handlePayVerification = async () => {
    if (!vConsent) {
      toast && toast("Please agree to the CampusNetwork terms first.", "error");
      return;
    }
    setVBusy(true);
    try {
      const res = await adsApi.initiateVerificationPayment();
      if (res.reference) setVPayRef(res.reference);
      if (res.authorization_url) {
        await Linking.openURL(res.authorization_url);
        toast && toast("Complete Paystack ₦1,500 payment, then tap Verify Payment.", "info");
      } else {
        toast && toast(res.detail || "Payment initiated.", "info");
      }
    } catch (e) { toast && toast(e.message || "Could not start payment.", "error"); }
    finally { setVBusy(false); }
  };

  const handleVerifyPayment = async () => {
    if (!vPayRef) {
      toast && toast("Start payment first to receive a Paystack reference.", "error");
      return;
    }
    setVBusy(true);
    try {
      const res = await adsApi.verifyPayment(vPayRef);
      if (res?.verified || res?.status === "paid" || res?.status === "success") {
        setVPaid(true);
        toast && toast("Payment verified! You can now submit your application.", "success");
      } else {
        toast && toast(res?.detail || "Payment not confirmed yet. Try again in a moment.", "error");
      }
    } catch (e) { toast && toast(e.message, "error"); }
    finally { setVBusy(false); }
  };

  const handleSubmitVerification = async () => {
    if (!vConsent || !vPaid) {
      toast && toast("Complete payment and consent agreement first.", "error");
      return;
    }
    setVBusy(true);
    try {
      const form = new FormData();
      if (vFaculty) form.append("faculty", String(vFaculty));
      if (vDeptName.trim()) form.append("department_name", vDeptName.trim());
      form.append("level", vLevel);
      form.append("reason", vReason.trim());
      form.append("consent", "true");
      if (vDoc) form.append("supporting_document", vDoc);
      if (vLiveness) form.append("liveness_video", vLiveness);

      await usersApi.applyVerification(form);
      toast && toast("Student verification application submitted!", "success");
      loadTabData();
    } catch (e) {
      toast && toast(e.message || "Could not submit verification.", "error");
    } finally {
      setVBusy(false);
    }
  };

  const canNextStage1 = !!vFaculty && !!vDeptName.trim() && !!vLevel;
  const canNextStage2 = hasExistingDoc || !!vDoc;
  const canNextStage3 = !!vLiveness;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.bg }}
        contentContainerStyle={{ padding: 14, paddingBottom: 110, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* Profile Header Card */}
        <ClayCard theme={theme} level={2} style={{ padding: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Pressable onPress={handlePickAvatar} style={{ position: "relative" }}>
              <UserAvatar src={user.avatar_url} av={initials} bg={user.avatar_bg} size={68} />
              <View
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: theme.accent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="camera" size={13} color="#FFFFFF" />
              </View>
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <Text style={{ color: theme.txt, fontSize: 19, fontWeight: "800" }}>
                  Hello, {user.first_name || user.username}!
                </Text>
                {user.is_verified_student ? <VerifiedBadge size={17} /> : null}
              </View>
              <Text style={{ color: theme.mut, fontSize: 13 }}>@{user.username}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                {user.is_verified_staff ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(245,158,11,0.16)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 }}>
                    <Ionicons name="shield-checkmark" size={13} color="#F59E0B" />
                    <Text style={{ color: "#F59E0B", fontSize: 11.5, fontWeight: "800" }}>Verified SUG</Text>
                  </View>
                ) : null}
                {!user.email_verified ? (
                  <Pressable
                    onPress={() => selectTab("settings")}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(245,158,11,0.14)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 }}
                  >
                    <Ionicons name="mail-unread-outline" size={13} color="#F59E0B" />
                    <Text style={{ color: "#F59E0B", fontSize: 11.5, fontWeight: "700" }}>Verify Email</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
          {user.bio ? <Text style={{ color: theme.txt, fontSize: 13.5, lineHeight: 20, marginTop: 12 }}>{user.bio}</Text> : null}
        </ClayCard>

        {/* Stats Row */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {[
            { k: "Followers", v: user.followers_count || 0 },
            { k: "Following", v: user.following_count || 0 },
            { k: "Questions", v: user.questions_count || 0 },
            { k: "Answers", v: user.answers_count || 0 },
          ].map((s) => (
            <ClayCard key={s.k} theme={theme} level={1} style={{ width: "48%", padding: 14 }}>
              <Text style={{ color: theme.txt, fontSize: 22, fontWeight: "900" }}>{s.v}</Text>
              <Text style={{ color: theme.mut, fontSize: 12.5, fontWeight: "600" }}>{s.k}</Text>
            </ClayCard>
          ))}
        </View>

        {/* Edge-to-edge Horizontal Tabs (ZERO CLIPPING!) */}
        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -14 }}
          contentContainerStyle={{ paddingHorizontal: 14, gap: 8, paddingVertical: 4 }}
        >
          {visibleTabs.map((t) => (
            <View
              key={t.id}
              onLayout={(e) => { tabPositions.current[t.id] = e.nativeEvent.layout.x; }}
            >
              <ClayPill
                theme={theme}
                label={t.id === "notifications" && unread > 0 ? `${t.label} (${unread})` : t.label}
                icon={t.icon}
                active={tab === t.id}
                onPress={() => selectTab(t.id)}
              />
            </View>
          ))}
        </ScrollView>

        {loadingTab ? <ActivityIndicator color={theme.accent} style={{ marginVertical: 20 }} /> : null}

        {/* TAB: COMMUNITIES */}
        {tab === "communities" && !loadingTab ? (
          <View style={{ gap: 10 }}>
            {myCommunities.length === 0 ? (
              <ClayCard theme={theme} style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ color: theme.mut }}>You haven't followed any communities yet.</Text>
              </ClayCard>
            ) : myCommunities.map((c) => (
              <ClayCard key={c.id} theme={theme} level={1} style={{ padding: 14 }}>
                <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }}>{c.name}</Text>
                <Text style={{ color: theme.mut, fontSize: 12.5 }}>{c.category} · {c.followers_count} followers</Text>
              </ClayCard>
            ))}
          </View>
        ) : null}

        {/* TAB: QUESTIONS / SAVED */}
        {(tab === "questions" || tab === "saved") && !loadingTab ? (
          <View style={{ gap: 10 }}>
            {(tab === "questions" ? myQuestions : savedQuestions).length === 0 ? (
              <ClayCard theme={theme} style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ color: theme.mut }}>
                  {tab === "questions" ? "You haven't asked any questions yet." : "No saved posts yet."}
                </Text>
              </ClayCard>
            ) : (tab === "questions" ? myQuestions : savedQuestions).map((q) => (
              <Pressable key={q.id} onPress={() => onOpenQuestion(q)}>
                <ClayCard theme={theme} level={1} style={{ padding: 14, gap: 4 }}>
                  <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }}>{q.title}</Text>
                  <Text style={{ color: theme.mut, fontSize: 12.5 }}>{q.dept_name} · {q.answers_count || 0} answers</Text>
                </ClayCard>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* TAB: UPLOADS (Restored Website Tab!) */}
        {tab === "uploads" && !loadingTab ? (
          <View style={{ gap: 12 }}>
            <ClayCard theme={theme} level={2} style={{ padding: 16, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="library-outline" size={20} color={theme.accent} />
                <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 16 }}>Academic PDF Uploads</Text>
              </View>
              <Text style={{ color: theme.mut, fontSize: 13, lineHeight: 19 }}>
                {uploadPerm?.can_upload
                  ? "You are an approved Class Representative and can publish course PDFs to the library."
                  : "PDF uploads are curated by approved Class Representatives & SUG academic officers."}
              </Text>
            </ClayCard>

            {myUploads.length === 0 ? (
              <ClayCard theme={theme} style={{ padding: 24, alignItems: "center", gap: 6 }}>
                <Ionicons name="document-text-outline" size={32} color={theme.faint} />
                <Text style={{ color: theme.mut }}>No uploaded library documents yet.</Text>
              </ClayCard>
            ) : myUploads.map((doc) => (
              <ClayCard key={doc.id} theme={theme} level={1} style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Ionicons name="document-text" size={22} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.txt, fontWeight: "700", fontSize: 14.5 }} numberOfLines={1}>{doc.title}</Text>
                  <Text style={{ color: theme.mut, fontSize: 12 }}>{doc.course_code || "PDF"} · {doc.doc_type || "Notes"}</Text>
                </View>
                {doc.file_url ? (
                  <ClayButton theme={theme} variant="out" compact label="Open" onPress={() => Linking.openURL(doc.file_url)} />
                ) : null}
              </ClayCard>
            ))}
          </View>
        ) : null}

        {/* TAB: 5-STAGE STUDENT VERIFICATION */}
        {tab === "verification" && !loadingTab ? (
          <ClayCard theme={theme} level={2} style={{ padding: 18, gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <VerifiedBadge size={20} />
              <Text style={{ color: theme.txt, fontSize: 18, fontWeight: "800", flex: 1 }}>
                Student Verification (₦1,500 / 3 Months)
              </Text>
            </View>

            {user.is_verified_student ? (
              <View style={{ gap: 8, padding: 14, borderRadius: 14, backgroundColor: "rgba(16,185,129,0.12)" }}>
                <Text style={{ color: "#10B981", fontWeight: "800", fontSize: 15 }}>
                  Verified Student Active
                </Text>
                <Text style={{ color: theme.mut, fontSize: 13, lineHeight: 19 }}>
                  You have full access to up to 6 images & video uploads, 1,200-word posts, unlimited edit/delete, and ad-free toggle.
                  {verifStatus?.expires_at ? `\nExpires: ${new Date(verifStatus.expires_at).toLocaleDateString()}` : ""}
                </Text>
              </View>
            ) : verifStatus?.latest_application?.status === "pending" ? (
              <View style={{ gap: 8, padding: 14, borderRadius: 14, backgroundColor: "rgba(245,158,11,0.12)" }}>
                <Text style={{ color: "#F59E0B", fontWeight: "800", fontSize: 15 }}>
                  Application Pending Admin Review
                </Text>
                <Text style={{ color: theme.mut, fontSize: 13 }}>
                  Your verification submission is under review. You will be notified as soon as it is approved.
                </Text>
              </View>
            ) : (
              <>
                {/* 5-Stage Progress Stepper */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                  {VERIF_STEPS.map((label, idx) => {
                    const num = idx + 1;
                    const active = vStep === num;
                    const done = vStep > num;
                    return (
                      <View key={label} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                        <View
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 13,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: done ? "#10B981" : active ? theme.accent : theme.recessBg,
                          }}
                        >
                          {done ? (
                            <Ionicons name="checkmark" size={14} color="#FFF" />
                          ) : (
                            <Text style={{ color: active ? "#FFF" : theme.mut, fontWeight: "800", fontSize: 12 }}>{num}</Text>
                          )}
                        </View>
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: active ? "800" : "600",
                            color: active ? theme.accent : theme.mut,
                            textAlign: "center",
                          }}
                          numberOfLines={1}
                        >
                          {label}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* STAGE 1: Academic Info */}
                {vStep === 1 ? (
                  <View style={{ gap: 10 }}>
                    <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }}>
                      Step 1: Academic Information
                    </Text>
                    <Text style={{ color: theme.mut, fontSize: 12.5 }}>Select your Faculty *</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginHorizontal: -18 }}
                      contentContainerStyle={{ paddingHorizontal: 18, gap: 8, paddingVertical: 4 }}
                    >
                      {depts.map((d) => (
                        <ClayPill
                          key={d.id}
                          theme={theme}
                          label={d.name}
                          dot={d.color}
                          active={String(vFaculty) === String(d.id)}
                          onPress={() => { setVFaculty(d.id); setVDeptName(""); }}
                        />
                      ))}
                    </ScrollView>

                    {subDepts.length > 0 ? (
                      <>
                        <Text style={{ color: theme.mut, fontSize: 12.5 }}>Select your Department *</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={{ marginHorizontal: -18 }}
                          contentContainerStyle={{ paddingHorizontal: 18, gap: 8, paddingVertical: 4 }}
                        >
                          {subDepts.map((sd) => (
                            <ClayPill
                              key={sd.id || sd.name}
                              theme={theme}
                              label={sd.name}
                              active={vDeptName === sd.name}
                              onPress={() => setVDeptName(sd.name)}
                            />
                          ))}
                        </ScrollView>
                      </>
                    ) : (
                      <ClayInput
                        theme={theme}
                        label="Academic Department *"
                        placeholder="e.g. Computer Science"
                        value={vDeptName}
                        onChangeText={setVDeptName}
                      />
                    )}

                    <Text style={{ color: theme.mut, fontSize: 12.5 }}>Academic Level *</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginHorizontal: -18 }}
                      contentContainerStyle={{ paddingHorizontal: 18, gap: 8, paddingVertical: 4 }}
                    >
                      {LEVELS.map((lv) => (
                        <ClayPill key={lv} theme={theme} label={lv} active={vLevel === lv} onPress={() => setVLevel(lv)} />
                      ))}
                    </ScrollView>

                    <ClayInput
                      theme={theme}
                      label="Short Note (Optional)"
                      placeholder="Any helpful context for verification..."
                      multiline
                      value={vReason}
                      onChangeText={setVReason}
                    />

                    <ClayButton
                      theme={theme}
                      variant="pri"
                      label="Continue to Student ID"
                      icon="arrow-forward"
                      disabled={!canNextStage1}
                      onPress={() => setVStep(2)}
                    />
                  </View>
                ) : null}

                {/* STAGE 2: Student Documentation */}
                {vStep === 2 ? (
                  <View style={{ gap: 12 }}>
                    <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }}>
                      Step 2: Upload Student ID or Admission Letter
                    </Text>
                    {hasExistingDoc ? (
                      <View style={{ padding: 14, borderRadius: 14, backgroundColor: "rgba(16,185,129,0.12)", gap: 4 }}>
                        <Text style={{ color: "#10B981", fontWeight: "800" }}>Document On File (Renewal)</Text>
                        <Text style={{ color: theme.mut, fontSize: 12.5 }}>
                          Your previously verified student document is already on file. You may skip re-uploading or attach a fresh one.
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ color: theme.mut, fontSize: 13, lineHeight: 19 }}>
                        Upload a clear PDF or photo of your Student ID Card or Admission Letter. This is never shown publicly.
                      </Text>
                    )}

                    {vDoc ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, backgroundColor: theme.recessBg }}>
                        <Ionicons name="document-attach" size={22} color={theme.accent} />
                        <Text style={{ color: theme.txt, fontWeight: "700", flex: 1 }} numberOfLines={1}>{vDoc.name}</Text>
                        <Pressable onPress={() => setVDoc(null)}>
                          <Ionicons name="close-circle" size={20} color={theme.danger} />
                        </Pressable>
                      </View>
                    ) : null}

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <ClayButton theme={theme} variant="out" style={{ flex: 1 }} icon="document-outline" label="Pick PDF/File" onPress={handlePickDocument} />
                      <ClayButton theme={theme} variant="out" style={{ flex: 1 }} icon="image-outline" label="Pick Photo" onPress={handlePickDocPhoto} />
                    </View>

                    <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                      <ClayButton theme={theme} variant="out" label="Back" onPress={() => setVStep(1)} />
                      <ClayButton
                        theme={theme}
                        variant="pri"
                        style={{ flex: 1 }}
                        label="Continue to Live Scan"
                        disabled={!canNextStage2}
                        onPress={() => setVStep(3)}
                      />
                    </View>
                  </View>
                ) : null}

                {/* STAGE 3: Live Camera Verification */}
                {vStep === 3 ? (
                  <View style={{ gap: 12 }}>
                    <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }}>
                      Step 3: Live Camera Verification (Blink & Nod)
                    </Text>
                    <NativeLivenessCamera
                      theme={theme}
                      completedFile={vLiveness}
                      onComplete={setVLiveness}
                      toast={toast}
                    />
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <ClayButton theme={theme} variant="out" label="Back" onPress={() => setVStep(2)} />
                      <ClayButton
                        theme={theme}
                        variant="pri"
                        style={{ flex: 1 }}
                        label="Continue to Review"
                        disabled={!canNextStage3}
                        onPress={() => setVStep(4)}
                      />
                    </View>
                  </View>
                ) : null}

                {/* STAGE 4: Review & Confirmation */}
                {vStep === 4 ? (
                  <View style={{ gap: 10 }}>
                    <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }}>
                      Step 4: Review Your Details
                    </Text>
                    <View style={{ padding: 14, borderRadius: 14, backgroundColor: theme.recessBg, gap: 8 }}>
                      <Text style={{ color: theme.txt, fontSize: 13.5 }}><Text style={{ fontWeight: "800" }}>Faculty:</Text> {selectedFacultyObj?.name || "-"}</Text>
                      <Text style={{ color: theme.txt, fontSize: 13.5 }}><Text style={{ fontWeight: "800" }}>Department:</Text> {vDeptName}</Text>
                      <Text style={{ color: theme.txt, fontSize: 13.5 }}><Text style={{ fontWeight: "800" }}>Level:</Text> {vLevel}</Text>
                      <Text style={{ color: theme.txt, fontSize: 13.5 }}><Text style={{ fontWeight: "800" }}>Document:</Text> {vDoc ? vDoc.name : "Existing document on file"}</Text>
                      <Text style={{ color: "#10B981", fontSize: 13.5, fontWeight: "700" }}>Live Camera Scan: Captured ✓</Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <ClayButton theme={theme} variant="out" label="Back" onPress={() => setVStep(3)} />
                      <ClayButton theme={theme} variant="pri" style={{ flex: 1 }} label="Proceed to Payment" onPress={() => setVStep(5)} />
                    </View>
                  </View>
                ) : null}

                {/* STAGE 5: Agreement & Paystack ₦1,500 Payment */}
                {vStep === 5 ? (
                  <View style={{ gap: 12 }}>
                    <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }}>
                      Step 5: Consent & ₦1,500 Verification Payment
                    </Text>

                    <Pressable
                      onPress={() => setVConsent((c) => !c)}
                      style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
                    >
                      <Ionicons
                        name={vConsent ? "checkbox" : "square-outline"}
                        size={22}
                        color={vConsent ? theme.accent : theme.faint}
                      />
                      <Text style={{ color: theme.txt, fontSize: 13, flex: 1, lineHeight: 19 }}>
                        I confirm my student details are accurate and agree to CampusNetwork's Privacy Policy & Verification terms.
                      </Text>
                    </Pressable>

                    {!vPaid ? (
                      <>
                        <ClayButton
                          theme={theme}
                          variant="pri"
                          label="Pay ₦1,500 with Paystack"
                          disabled={!vConsent}
                          loading={vBusy}
                          onPress={handlePayVerification}
                        />
                        {vPayRef ? (
                          <ClayButton
                            theme={theme}
                            variant="navy"
                            label="I've Paid — Verify Payment"
                            loading={vBusy}
                            onPress={handleVerifyPayment}
                          />
                        ) : null}
                      </>
                    ) : (
                      <View style={{ padding: 12, borderRadius: 12, backgroundColor: "rgba(16,185,129,0.12)" }}>
                        <Text style={{ color: "#10B981", fontWeight: "800", fontSize: 13.5 }}>
                          Payment Verified ✓ — Ready to Submit
                        </Text>
                      </View>
                    )}

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <ClayButton theme={theme} variant="out" label="Back" onPress={() => setVStep(4)} />
                      <ClayButton
                        theme={theme}
                        variant="pri"
                        style={{ flex: 1 }}
                        label="Apply for Verification"
                        disabled={!vConsent || !vPaid}
                        loading={vBusy}
                        onPress={handleSubmitVerification}
                      />
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </ClayCard>
        ) : null}

        {/* TAB: SETTINGS */}
        {tab === "settings" ? (
          <View style={{ gap: 14 }}>
            <ClayCard theme={theme} level={2} style={{ padding: 18 }}>
              <Text style={{ color: theme.txt, fontSize: 17, fontWeight: "800", marginBottom: 12 }}>Edit Profile</Text>
              <ClayInput theme={theme} label="First Name" value={firstName} onChangeText={setFirstName} />
              <ClayInput theme={theme} label="Last Name" value={lastName} onChangeText={setLastName} />
              <ClayInput theme={theme} label="Bio" multiline value={bio} onChangeText={setBio} />
              <ClayButton theme={theme} variant="pri" label="Save Changes" loading={savingProfile} onPress={handleSaveProfile} />
            </ClayCard>

            {!user.email_verified ? (
              <ClayCard theme={theme} level={1} style={{ padding: 18, gap: 10 }}>
                <Text style={{ color: theme.txt, fontSize: 16, fontWeight: "800" }}>Verify Your Email</Text>
                <Text style={{ color: theme.mut, fontSize: 13 }}>Email: {user.email}</Text>
                {codeSent ? (
                  <>
                    <ClayInput theme={theme} label="6-Digit Code" keyboardType="number-pad" value={verifyCode} onChangeText={setVerifyCode} />
                    <ClayButton theme={theme} variant="pri" label="Confirm Code" onPress={handleVerifyEmail} />
                  </>
                ) : (
                  <ClayButton theme={theme} variant="navy" label="Send Verification Code" onPress={handleSendEmailCode} />
                )}
              </ClayCard>
            ) : null}

            <ClayCard theme={theme} level={1} style={{ padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }}>Dark Mode</Text>
                <Text style={{ color: theme.mut, fontSize: 12.5 }}>Matches website neutral dark theme</Text>
              </View>
              <Switch value={mode === "dark"} onValueChange={onToggleTheme} trackColor={{ true: theme.accent }} />
            </ClayCard>

            <Pressable onPress={() => onOpenAbout && onOpenAbout()}>
              <ClayCard theme={theme} level={1} style={{ padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name="information-circle-outline" size={22} color={theme.accent} />
                  <View>
                    <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }}>About, Help & Privacy</Text>
                    <Text style={{ color: theme.mut, fontSize: 12.5 }}>Support, NDPA Privacy Policy & Terms</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.faint} />
              </ClayCard>
            </Pressable>

            <ClayButton
              theme={theme}
              variant="danger"
              icon="log-out-outline"
              label="Sign Out"
              onPress={() =>
                Alert.alert("Sign Out?", "You will need to sign in again to post or chat.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Sign Out", style: "destructive", onPress: onLogout },
                ])
              }
            />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
