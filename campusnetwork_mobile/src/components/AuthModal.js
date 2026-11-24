/**
 * Redesigned Authentication Modal (Create Account & Login)
 * Visual style inspired by the supplied Create Account reference, adapted to CampusNetwork's
 * dark/light morphism theme while preserving EVERY backend-required field & validation rule.
 */
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BrandMark, ClayButton, ClayInput } from "./ClayUI";
import { authApi } from "../api";

export default function AuthModal({
  visible,
  initialTab = "login",
  theme,
  onClose,
  onSuccess,
  onApplySug,
  onOpenPolicy,
  toast,
}) {
  const [tab, setTab] = useState(initialTab);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setTab(initialTab);
    setErr("");
  }, [initialTab, visible]);

  const handleSubmit = async () => {
    setErr("");
    if (tab === "login") {
      if (!username.trim() || !password) {
        setErr("Enter your username/email and password.");
        return;
      }
      setBusy(true);
      try {
        const u = await authApi.login(username.trim(), password);
        setPassword("");
        onSuccess && onSuccess(u);
      } catch (e) {
        setErr(e.message || "Invalid credentials.");
      } finally {
        setBusy(false);
      }
    } else {
      if (!firstName.trim() || !lastName.trim() || !username.trim() || !email.trim() || password.length < 6) {
        setErr("Fill in all fields (password must be at least 6 characters).");
        return;
      }
      setBusy(true);
      try {
        const u = await authApi.register({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          username: username.trim().replace(/^@/, ""),
          email: email.trim(),
          password,
        });
        setPassword("");
        onSuccess && onSuccess(u);
      } catch (e) {
        setErr(e.message || "Could not create account.");
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.68)", justifyContent: "center", padding: 16 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              backgroundColor: theme.surf,
              borderRadius: 28,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.1)",
            }}
          >
            {/* Accent Hero Header inspired by Create Account reference */}
            <View
              style={{
                backgroundColor: "#14223B",
                paddingHorizontal: 22,
                paddingTop: 22,
                paddingBottom: 24,
                alignItems: "center",
                gap: 8,
                position: "relative",
              }}
            >
              <Pressable
                onPress={onClose}
                style={{
                  position: "absolute",
                  top: 14,
                  right: 14,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: "rgba(255,255,255,0.12)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={18} color="#FFFFFF" />
              </Pressable>

              <BrandMark size={44} />
              <Text style={{ color: "#FFFFFF", fontSize: 23, fontWeight: "900", textAlign: "center" }}>
                {tab === "login" ? "Welcome back" : "Create an account"}
              </Text>
              <Text style={{ color: "#93C5FD", fontSize: 13, textAlign: "center" }}>
                {tab === "login"
                  ? "Sign in to your CampusNetwork account"
                  : "Join ATBU students on CampusNetwork"}
              </Text>
            </View>

            {/* Form Body */}
            <View style={{ padding: 20 }}>
              {err ? (
                <View style={{ padding: 11, borderRadius: 12, backgroundColor: "rgba(239,68,68,0.14)", marginBottom: 12 }}>
                  <Text style={{ color: "#F87171", fontSize: 13, fontWeight: "700" }}>{err}</Text>
                </View>
              ) : null}

              {tab === "register" ? (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <ClayInput
                    theme={theme}
                    style={{ flex: 1 }}
                    placeholder="First Name"
                    value={firstName}
                    onChangeText={setFirstName}
                  />
                  <ClayInput
                    theme={theme}
                    style={{ flex: 1 }}
                    placeholder="Last Name"
                    value={lastName}
                    onChangeText={setLastName}
                  />
                </View>
              ) : null}

              <ClayInput
                theme={theme}
                placeholder={tab === "login" ? "Username or Email" : "Username (e.g. cenetstudent)"}
                autoCapitalize="none"
                value={username}
                onChangeText={setUsername}
              />

              {tab === "register" ? (
                <ClayInput
                  theme={theme}
                  placeholder="Email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
              ) : null}

              <ClayInput
                theme={theme}
                placeholder="Password"
                secureTextEntry={!showPass}
                value={password}
                onChangeText={setPassword}
                rightSlot={
                  <Pressable onPress={() => setShowPass((p) => !p)} hitSlop={8}>
                    <Ionicons name={showPass ? "eye-off-outline" : "eye-outline"} size={19} color={theme.mut} />
                  </Pressable>
                }
              />

              <ClayButton
                theme={theme}
                variant="pri"
                label={tab === "login" ? "Log In" : "Create account"}
                loading={busy}
                onPress={handleSubmit}
                style={{ marginTop: 4 }}
              />

              {tab === "register" ? (
                <Text style={{ color: theme.mut, fontSize: 12, textAlign: "center", lineHeight: 18, marginTop: 14 }}>
                  By signing up, you agree to our{" "}
                  <Text
                    style={{ color: theme.accent, textDecorationLine: "underline", fontWeight: "700" }}
                    onPress={() => { onClose(); onOpenPolicy && onOpenPolicy(); }}
                  >
                    Privacy Policy
                  </Text>{" "}
                  and{" "}
                  <Text
                    style={{ color: theme.accent, textDecorationLine: "underline", fontWeight: "700" }}
                    onPress={() => { onClose(); onOpenPolicy && onOpenPolicy(); }}
                  >
                    Terms of Service
                  </Text>
                  .
                </Text>
              ) : null}

              <Pressable
                onPress={() => { setErr(""); setTab((t) => (t === "login" ? "register" : "login")); }}
                style={{ marginTop: 16, alignItems: "center" }}
              >
                <Text style={{ color: theme.mut, fontSize: 13.5 }}>
                  {tab === "login" ? "Don't have an account? " : "Have an account? "}
                  <Text style={{ color: theme.accent, fontWeight: "800", textDecorationLine: "underline" }}>
                    {tab === "login" ? "Sign up here" : "Log in here"}
                  </Text>
                </Text>
              </Pressable>

              {onApplySug ? (
                <Pressable
                  onPress={() => { onClose(); onApplySug(); }}
                  style={{ marginTop: 12, alignItems: "center" }}
                >
                  <Text style={{ color: theme.faint, fontSize: 12.5, fontWeight: "600" }}>
                    Are you an SUG Official? Apply for SUG Access →
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
