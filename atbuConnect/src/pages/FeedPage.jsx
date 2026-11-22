import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import T from '../tokens';
import Ic from '../components/Ic';
import { Skel, Modal } from '../components/ui/shared';
import QuestionCard from '../components/feed/QuestionCard';
import AuthorPopover from '../components/feed/AuthorPopover';
import AdCard from '../components/ads/AdCard';
import QuickAskModal from '../modals/QuickAskModal';
import { useI18n } from '../i18n';
import CategoryPicker from '../components/CategoryPicker';
import {
  listQuestionsPage, listTrendingTopics, voteQuestion, likeQuestion, bookmarkQuestion, deleteQuestion,
} from '../api/questions';
import { listDepartments } from '../api/departments';
import { serveAds } from '../api/ads';

function LeftSidebarTopics({ topicF, setTopicF, depts, stats }) {
  const scrollRef = useRef(null);
  const [canUp, setCanUp] = useState(false);
  const [canDown, setCanDown] = useState(true);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanUp(el.scrollTop > 8);
    setCanDown(el.scrollTop < el.scrollHeight - el.clientHeight - 8);
  };

  const scrollBy = (dir) => {
    scrollRef.current?.scrollBy({ top: dir * 120, behavior: "smooth" });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    return () => el.removeEventListener("scroll", checkScroll);
  }, []);

  const allTopics = [{ name: "All Questions", color: T.gold, count: stats.questions }, ...depts];

  return (
    <div className="card" style={{ position: "relative", display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 120px)" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--brd)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, color: "var(--faint)" }}>Browse Topics</span>
        <button type="button" onClick={() => setTopicF("All")} style={{ fontSize: 12, color: T.gold, fontWeight: 600, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>Clear</button>
      </div>

      <button type="button" onClick={() => scrollBy(-1)} aria-label="Scroll topics up" style={{
        width: "100%", padding: "5px 0", background: canUp ? "var(--surfH)" : "transparent",
        border: "none", borderBottom: "1px solid var(--brd)", cursor: canUp ? "pointer" : "default",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: canUp ? T.gold : "var(--brd)", transition: "all .18s", flexShrink: 0,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15" /></svg>
      </button>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3, scrollbarWidth: "thin" }}>
        {allTopics.map((d) => {
          const key = d.name === "All Questions" ? "All" : d.name;
          const isOn = topicF === key;
          return (
            <button key={d.name} type="button" onClick={() => setTopicF(key)}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                background: isOn ? "rgba(59,130,246,.15)" : "transparent", color: isOn ? T.gold : "var(--mut)",
                fontWeight: isOn ? 600 : 400, fontSize: 14, transition: "all .15s", fontFamily: "inherit", width: "100%", textAlign: "left",
              }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, display: "inline-block", flexShrink: 0 }} />
                {d.name}
              </span>
              <span style={{ fontSize: 11, background: "var(--surfA)", padding: "2px 8px", borderRadius: 10, color: "var(--faint)" }}>{d.count}</span>
            </button>
          );
        })}

        <div style={{ marginTop: 12, borderTop: "1px solid var(--brd)", paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, color: "var(--faint)", padding: "0 4px 10px" }}>Community Stats</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)" }}>
            {[[stats.questions, "Posts"], [stats.answers, "Ans"], [stats.staff, "SUG"]].map(([v, l], i) => (
              <div key={l} style={{ textAlign: "center", borderRight: i < 2 ? "1px solid var(--brd)" : undefined, padding: "0 6px" }}>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Playfair Display',serif" }}>{v}</div>
                <div style={{ fontSize: 10, color: "var(--faint)", textTransform: "uppercase", letterSpacing: .5, marginTop: 3 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button type="button" onClick={() => scrollBy(1)} aria-label="Scroll topics down" style={{
        width: "100%", padding: "5px 0", background: canDown ? "var(--surfH)" : "transparent",
        border: "none", borderTop: "1px solid var(--brd)", cursor: canDown ? "pointer" : "default",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: canDown ? T.gold : "var(--brd)", transition: "all .18s", flexShrink: 0,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
    </div>
  );
}

function FeedPage({ user, onLogin, toast, onViewQ }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("Trending");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [topicF, setTopicF] = useState(searchParams.get("topic") || "All");
  const discovery = searchParams.get("discovery") || "";
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [qs, setQs] = useState([]);
  const [totalQuestions, setTotalQuestions] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [depts, setDepts] = useState([]);
  const [trendingTopics, setTrendingTopics] = useState([]);
  const [feedAds, setFeedAds] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [author, setAuthor] = useState(null);      // { userId?, username?, anchor }
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const req = useRef(0);

  useEffect(() => {
    const urlTopic = searchParams.get("topic");
    if (urlTopic && urlTopic !== topicF) setTopicF(urlTopic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const loadFeed = (pg = 1) => {
    const id = ++req.current;
    if (pg === 1) { setLoading(true); setError(false); } else setLoadingMore(true);
    listQuestionsPage({ filter, topic: topicF, discovery, page: pg })
      .then(({ items, hasMore: more, count }) => {
        if (id !== req.current) return;
        setQs((p) => (pg === 1 ? items : [...p, ...items]));
        if (pg === 1 && topicF === "All" && !discovery && filter !== "Answered") {
          setTotalQuestions(count);
        }
        setHasMore(more);
        setPage(pg);
      })
      .catch(() => { if (id === req.current) { setError(true); if (pg === 1) setQs([]); } })
      .finally(() => { if (id === req.current) { setLoading(false); setLoadingMore(false); } });
  };

  useEffect(() => { loadFeed(1); }, [filter, topicF, discovery, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    listDepartments().then(setDepts).catch(() => {});
    listTrendingTopics().then(setTrendingTopics).catch(() => {});
  }, []);
  useEffect(() => {
    if (user?.hideAds) { setFeedAds([]); return; }
    serveAds("feed").then(setFeedAds).catch(() => setFeedAds([]));
  }, [user?.hideAds]);

  const allPostCount = totalQuestions ?? depts.reduce((sum, d) => sum + (Number(d.count) || 0), 0);
  const stats = {
    questions: allPostCount,
    answers: qs.reduce((n, q) => n + q.ans, 0),
    staff: depts.length ? new Set(qs.filter((q) => q.staff).map((q) => q.user)).size : 0,
  };
  const dynamicCatItems = [
    { value: "All", label: "All Questions", dot: T.gold, count: String(allPostCount) },
    ...depts.map((d) => ({
      value: d.name,
      label: d.name,
      dot: d.color || T.gold,
      count: String(d.count ?? 0),
    })),
  ];

  const guard = (action) => { if (!user) { onLogin(t(action)); return false; } return true; };

  const handleLike = (id) => {
    if (!guard("guest.actions.like")) return;
    setQs((p) => p.map((q) => (q.id === id ? { ...q, liked: !q.liked, likes: q.liked ? q.likes - 1 : q.likes + 1 } : q)));
    likeQuestion(id).catch(() => { toast(t("feed.err.like"), "error"); loadFeed(1); });
  };

  const handleVote = (id, dir) => {
    if (!guard("guest.actions.vote")) return;
    setQs((p) => p.map((q) => {
      if (q.id !== id) return q;
      const prev = q.voted;
      if (prev === dir) return { ...q, voted: null, votes: q.votes + (dir === "up" ? -1 : 1) };
      const delta = (dir === "up" ? 1 : -1) - (prev === "up" ? 1 : prev === "down" ? -1 : 0);
      return { ...q, voted: dir, votes: q.votes + delta };
    }));
    voteQuestion(id, dir).catch(() => { toast(t("feed.err.vote"), "error"); loadFeed(1); });
  };

  const handleBookmark = (id) => {
    if (!guard("guest.actions.save")) return;
    const cur = qs.find((q) => q.id === id);
    setQs((p) => p.map((q) => (q.id === id ? { ...q, saved: !q.saved } : q)));
    toast(cur?.saved ? t("feed.removedSaved") : t("feed.savedOk"), "success");
    bookmarkQuestion(id).catch(() => { toast(t("feed.err.save"), "error"); loadFeed(1); });
  };

  const confirmDelete = async () => {
    if (!toDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteQuestion(toDelete.id);
      setQs((p) => p.filter((q) => q.id !== toDelete.id));
      toast(t("feed.deleted"), "success");
      setToDelete(null);
    } catch (e) {
      toast(e.message || t("feed.err.delete"), "error");
      setToDelete(null);
      loadFeed(1);
    } finally { setDeleting(false); }
  };

  const openAuthor = (id, anchor) => setAuthor({ userId: id, anchor });
  const openMention = (handle, anchor) => setAuthor({ username: handle, anchor });
  const toggleExpand = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const clearDiscovery = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("discovery");
    setSearchParams(next);
  };

  const pickDiscovery = (phrase) => {
    const next = new URLSearchParams(searchParams);
    next.set("discovery", phrase);
    setSearchParams(next);
  };

  return (
    <div style={{ display: "flex", gap: 24, width: "100%", minWidth: 0, maxWidth: 1280, margin: "0 auto", padding: "18px clamp(14px,2.5vw,28px) 28px" }} className="feed-wrap">
      <aside className="lsb">
        <LeftSidebarTopics topicF={topicF} setTopicF={setTopicF} depts={depts} stats={stats} />
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        {discovery && (
          <div className="raised fu" style={{ padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              <Ic n="trending" s={15} c="var(--accent)" />
              <span>Showing discussions related to <strong>“{discovery}”</strong></span>
            </div>
            <button type="button" className="btn btn-out" style={{ height: 32, minHeight: 32, padding: "0 12px", fontSize: 12 }} onClick={clearDiscovery}>
              Clear topic
            </button>
          </div>
        )}

        <div className="feed-filter-bar fu fu2" style={{ display: "flex", gap: 8, marginBottom: 18, alignItems: "center", flexWrap: "wrap", position: "relative", zIndex: 50 }}>
          <div className="mob-only-cat">
            <CategoryPicker items={dynamicCatItems} value={topicF} onChange={(v) => setTopicF(v || "All")} placeholder="All Questions" />
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "4px 4px 8px", flex: 1, minWidth: 0, maxWidth: "100%" }}>
            {[["Trending", "feed.f.trending"], ["Most Recent", "feed.f.recent"], ["Unanswered", "feed.f.unanswered"], ["Answered", "feed.f.answered"]].map(([f, k]) => (
              <button key={f} type="button" className={`pill${filter === f ? " on" : ""}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>{t(k)}</button>
            ))}
          </div>
        </div>

        {loading && [1, 2, 3].map((i) => (
          <div key={i} className="fcard"><div style={{ display: "flex", gap: 12, marginBottom: 14 }}><div className="skel" style={{ width: 46, height: 46, borderRadius: "50%", flexShrink: 0 }} /><div style={{ flex: 1 }}><Skel h={13} w="40%" mb={8} /><Skel h={11} w="25%" mb={0} /></div></div><Skel h={18} w="75%" mb={10} /><Skel h={12} mb={8} /><Skel h={12} w="90%" /></div>
        ))}

        {!loading && error && (
          <div className="fcard" style={{ textAlign: "center", padding: "40px 20px" }} role="alert">
            <h3 style={{ marginBottom: 8 }}>{t("feed.err.load")}</h3>
            <p style={{ color: "var(--mut)", marginBottom: 16, fontSize: 14 }}>{t("common.checkConnection")}</p>
            <button type="button" className="btn btn-pri" onClick={() => loadFeed(1)}>{t("common.retry")}</button>
          </div>
        )}

        {!loading && !error && qs.length === 0 && (
          <div className="fcard" style={{ textAlign: "center", padding: "44px 20px" }}>
            <Ic n="msg" s={36} c="var(--faint)" />
            <h3 style={{ margin: "12px 0 6px" }}>{t("feed.empty")}</h3>
            <p style={{ color: "var(--mut)", fontSize: 14 }}>{t("feed.emptyHint")}</p>
          </div>
        )}

        {!loading && qs.map((q, i) => (
          <div key={q.id}>
            <QuestionCard
              q={q} index={i} expanded={!!expanded[q.id]} toast={toast}
              onToggle={toggleExpand} onVote={handleVote} onLike={handleLike} onSave={handleBookmark}
              onOpen={onViewQ} onTag={setTopicF} onAuthor={openAuthor} onMention={openMention}
              onEdit={setEditing} onDelete={setToDelete}
            />
            {!user?.hideAds && feedAds.length > 0 && (i + 1) % 4 === 0 && (
              <div style={{ marginBottom: 16 }}>
                <AdCard ad={feedAds[Math.floor(i / 4) % feedAds.length]} placement="feed" />
              </div>
            )}
          </div>
        ))}

        {!loading && hasMore && (
          <div style={{ textAlign: "center", margin: "8px 0 24px" }}>
            <button type="button" className="btn btn-out" onClick={() => loadFeed(page + 1)} disabled={loadingMore} aria-busy={loadingMore}>
              {loadingMore ? t("common.loading") : t("common.loadMore")}
            </button>
          </div>
        )}
      </main>

      {/* Right sidebar: Topic-Based Trending Discovery */}
      <aside className="rsb">
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--brd)", display: "flex", alignItems: "center", gap: 6 }}>
            <Ic n="trending" s={14} c="var(--accent)" />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, color: "var(--faint)" }}>{t("feed.trendingNow")}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px 18px" }}>
            {trendingTopics.length === 0 && <p style={{ fontSize: 12, color: "var(--faint)" }}>{t("feed.noTrending")}</p>}
            {trendingTopics.map((item) => (
              <button key={item.id} type="button" onClick={() => pickDiscovery(item.discovery || item.title)} style={{ display: "flex", gap: 12, textAlign: "left", padding: "4px 0", cursor: "pointer", color: "var(--txt)" }}>
                <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, flexShrink: 0, color: "var(--accent)" }}>{item.n}</span>
                <span>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 4 }}>{item.title}</span>
                  <span style={{ fontSize: 11, color: "var(--mut)" }}>{item.dept} · {item.answers} answers · Explore topic</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: `linear-gradient(145deg,${T.navy},${T.navyD})`, borderRadius: "var(--r-lg)", padding: 24, textAlign: "center", color: "#fff", position: "relative", overflow: "hidden", boxShadow: "var(--sh-2)" }}>
          <div style={{ width: 48, height: 48, background: "rgba(2,8,23,.4)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: T.gold, boxShadow: "inset 0 2px 6px rgba(2,8,23,.6)" }}><Ic n="cap" s={22} /></div>
          <h3 style={{ fontSize: 16, marginBottom: 8, color: "#fff" }}>{t("feed.sugPromoTitle")}</h3>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,.75)", marginBottom: 18, lineHeight: 1.5 }}>{t("feed.sugPromoBody")}</p>
          <button type="button" className="btn btn-pri" style={{ width: "100%" }} onClick={() => navigate("/apply")}>{t("sug.apply")}</button>
        </div>
      </aside>

      {author && (
        <AuthorPopover
          userId={author.userId}
          username={author.username}
          anchor={author.anchor}
          viewer={user}
          toast={toast}
          onGuest={(a) => { setAuthor(null); onLogin(a); }}
          onClose={() => setAuthor(null)}
        />
      )}

      {editing && (
        <QuickAskModal
          editingQuestion={editing}
          user={user}
          onLogin={onLogin}
          toast={toast}
          onClose={() => setEditing(null)}
          onPosted={(updated) => {
            if (updated) setQs((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
          }}
        />
      )}

      {toDelete && (
        <Modal onClose={() => !deleting && setToDelete(null)} maxW={420} label={t("feed.deleteTitle")} dismissible={!deleting} showClose>
          <div style={{ padding: "30px 24px 24px" }}>
            <h3 style={{ fontSize: 20, marginBottom: 8, paddingRight: 36 }}>{t("feed.deleteTitle")}</h3>
            <p style={{ color: "var(--mut)", fontSize: 14.5, lineHeight: 1.6, marginBottom: 6, overflowWrap: "anywhere" }}>“{toDelete.title}”</p>
            <p style={{ color: "var(--mut)", fontSize: 13.5, marginBottom: 20 }}>
              {user?.isVerifiedStudent ? "This post will be permanently deleted." : t("feed.deleteBody")}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-out" onClick={() => setToDelete(null)} disabled={deleting} data-autofocus>{t("common.cancel")}</button>
              <button type="button" className="btn" style={{ background: "#DC2626", color: "#fff" }} onClick={confirmDelete} disabled={deleting} aria-busy={deleting}>
                {deleting ? t("common.deleting") : t("feed.delete")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default FeedPage;
