import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import Ic from "../components/Ic";
import UserAvatar from "../components/ui/UserAvatar";
import { Modal } from "../components/ui/shared";
import {
  listConversations, startConversation, getMessages, sendMessage,
  toggleSaveChatMessage, listSavedChatQuestions,
} from "../api/chat";
import { listStaff } from "../api/staff";
import { formatBytes } from "../api/library";

/**
 * MODULE 4: SUG Chat System (inspired by SUG CHAT reference).
 * Strictly for authenticated students <-> verified SUG representatives/staff.
 * Includes alternating rounded pill bubbles, avatars, file attachments, read status,
 * AND saving important questions directly within chat threads.
 */
export default function ChatsPage({ user, onLogin, toast }) {
  const [params, setParams] = useSearchParams();
  const activeId = params.get("c") ? Number(params.get("c")) : null;

  const [tab, setTab] = useState("chats"); // chats | saved
  const [convos, setConvos] = useState([]);
  const [savedItems, setSavedItems] = useState([]);
  const [search, setSearch] = useState("");
  const [messages, setMessages] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [sending, setSending] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [sugList, setSugList] = useState([]);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);

  const loadConvos = useCallback(() => {
    if (!user) return;
    listConversations({ search })
      .then((list) => { setConvos(list); setLoadingList(false); })
      .catch(() => setLoadingList(false));
  }, [user, search]);

  useEffect(() => {
    const t = setTimeout(loadConvos, search ? 220 : 0);
    return () => clearTimeout(t);
  }, [loadConvos, search]);

  useEffect(() => {
    if (!user || tab !== "saved") return;
    listSavedChatQuestions().then(setSavedItems).catch(() => {});
  }, [user, tab]);

  const loadMsgs = useCallback((cid, silent = false) => {
    if (!cid || !user) return;
    if (!silent) setLoadingMsgs(true);
    getMessages(cid)
      .then((list) => {
        setMessages(list);
        if (!silent) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
      })
      .catch(() => {})
      .finally(() => { if (!silent) setLoadingMsgs(false); });
  }, [user]);

  useEffect(() => {
    if (!activeId || !user) { setMessages([]); return; }
    loadMsgs(activeId, false);
    const interval = setInterval(() => {
      if (!document.hidden) {
        loadMsgs(activeId, true);
        loadConvos();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [activeId, user, loadMsgs, loadConvos]);

  if (!user) {
    return (
      <div className="comm-page">
        <div className="raised lib-empty fu">
          <Ic n="chat" s={42} c="var(--accent)" />
          <h2>SUG Direct Messages</h2>
          <p>Sign in to message verified SUG representatives and save important Q&amp;As from your chats.</p>
          <button type="button" className="btn btn-navy" onClick={() => onLogin("open SUG chats")}>Sign In</button>
        </div>
      </div>
    );
  }

  const activeConvo = convos.find((c) => c.id === activeId) || null;

  const openPicker = () => {
    setPickerOpen(true);
    if (!sugList.length) listStaff().then(setSugList).catch(() => {});
  };

  const pickSug = async (rep) => {
    try {
      const convo = await startConversation(rep.id);
      setPickerOpen(false);
      setParams({ c: String(convo.id) });
      loadConvos();
    } catch (e) { toast(e.message || "Could not start conversation.", "error"); }
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!activeId || sending) return;
    if (!text.trim() && !attachment) return;
    setSending(true);
    try {
      const created = await sendMessage(activeId, { body: text.trim(), attachment });
      setMessages((prev) => [...prev, created]);
      setText("");
      setAttachment(null);
      loadConvos();
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    } catch (err) {
      toast(err.message || "Could not send message.", "error");
    } finally { setSending(false); }
  };

  const handleToggleSave = async (msg) => {
    try {
      const res = await toggleSaveChatMessage(msg.id);
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, saved: res.saved } : m)));
      toast(res.saved ? "Saved question from chat!" : "Removed from saved chat questions", "success");
    } catch { toast("Could not save message.", "error"); }
  };

  return (
    <div className="chat-shell">
      <div className={`chat-layout raised${activeId ? " has-active" : ""}`}>
        {/* LEFT PANE: Conversations & Saved Chat Questions */}
        <aside className="chat-side">
          <div className="chat-side-head">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h1 style={{ fontSize: 20 }}>SUG Chats</h1>
              <button type="button" className="btn btn-navy" style={{ height: 34, minHeight: 34, padding: "0 12px", fontSize: 12.5 }} onClick={openPicker}>
                <Ic n="plus" s={14} /> Message SUG
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <button type="button" className={`pill${tab === "chats" ? " on" : ""}`} style={{ flex: 1, minHeight: 32, padding: "4px 10px", fontSize: 12.5 }} onClick={() => setTab("chats")}>
                Conversations
              </button>
              <button type="button" className={`pill${tab === "saved" ? " on" : ""}`} style={{ flex: 1, minHeight: 32, padding: "4px 10px", fontSize: 12.5 }} onClick={() => setTab("saved")}>
                Saved Q&apos;s
              </button>
            </div>
            {tab === "chats" && (
              <input className="inp" style={{ height: 38, fontSize: 13 }} type="search" placeholder="Search SUG conversations…" value={search} onChange={(e) => setSearch(e.target.value)} />
            )}
          </div>

          <div className="chat-side-list">
            {tab === "chats" ? (
              loadingList ? (
                <p style={{ padding: 20, fontSize: 13, color: "var(--mut)" }}>Loading chats…</p>
              ) : convos.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "var(--mut)", fontSize: 13 }}>
                  <p style={{ marginBottom: 12 }}>No SUG conversations yet.</p>
                  <button type="button" className="btn btn-out" style={{ height: 36, fontSize: 12.5 }} onClick={openPicker}>Start a chat with SUG</button>
                </div>
              ) : (
                convos.map((c) => {
                  const cp = c.counterpart || {};
                  const on = c.id === activeId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`chat-row${on ? " on" : ""}`}
                      onClick={() => setParams({ c: String(c.id) })}
                    >
                      <UserAvatar src={cp.avatar_url} av={cp.av || "S"} bg={cp.bg} size={44} online={cp.online} />
                      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                          <strong style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {cp.name}
                            {cp.staff && <Ic n="shield" s={12} c="var(--accent)" />}
                          </strong>
                          <span style={{ fontSize: 11, color: "var(--faint)", flexShrink: 0 }}>{c.last_message?.time || c.updated_time}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 12.5, color: "var(--mut)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.last_message?.body || "Tap to start chatting…"}
                          </span>
                          {c.unread_count > 0 && <span className="chat-unread">{c.unread_count}</span>}
                        </div>
                      </div>
                    </button>
                  );
                })
              )
            ) : savedItems.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--mut)", fontSize: 13 }}>
                Bookmark any message inside a chat thread to save important questions &amp; SUG answers here.
              </div>
            ) : (
              savedItems.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="chat-row"
                  onClick={() => { setTab("chats"); setParams({ c: String(it.conversation_id) }); }}
                >
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 2 }}>
                      {it.message_data?.sender_info?.name} · {it.message_data?.time}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--txt)", lineHeight: 1.45 }}>{it.message_data?.body}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* RIGHT PANE: Active Conversation Thread (inspired by SUG CHAT reference) */}
        <section className="chat-main">
          {!activeConvo ? (
            <div className="chat-empty">
              <Ic n="chat" s={44} c="var(--faint)" />
              <h3>Select a conversation</h3>
              <p>Message any verified SUG representative for official help, academic welfare, or campus inquiries.</p>
              <button type="button" className="btn btn-navy" onClick={openPicker}>Start New SUG Chat</button>
            </div>
          ) : (
            <>
              <header className="chat-head">
                <button type="button" className="chat-back" onClick={() => setParams({})} aria-label="Back to conversations">
                  <Ic n="arrowL" s={18} />
                </button>
                <UserAvatar src={activeConvo.counterpart?.avatar_url} av={activeConvo.counterpart?.av} bg={activeConvo.counterpart?.bg} size={42} online={activeConvo.counterpart?.online} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
                    {activeConvo.counterpart?.name}
                    {activeConvo.counterpart?.staff && (
                      <span className="cmt-staff-pill"><Ic n="shield" s={10} c="var(--accent)" /> Verified SUG</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--mut)" }}>
                    {activeConvo.counterpart?.title || (activeConvo.counterpart?.username ? `@${activeConvo.counterpart.username}` : "Official Channel")}
                  </div>
                </div>
              </header>

              <div className="chat-body">
                {loadingMsgs && <p style={{ textAlign: "center", color: "var(--mut)", fontSize: 13 }}>Loading messages…</p>}
                {!loadingMsgs && messages.length === 0 && (
                  <div style={{ textAlign: "center", padding: "36px 16px", color: "var(--mut)", fontSize: 13.5 }}>
                    Start your conversation with <strong>{activeConvo.counterpart?.name}</strong> below.
                  </div>
                )}

                {messages.map((m) => (
                  <div key={m.id} className={`chat-bubble-row${m.is_mine ? " mine" : " theirs"}`}>
                    {!m.is_mine && (
                      <UserAvatar src={m.sender_info?.avatar_url} av={m.sender_info?.av} bg={m.sender_info?.bg} size={40} border="3px solid var(--surf)" />
                    )}
                    <div className={`chat-pill${m.is_mine ? " mine" : " theirs"}`}>
                      <div className="chat-pill-meta">
                        <span>{m.is_mine ? "You" : m.sender_info?.name} · {m.time}</span>
                        <button
                          type="button"
                          className={`chat-save-btn${m.saved ? " on" : ""}`}
                          onClick={() => handleToggleSave(m)}
                          title={m.saved ? "Saved in Saved Questions" : "Save question from chat"}
                          aria-label={m.saved ? "Unsave question" : "Save question"}
                        >
                          <Ic n="bookmark" s={12} />
                        </button>
                      </div>
                      {m.body && <p className="chat-pill-txt">{m.body}</p>}
                      {m.attachment_url && (
                        <div className="chat-att">
                          {/\.(jpg|jpeg|png|webp|gif)$/i.test(m.attachment_name || m.attachment_url) ? (
                            <img src={m.attachment_url} alt={m.attachment_name || "Attachment"} style={{ maxWidth: 240, borderRadius: 12, marginTop: 6 }} />
                          ) : (
                            <a href={m.attachment_url} target="_blank" rel="noopener noreferrer" className="chat-att-file">
                              <Ic n="file" s={14} />
                              <span>{m.attachment_name || "Attachment"} ({formatBytes(m.attachment_size)})</span>
                              <span className="chat-att-dl">Download</span>
                            </a>
                          )}
                        </div>
                      )}
                      {m.is_mine && (
                        <div className="chat-read">{m.is_read ? "Read ✓✓" : "Sent ✓"}</div>
                      )}
                    </div>
                    {m.is_mine && (
                      <UserAvatar src={user.avatarUrl} av={user.av} bg={user.bg} size={40} border="3px solid var(--surf)" />
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Rounded Neumorphic Bottom Composer (inspired by SUG CHAT reference) */}
              <form className="chat-composer-wrap" onSubmit={handleSend}>
                {attachment && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", fontSize: 12.5, color: "var(--mut)" }}>
                    <Ic n="paperclip" s={13} /> {attachment.name}
                    <button type="button" onClick={() => setAttachment(null)} style={{ color: "#EF4444", fontWeight: 700 }}>Remove</button>
                  </div>
                )}
                <div className="chat-composer-pill">
                  <button type="button" className="chat-att-btn" onClick={() => fileRef.current?.click()} aria-label="Attach file">
                    <Ic n="paperclip" s={17} />
                  </button>
                  <input ref={fileRef} type="file" hidden accept="image/*,.pdf,.doc,.docx,.txt" onChange={(e) => { setAttachment(e.target.files?.[0] || null); e.target.value = ""; }} />
                  <input
                    className="chat-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Write your message to SUG…"
                    disabled={sending}
                    maxLength={4000}
                  />
                  <button type="submit" className="chat-send-circle" disabled={sending || (!text.trim() && !attachment)} aria-label="Send message">
                    {sending ? "…" : "SEND"}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>

      {/* Pick Verified SUG Representative Modal */}
      {pickerOpen && (
        <Modal onClose={() => setPickerOpen(false)} maxW={460} showClose label="Choose SUG Representative">
          <div style={{ padding: "24px 20px" }}>
            <h3 style={{ fontSize: 19, marginBottom: 6 }}>Message an SUG Official</h3>
            <p style={{ fontSize: 13, color: "var(--mut)", marginBottom: 14 }}>
              Select a verified SUG representative below to start or resume a private conversation.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" }}>
              {sugList.filter((s) => s.id !== user.id).map((s) => (
                <button key={s.id} type="button" className="chat-row" style={{ borderRadius: 14, background: "var(--surfH)" }} onClick={() => pickSug(s)}>
                  <UserAvatar src={s.avatarUrl} av={s.av} bg={s.bg} size={42} online={s.online} />
                  <div style={{ textAlign: "left", flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: "var(--mut)" }}>{s.role} · {s.dept}</div>
                  </div>
                  <Ic n="arrow" s={15} c="var(--accent)" />
                </button>
              ))}
              {sugList.length === 0 && <p style={{ color: "var(--mut)", fontSize: 13 }}>No SUG officials found yet.</p>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
