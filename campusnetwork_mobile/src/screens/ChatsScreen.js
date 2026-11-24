/**
 * Website-Faithful Private SUG Direct Messaging Screen (mirrors ChatsPage.jsx)
 * - Uses fixed /api/chats/ endpoints (list, start, messages, read, save)
 * - Smooth KeyboardAvoidingView + ClayInput + message bookmarking + live polling
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ClayButton, ClayCard, ClayInput, UserAvatar, VerifiedBadge } from "../components/ClayUI";
import { chatApi } from "../api";

export default function ChatsScreen({ theme, user, initialConvoId, onRequireAuth, toast }) {
  const [convos, setConvos] = useState([]);
  const [activeId, setActiveId] = useState(initialConvoId || null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    if (initialConvoId) setActiveId(initialConvoId);
  }, [initialConvoId]);

  const loadConvos = useCallback(async () => {
    if (!user) return;
    try {
      const list = await chatApi.conversations(search);
      setConvos(list);
    } catch {
      setConvos([]);
    } finally {
      setLoading(false);
    }
  }, [user, search]);

  const loadMsgs = useCallback(async (id) => {
    if (!id) return;
    try {
      const list = await chatApi.messages(id);
      setMessages(list);
      chatApi.markRead(id).catch(() => {});
    } catch {
      setMessages([]);
    }
  }, []);

  useEffect(() => { loadConvos(); }, [loadConvos]);

  useEffect(() => {
    if (!activeId) return;
    loadMsgs(activeId);
    const t = setInterval(() => loadMsgs(activeId), 7000);
    return () => clearInterval(t);
  }, [activeId, loadMsgs]);

  const handleSend = async () => {
    if (!text.trim() || !activeId || sending) return;
    setSending(true);
    try {
      const sent = await chatApi.send(activeId, text.trim());
      setMessages((p) => [...p, sent]);
      setText("");
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
    } catch (e) {
      toast && toast(e.message || "Could not send message.", "error");
    } finally {
      setSending(false);
    }
  };

  const handleToggleSave = async (msgId) => {
    try {
      const res = await chatApi.toggleSave(msgId);
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, is_saved: res.saved } : m)));
      toast && toast(res.saved ? "Saved message" : "Removed from saved", "info");
    } catch (e) {
      toast && toast(e.message, "error");
    }
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, padding: 20, justifyContent: "center" }}>
        <ClayCard theme={theme} level={2} style={{ padding: 26, alignItems: "center", gap: 10 }}>
          <Ionicons name="chatbubbles-outline" size={44} color={theme.accent} />
          <Text style={{ color: theme.txt, fontSize: 19, fontWeight: "800" }}>Private SUG Messages</Text>
          <Text style={{ color: theme.mut, fontSize: 13.5, textAlign: "center" }}>
            Sign in to message verified SUG officials directly and track replies.
          </Text>
          <ClayButton theme={theme} variant="pri" label="Sign In" onPress={() => onRequireAuth("open messages")} />
        </ClayCard>
      </View>
    );
  }

  const activeConvo = convos.find((c) => c.id === activeId);

  if (activeId) {
    const peer = activeConvo?.other_user || activeConvo?.sug || activeConvo?.student || {};
    const peerName = peer.name || peer.username || "SUG Conversation";
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.bg }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 24}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, backgroundColor: theme.surf }}>
          <Pressable onPress={() => setActiveId(null)} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={theme.txt} />
          </Pressable>
          <UserAvatar src={peer.avatar_url} av={peer.av || peerName.slice(0, 2)} bg={peer.bg} size={36} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>
                {peerName}
              </Text>
              {peer.is_verified_student ? <VerifiedBadge size={13} /> : null}
            </View>
            <Text style={{ color: theme.mut, fontSize: 11.5 }}>{peer.title || "Private SUG Chat"}</Text>
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m, i) => String(m.id || i)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 16 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const mine = item.sender === user.id || item.sender_id === user.id || item.is_mine;
            return (
              <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                <Pressable
                  onLongPress={() => handleToggleSave(item.id)}
                  style={{
                    backgroundColor: mine ? theme.accent : theme.surf,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 18,
                    borderBottomRightRadius: mine ? 4 : 18,
                    borderBottomLeftRadius: mine ? 18 : 4,
                  }}
                >
                  <Text style={{ color: mine ? "#FFFFFF" : theme.txt, fontSize: 14.5, lineHeight: 20 }}>
                    {item.body || item.text}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
                    {item.is_saved ? (
                      <Ionicons name="bookmark" size={11} color={mine ? "#DBEAFE" : theme.accent} />
                    ) : null}
                    <Text style={{ color: mine ? "rgba(255,255,255,0.75)" : theme.faint, fontSize: 10.5 }}>
                      {item.time || ""}
                    </Text>
                  </View>
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={{ color: theme.mut, textAlign: "center", marginTop: 40, fontSize: 13.5 }}>
              Say hello to start this private SUG conversation.
            </Text>
          }
        />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: 92,
            backgroundColor: theme.surf,
          }}
        >
          <ClayInput
            theme={theme}
            style={{ flex: 1, marginBottom: 0 }}
            placeholder="Write a message..."
            value={text}
            onChangeText={setText}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <ClayButton theme={theme} variant="pri" compact icon="send" loading={sending} onPress={handleSend} />
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 14 }}>
      <Text style={{ color: theme.txt, fontSize: 22, fontWeight: "800", marginBottom: 10 }}>Messages</Text>
      <ClayInput
        theme={theme}
        leftIcon="search-outline"
        placeholder="Search conversations..."
        value={search}
        onChangeText={setSearch}
      />
      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={convos}
          keyExtractor={(c) => String(c.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 10, paddingBottom: 110 }}
          renderItem={({ item }) => {
            const peer = item.other_user || item.sug || item.student || {};
            const peerName = peer.name || peer.username || "SUG Official";
            return (
              <Pressable onPress={() => setActiveId(item.id)}>
                <ClayCard theme={theme} level={1} style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <UserAvatar src={peer.avatar_url} av={peer.av || peerName.slice(0, 2)} bg={peer.bg} size={46} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>
                      {peerName}
                    </Text>
                    <Text style={{ color: theme.mut, fontSize: 13 }} numberOfLines={1}>
                      {item.last_message?.body || item.last_message || "Tap to open chat"}
                    </Text>
                  </View>
                  {item.unread_count > 0 ? (
                    <View style={{ backgroundColor: theme.accent, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "800" }}>{item.unread_count}</Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward" size={18} color={theme.faint} />
                </ClayCard>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <ClayCard theme={theme} style={{ padding: 28, alignItems: "center", gap: 8 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={38} color={theme.faint} />
              <Text style={{ color: theme.txt, fontWeight: "700", fontSize: 15 }}>No conversations yet</Text>
              <Text style={{ color: theme.mut, fontSize: 13, textAlign: "center" }}>
                Visit the SUG tab and tap "Message" on any representative to start chatting.
              </Text>
            </ClayCard>
          }
        />
      )}
    </View>
  );
}
