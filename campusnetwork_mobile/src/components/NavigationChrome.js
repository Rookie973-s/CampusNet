/**
 * Redesigned Mobile Navigation Chrome:
 * - Glassmorphism TopNav (always visible, NO hide-on-scroll, NO avatar button):
 *   Transparent BrandMark + CampusNetwork left | Search icon + Hamburger right
 * - Floating BottomNav + Central 2-Action Radial FAB (matches FLOATING ACTION NAVIGATION video):
 *   Feed | Library | [ + FAB -> Create Post / Create Poll ] | SUG | Me (with live unread dot!)
 * - Reorganized Hamburger MobileDrawer (Communities, SUG Chats, Place Ads, SUG Access, About/Help/Privacy, Trending Now, Theme, Sign Out)
 * - Redesigned NotificationsModal (Today / Earlier groups, red unread dots, Mark All Read, Clear All)
 * - Global SearchModal (Posts + @users with MorphismSearchInput feel)
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BrandMark, ClayButton, ClayCard, UserAvatar } from "./ClayUI";
import { clayShadow, RADII } from "../theme/tokens";
import { questionsApi, usersApi } from "../api";

/** Glassmorphism Top Navigation — always visible (no hide-on-scroll), no avatar shortcut. */
export function TopNav({ theme, onLogoPress, onOpenSearch, onOpenDrawer }) {
  return (
    <View
      style={[
        styles.topBar,
        {
          backgroundColor: theme.isDark ? "rgba(12, 15, 24, 0.92)" : "rgba(15, 23, 42, 0.94)",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.08)",
        },
      ]}
    >
      <Pressable onPress={onLogoPress} style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <BrandMark size={34} />
        <Text style={styles.brandTxt}>
          Campus<Text style={{ color: "#60A5FA" }}>Network</Text>
        </Text>
      </Pressable>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable onPress={onOpenSearch} style={styles.iconBtn} accessibilityLabel="Search">
          <Ionicons name="search" size={19} color="#E8EEFA" />
        </Pressable>
        <Pressable onPress={onOpenDrawer} style={styles.iconBtn} accessibilityLabel="Open menu">
          <Ionicons name="menu" size={22} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Floating Dark-Morphism Bottom Bar + 2-Action Radial FAB
 * Matches FLOATING ACTION NAVIGATION video:
 * - Left: Feed, Library | Center: Elevated Glowing Blue + FAB | Right: SUG, Me (with unread dot)
 * - Tapping + smoothly rotates to × and fans out STRICTLY TWO buttons: Create Post (pencil) & Create Poll (chart)
 */
export function BottomNav({
  theme,
  tab,
  unread = 0,
  onSelect,
  onCreatePost,
  onCreatePoll,
}) {
  const [fabOpen, setFabOpen] = useState(false);
  const fabAnim = useRef(new Animated.Value(0)).current;
  const lockRef = useRef(false);

  const toggleFab = (forceState) => {
    if (lockRef.current) return;
    lockRef.current = true;
    const next = typeof forceState === "boolean" ? forceState : !fabOpen;
    setFabOpen(next);
    Animated.spring(fabAnim, {
      toValue: next ? 1 : 0,
      useNativeDriver: true,
      speed: 22,
      bounciness: 9,
    }).start(() => {
      lockRef.current = false;
    });
    setTimeout(() => { lockRef.current = false; }, 220);
  };

  const rotateFab = fabAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] });
  const postTx = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -64] });
  const postTy = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -78] });
  const pollTx = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 64] });
  const pollTy = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -78] });
  const actionScale = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  const actionOpacity = fabAnim.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] });

  const leftItems = [
    { key: "feed", label: "Feed", icon: "newspaper-outline", iconOn: "newspaper" },
    { key: "library", label: "Library", icon: "book-outline", iconOn: "book" },
  ];
  const rightItems = [
    { key: "sug", label: "SUG", icon: "people-outline", iconOn: "people" },
    { key: "profile", label: "Me", icon: "person-outline", iconOn: "person", hasUnread: unread > 0 },
  ];

  const renderTab = (it) => {
    const active = tab === it.key;
    return (
      <Pressable
        key={it.key}
        onPress={() => { if (fabOpen) toggleFab(false); onSelect(it.key); }}
        style={[styles.bottomItem, active && { backgroundColor: theme.accentSoft }]}
      >
        <View style={{ position: "relative" }}>
          <Ionicons name={active ? it.iconOn : it.icon} size={20} color={active ? theme.accent : theme.mut} />
          {it.hasUnread ? (
            <View
              style={{
                position: "absolute",
                top: -2,
                right: -5,
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundColor: "#EF4444",
                borderWidth: 1.5,
                borderColor: theme.surf,
              }}
            />
          ) : null}
        </View>
        <Text style={{ fontSize: 10.5, fontWeight: active ? "800" : "600", color: active ? theme.accent : theme.mut, marginTop: 2 }}>
          {it.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      {/* Tap-outside dismissal layer when FAB is expanded */}
      {fabOpen ? (
        <Pressable
          onPress={() => toggleFab(false)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.34)",
            zIndex: 40,
          }}
        />
      ) : null}

      <View pointerEvents="box-none" style={styles.bottomOuter}>
        {/* Strictly 2 Expandable Radial FAB Actions */}
        <Animated.View
          pointerEvents={fabOpen ? "auto" : "none"}
          style={{
            position: "absolute",
            bottom: 34,
            alignSelf: "center",
            opacity: actionOpacity,
            transform: [{ translateX: postTx }, { translateY: postTy }, { scale: actionScale }],
            zIndex: 60,
            alignItems: "center",
            gap: 4,
          }}
        >
          <Pressable
            onPress={() => { toggleFab(false); onCreatePost && onCreatePost(); }}
            style={[styles.fabSubBtn, { backgroundColor: "#2563EB" }]}
            accessibilityLabel="Create Post"
          >
            <Ionicons name="create-outline" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.fabSubLabel}>Post</Text>
        </Animated.View>

        <Animated.View
          pointerEvents={fabOpen ? "auto" : "none"}
          style={{
            position: "absolute",
            bottom: 34,
            alignSelf: "center",
            opacity: actionOpacity,
            transform: [{ translateX: pollTx }, { translateY: pollTy }, { scale: actionScale }],
            zIndex: 60,
            alignItems: "center",
            gap: 4,
          }}
        >
          <Pressable
            onPress={() => { toggleFab(false); onCreatePoll && onCreatePoll(); }}
            style={[styles.fabSubBtn, { backgroundColor: "#3B82F6" }]}
            accessibilityLabel="Create Poll"
          >
            <Ionicons name="stats-chart-outline" size={21} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.fabSubLabel}>Poll</Text>
        </Animated.View>

        {/* Floating Rounded Morphism Bar */}
        <View
          style={[
            styles.bottomWrap,
            {
              backgroundColor: theme.isDark ? "rgba(22, 25, 35, 0.96)" : theme.surf,
              borderWidth: 1,
              borderColor: theme.isDark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.08)",
            },
            clayShadow(theme, 3),
          ]}
        >
          {leftItems.map(renderTab)}
          <View style={{ width: 62 }} />
          {rightItems.map(renderTab)}
        </View>

        {/* Elevated Glowing Central + FAB */}
        <Pressable
          onPress={() => toggleFab()}
          style={[
            styles.centerFab,
            {
              backgroundColor: theme.accent,
              shadowColor: theme.accent,
            },
          ]}
          accessibilityLabel={fabOpen ? "Close create menu" : "Create post or poll"}
        >
          <Animated.View style={{ transform: [{ rotate: rotateFab }] }}>
            <Ionicons name="add" size={30} color="#FFFFFF" />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

