import React, { useEffect, useState, useCallback } from "react";
import {
  SafeAreaView, View, Text, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, StyleSheet, RefreshControl, ScrollView, Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { api, tokenStore } from "./src/api";

const DARK = {
  bg: "#0A0A0D",
  surf: "#141418",
  surfH: "#1C1C22",
  txt: "#F3F4F6",
  mut: "#A1A1AA",
  brd: "rgba(255,255,255,0.09)",
  accent: "#3B82F6",
};

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState("feed"); // feed | communities | sug | library | profile
  const [authMode, setAuthMode] = useState("login"); // login | register
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null)).finally(() => setBooting(false));
  }, []);

  const loadTab = useCallback(async (target = tab) => {
    if (!user && (target === "sug" || target === "library" || target === "profile")) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      let data = [];
      if (target === "feed") data = (await api.feed()).results || [];
      else if (target === "communities") data = (await api.communities()).results || [];
      else if (target === "sug") data = (await api.sug()).results || [];
      else if (target === "library") data = (await api.libraryFolders()).results || [];
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      Alert.alert("Error", err.message || "Could not load data.");
    } finally {
      setLoading(false);
    }
  }, [tab, user]);

  useEffect(() => {
    if (!booting) loadTab(tab);
  }, [booting, tab, loadTab]);

  const handleAuth = async () => {
    setAuthBusy(true);
    try {
      const u = authMode === "login"
        ? await api.login(identifier.trim(), password)
        : await api.register({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            username: username.trim(),
            email: email.trim(),
            password,
            confirm_password: password,
          });
      setUser(u);
      setPassword("");
    } catch (err) {
      Alert.alert("Authentication Failed", err.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleCreatePost = async () => {
    if (!postBody.trim()) return;
    setPosting(true);
    try {
      await api.createPost({
        title: postTitle.trim() || postBody.trim().slice(0, 100),
        body: postBody.trim(),
      });
      setPostTitle("");
      setPostBody("");
      loadTab("feed");
    } catch (err) {
      Alert.alert("Could not post", err.message);
    } finally {
      setPosting(false);
    }
  };

  const handleLogout = async () => {
    await tokenStore.clear();
    setUser(null);
    setTab("feed");
  };

  if (booting) {
    return (
      <SafeAreaView style={[s.root, s.center]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={DARK.accent} />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={s.root}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={s.authWrap} keyboardShouldPersistTaps="handled">
          <Text style={s.brand}>Campus<Text style={{ color: DARK.accent }}>Network</Text></Text>
          <Text style={s.sub}>ATBU Bauchi · More Schools Coming Soon</Text>
          <View style={s.card}>
            <Text style={s.h2}>{authMode === "login" ? "Welcome Back" : "Create Account"}</Text>
            {authMode === "register" && (
              <>
                <TextInput style={s.inp} placeholder="First Name" placeholderTextColor={DARK.mut} value={firstName} onChangeText={setFirstName} />
                <TextInput style={s.inp} placeholder="Last Name" placeholderTextColor={DARK.mut} value={lastName} onChangeText={setLastName} />
                <TextInput style={s.inp} placeholder="Username (unique)" placeholderTextColor={DARK.mut} autoCapitalize="none" value={username} onChangeText={setUsername} />
                <TextInput style={s.inp} placeholder="Email" placeholderTextColor={DARK.mut} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
              </>
            )}
            {authMode === "login" && (
              <TextInput style={s.inp} placeholder="Username or email" placeholderTextColor={DARK.mut} autoCapitalize="none" value={identifier} onChangeText={setIdentifier} />
            )}
            <TextInput style={s.inp} placeholder="Password" placeholderTextColor={DARK.mut} secureTextEntry value={password} onChangeText={setPassword} />
            <TouchableOpacity style={s.btnPri} onPress={handleAuth} disabled={authBusy}>
              <Text style={s.btnPriTxt}>{authBusy ? "Please wait…" : authMode === "login" ? "Sign In" : "Join Free"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAuthMode(authMode === "login" ? "register" : "login")} style={{ marginTop: 14, alignItems: "center" }}>
              <Text style={{ color: DARK.accent, fontWeight: "700" }}>
                {authMode === "login" ? "New to CampusNetwork? Create Account" : "Already have an account? Sign In"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />
      <View style={s.header}>
        <Text style={s.brandSm}>Campus<Text style={{ color: DARK.accent }}>Network</Text></Text>
        <Text style={{ color: DARK.mut, fontSize: 13 }}>@{user.username}</Text>
      </View>

      {tab === "profile" ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          <View style={s.card}>
            <Text style={s.h2}>{user.name || user.username}</Text>
            <Text style={{ color: DARK.mut, marginBottom: 10 }}>@{user.username} · {user.email}</Text>
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <View style={s.statBox}><Text style={s.statNum}>{user.followers ?? 0}</Text><Text style={s.statLbl}>Followers</Text></View>
              <View style={s.statBox}><Text style={s.statNum}>{user.following ?? 0}</Text><Text style={s.statLbl}>Following</Text></View>
              <View style={s.statBox}><Text style={s.statNum}>{user.questions ?? 0}</Text><Text style={s.statLbl}>Posts</Text></View>
            </View>
            <TouchableOpacity style={[s.btnPri, { backgroundColor: "#DC2626" }]} onPress={handleLogout}>
              <Text style={s.btnPriTxt}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it, idx) => String(it.public_id || it.slug || it.id || idx)}
          contentContainerStyle={{ padding: 14, paddingBottom: 90, gap: 12 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => loadTab(tab)} tintColor={DARK.accent} />}
          ListHeaderComponent={
            tab === "feed" ? (
              <View style={[s.card, { marginBottom: 12 }]}>
                <TextInput style={s.inp} placeholder="Post headline (optional)" placeholderTextColor={DARK.mut} value={postTitle} onChangeText={setPostTitle} />
                <TextInput style={[s.inp, { height: 76, textAlignVertical: "top", paddingTop: 10 }]} multiline placeholder="Ask the ATBU network…" placeholderTextColor={DARK.mut} value={postBody} onChangeText={setPostBody} />
                <TouchableOpacity style={s.btnPri} onPress={handleCreatePost} disabled={posting}>
                  <Text style={s.btnPriTxt}>{posting ? "Posting…" : "Post to Feed"}</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={s.card}>
              {tab === "feed" && (
                <>
                  <Text style={{ color: DARK.accent, fontSize: 12, fontWeight: "700", marginBottom: 4 }}>
                    {item.user?.name} (@{item.user?.username}) · {item.dept || "General"}
                  </Text>
                  <Text style={s.h3}>{item.title}</Text>
                  <Text style={{ color: DARK.mut, marginTop: 4 }} numberOfLines={3}>{item.body}</Text>
                  <Text style={{ color: DARK.mut, fontSize: 12, marginTop: 8 }}>
                    ♥ {item.likes ?? 0} · 💬 {item.ans ?? 0} · 👁 {item.views ?? 0}
                  </Text>
                </>
              )}
              {tab === "communities" && (
                <>
                  <Text style={s.h3}>{item.name}{item.is_official ? " ✓ Official" : ""}</Text>
                  <Text style={{ color: DARK.accent, fontSize: 12, marginTop: 2 }}>{item.category} · {item.followers_count} followers</Text>
                  <Text style={{ color: DARK.mut, marginTop: 6 }} numberOfLines={2}>{item.description}</Text>
                </>
              )}
              {tab === "sug" && (
                <>
                  <Text style={s.h3}>{item.name}</Text>
                  <Text style={{ color: DARK.accent, fontSize: 12 }}>@{item.username} · {item.title || "SUG Representative"}</Text>
                  <Text style={{ color: DARK.mut, marginTop: 6 }}>{item.dept || "ATBU"} · Rating: {item.sug_rating || 0}/5</Text>
                </>
              )}
              {tab === "library" && (
                <>
                  <Text style={s.h3}>{item.code} — {item.title}</Text>
                  <Text style={{ color: DARK.mut, marginTop: 4 }}>{item.document_count} PDFs · {item.department_name}</Text>
                </>
              )}
            </View>
          )}
          ListEmptyComponent={!loading ? <Text style={{ color: DARK.mut, textAlign: "center", marginTop: 40 }}>Nothing here yet.</Text> : null}
        />
      )}

      <View style={s.bottomNav}>
        {[["feed", "Feed"], ["communities", "Groups"], ["sug", "SUG"], ["library", "Library"], ["profile", "Me"]].map(([k, lbl]) => (
          <TouchableOpacity key={k} onPress={() => setTab(k)} style={[s.navBtn, tab === k && s.navBtnOn]}>
            <Text style={[s.navTxt, tab === k && { color: DARK.accent }]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  center: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: DARK.brd, backgroundColor: DARK.surf },
  brand: { fontSize: 28, fontWeight: "800", color: DARK.txt, textAlign: "center", marginBottom: 4 },
  brandSm: { fontSize: 18, fontWeight: "800", color: DARK.txt },
  sub: { fontSize: 13, color: DARK.mut, textAlign: "center", marginBottom: 22 },
  authWrap: { flexGrow: 1, justifyContent: "center", padding: 20 },
  card: { backgroundColor: DARK.surf, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: DARK.brd },
  h2: { fontSize: 20, fontWeight: "800", color: DARK.txt, marginBottom: 12 },
  h3: { fontSize: 16, fontWeight: "700", color: DARK.txt },
  inp: { backgroundColor: DARK.surfH, color: DARK.txt, borderWidth: 1, borderColor: DARK.brd, borderRadius: 12, paddingHorizontal: 14, height: 46, marginBottom: 10, fontSize: 14 },
  btnPri: { backgroundColor: DARK.accent, borderRadius: 12, height: 46, alignItems: "center", justifyContent: "center", marginTop: 4 },
  btnPriTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  statBox: { flex: 1, minWidth: 90, backgroundColor: DARK.surfH, padding: 12, borderRadius: 12, alignItems: "center" },
  statNum: { color: DARK.txt, fontSize: 22, fontWeight: "800" },
  statLbl: { color: DARK.mut, fontSize: 12, marginTop: 2 },
  bottomNav: { flexDirection: "row", backgroundColor: DARK.surf, borderTopWidth: 1, borderTopColor: DARK.brd, paddingVertical: 8, paddingHorizontal: 6 },
  navBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 12 },
  navBtnOn: { backgroundColor: DARK.surfH },
  navTxt: { color: DARK.mut, fontWeight: "700", fontSize: 12 },
});
