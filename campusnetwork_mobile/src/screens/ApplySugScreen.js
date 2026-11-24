/**
 * Redesigned 4-Step SUG Access Application Screen
 * Visual style mirrors the supplied SUG Access reference (blue wave header, 4-step indicator,
 * Profile Picture upload card, rounded inputs, FacultyDropdown) + full anti-loophole backend integration!
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { BrandMark, ClayButton, ClayCard, ClayInput, FacultyDropdown } from "../components/ClayUI";
import { departmentsApi, staffApi } from "../api";

const STEP_LABELS = ["Personal", "Academic", "Role & Bio", "Review"];

export default function ApplySugScreen({ theme, user, onUserUpdate, onBack, toast }) {
  const [depts, setDepts] = useState([]);
  const [myPending, setMyPending] = useState(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const [photo, setPhoto] = useState(null);
  const [fname, setFname] = useState(user?.first_name || "");
  const [lname, setLname] = useState(user?.last_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [facultyId, setFacultyId] = useState("");
  const [subDept, setSubDept] = useState("");
  const [role, setRole] = useState("");
  const [bio, setBio] = useState("");
  const [why, setWhy] = useState("");

  useEffect(() => {
    departmentsApi.list().then(setDepts).catch(() => {});
    if (user?.email && !user?.is_verified_staff) {
      staffApi.checkStatus(user.email)
        .then((r) => { if (r?.found && r.status === "pending") setMyPending(r); })
        .catch(() => {});
    }
  }, [user]);

  const facultyOptions = useMemo(
    () => depts.map((d) => ({ label: d.name, value: String(d.id), color: d.color })),
    [depts]
  );

  const handlePickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setPhoto({ uri: a.uri, name: a.fileName || `sug_${Date.now()}.jpg`, type: a.mimeType || "image/jpeg" });
  };

  const handleCancelSug = () => {
    Alert.alert("Cancel SUG Status?", "You will lose your Verified SUG badge until re-approved.", [
      { text: "Keep Status", style: "cancel" },
      {
        text: "Cancel SUG",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            const res = await staffApi.cancelSug();
            if (res.user && onUserUpdate) onUserUpdate(res.user);
            toast && toast(res.detail || "SUG status cancelled.", "info");
          } catch (e) { toast && toast(e.message, "error"); }
          finally { setBusy(false); }
        },
      },
    ]);
  };

  const handleWithdrawPending = async () => {
    setBusy(true);
    try {
      await staffApi.cancelPending();
      setMyPending(null);
      toast && toast("Pending application withdrawn.", "info");
    } catch (e) { toast && toast(e.message, "error"); }
    finally { setBusy(false); }
  };

  const handleSubmit = async () => {
    if (!fname.trim() || !lname.trim() || !email.trim() || !role.trim()) {
      toast && toast("Fill in all required fields.", "error");
      return;
    }
    if (bio.trim().length < 20 || why.trim().length < 20) {
      toast && toast("Bio and motivation must each be at least 20 characters.", "error");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("first_name", fname.trim());
      form.append("last_name", lname.trim());
      form.append("email", email.trim());
      form.append("phone", phone.trim());
      if (facultyId) form.append("department", String(facultyId));
      form.append("academic_department_name", subDept.trim());
      form.append("role_title", role.trim());
      form.append("bio", bio.trim());
      form.append("why", why.trim());
      if (photo) form.append("photo", photo);

      await staffApi.apply(form);
      toast && toast("SUG application submitted for admin review!", "success");
      onBack();
    } catch (e) {
      toast && toast(e.message || "Could not submit application.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.bg }}
        contentContainerStyle={{ padding: 14, paddingBottom: 120, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="arrow-back" size={18} color={theme.accent} />
          <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 14 }}>Back</Text>
        </Pressable>

        {user?.is_verified_staff ? (
          <ClayCard theme={theme} level={2} style={{ padding: 24, alignItems: "center", gap: 10 }}>
            <Ionicons name="shield-checkmark" size={44} color={theme.accent} />
            <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 19, textAlign: "center" }}>
              You Already Have Verified SUG Status
            </Text>
            <Text style={{ color: theme.mut, fontSize: 13.5, textAlign: "center", lineHeight: 20 }}>
              You cannot apply again unless you cancel your current SUG status first.
            </Text>
            <ClayButton theme={theme} variant="danger" label="Cancel My SUG Status" loading={busy} onPress={handleCancelSug} />
          </ClayCard>
        ) : myPending ? (
          <ClayCard theme={theme} level={2} style={{ padding: 24, alignItems: "center", gap: 10 }}>
            <Ionicons name="time-outline" size={44} color="#F59E0B" />
            <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 19, textAlign: "center" }}>
              SUG Application Pending Review
            </Text>
            <Text style={{ color: theme.mut, fontSize: 13.5, textAlign: "center" }}>
              Your application for {myPending.role_title} is awaiting admin review.
            </Text>
            <ClayButton theme={theme} variant="danger" label="Withdraw Application" loading={busy} onPress={handleWithdrawPending} />
          </ClayCard>
        ) : (
          <ClayCard theme={theme} level={2} style={{ overflow: "hidden" }}>
            {/* Blue Header Banner matching SUG Access Reference */}
            <View style={{ backgroundColor: "#1D4ED8", paddingHorizontal: 18, paddingVertical: 20, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <BrandMark size={34} />
              <Text style={{ color: "#FFFFFF", fontSize: 19, fontWeight: "900" }}>
                Campus<Text style={{ color: "#BFDBFE" }}>Network</Text>
              </Text>
            </View>

            <View style={{ padding: 18, gap: 14 }}>
              <View>
                <Text style={{ color: theme.txt, fontSize: 22, fontWeight: "900" }}>Apply for SUG Access</Text>
                <Text style={{ color: theme.mut, fontSize: 13, marginTop: 3 }}>
                  Tell us about yourself. An administrator reviews every application.
                </Text>
              </View>

              {/* 4-Step Indicator matching reference */}
              <View style={{ gap: 8 }}>
                <Text style={{ color: theme.accent, fontWeight: "800", fontSize: 13 }}>
                  Step {step} of 4 · {STEP_LABELS[step - 1]}
                </Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  {[1, 2, 3, 4].map((n) => (
                    <Pressable
                      key={n}
                      onPress={() => setStep(n)}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: n === step ? theme.accent : n < step ? "#10B981" : theme.recessBg,
                      }}
                    >
                      {n < step ? (
                        <Ionicons name="checkmark" size={16} color="#FFF" />
                      ) : (
                        <Text style={{ color: n === step ? "#FFF" : theme.mut, fontWeight: "800", fontSize: 13 }}>{n}</Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* STEP 1: Personal + Profile Picture Card */}
              {step === 1 ? (
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 16, backgroundColor: theme.recessBg, marginBottom: 8 }}>
                    {photo ? (
                      <Image source={{ uri: photo.uri }} style={{ width: 58, height: 58, borderRadius: 29 }} />
                    ) : (
                      <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: theme.surf, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="camera-outline" size={24} color={theme.mut} />
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 13.5 }}>
                        Profile Picture (displayed on your SUG Card)
                      </Text>
                      <ClayButton theme={theme} variant="out" compact icon="cloud-upload-outline" label={photo ? "Change Photo" : "Upload Photo"} onPress={handlePickPhoto} />
                    </View>
                  </View>

                  <ClayInput theme={theme} label="First name *" value={fname} onChangeText={setFname} />
                  <ClayInput theme={theme} label="Last name *" value={lname} onChangeText={setLname} />
                  <ClayInput theme={theme} label="Your Email *" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
                  <ClayInput theme={theme} label="Phone number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
                  <ClayButton theme={theme} variant="pri" label="Next: Academic Info" icon="arrow-forward" onPress={() => setStep(2)} />
                </View>
              ) : null}

              {/* STEP 2: Academic */}
              {step === 2 ? (
                <View style={{ gap: 10 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: "700", color: theme.mut, marginLeft: 4 }}>Academic Faculty *</Text>
                  <FacultyDropdown
                    theme={theme}
                    options={facultyOptions}
                    value={facultyId}
                    onChange={setFacultyId}
                    placeholder="Select Faculty"
                  />
                  <ClayInput theme={theme} label="Department" placeholder="e.g. Computer Science" value={subDept} onChangeText={setSubDept} />
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <ClayButton theme={theme} variant="out" label="Back" onPress={() => setStep(1)} />
                    <ClayButton theme={theme} variant="pri" style={{ flex: 1 }} label="Next: Role & Bio" onPress={() => setStep(3)} />
                  </View>
                </View>
              ) : null}

              {/* STEP 3: Role & Bio */}
              {step === 3 ? (
                <View style={{ gap: 8 }}>
                  <ClayInput theme={theme} label="SUG Role / Office *" placeholder="e.g. Welfare Director" value={role} onChangeText={setRole} />
                  <ClayInput theme={theme} label="Short Bio (20+ chars) *" multiline value={bio} onChangeText={setBio} />
                  <ClayInput theme={theme} label="Why SUG Access? (20+ chars) *" multiline value={why} onChangeText={setWhy} />
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <ClayButton theme={theme} variant="out" label="Back" onPress={() => setStep(2)} />
                    <ClayButton theme={theme} variant="pri" style={{ flex: 1 }} label="Next: Review" onPress={() => setStep(4)} />
                  </View>
                </View>
              ) : null}

              {/* STEP 4: Review & Submit */}
              {step === 4 ? (
                <View style={{ gap: 12 }}>
                  <View style={{ padding: 14, borderRadius: 14, backgroundColor: theme.recessBg, gap: 6 }}>
                    <Text style={{ color: theme.txt, fontSize: 13.5 }}><Text style={{ fontWeight: "800" }}>Name:</Text> {fname} {lname}</Text>
                    <Text style={{ color: theme.txt, fontSize: 13.5 }}><Text style={{ fontWeight: "800" }}>Email:</Text> {email}</Text>
                    <Text style={{ color: theme.txt, fontSize: 13.5 }}><Text style={{ fontWeight: "800" }}>Role / Office:</Text> {role || "-"}</Text>
                    <Text style={{ color: theme.txt, fontSize: 13.5 }}><Text style={{ fontWeight: "800" }}>Department:</Text> {subDept || "-"}</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <ClayButton theme={theme} variant="out" label="Back" onPress={() => setStep(3)} />
                    <ClayButton theme={theme} variant="pri" style={{ flex: 1 }} label="Submit SUG Application" loading={busy} onPress={handleSubmit} />
                  </View>
                </View>
              ) : null}
            </View>
          </ClayCard>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
