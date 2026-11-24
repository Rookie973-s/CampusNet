/**
 * Create Post ("Ask the Network") & Create Poll Modals
 * Launched strictly from the central Floating Action Button's 2 actions.
 * - AskNetworkModal mirrors the supplied ASK THE NETWORK reference adapted to dark/light morphism
 * - CreatePollModal is a dedicated poll creator backed by Django PollOption / PollVote models
 */
import React, { useMemo, useState } from "react";
import {
  Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { ClayButton, ClayInput, FacultyDropdown } from "./ClayUI";
import { questionsApi } from "../api";
import { RADII } from "../theme/tokens";

export function AskNetworkModal({ visible, onClose, theme, user, departments = [], onCreated, toast }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deptId, setDeptId] = useState(departments[0]?.id || "");
  const [tagsText, setTagsText] = useState("");
  const [images, setImages] = useState([]);
  const [video, setVideo] = useState(null);
  const [busy, setBusy] = useState(false);

  const isVerified = !!(user?.is_verified_student || user?.is_verified_staff);
  const wordLimit = isVerified ? 1200 : 300;
  const maxImages = isVerified ? 6 : 1;

  const wordCount = useMemo(() => (body.trim() ? body.trim().split(/\s+/).length : 0), [body]);
  const facultyOptions = useMemo(
    () => departments.map((d) => ({ label: d.name, value: d.id, color: d.color })),
    [departments]
  );

  const insertFormat = (wrap) => {
    if (wrap === "bold") setBody((b) => `${b}**bold**`);
    else if (wrap === "italic") setBody((b) => `${b}_italic_`);
    else if (wrap === "underline") setBody((b) => `${b}__underline__`);
    else if (wrap === "emoji") setBody((b) => `${b} 😊`);
    else if (wrap === "mention") setBody((b) => `${b} @`);
  };

  const handlePickPhotos = async () => {
    if (video) { toast && toast("Remove attached video before adding photos.", "info"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: isVerified,
      selectionLimit: maxImages,
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.length) return;
    const picked = res.assets.slice(0, maxImages).map((a, i) => ({
      uri: a.uri,
      name: a.fileName || `photo_${Date.now()}_${i}.jpg`,
      type: a.mimeType || "image/jpeg",
    }));
    setImages((prev) => [...prev, ...picked].slice(0, maxImages));
  };

  const handlePickVideo = async () => {
    if (!isVerified) {
      toast && toast("Only Verified Students & SUG officials can upload videos.", "info");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      quality: 0.75,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const v = res.assets[0];
    setImages([]);
    setVideo({ uri: v.uri, name: v.fileName || `video_${Date.now()}.mp4`, type: v.mimeType || "video/mp4" });
  };

  const handleSubmit = async () => {
    const cleanBody = body.trim();
    const cleanTitle = title.trim() || cleanBody.slice(0, 72);
    if (!cleanBody && !cleanTitle) {
      toast && toast("Write your question or post first.", "error");
      return;
    }
    if (wordCount > wordLimit) {
      toast && toast(`Exceeds your ${wordLimit}-word limit.`, "error");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("title", cleanTitle);
      form.append("body", cleanBody || cleanTitle);
      const chosenDept = deptId || departments[0]?.id;
      if (chosenDept) form.append("department", String(chosenDept));
      tagsText
        .split(",")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean)
        .slice(0, 5)
        .forEach((t) => form.append("tags", t));
      images.forEach((img) => form.append("images", img));
      if (video) form.append("video", video);

      const created = await questionsApi.create(form);
      setTitle("");
      setBody("");
      setTagsText("");
      setImages([]);
      setVideo(null);
      toast && toast("Posted to CampusNetwork!", "success");
      onCreated && onCreated(created);
      onClose();
    } catch (e) {
      toast && toast(e.message || "Could not publish post.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          style={{
            backgroundColor: theme.surf,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 20,
            maxHeight: "92%",
            borderTopWidth: 1,
            borderColor: "rgba(255,255,255,0.1)",
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Header matching ASK THE NETWORK reference */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: "#14223B",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="book-outline" size={21} color="#60A5FA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.txt, fontSize: 20, fontWeight: "900" }}>Ask the Network</Text>
                <Text style={{ color: theme.mut, fontSize: 12.5, lineHeight: 18 }}>
                  Write your question. Add photos or a short video if it helps. (Limit: {wordLimit} words)
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.recessBg, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="close" size={18} color={theme.txt} />
              </Pressable>
            </View>

            <ClayInput
              theme={theme}
              label="Headline (optional)"
              placeholder="Short summary of your question or post..."
              value={title}
              onChangeText={setTitle}
            />

            <ClayInput
              theme={theme}
              label="Your question"
              placeholder="Write your post... Use Bold, Italic, Underline, or @mention classmates"
              multiline
              value={body}
              onChangeText={setBody}
              style={{ marginBottom: 6 }}
            />

            {/* Formatting Toolbar + Live Word Counter */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: theme.recessBg,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <Pressable onPress={() => insertFormat("bold")} hitSlop={6}>
                  <Text style={{ color: theme.txt, fontWeight: "900", fontSize: 15 }}>B</Text>
                </Pressable>
                <Pressable onPress={() => insertFormat("italic")} hitSlop={6}>
                  <Text style={{ color: theme.txt, fontStyle: "italic", fontWeight: "700", fontSize: 15 }}>I</Text>
                </Pressable>
                <Pressable onPress={() => insertFormat("underline")} hitSlop={6}>
                  <Text style={{ color: theme.txt, textDecorationLine: "underline", fontWeight: "700", fontSize: 15 }}>U</Text>
                </Pressable>
                <Pressable onPress={() => insertFormat("emoji")} hitSlop={6}>
                  <Ionicons name="happy-outline" size={18} color={theme.mut} />
                </Pressable>
                <Pressable onPress={() => insertFormat("mention")} hitSlop={6}>
                  <Text style={{ color: theme.mut, fontWeight: "800", fontSize: 15 }}>@</Text>
                </Pressable>
              </View>
              <Text style={{ color: wordCount > wordLimit ? theme.danger : theme.faint, fontSize: 12, fontWeight: "700" }}>
                {wordCount}/{wordLimit} words
              </Text>
            </View>

            {/* Media Attachment Row */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
              <ClayButton
                theme={theme}
                variant="out"
                compact
                style={{ flex: 1 }}
                icon="image-outline"
                label={`Add photos ${images.length}/${maxImages}`}
                onPress={handlePickPhotos}
              />
              <ClayButton
                theme={theme}
                variant="out"
                compact
                style={{ flex: 1 }}
                icon={isVerified ? "videocam-outline" : "lock-closed-outline"}
                label={video ? "Video Ready ✓" : isVerified ? "Add video" : "Video (Verified)"}
                onPress={handlePickVideo}
              />
            </View>

            {images.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
                {images.map((img, i) => (
                  <View key={img.uri} style={{ position: "relative" }}>
                    <Image source={{ uri: img.uri }} style={{ width: 68, height: 68, borderRadius: 12 }} />
                    <Pressable
                      onPress={() => setImages((p) => p.filter((_, idx) => idx !== i))}
                      style={{ position: "absolute", top: -6, right: -6, backgroundColor: "#0B1220", borderRadius: 12 }}
                    >
                      <Ionicons name="close-circle" size={20} color="#F87171" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            {/* Faculty Dropdown + Tags */}
            <View style={{ gap: 10, marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: theme.mut, marginBottom: 6, marginLeft: 4 }}>Faculty</Text>
                <FacultyDropdown
                  theme={theme}
                  options={facultyOptions}
                  value={deptId || departments[0]?.id}
                  onChange={setDeptId}
                  placeholder="Select Faculty"
                />
              </View>
              <ClayInput
                theme={theme}
                label="Tags"
                placeholder="e.g. MTH201, exams"
                value={tagsText}
                onChangeText={setTagsText}
                style={{ marginBottom: 0 }}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <ClayButton theme={theme} variant="out" label="Cancel" style={{ flex: 1 }} onPress={onClose} />
              <ClayButton theme={theme} variant="pri" icon="paper-plane" label="Post" style={{ flex: 1 }} loading={busy} onPress={handleSubmit} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function CreatePollModal({ visible, onClose, theme, departments = [], onCreated, toast }) {
  const [question, setQuestion] = useState("");
  const [details, setDetails] = useState("");
  const [options, setOptions] = useState(["Yes", "No", ""]);
  const [deptId, setDeptId] = useState(departments[0]?.id || "");
  const [busy, setBusy] = useState(false);

  const facultyOptions = useMemo(
    () => departments.map((d) => ({ label: d.name, value: d.id, color: d.color })),
    [departments]
  );

  const updateOption = (idx, text) => {
    setOptions((prev) => prev.map((v, i) => (i === idx ? text : v)));
  };

  const addOption = () => {
    if (options.length >= 6) return;
    setOptions((prev) => [...prev, ""]);
  };

  const removeOption = (idx) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    const cleanQ = question.trim();
    const cleanOpts = options.map((o) => o.trim()).filter(Boolean);
    if (!cleanQ) {
      toast && toast("Enter your poll question.", "error");
      return;
    }
    if (cleanOpts.length < 2) {
      toast && toast("Provide at least 2 poll options.", "error");
      return;
    }
    setBusy(true);
    try {
      const created = await questionsApi.create({
        title: cleanQ,
        body: details.trim() || cleanQ,
        department: deptId || departments[0]?.id,
        poll_options: cleanOpts,
      });
      setQuestion("");
      setDetails("");
      setOptions(["Yes", "No", ""]);
      toast && toast("Poll published to Feed!", "success");
      onCreated && onCreated(created);
      onClose();
    } catch (e) {
      toast && toast(e.message || "Could not create poll.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          style={{
            backgroundColor: theme.surf,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 20,
            maxHeight: "90%",
            borderTopWidth: 1,
            borderColor: "rgba(255,255,255,0.1)",
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.accentSoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="stats-chart" size={20} color={theme.accent} />
                </View>
                <View>
                  <Text style={{ color: theme.txt, fontSize: 19, fontWeight: "900" }}>Create a Poll</Text>
                  <Text style={{ color: theme.mut, fontSize: 12.5 }}>Get instant student votes on any campus topic</Text>
                </View>
              </View>
              <Pressable onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.mut} />
              </Pressable>
            </View>

            <ClayInput
              theme={theme}
              label="Poll Question *"
              placeholder="e.g. Should we write tests today?"
              value={question}
              onChangeText={setQuestion}
            />

            <ClayInput
              theme={theme}
              label="Context (optional)"
              placeholder="Add brief context..."
              value={details}
              onChangeText={setDetails}
            />

            <Text style={{ fontSize: 12.5, fontWeight: "700", color: theme.mut, marginBottom: 6, marginLeft: 4 }}>
              Poll Options (2–6)
            </Text>
            {options.map((opt, idx) => (
              <View key={idx} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <ClayInput
                  theme={theme}
                  style={{ flex: 1, marginBottom: 0 }}
                  placeholder={`Option ${idx + 1}${idx === 2 ? " (e.g. Maybe)" : ""}`}
                  value={opt}
                  onChangeText={(t) => updateOption(idx, t)}
                />
                {options.length > 2 ? (
                  <Pressable onPress={() => removeOption(idx)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={19} color={theme.danger} />
                  </Pressable>
                ) : null}
              </View>
            ))}

            {options.length < 6 ? (
              <Pressable onPress={addOption} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, marginBottom: 10 }}>
                <Ionicons name="add-circle-outline" size={19} color={theme.accent} />
                <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 13.5 }}>Add another option</Text>
              </Pressable>
            ) : null}

            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: theme.mut, marginBottom: 6, marginLeft: 4 }}>Faculty</Text>
              <FacultyDropdown
                theme={theme}
                options={facultyOptions}
                value={deptId || departments[0]?.id}
                onChange={setDeptId}
                placeholder="Select Faculty"
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <ClayButton theme={theme} variant="out" label="Cancel" style={{ flex: 1 }} onPress={onClose} />
              <ClayButton theme={theme} variant="pri" icon="stats-chart" label="Publish Poll" style={{ flex: 1 }} loading={busy} onPress={handleSubmit} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
