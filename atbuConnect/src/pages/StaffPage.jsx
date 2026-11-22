import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import T from '../tokens';
import Ic from '../components/Ic';
import { Modal, Skel, Stars } from '../components/ui/shared';
import UserAvatar from '../components/ui/UserAvatar';
import CategoryPicker from '../components/CategoryPicker';
import { listStaff } from '../api/staff';
import { getSUGRatings, rateSUG } from '../api/users';
import { startConversation } from '../api/chat';
import { staffCatItems } from '../data';

/**
 * Meet the SUG — Vertical Swipeable Card Deck Carousel (inspired by SUG_CARD.mp4)
 * - Smooth vertical swiping (touch swipe, pointer drag, wheel, keyboard Up/Down, nav arrows)
 * - Partial visibility of previous & next adjacent cards peeking above/below with next-card preview
 * - Displays uploaded profile pictures consistently
 * - Distinct SUG Performance Profile modal with real 1–5 star rating system (school & Cenet performance)
 * - "Send a Message" opens real SUG Chat conversation
 */
function StaffPage({ user, onLogin, toast }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [deptF, setDeptF] = useState("All");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState([]);
  const [search, setSearch] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  // SUG Profile & Rating state
  const [ratingData, setRatingData] = useState(null);
  const [myScore, setMyScore] = useState(0);
  const [hoverScore, setHoverScore] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingBusy, setRatingBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);

  const startY = useRef(0);
  const wheelLock = useRef(0);

  useEffect(() => {
    if (!user) { setStaff([]); setLoading(false); return; }
    setLoading(true);
    listStaff()
      .then((s) => {
        setStaff(s);
        setLoading(false);
        const selId = searchParams.get("selected");
        if (selId) {
          const idx = s.findIndex((x) => String(x.id) === String(selId));
          if (idx >= 0) {
            setActiveIdx(idx);
            setSelected(s[idx]);
          }
        }
      })
      .catch(() => {
        toast("Could not load the SUG directory.", "error");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = staff.filter((s) => {
    const dOk = deptF === "All" || s.dept === deptF;
    const q = search.toLowerCase();
    const sOk =
      s.name.toLowerCase().includes(q) ||
      (s.role || "").toLowerCase().includes(q) ||
      (s.username || "").toLowerCase().includes(q);
    return dOk && sOk;
  });

  useEffect(() => {
    if (activeIdx >= filtered.length && filtered.length > 0) {
      setActiveIdx(0);
    }
  }, [filtered.length, activeIdx]);

  // Load detailed SUG performance ratings when opening an SUG profile
  useEffect(() => {
    if (!selected) { setRatingData(null); setMyScore(0); setRatingComment(""); return; }
    let live = true;
    getSUGRatings(selected.id)
      .then((d) => {
        if (!live) return;
        setRatingData(d);
        setMyScore(d.my_rating?.score || 0);
        setRatingComment(d.my_rating?.comment || "");
      })
      .catch(() => {});
    return () => { live = false; };
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepTo = (next) => {
    if (!filtered.length) return;
    const clamped = Math.max(0, Math.min(filtered.length - 1, next));
    setActiveIdx(clamped);
  };

  // Pointer / touch vertical swipe handlers
  const onPointerDown = (e) => {
    if (e.target.closest("button")) return;
    startY.current = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    setDragging(true);
    setDragY(0);
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    const y = e.clientY ?? e.touches?.[0]?.clientY ?? startY.current;
    setDragY(Math.max(-160, Math.min(160, y - startY.current)));
  };
  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (dragY < -48 && activeIdx < filtered.length - 1) stepTo(activeIdx + 1);
    else if (dragY > 48 && activeIdx > 0) stepTo(activeIdx - 1);
    setDragY(0);
  };

  const onWheel = (e) => {
    const now = Date.now();
    if (now - wheelLock.current < 360) return;
    if (Math.abs(e.deltaY) < 22) return;
    if (e.deltaY > 0 && activeIdx < filtered.length - 1) {
      wheelLock.current = now;
      stepTo(activeIdx + 1);
    } else if (e.deltaY < 0 && activeIdx > 0) {
      wheelLock.current = now;
      stepTo(activeIdx - 1);
    }
  };

  const submitRating = async () => {
    if (!user) { onLogin("rate SUG representatives"); return; }
    if (!selected) return;
    if (myScore < 1 || myScore > 5) { toast("Select a 1 to 5 star performance rating", "error"); return; }
    setRatingBusy(true);
    try {
      const res = await rateSUG(selected.id, myScore, ratingComment.trim());
      toast("Performance rating saved!", "success");
      setStaff((prev) =>
        prev.map((x) => (x.id === selected.id ? { ...x, sugRating: res.sug_rating, sugRatingsCount: res.sug_ratings_count, mySugRating: myScore } : x)),
      );
      setSelected((prev) => (prev ? { ...prev, sugRating: res.sug_rating, sugRatingsCount: res.sug_ratings_count, mySugRating: myScore } : prev));
      const fresh = await getSUGRatings(selected.id);
      setRatingData(fresh);
    } catch (e) {
      toast(e.message || "Could not submit your rating.", "error");
    } finally { setRatingBusy(false); }
  };

  const openSugChat = async (rep) => {
    if (!user) { onLogin("message an SUG representative"); return; }
    setChatBusy(true);
    try {
      const convo = await startConversation(rep.id);
      setSelected(null);
      navigate(`/chats?c=${convo.id}`);
    } catch (e) {
      toast(e.message || "Could not start SUG chat.", "error");
    } finally { setChatBusy(false); }
  };

  const renderCardSlot = (s, offset) => {
    // offset: -1 (previous peeking above), 0 (active center), 1 (next peeking below), 2 (far preview)
    const isCenter = offset === 0;
    const translatePx = offset * 285 + (dragging ? dragY * (isCenter ? 0.65 : 0.45) : 0);
    const scale = isCenter ? 1 : offset === 1 || offset === -1 ? 0.91 : 0.84;
    const opacity = isCenter ? 1 : offset === 1 || offset === -1 ? 0.62 : 0.25;
    const zIndex = isCenter ? 10 : offset === 1 || offset === -1 ? 6 : 2;
    const avgScore = s.sugRatingsCount > 0 ? s.sugRating : s.rating;

    return (
      <article
        key={s.id}
        className={`sug-deck-card${isCenter ? " active" : ""}`}
        style={{
          transform: `translateY(${translatePx}px) scale(${scale})`,
          opacity,
          zIndex,
          transition: dragging ? "none" : "transform .46s cubic-bezier(.22,1.12,.36,1), opacity .36s ease",
        }}
        onClick={() => {
          if (offset === -1) stepTo(activeIdx - 1);
          else if (offset === 1) stepTo(activeIdx + 1);
          else setSelected(s);
        }}
      >
        <div className="sug-deck-banner">
          <span className="sug-deck-badge"><Ic n="shield" s={12} c="#93C5FD" /> Verified SUG</span>
          <span className="sug-deck-dept">{s.dept}</span>
        </div>

        <div className="sug-deck-body">
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
            <UserAvatar src={s.avatarUrl} av={s.av} bg={s.bg} size={74} online={s.online} border="4px solid var(--surf)" />
            <div style={{ minWidth: 0, textAlign: "left", flex: 1 }}>
              <h3 style={{ fontSize: 19, fontFamily: "'DM Sans',sans-serif", fontWeight: 800, marginBottom: 2 }}>{s.name}</h3>
              {s.username && <div style={{ fontSize: 12.5, color: "var(--accent)", fontWeight: 700, marginBottom: 2 }}>@{s.username}</div>}
              <div style={{ fontSize: 13, color: "var(--mut)" }}>{s.role || "SUG Representative"}</div>
            </div>
          </div>

          {s.bio && (
            <p style={{ fontSize: 13.5, color: "var(--mut)", lineHeight: 1.55, marginBottom: 14, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textAlign: "left" }}>
              {s.bio}
            </p>
          )}

          <div className="sug-deck-stats">
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <Stars r={avgScore} />
              </div>
              <span>{s.sugRatingsCount > 0 ? `${s.sugRating}/5 (${s.sugRatingsCount} ratings)` : "Not rated yet"}</span>
            </div>
            <div>
              <strong>{s.answers}</strong>
              <span>Answers on Cenet</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button type="button" className="btn btn-navy" style={{ flex: 1, height: 42 }} onClick={(e) => { e.stopPropagation(); setSelected(s); }}>
              View Profile &amp; Rate
            </button>
            <button type="button" className="btn btn-out" style={{ height: 42, padding: "0 16px" }} onClick={(e) => { e.stopPropagation(); openSugChat(s); }}>
              <Ic n="chat" s={15} /> Message
            </button>
          </div>
        </div>
      </article>
    );
  };

  if (!user) {
    return (
      <div style={{ flex: 1, minWidth: 0, maxWidth: 680, margin: "0 auto", padding: "28px 16px 40px" }}>
        <div className="raised lib-empty fu">
          <Ic n="lock" s={42} c="var(--accent)" />
          <h2>Sign in to Meet the SUG</h2>
          <p>
            The verified SUG directory, performance ratings, and direct SUG messaging are available to registered
            CampusNetwork (Cenet) students.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
            <button type="button" className="btn btn-navy" onClick={() => onLogin("view the SUG directory")}>
              Sign In
            </button>
            <Link to="/apply" className="btn btn-out">
              Apply for SUG Access
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minWidth: 0, maxWidth: 960, margin: "0 auto", padding: "12px 16px 32px" }} className="staff-wrap">
      <div className="fu" style={{ margin: "6px 0 18px" }}>
        <h2 style={{ fontSize: 28, marginBottom: 4 }}>Meet the SUG</h2>
        <p style={{ fontSize: 14, color: "var(--mut)" }}>
          Verified SUG representatives on CampusNetwork (Cenet). Swipe vertically to explore officials, rate their campus &amp; Cenet performance, or message them directly.{" "}
          <Link to="/apply" style={{ color: "var(--accent)", fontWeight: 700 }}>Apply for SUG Access</Link>.
        </p>
      </div>

      <div className="fu" style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <input className="inp" placeholder="Search SUG by name, @username, or office…" value={search} onChange={(e) => { setSearch(e.target.value); setActiveIdx(0); }} style={{ paddingLeft: 38 }} />
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--faint)" }}><Ic n="search" s={15} /></span>
        </div>
        <div style={{ position: "relative", zIndex: 50 }}>
          <CategoryPicker items={staffCatItems} value={deptF} onChange={(v) => { setDeptF(v || "All"); setActiveIdx(0); }} placeholder="All Departments" />
        </div>
      </div>

      {loading ? (
        <div className="raised" style={{ padding: 28, maxWidth: 480, margin: "24px auto", textAlign: "center" }}>
          <div className="skel" style={{ width: 74, height: 74, borderRadius: "50%", margin: "0 auto 14px" }} />
          <Skel h={16} w="60%" mb={8} /><Skel h={12} w="45%" mb={0} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="raised" style={{ padding: 44, textAlign: "center", color: "var(--mut)" }}>
          <Ic n="users" s={38} c="var(--faint)" />
          <h3 style={{ margin: "10px 0 6px" }}>No SUG representatives found</h3>
          <p style={{ fontSize: 14 }}>Try clearing your search or department filter.</p>
        </div>
      ) : (
        <div className="sug-deck-layout">
          {/* Vertical Swipeable Carousel Deck */}
          <div
            className="sug-deck-stage"
            tabIndex={0}
            aria-label="Swipeable SUG representatives carousel"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); stepTo(activeIdx + 1); }
              if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); stepTo(activeIdx - 1); }
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {filtered.map((s, idx) => {
              const offset = idx - activeIdx;
              if (Math.abs(offset) > 2) return null;
              return renderCardSlot(s, offset);
            })}
          </div>

          {/* Right/Bottom Carousel Controls & Next-Card Preview Indicator */}
          <div className="sug-deck-controls">
            <button type="button" className="sug-nav-btn" onClick={() => stepTo(activeIdx - 1)} disabled={activeIdx === 0} aria-label="Previous SUG representative">
              <Ic n="up" s={18} />
            </button>
            <div className="sug-deck-dots" role="tablist" aria-label="SUG representatives">
              {filtered.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === activeIdx}
                  aria-label={s.name}
                  className={i === activeIdx ? "on" : ""}
                  onClick={() => stepTo(i)}
                />
              ))}
            </div>
            <button type="button" className="sug-nav-btn" onClick={() => stepTo(activeIdx + 1)} disabled={activeIdx >= filtered.length - 1} aria-label="Next SUG representative">
              <Ic n="down" s={18} />
            </button>
            <span className="sug-deck-counter">{activeIdx + 1} / {filtered.length}</span>
          </div>
        </div>
      )}

      {/* Distinct SUG Representative Performance Profile Modal */}
      {selected && (
        <Modal onClose={() => setSelected(null)} maxW={560} showClose label={`${selected.name} SUG Profile`}>
          <div style={{ background: `linear-gradient(135deg,${T.navy},${T.navyL})`, padding: "28px 24px 22px", color: "#fff" }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <UserAvatar src={selected.avatarUrl} av={selected.av} bg={selected.bg} size={76} online={selected.online} border="3px solid rgba(255,255,255,.35)" />
              <div style={{ minWidth: 0 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .5, padding: "3px 10px", borderRadius: 99, background: "rgba(96,165,250,.22)", color: "#BFDBFE", marginBottom: 6 }}>
                  <Ic n="shield" s={11} c="#93C5FD" /> Verified SUG Official
                </span>
                <h2 style={{ fontSize: 22, color: "#fff", marginBottom: 2 }}>{selected.name}</h2>
                <div style={{ fontSize: 13.5, color: "rgba(255,255,255,.8)" }}>
                  {selected.role} · {selected.dept}{selected.username ? ` · @${selected.username}` : ""}
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: 22 }}>
            {/* Performance Rating Overview Card */}
            <div className="sug-rating-box">
              <div className="sug-rating-big">
                <strong>{ratingData?.sug_ratings_count ? ratingData.sug_rating.toFixed(1) : "—"}</strong>
                <Stars r={ratingData?.sug_rating || 0} />
                <span>{ratingData?.sug_ratings_count || 0} student performance rating{(ratingData?.sug_ratings_count || 0) === 1 ? "" : "s"}</span>
              </div>
              <div className="sug-rating-bars">
                {[5, 4, 3, 2, 1].map((st) => {
                  const cnt = ratingData?.breakdown?.[String(st)] || 0;
                  const total = ratingData?.sug_ratings_count || 1;
                  const pct = ratingData?.sug_ratings_count ? Math.round((cnt / total) * 100) : 0;
                  return (
                    <div key={st} className="sug-rbar-row">
                      <span>{st}★</span>
                      <div className="sug-rbar-track"><div style={{ width: `${pct}%` }} /></div>
                      <small>{cnt}</small>
                    </div>
                  );
                })}
              </div>
            </div>

            {selected.bio && (
              <div style={{ padding: 14, background: "var(--surfH)", borderRadius: 14, marginBottom: 16, fontSize: 13.5, lineHeight: 1.65, color: "var(--mut)" }}>
                {selected.bio}
              </div>
            )}

            {/* Interactive Student Performance Rating Form */}
            {(!user || user.id !== selected.id) && (
              <div className="sug-rate-form">
                <h4 style={{ fontSize: 14.5, fontFamily: "'DM Sans',sans-serif", fontWeight: 800, marginBottom: 4 }}>
                  Rate {selected.name.split(" ")[0]}&apos;s Performance (School &amp; CampusNetwork)
                </h4>
                <p style={{ fontSize: 12.5, color: "var(--mut)", marginBottom: 10 }}>
                  Rate based on responsiveness, leadership on campus, and engagement on CampusNetwork.
                </p>
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onMouseEnter={() => setHoverScore(n)}
                      onMouseLeave={() => setHoverScore(0)}
                      onClick={() => setMyScore(n)}
                      aria-label={`Rate ${n} out of 5 stars`}
                      style={{ fontSize: 28, lineHeight: 1, color: (hoverScore || myScore) >= n ? "#F59E0B" : "var(--brdS)", transition: "transform .12s" }}
                    >
                      ★
                    </button>
                  ))}
                  {myScore > 0 && <span style={{ alignSelf: "center", fontSize: 13, fontWeight: 700, color: "var(--accent)", marginLeft: 6 }}>{myScore}/5</span>}
                </div>
                <textarea
                  className="inp"
                  style={{ minHeight: 68, marginBottom: 10 }}
                  placeholder="Optional feedback on their campus & Cenet performance…"
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  maxLength={500}
                />
                <button type="button" className="btn btn-pri" style={{ height: 40 }} onClick={submitRating} disabled={ratingBusy}>
                  {ratingBusy ? "Saving…" : ratingData?.my_rating ? "Update My Rating" : "Submit Rating"}
                </button>
              </div>
            )}

            {/* Recent Performance Reviews */}
            {ratingData?.reviews?.length > 0 && (
              <div style={{ marginTop: 16, marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: .5, color: "var(--faint)", marginBottom: 8 }}>Recent Ratings</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 170, overflowY: "auto" }}>
                  {ratingData.reviews.slice(0, 6).map((rev) => (
                    <div key={rev.id} style={{ padding: "10px 12px", borderRadius: 12, background: "var(--surfH)", fontSize: 13 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <strong>{rev.rater?.name} <span style={{ color: "var(--faint)", fontWeight: 500 }}>@{rev.rater?.username}</span></strong>
                        <span style={{ color: "#F59E0B", fontWeight: 800 }}>{"★".repeat(rev.score)}</span>
                      </div>
                      {rev.comment && <p style={{ color: "var(--mut)", lineHeight: 1.5 }}>{rev.comment}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contact + Send a Message to SUG (wired to real Chat!) */}
            {(selected.email || selected.phone) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[{ ic: "mail", label: "Email", val: selected.email }, { ic: "phone", label: "Phone", val: selected.phone }]
                  .filter((x) => x.val)
                  .map(({ ic, label, val }) => (
                    <div key={label} style={{ padding: 12, background: "var(--surfA)", borderRadius: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, color: "var(--faint)", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase" }}>
                        <Ic n={ic} s={12} />{label}
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, overflowWrap: "anywhere" }}>{val}</div>
                    </div>
                  ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="btn btn-navy" style={{ flex: 1 }} onClick={() => openSugChat(selected)} disabled={chatBusy}>
                <Ic n="chat" s={15} />{chatBusy ? "Opening chat…" : "Send a Message to SUG"}
              </button>
              <button type="button" className="btn btn-out" onClick={() => {
                navigator.clipboard?.writeText(`${window.location.origin}/sug?selected=${selected.id}`);
                toast("SUG profile link copied!", "success");
              }}>
                <Ic n="link" s={15} />Share
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default StaffPage;
