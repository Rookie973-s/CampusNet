/**
 * CampusNetwork (Cenet) React Native App — Redesigned Production Shell
 * - Home completely removed on mobile:
 *   * Unauthenticated launch -> Website-faithful LandingScreen
 *   * Authenticated launch -> Directly into Feed
 * - Glassmorphism TopNav (always visible, NO avatar shortcut, transparent logo -> Feed)
 * - Floating BottomNav + Central 2-Action Radial FAB (Create Post -> AskNetworkModal, Create Poll -> CreatePollModal)
 * - Real-time Twitter-style Notifications (auto-polls every 10s + AppState foreground resume + instant toast/local banner without manual refresh!)
 * - Me dashboard: Notifications before Communities, live unread badge on Me, role-restricted Uploads
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { DARK_THEME, LIGHT_THEME } from "./src/theme/tokens";
import { authApi, departmentsApi, notificationsApi } from "./src/api";
import { TopToast } from "./src/components/ClayUI";
import {
  BottomNav, MobileDrawer, NotificationsModal, SearchModal, TopNav,
} from "./src/components/NavigationChrome";
import { AskNetworkModal, CreatePollModal } from "./src/components/CreatePostModals";
import AuthModal from "./src/components/AuthModal";
import AuthorModal from "./src/components/AuthorModal";
import {
  registerForPushNotificationsAsync,
  subscribeNotificationResponses,
} from "./src/utils/pushNotifications";

import LandingScreen from "./src/screens/LandingScreen";
import FeedScreen from "./src/screens/FeedScreen";
import QuestionDetailScreen from "./src/screens/QuestionDetailScreen";
import LibraryScreen from "./src/screens/LibraryScreen";
import SugScreen from "./src/screens/SugScreen";
import ApplySugScreen from "./src/screens/ApplySugScreen";
import CommunitiesScreen from "./src/screens/CommunitiesScreen";
import ChatsScreen from "./src/screens/ChatsScreen";
import AdsScreen from "./src/screens/AdsScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import AboutScreen from "./src/screens/AboutScreen";

export default function App() {
  const [isDark, setIsDark] = useState(true);
  const theme = isDark ? DARK_THEME : LIGHT_THEME;

  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [guestEntered, setGuestEntered] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [departments, setDepartments] = useState([]);

  // Primary tabs (NO Home!): feed | library | sug | profile
  // Sub-screens: communities | chats | ads | apply | about
  const [screen, setScreen] = useState("feed");
  const [feedTopic, setFeedTopic] = useState("All");
  const [feedDiscovery, setFeedDiscovery] = useState("");
  const [newPostSignal, setNewPostSignal] = useState(null);
  const [openQuestion, setOpenQuestion] = useState(null);
  const [activeChatConvoId, setActiveChatConvoId] = useState(null);

  // Modals & Overlays
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [askModalOpen, setAskModalOpen] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [authModal, setAuthModal] = useState({ open: false, tab: "login" });
  const [authorModal, setAuthorModal] = useState(null);

  // Top-popping sleek dark toast
  const [toastState, setToastState] = useState(null);
  const toastTimer = useRef(null);
  const toast = useCallback((msg, type = "info") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastState({ msg, type });
    toastTimer.current = setTimeout(() => setToastState(null), 3600);
  }, []);

  // Track latest notification ID so new arrivals trigger instant Twitter-style live banner
  const latestNotifIdRef = useRef(null);

  const refreshNotifs = useCallback(async (announceNew = false) => {
    try {
      const list = await notificationsApi.list();
      setNotifs(list || []);
      const newestUnread = (list || []).find((n) => !n.read);
      if (newestUnread) {
        if (announceNew && latestNotifIdRef.current && newestUnread.id > latestNotifIdRef.current) {
          toast(newestUnread.text, "info");
        }
        latestNotifIdRef.current = Math.max(latestNotifIdRef.current || 0, newestUnread.id);
      }
    } catch {
      // ignore transient network errors
    }
  }, [toast]);

  // Initial boot: restore persisted session & route directly to Feed if logged in
  useEffect(() => {
    departmentsApi.list().then((d) => setDepartments(d || [])).catch(() => {});
    authApi.me()
      .then((u) => {
        setUser(u);
        setScreen("feed");
        refreshNotifs(false);
        registerForPushNotificationsAsync();
      })
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, [refreshNotifs]);

  // Real-time Twitter-style notification polling every 10s + immediate refresh on app foreground
  useEffect(() => {
    if (!user) return;
    const poll = setInterval(() => refreshNotifs(true), 10000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshNotifs(true);
    });
    return () => {
      clearInterval(poll);
      sub.remove();
    };
  }, [user, refreshNotifs]);

  // Deep-link native push notification taps
  useEffect(() => {
    return subscribeNotificationResponses((data) => {
      if (data?.type === "chat") navigateTo("chats");
      else if (data?.type === "verification") navigateTo("profile");
      else if (data?.type === "community") navigateTo("communities");
      else navigateTo("feed");
    });
  }, []);

  const unread = notifs.filter((n) => !n.read).length;

  const navigateTo = (dest) => {
    setOpenQuestion(null);
    if (dest === "home" || dest === "profile-settings") {
      setScreen(dest === "profile-settings" ? "profile" : "feed");
      return;
    }
    setScreen(dest);
  };

  const handleLogout = async () => {
    await authApi.logout();
    setUser(null);
    setGuestEntered(false);
    setNotifs([]);
    latestNotifIdRef.current = null;
    setOpenQuestion(null);
    setScreen("feed");
    toast("Signed out.", "info");
  };

  const primaryTab = ["feed", "library", "sug", "profile"].includes(screen) ? screen : "feed";

  if (booting) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" }}>
          <StatusBar style="light" />
          <ActivityIndicator size="large" color={theme.accent} />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // Unauthenticated entry -> Website-faithful LandingScreen
  if (!user && !guestEntered) {
    return (
      <SafeAreaProvider>
        <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: "#0B0D14" }}>
          <StatusBar style="light" />
          <LandingScreen
            theme={theme}
            onLogin={() => setAuthModal({ open: true, tab: "login" })}
            onRegister={() => setAuthModal({ open: true, tab: "register" })}
            onGuest={() => { setGuestEntered(true); setScreen("feed"); }}
          />
          <TopToast toast={toastState} />
          <AuthModal
            visible={authModal.open}
            initialTab={authModal.tab}
            theme={theme}
            onClose={() => setAuthModal((p) => ({ ...p, open: false }))}
            onSuccess={(u) => {
              setUser(u);
              setScreen("feed");
              setAuthModal({ open: false, tab: "login" });
              refreshNotifs(false);
              registerForPushNotificationsAsync();
              toast(`Welcome, ${u.first_name || u.username}!`, "success");
            }}
            onApplySug={() => { setGuestEntered(true); setScreen("apply"); }}
            onOpenPolicy={() => { setGuestEntered(true); setScreen("about"); }}
            toast={toast}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: theme.topBar }}>
        <StatusBar style="light" />

        {/* Always-visible Glassmorphism TopNav (no avatar shortcut, transparent logo -> Feed) */}
        <TopNav
          theme={theme}
          onLogoPress={() => navigateTo("feed")}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenDrawer={() => setDrawerOpen(true)}
        />

        <View style={{ flex: 1, backgroundColor: theme.bg }}>
          {openQuestion ? (
            <QuestionDetailScreen
              question={openQuestion}
              theme={theme}
              user={user}
              onBack={() => setOpenQuestion(null)}
              onOpenAuthor={(id) => setAuthorModal({ userId: id })}
              onRequireAuth={() => setAuthModal({ open: true, tab: "login" })}
              toast={toast}
            />
          ) : screen === "feed" ? (
            <FeedScreen
              theme={theme}
              user={user}
              departments={departments}
              initialTopic={feedTopic}
              discovery={feedDiscovery}
              onClearDiscovery={() => setFeedDiscovery("")}
              newPostSignal={newPostSignal}
              onOpenQuestion={(q) => setOpenQuestion(q)}
              onOpenAuthor={(id) => setAuthorModal({ userId: id })}
              onRequireAuth={() => setAuthModal({ open: true, tab: "login" })}
              toast={toast}
            />
          ) : screen === "library" ? (
            <LibraryScreen
              theme={theme}
              user={user}
              onRequireAuth={() => setAuthModal({ open: true, tab: "login" })}
              toast={toast}
            />
          ) : screen === "sug" ? (
            <SugScreen
              theme={theme}
              user={user}
              departments={departments}
              onRequireAuth={() => setAuthModal({ open: true, tab: "login" })}
              onOpenChat={(convoId) => { setActiveChatConvoId(convoId); navigateTo("chats"); }}
              onOpenApplySug={() => navigateTo("apply")}
              onOpenAuthor={(id) => setAuthorModal({ userId: id })}
              toast={toast}
            />
          ) : screen === "apply" ? (
            <ApplySugScreen
              theme={theme}
              user={user}
              onUserUpdate={setUser}
              onBack={() => navigateTo("sug")}
              toast={toast}
            />
          ) : screen === "communities" ? (
            <CommunitiesScreen
              theme={theme}
              user={user}
              onRequireAuth={() => setAuthModal({ open: true, tab: "login" })}
              toast={toast}
            />
          ) : screen === "chats" ? (
            <ChatsScreen
              theme={theme}
              user={user}
              initialConvoId={activeChatConvoId}
              onRequireAuth={() => setAuthModal({ open: true, tab: "login" })}
              toast={toast}
            />
          ) : screen === "ads" ? (
            <AdsScreen
              theme={theme}
              onBack={() => navigateTo("feed")}
              toast={toast}
            />
          ) : screen === "about" ? (
            <AboutScreen
              theme={theme}
              onBack={() => navigateTo("feed")}
              onExploreFeed={() => navigateTo("feed")}
            />
          ) : (
            <ProfileScreen
              theme={theme}
              mode={isDark ? "dark" : "light"}
              onToggleTheme={() => setIsDark((p) => !p)}
              user={user}
              unread={unread}
              onUserUpdate={setUser}
              onRequireAuth={() => setAuthModal({ open: true, tab: "login" })}
              onLogout={handleLogout}
              onOpenQuestion={(q) => setOpenQuestion(q)}
              onOpenAbout={() => navigateTo("about")}
              onOpenNotifications={() => { refreshNotifs(false); setNotifsOpen(true); }}
              onOpenCommunities={() => navigateTo("communities")}
              toast={toast}
            />
          )}

          {/* Floating BottomNav + Strictly 2-Action FAB (Create Post & Create Poll) */}
          <BottomNav
            theme={theme}
            tab={primaryTab}
            unread={unread}
            onSelect={navigateTo}
            onCreatePost={() => (user ? setAskModalOpen(true) : setAuthModal({ open: true, tab: "login" }))}
            onCreatePoll={() => (user ? setPollModalOpen(true) : setAuthModal({ open: true, tab: "login" }))}
          />
        </View>

        <TopToast toast={toastState} />

        {/* Reorganized Hamburger Drawer */}
        <MobileDrawer
          visible={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          theme={theme}
          isDark={isDark}
          toggleTheme={() => setIsDark((p) => !p)}
          user={user}
          unread={unread}
          onNavigate={navigateTo}
          onDiscovery={(phrase) => { setFeedDiscovery(phrase); setFeedTopic("All"); navigateTo("feed"); }}
          onLogout={handleLogout}
        />

        {/* Redesigned Notifications Modal */}
        <NotificationsModal
          visible={notifsOpen}
          onClose={() => setNotifsOpen(false)}
          theme={theme}
          notifs={notifs}
          onMarkAll={() => {
            setNotifs((p) => p.map((n) => ({ ...n, read: true })));
            notificationsApi.markAllRead().catch(() => {});
          }}
          onClearAll={() => {
            setNotifs([]);
            notificationsApi.clearAll().catch(() => {});
            toast("All notifications cleared.", "info");
          }}
          onTapNotif={(n) => {
            if (!n.read) {
              setNotifs((p) => p.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
              notificationsApi.markRead(n.id).catch(() => {});
            }
            if (n.link?.startsWith("/sug")) navigateTo("sug");
            else if (n.link?.startsWith("/chats")) navigateTo("chats");
            else if (n.link?.startsWith("/communities")) navigateTo("communities");
            else if (n.link?.startsWith("/ads")) navigateTo("ads");
            else if (n.link?.startsWith("/profile")) navigateTo("profile");
            else navigateTo("feed");
          }}
        />

        <SearchModal
          visible={searchOpen}
          onClose={() => setSearchOpen(false)}
          theme={theme}
          onPickPost={(p) => setOpenQuestion(p)}
          onPickUser={(uid) => setAuthorModal({ userId: uid })}
        />

        {/* FAB Action 1: Ask the Network (Create Post) Modal */}
        <AskNetworkModal
          visible={askModalOpen}
          onClose={() => setAskModalOpen(false)}
          theme={theme}
          user={user}
          departments={departments}
          onCreated={(created) => {
            setNewPostSignal(created);
            setScreen("feed");
          }}
          toast={toast}
        />

        {/* FAB Action 2: Create Poll Modal */}
        <CreatePollModal
          visible={pollModalOpen}
          onClose={() => setPollModalOpen(false)}
          theme={theme}
          departments={departments}
          onCreated={(created) => {
            setNewPostSignal(created);
            setScreen("feed");
          }}
          toast={toast}
        />

        <AuthModal
          visible={authModal.open}
          initialTab={authModal.tab}
          theme={theme}
          onClose={() => setAuthModal((p) => ({ ...p, open: false }))}
          onSuccess={(u) => {
            setUser(u);
            setScreen("feed");
            setAuthModal({ open: false, tab: "login" });
            refreshNotifs(false);
            registerForPushNotificationsAsync();
            toast(`Welcome, ${u.first_name || u.username}!`, "success");
          }}
          onApplySug={() => navigateTo("apply")}
          onOpenPolicy={() => navigateTo("about")}
          toast={toast}
        />

        <AuthorModal
          userId={authorModal?.userId}
          username={authorModal?.username}
          theme={theme}
          viewer={user}
          onClose={() => setAuthorModal(null)}
          onRequireAuth={() => setAuthModal({ open: true, tab: "login" })}
          toast={toast}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