/** Reorganized Hamburger Drawer (Communities, SUG Chats, Place Ads, SUG Access, About/Help/Privacy, Trending Now, Theme, Sign Out) */
export function MobileDrawer({
  visible, onClose, theme, isDark, toggleTheme, user, unread, onNavigate, onDiscovery, onLogout,
}) {
  const [topics, setTopics] = useState([]);

  useEffect(() => {
    if (!visible) return;
    questionsApi.trendingTopics().then(setTopics).catch(() => {});
  }, [visible]);

  const navRows = [
    { icon: "compass-outline", label: "Communities", dest: "communities" },
    { icon: "chatbubbles-outline", label: "SUG Chats", dest: "chats" },
    { icon: "megaphone-outline", label: "Place Ads", dest: "ads" },
    { icon: "school-outline", label: "SUG Access", dest: "apply" },
    { icon: "information-circle-outline", label: "About, Help & Privacy", dest: "about" },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.drawerOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.drawerPanel, { backgroundColor: theme.surf }]}>
          <View style={[styles.drawerHead, { backgroundColor: theme.topBar }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <BrandMark size={34} />
              <View>
                <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 15 }}>CampusNetwork</Text>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>ATBU Student Hub</Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={styles.closeCircle}>
              <Ionicons name="close" size={18} color="#FFFFFF" />
            </Pressable>
          </View>

          {user ? (
            <Pressable
              onPress={() => { onClose(); onNavigate("profile"); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 15, backgroundColor: theme.surfH }}
            >
              <UserAvatar src={user.avatar_url} av={user.av || "?"} bg={user.bg} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.txt, fontWeight: "700", fontSize: 14 }} numberOfLines={1}>
                  {user.first_name ? `${user.first_name} ${user.last_name || ""}`.trim() : user.username}
                </Text>
                <Text style={{ color: theme.mut, fontSize: 12 }} numberOfLines={1}>@{user.username}</Text>
              </View>
              {unread > 0 ? (
                <View style={{ backgroundColor: "#EF4444", borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{unread}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: theme.faint, letterSpacing: 0.6, marginBottom: 2 }}>
              EXPLORE &amp; TOOLS
            </Text>
            {navRows.map((row) => (
              <Pressable
                key={row.dest}
                onPress={() => { onClose(); onNavigate(row.dest); }}
                style={[styles.drawerRow, { backgroundColor: theme.surfH }]}
              >
                <Ionicons name={row.icon} size={18} color={theme.accent} />
                <Text style={{ color: theme.txt, fontWeight: "700", fontSize: 14, flex: 1 }}>{row.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.faint} />
              </Pressable>
            ))}

            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: theme.faint, letterSpacing: 0.6, marginBottom: 8 }}>
                TRENDING NOW
              </Text>
              {topics.length === 0 ? (
                <Text style={{ color: theme.mut, fontSize: 13 }}>Explore the Feed for live discussions.</Text>
              ) : (
                topics.slice(0, 5).map((it, idx) => (
                  <Pressable
                    key={it.id || idx}
                    onPress={() => { onClose(); onDiscovery(it.discovery || it.title); }}
                    style={{ flexDirection: "row", gap: 10, paddingVertical: 8 }}
                  >
                    <Text style={{ color: theme.accent, fontWeight: "800", fontSize: 14, width: 20 }}>{it.n || idx + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.txt, fontWeight: "600", fontSize: 13.5 }} numberOfLines={2}>{it.title}</Text>
                      <Text style={{ color: theme.faint, fontSize: 11.5, marginTop: 2 }}>{it.dept} · {it.answers} answers</Text>
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          </ScrollView>

          <View style={{ padding: 14, gap: 10, backgroundColor: theme.surfH }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name={isDark ? "moon" : "sunny"} size={18} color={theme.accent} />
                <Text style={{ color: theme.txt, fontWeight: "700", fontSize: 14 }}>Dark Mode</Text>
              </View>
              <Switch value={isDark} onValueChange={toggleTheme} trackColor={{ true: theme.accent }} />
            </View>
            {user ? (
              <ClayButton theme={theme} variant="danger" icon="log-out-outline" label="Sign Out" compact onPress={() => { onClose(); onLogout(); }} />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Redesigned Notifications Modal (matches reference layout: Today / Earlier, icon squares, red unread dots) */
export function NotificationsModal({ visible, onClose, theme, notifs, onMarkAll, onClearAll, onTapNotif }) {
  const unread = notifs.filter((n) => !n.read).length;
  const iconFor = (type) => {
    if (type === "like") return { name: "heart", color: "#F43F5E" };
    if (type === "answer" || type === "comment") return { name: "chatbubble", color: "#3B82F6" };
    if (type === "verification" || type === "staff") return { name: "checkmark-circle", color: "#60A5FA" };
    if (type === "chat") return { name: "mail", color: "#10B981" };
    return { name: "notifications", color: "#F59E0B" };
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <ClayCard theme={theme} level={3} style={[styles.sheetCard, { maxHeight: "86%" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, backgroundColor: theme.surfH, borderTopLeftRadius: RADII.lg, borderTopRightRadius: RADII.lg }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: theme.txt, fontWeight: "900", fontSize: 18 }}>Notifications</Text>
              {unread > 0 ? (
                <View style={{ backgroundColor: "#EF4444", borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800" }}>{unread}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {unread > 0 ? (
                <Pressable onPress={onMarkAll}><Text style={{ color: theme.accent, fontWeight: "700", fontSize: 12.5 }}>Mark read</Text></Pressable>
              ) : null}
              {notifs.length > 0 ? (
                <Pressable onPress={onClearAll}><Text style={{ color: theme.danger, fontWeight: "700", fontSize: 12.5 }}>Clear all</Text></Pressable>
              ) : null}
              <Pressable onPress={onClose}><Ionicons name="close" size={21} color={theme.mut} /></Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
            {notifs.length === 0 ? (
              <Text style={{ color: theme.mut, textAlign: "center", paddingVertical: 36 }}>You're all caught up!</Text>
            ) : (
              notifs.map((n) => {
                const ic = iconFor(n.type);
                return (
                  <Pressable
                    key={n.id}
                    onPress={() => { onTapNotif(n); onClose(); }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 12,
                      borderRadius: RADII.md,
                      backgroundColor: !n.read ? theme.accentSoft : theme.surfH,
                    }}
                  >
                    <View
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 12,
                        backgroundColor: "#0F172A",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name={ic.name} size={20} color={ic.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.txt, fontSize: 13.5, fontWeight: !n.read ? "700" : "500", lineHeight: 19 }}>
                        {n.text}
                      </Text>
                      <Text style={{ color: theme.faint, fontSize: 11.5, marginTop: 3 }}>{n.time || ""}</Text>
                    </View>
                    {!n.read ? (
                      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: "#EF4444" }} />
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </ClayCard>
      </View>
    </Modal>
  );
}

/** Global Search Modal (Posts + @users, matches SEARCH BEHAVIOR video) */
export function SearchModal({ visible, onClose, theme, onPickPost, onPickUser }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [posts, setPosts] = useState([]);
  const [people, setPeople] = useState([]);

  useEffect(() => {
    if (!visible) return;
    const trimmed = q.trim();
    if (!trimmed) { setPosts([]); setPeople([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const [pRes, uRes] = await Promise.all([
          questionsApi.list({ search: trimmed }).catch(() => ({ results: [] })),
          usersApi.search(trimmed.replace(/^@/, "")).catch(() => []),
        ]);
        setPosts(pRes.results || []);
        setPeople(uRes || []);
      } finally { setBusy(false); }
    }, 260);
    return () => clearTimeout(t);
  }, [q, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { justifyContent: "flex-start", paddingTop: 56 }]}>
        <ClayCard theme={theme} level={3} style={[styles.sheetCard, { maxHeight: "82%" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)" }}>
            <Ionicons name="search" size={19} color={theme.accent} />
            <TextInput
              autoFocus
              value={q}
              onChangeText={setQ}
              placeholder="Search posts, topics, or @users..."
              placeholderTextColor={theme.faint}
              style={{ flex: 1, color: theme.txt, fontSize: 15, paddingVertical: 6 }}
            />
            <Pressable onPress={() => { setQ(""); onClose(); }} hitSlop={8}>
              <Ionicons name="close" size={21} color={theme.mut} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, gap: 10 }}>
            {busy ? <ActivityIndicator color={theme.accent} style={{ marginVertical: 16 }} /> : null}

            {people.length > 0 ? (
              <View style={{ gap: 6 }}>
                <Text style={{ color: theme.faint, fontSize: 11, fontWeight: "800" }}>PEOPLE</Text>
                {people.slice(0, 4).map((u) => (
                  <Pressable
                    key={u.id}
                    onPress={() => { onClose(); onPickUser(u.id); }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: 12, backgroundColor: theme.surfH }}
                  >
                    <UserAvatar src={u.avatar_url} av={u.av} bg={u.bg} size={34} />
                    <View>
                      <Text style={{ color: theme.txt, fontWeight: "700", fontSize: 14 }}>{u.name}</Text>
                      <Text style={{ color: theme.mut, fontSize: 12 }}>@{u.username}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {posts.length > 0 ? (
              <View style={{ gap: 6 }}>
                <Text style={{ color: theme.faint, fontSize: 11, fontWeight: "800" }}>POSTS</Text>
                {posts.slice(0, 6).map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => { onClose(); onPickPost(p); }}
                    style={{ padding: 10, borderRadius: 12, backgroundColor: theme.surfH }}
                  >
                    <Text style={{ color: theme.txt, fontWeight: "700", fontSize: 14 }} numberOfLines={2}>{p.title}</Text>
                    <Text style={{ color: theme.mut, fontSize: 12, marginTop: 2 }}>{p.user} · {p.dept}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {!busy && q.trim() && posts.length === 0 && people.length === 0 ? (
              <Text style={{ color: theme.mut, textAlign: "center", paddingVertical: 20 }}>No results found for "{q}"</Text>
            ) : null}
          </ScrollView>
        </ClayCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 58,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 30,
  },
  brandTxt: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: -0.3,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomOuter: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    alignItems: "center",
    zIndex: 50,
  },
  bottomWrap: {
    width: "100%",
    height: 66,
    borderRadius: 28,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bottomItem: {
    flex: 1,
    height: 50,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  centerFab: {
    position: "absolute",
    bottom: 22,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 12,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.18)",
  },
  fabSubBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
  },
  fabSubLabel: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "800",
    backgroundColor: "rgba(11,18,32,0.82)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
    overflow: "hidden",
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  drawerPanel: {
    width: "82%",
    maxWidth: 330,
    height: "100%",
  },
  drawerHead: {
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  closeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    padding: 14,
  },
  sheetCard: {
    width: "100%",
    overflow: "hidden",
  },
});
