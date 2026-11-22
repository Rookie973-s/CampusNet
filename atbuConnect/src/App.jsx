import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";

import GlobalStyle from "./components/GlobalStyle";
import Ic from "./components/Ic";
import useToast from "./hooks/useToast";
import { ToastContainer, BackToTop } from "./components/ui/shared";
import T from "./tokens";
import { useI18n } from "./i18n";

import TopNav from "./components/layout/TopNav";
import HeaderSearch from "./components/layout/HeaderSearch";
import BottomNav from "./components/layout/BottomNav";
import Footer from "./components/layout/Footer";
import { MobileDrawer } from "./components/layout/MobileDrawer";
import GuestPrompt from "./components/GuestPrompt";
import AuthorPopover from "./components/feed/AuthorPopover";

import HomePage from "./pages/HomePage";
import LandingPage, { SEEN_KEY, markSeen } from "./pages/LandingPage";
const FeedPage = lazy(() => import("./pages/FeedPage"));
const StaffPage = lazy(() => import("./pages/StaffPage"));
const QuestionPage = lazy(() => import("./pages/QuestionPage"));
const QuestionRoute = lazy(() => import("./pages/QuestionRoute"));
const ApplyPage = lazy(() => import("./pages/ApplyPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const LibraryPage = lazy(() => import("./pages/LibraryPage"));
const CommunitiesPage = lazy(() => import("./pages/CommunitiesPage"));
const CommunityDetailPage = lazy(() => import("./pages/CommunityDetailPage"));
const AdsPage = lazy(() => import("./pages/AdsPage"));
const ChatsPage = lazy(() => import("./pages/ChatsPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));

import AuthModal from "./modals/AuthModal";
import QuickAskModal from "./modals/QuickAskModal";
import ChatModal from "./modals/ChatModal";
import AiAskModal from "./modals/AiAskModal";

import { fetchMe, logout as apiLogout, updateMe } from "./api/auth";
import { tokenStore } from "./api/client";
import { listNotifications, markAllRead as apiMarkAllRead, markRead as apiMarkRead } from "./api/notifications";

const ROUTES = {
  home: "/", feed: "/feed", sug: "/sug", staff: "/sug",
  apply: "/apply", profile: "/profile", "profile-settings": "/profile?tab=settings",
  media: "/library", communities: "/communities", chats: "/chats", ads: "/ads", about: "/about",
};
const PATH_TO_PAGE = {
  "/": "home", "/feed": "feed", "/sug": "sug", "/staff": "sug",
  "/apply": "apply", "/profile": "profile", "/media": "media", "/library": "media",
  "/communities": "communities", "/chats": "chats", "/ads": "ads", "/about": "about",
};

const initialTheme = () => {
  try {
    const s = localStorage.getItem("cc_theme");
    if (s === "dark" || s === "light") return s;
  } catch { /* ignore */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang, setLang } = useI18n();
  const { toasts, show: toast } = useToast();

  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState("login");
  const [resetToken, setResetToken] = useState("");
  const [guestPrompt, setGuestPrompt] = useState(null);
  const [theme, setTheme] = useState(initialTheme);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [quickAsk, setQuickAsk] = useState(false);
  const [viewQ, setViewQ] = useState(null);
  const [feedKey, setFeedKey] = useState(0);
  const [searchUserPopover, setSearchUserPopover] = useState(null);

  const [notifs, setNotifs] = useState([]);
  const unread = notifs.filter((n) => n.unread).length;

  const refreshNotifs = useCallback(() => {
    if (!tokenStore.isLoggedIn()) { setNotifs([]); return; }
    listNotifications().then(setNotifs).catch(() => setNotifs([]));
  }, []);

  const syncLanguage = useCallback((u) => {
    if (!u) return;
    let local = null;
    try { local = localStorage.getItem("cc_lang"); } catch { /* ignore */ }
    if (local && local !== u.language) updateMe({ language: local }).catch(() => {});
    else if (u.language && u.language !== lang) setLang(u.language);
  }, [lang, setLang]);

  useEffect(() => {
    if (!tokenStore.isLoggedIn()) return;
    fetchMe()
      .then((u) => { setUser(u); refreshNotifs(); syncLanguage(u); })
      .catch(() => { tokenStore.clear(); setUser(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Support emailed password reset link (?reset_token=...)
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const rt = sp.get("reset_token");
    if (rt) {
      setResetToken(rt);
      setAuthOpen(true);
    }
  }, [location.search]);

  useEffect(() => {
    if (location.pathname !== "/") return;
    let seen = "1";
    try { seen = localStorage.getItem(SEEN_KEY); } catch { /* ignore */ }
    if (!seen && !tokenStore.isLoggedIn()) navigate("/welcome", { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => { document.documentElement.className = theme; try { localStorage.setItem("cc_theme", theme); } catch { /* ignore */ } }, [theme]);
  useEffect(() => { setDrawerOpen(false); setViewQ(null); }, [location.pathname]);

  const handleLogout = () => { apiLogout(); setUser(null); setNotifs([]); toast(t("toast.signedOut"), "info"); };

  const openLogin = useCallback(() => { setResetToken(""); setAuthTab("login"); setAuthOpen(true); }, []);
  const openRegister = useCallback(() => { setResetToken(""); setAuthTab("register"); setAuthOpen(true); }, []);
  const promptLogin = useCallback((action) => setGuestPrompt({ action: typeof action === "string" ? action : null }), []);

  const handleNav = (p) => { navigate(ROUTES[p] || "/"); setDrawerOpen(false); };
  const handleViewQ = (q) => {
    if (q?.id) navigate(`/q/${q.id}`);
    else { setViewQ(q); navigate("/feed"); }
  };
  const toggleTheme = () => setTheme((x) => (x === "dark" ? "light" : "dark"));

  const page = PATH_TO_PAGE[location.pathname] || (location.pathname.startsWith("/communities") ? "communities" : "home");
  const isHome = location.pathname === "/";
  const isWelcome = location.pathname === "/welcome";
  const chromeless = isWelcome;

  const nav = (variant) => (
    <TopNav
      variant={variant} page={page} onNav={handleNav} user={user}
      onLogin={openLogin} onRegister={openRegister} onLogout={handleLogout}
      theme={theme} toggleTheme={toggleTheme}
      notifs={notifs} unread={unread}
      onMarkAll={() => { setNotifs((p) => p.map((n) => ({ ...n, unread: false }))); if (user) apiMarkAllRead().catch(() => {}); }}
      onMarkOne={(id) => { setNotifs((p) => p.map((n) => (n.id === id ? { ...n, unread: false } : n))); if (user) apiMarkRead(id).catch(() => {}); }}
      drawerOpen={drawerOpen} onToggleDrawer={() => setDrawerOpen((p) => !p)}
      search={variant === "bar" ? <HeaderSearch onPick={handleViewQ} onPickUser={(u) => setSearchUserPopover({ userId: u.id })} /> : null}
    />
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <GlobalStyle />
      <ToastContainer toasts={toasts} />
      {!isHome && !chromeless && page !== "chats" && (
        <BackToTop onAsk={() => (user ? setQuickAsk(true) : promptLogin(t("guest.actions.post")))}
          askLabel={t("nav.ask")} topLabel={t("nav.top")} />
      )}

      {!isHome && !chromeless && nav("bar")}

      <main className={`app-main${isHome ? " app-main--home" : ""}`} id="main" style={{ flex: 1, ...(chromeless || isHome ? { paddingTop: 0 } : {}) }}>
        <Suspense fallback={<div style={{ textAlign: "center", padding: "64px 20px", color: "var(--mut)" }}>Loading…</div>}>
        <Routes>
          <Route path="/" element={<HomePage nav={nav("hero")} onNav={handleNav} />} />
          <Route path="/welcome" element={<LandingPage onLogin={openLogin} onRegister={openRegister} />} />
          <Route path="/feed" element={
            viewQ
              ? <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
                  <QuestionPage q={viewQ} onBack={() => setViewQ(null)} user={user} onLogin={promptLogin} toast={toast} />
                </div>
              : <FeedPage key={feedKey} user={user} onLogin={promptLogin} toast={toast} onViewQ={handleViewQ} />
          } />
          <Route path="/q/:id" element={<QuestionRoute user={user} onLogin={promptLogin} toast={toast} />} />
          <Route path="/sug" element={<StaffPage user={user} onLogin={promptLogin} toast={toast} />} />
          <Route path="/staff" element={<StaffPage user={user} onLogin={promptLogin} toast={toast} />} />
          <Route path="/apply" element={<ApplyPage toast={toast} />} />
          <Route path="/profile" element={<ProfilePage user={user} toast={toast} onUserUpdate={setUser} onLogin={openLogin} onLogout={handleLogout} />} />
          <Route path="/media" element={<LibraryPage user={user} onLogin={promptLogin} toast={toast} />} />
          <Route path="/library" element={<LibraryPage user={user} onLogin={promptLogin} toast={toast} />} />
          <Route path="/communities" element={<CommunitiesPage user={user} onLogin={promptLogin} toast={toast} />} />
          <Route path="/communities/:slug" element={<CommunityDetailPage user={user} onLogin={promptLogin} toast={toast} />} />
          <Route path="/ads" element={<AdsPage user={user} onLogin={promptLogin} toast={toast} />} />
          <Route path="/chats" element={<ChatsPage user={user} onLogin={promptLogin} toast={toast} />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={
            <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--mut)" }}>
              <h2 style={{ fontSize: 32, marginBottom: 12 }}>404</h2>
              <p style={{ marginBottom: 24 }}>{t("common.notFound")}</p>
              <button type="button" className="btn btn-pri" onClick={() => navigate("/")}><Ic n="home" s={15} c={T.navyD} />{t("common.goHome")}</button>
            </div>
          } />
        </Routes>
        </Suspense>
      </main>

      {!chromeless && page !== "chats" && <Footer />}
      {!chromeless && <BottomNav page={page} onNav={handleNav} onLogin={openLogin} user={user} />}

      <MobileDrawer
        open={drawerOpen} onClose={() => setDrawerOpen(false)}
        page={page} onNav={handleNav}
        user={user} onLogout={handleLogout}
        toggleTheme={toggleTheme} theme={theme} unread={unread}
      />

      {searchUserPopover && (
        <AuthorPopover
          userId={searchUserPopover.userId}
          viewer={user}
          toast={toast}
          onGuest={(a) => { setSearchUserPopover(null); promptLogin(a); }}
          onClose={() => setSearchUserPopover(null)}
        />
      )}

      {authOpen && (
        <AuthModal
          tab={authTab}
          initialResetToken={resetToken}
          onClose={() => { setAuthOpen(false); setResetToken(""); }}
          onSuccess={(u) => {
            markSeen();
            setUser(u);
            setAuthOpen(false);
            setResetToken("");
            refreshNotifs();
            syncLanguage(u);
            toast(u ? t("toast.welcomeBack", { name: u.name }) : t("toast.welcome"), "success");
            if (location.pathname === "/welcome") navigate("/", { replace: true });
          }}
        />
      )}
      {guestPrompt && (
        <GuestPrompt action={guestPrompt.action} onClose={() => setGuestPrompt(null)} onLogin={openLogin} onRegister={openRegister} />
      )}
      {quickAsk && (
        <QuickAskModal
          onClose={() => setQuickAsk(false)} user={user} onLogin={promptLogin} toast={toast}
          onPosted={() => { setFeedKey((k) => k + 1); if (location.pathname !== "/feed") navigate("/feed"); }}
        />
      )}
      {chatOpen && <ChatModal onClose={() => setChatOpen(false)} user={user} onLogin={promptLogin} />}
      {aiOpen && <AiAskModal onClose={() => setAiOpen(false)} />}
    </div>
  );
}
