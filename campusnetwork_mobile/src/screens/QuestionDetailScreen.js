/**
 * Repaired Question & Comments Detail Screen (mirrors QuestionPage.jsx)
 * - Uses exact flattened fields (fixes "Objects are not valid as a React child" crash 100%!)
 * - Renders nested comment replies, real display names + @usernames, all 5 comment sort options
 * - Upvote/Downvote/Like/ShareFan/Bookmark + Global clickable user profiles
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  AnimatedLikeButton, ClayButton, ClayCard, ClayInput, ClayPill,
  SugBadge, UserAvatar, VerifiedBadge,
} from "../components/ClayUI";
import ShareSheet from "../components/ShareSheet";
import { flattenQuestion, questionsApi, WEB_ORIGIN } from "../api";
import { RADII } from "../theme/tokens";

const SORT_OPTIONS = [
  { key: "recommended", label: "Recommended" },
  { key: "recent", label: "Most Recent" },
  { key: "liked", label: "Most Liked" },
  { key: "disliked", label: "Most Disliked" },
  { key: "oldest", label: "Oldest First" },
];

function CommentCard({ c, depth = 0, theme, onOpenAuthor, onVote, onReply }) {
  return (
    <View style={{ marginLeft: depth > 0 ? 18 : 0, gap: 8 }}>
      <ClayCard theme={theme} level={1} style={{ padding: 14, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <Pressable onPress={() => c.userId && onOpenAuthor && onOpenAuthor(c.userId)}>
            <UserAvatar src={c.avatarUrl} av={c.av} bg={c.bg} size={depth > 0 ? 28 : 34} />
          </Pressable>
          <Pressable style={{ flex: 1 }} onPress={() => c.userId && onOpenAuthor && onOpenAuthor(c.userId)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
              <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 13.5 }}>{c.user}</Text>
              {c.isVerifiedStudent ? <VerifiedBadge size={13} /> : null}
              {c.staff ? <SugBadge /> : null}
            </View>
            <Text style={{ color: theme.faint, fontSize: 11.5 }}>
              {c.username ? `@${c.username} · ` : ""}{c.time}
            </Text>
          </Pressable>
        </View>

        <Text style={{ color: theme.txt, fontSize: 14, lineHeight: 20 }}>{c.body}</Text>

        {c.imageUrl ? (
          <Image
            source={{ uri: c.imageUrl }}
            style={{ width: "100%", height: 170, borderRadius: 12, backgroundColor: theme.recessBg }}
            resizeMode="cover"
          />
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Pressable onPress={() => onVote(c.id, "up")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="arrow-up-circle-outline" size={18} color={c.myVote === "up" ? theme.accent : theme.mut} />
            <Text style={{ color: c.myVote === "up" ? theme.accent : theme.mut, fontWeight: "700", fontSize: 12.5 }}>
              {c.upvotes ?? 0}
            </Text>
          </Pressable>
          <Pressable onPress={() => onVote(c.id, "down")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="arrow-down-circle-outline" size={18} color={c.myVote === "down" ? theme.danger : theme.mut} />
            <Text style={{ color: c.myVote === "down" ? theme.danger : theme.mut, fontWeight: "700", fontSize: 12.5 }}>
              {c.downvotes ?? 0}
            </Text>
          </Pressable>
          {depth < 2 ? (
            <Pressable onPress={() => onReply(c)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="return-down-forward-outline" size={16} color={theme.mut} />
              <Text style={{ color: theme.mut, fontWeight: "700", fontSize: 12.5 }}>Reply</Text>
            </Pressable>
          ) : null}
        </View>
      </ClayCard>

      {Array.isArray(c.replies) && c.replies.length > 0
        ? c.replies.map((rep) => (
            <CommentCard
              key={rep.id}
              c={rep}
              depth={depth + 1}
              theme={theme}
              onOpenAuthor={onOpenAuthor}
              onVote={onVote}
              onReply={onReply}
            />
          ))
        : null}
    </View>
  );
}

export default function QuestionDetailScreen({
  theme,
  user,
  question: initialQuestion,
  onBack,
  onOpenAuthor,
  onRequireAuth,
  toast,
}) {
  const [q, setQ] = useState(() => flattenQuestion(initialQuestion));
  const [comments, setComments] = useState([]);
  const [sort, setSort] = useState("recommended");
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const qLookup = q?.publicId || q?.id;
  const qNumericId = q?.id || qLookup;

  const loadDetail = useCallback(async () => {
    if (!qLookup) return;
    setLoading(true);
    try {
      const [detail, cmts] = await Promise.all([
        questionsApi.get(qLookup),
        questionsApi.comments(qNumericId, sort),
      ]);
      if (detail) setQ(detail);
      setComments(cmts || []);
    } catch (e) {
      toast && toast(e.message || "Could not load comments.", "error");
    } finally {
      setLoading(false);
    }
  }, [qLookup, qNumericId, sort, toast]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const handleLike = async () => {
    if (!user) { onRequireAuth("like posts"); return; }
    setQ((p) => ({ ...p, liked: !p.liked, likes: Math.max(0, (p.likes || 0) + (p.liked ? -1 : 1)) }));
    try {
      const res = await questionsApi.like(q.id);
      setQ((p) => ({ ...p, liked: res.liked, likes: res.likes }));
    } catch {
      loadDetail();
    }
  };

  const handleVote = async (dir) => {
    if (!user) { onRequireAuth("vote on posts"); return; }
    try {
      const res = await questionsApi.vote(q.id, dir);
      setQ((p) => ({ ...p, votes: res.votes, voted: res.voted }));
    } catch (e) { toast && toast(e.message, "error"); }
  };

  const handleBookmark = async () => {
    if (!user) { onRequireAuth("save posts"); return; }
    try {
      const res = await questionsApi.bookmark(q.id);
      setQ((p) => ({ ...p, saved: !!res.saved }));
      toast && toast(res.saved ? "Saved to bookmarks" : "Removed from saved", "info");
    } catch (e) { toast && toast(e.message, "error"); }
  };

  const handleVoteComment = async (cid, dir) => {
    if (!user) { onRequireAuth("vote on comments"); return; }
    try {
      await questionsApi.voteComment(cid, dir);
      loadDetail();
    } catch (e) { toast && toast(e.message, "error"); }
  };

  const handleSubmitReply = async () => {
    if (!user) { onRequireAuth("post an answer"); return; }
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      await questionsApi.addComment(q.id, { body: replyText.trim(), parent: replyTo?.id || null });
      setReplyText("");
      setReplyTo(null);
      toast && toast("Comment posted!", "success");
      loadDetail();
    } catch (e) {
      toast && toast(e.message || "Could not post comment.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const firstImg = q?.media?.find((m) => m.kind === "image" || m.url)?.url;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 24}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 24, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="arrow-back" size={18} color={theme.accent} />
          <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 14 }}>Back to Feed</Text>
        </Pressable>

        {q ? (
          <ClayCard theme={theme} level={2} style={{ padding: 18, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Pressable onPress={() => q.userId && onOpenAuthor && onOpenAuthor(q.userId)}>
                <UserAvatar src={q.avatarUrl} av={q.av} bg={q.bg} size={42} />
              </Pressable>
              <Pressable style={{ flex: 1 }} onPress={() => q.userId && onOpenAuthor && onOpenAuthor(q.userId)}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }}>{q.user}</Text>
                  {q.isVerifiedStudent ? <VerifiedBadge size={14} /> : null}
                  {q.staff ? <SugBadge /> : null}
                </View>
                {q.username ? <Text style={{ color: theme.accent, fontSize: 12.5, fontWeight: "600" }}>@{q.username}</Text> : null}
                <Text style={{ color: theme.faint, fontSize: 11.5 }}>{q.dept} · {q.time}</Text>
              </Pressable>
              <Pressable onPress={handleBookmark} hitSlop={8}>
                <Ionicons name={q.saved ? "bookmark" : "bookmark-outline"} size={21} color={q.saved ? "#F59E0B" : theme.faint} />
              </Pressable>
            </View>

            <Text style={{ color: theme.txt, fontSize: 19, fontWeight: "900", lineHeight: 25 }}>{q.title}</Text>
            <Text style={{ color: theme.txt, fontSize: 14.5, lineHeight: 22 }}>{q.body}</Text>

            {firstImg ? (
              <Image
                source={{ uri: firstImg }}
                style={{ width: "100%", height: 230, borderRadius: RADII.md, backgroundColor: theme.recessBg }}
                resizeMode="cover"
              />
            ) : null}

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: theme.recessBg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 }}>
                  <Pressable onPress={() => handleVote("up")} hitSlop={6}>
                    <Ionicons name="chevron-up" size={18} color={q.voted === "up" ? theme.accent : theme.mut} />
                  </Pressable>
                  <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 13 }}>{q.votes ?? 0}</Text>
                  <Pressable onPress={() => handleVote("down")} hitSlop={6}>
                    <Ionicons name="chevron-down" size={18} color={q.voted === "down" ? theme.danger : theme.mut} />
                  </Pressable>
                </View>
                <AnimatedLikeButton
                  liked={!!q.liked}
                  count={q.likes ?? 0}
                  inactiveColor={theme.mut}
                  onPress={handleLike}
                />
              </View>

              <Pressable
                onPress={() => setShareOpen(true)}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingHorizontal: 10 }}
              >
                <Ionicons name="paper-plane-outline" size={17} color={theme.mut} />
                <Text style={{ color: theme.mut, fontWeight: "700", fontSize: 13 }}>Share</Text>
              </Pressable>
            </View>
          </ClayCard>
        ) : null}

        {/* All 5 Website Comment Sorting Options */}
        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 16 }}>
            Answers &amp; Comments ({comments.length})
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -14 }}
            contentContainerStyle={{ paddingHorizontal: 14, gap: 8, paddingVertical: 4 }}
          >
            {SORT_OPTIONS.map((opt) => (
              <ClayPill key={opt.key} theme={theme} label={opt.label} active={sort === opt.key} onPress={() => setSort(opt.key)} />
            ))}
          </ScrollView>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.accent} style={{ marginVertical: 20 }} />
        ) : comments.length === 0 ? (
          <ClayCard theme={theme} style={{ padding: 24, alignItems: "center" }}>
            <Text style={{ color: theme.mut }}>No comments yet. Start the discussion below!</Text>
          </ClayCard>
        ) : (
          comments.map((c) => (
            <CommentCard
              key={c.id}
              c={c}
              theme={theme}
              onOpenAuthor={onOpenAuthor}
              onVote={handleVoteComment}
              onReply={setReplyTo}
            />
          ))
        )}
      </ScrollView>

      {/* Bottom Comment Composer */}
      <View style={{ padding: 12, paddingBottom: 94, backgroundColor: theme.surf, gap: 6 }}>
        {replyTo ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: theme.accent, fontSize: 12, fontWeight: "700" }}>
              Replying to {replyTo.user}
            </Text>
            <Pressable onPress={() => setReplyTo(null)}>
              <Ionicons name="close-circle" size={18} color={theme.mut} />
            </Pressable>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ClayInput
            theme={theme}
            style={{ flex: 1, marginBottom: 0 }}
            placeholder={replyTo ? "Write your reply..." : "Add a helpful answer or comment..."}
            value={replyText}
            onChangeText={setReplyText}
          />
          <ClayButton theme={theme} variant="pri" compact icon="send" loading={submitting} onPress={handleSubmitReply} />
        </View>
      </View>

      <ShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        theme={theme}
        title={q?.title}
        url={q ? `${WEB_ORIGIN}/q/${q.publicId || q.id}` : WEB_ORIGIN}
        toast={toast}
      />
    </KeyboardAvoidingView>
  );
}
