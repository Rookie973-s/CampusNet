/**
 * Overhauled Mobile Q&A Feed Screen (HIGHEST PRIORITY)
 * - Legacy "Ask Question" button REMOVED (launched strictly from central FAB!)
 * - Group 1 Filters: Trending, Most Recent, Unanswered, Answered (fixes Trending lock bug!)
 * - Group 2 Faculty filter replaced with reusable FacultyDropdown + MorphismSearchInput
 * - Real user display names + @username directly beneath + accurate live votes/likes/comments
 * - Full Upvote/Downvote/Like/Bookmark/Poll-Vote + 3-Dot Menu (Analytics & Liked By, See Less, Report, Copy, Delete)
 * - Real backend-driven NativeAdCard injected seamlessly into Feed
 * - Radial ShareFan animation
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, Pressable,
  RefreshControl, ScrollView, Text, View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import {
  AnimatedLikeButton, ClayButton, ClayCard, ClayPill, FacultyDropdown,
  FeedSkeletonList, MorphismSearchInput, NativeAdCard, SugBadge, UserAvatar, VerifiedBadge,
} from "../components/ClayUI";
import ShareSheet from "../components/ShareSheet";
import { adsApi, questionsApi, WEB_ORIGIN } from "../api";
import { RADII } from "../theme/tokens";

const FILTERS = ["Trending", "Most Recent", "Unanswered", "Answered"];

export default function FeedScreen({
  theme,
  user,
  departments = [],
  initialTopic = "All",
  discovery = "",
  onClearDiscovery,
  newPostSignal,
  onOpenQuestion,
  onOpenAuthor,
  onRequireAuth,
  toast,
}) {
  const [filter, setFilter] = useState("Trending");
  const [topic, setTopic] = useState(initialTopic || "All");
  const [localSearch, setLocalSearch] = useState("");
  const [items, setItems] = useState([]);
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ShareFan & 3-dot Menu & Post Analytics/Liked-By modal state
  const [shareItem, setShareItem] = useState(null);
  const [menuItem, setMenuItem] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);

  useEffect(() => {
    if (initialTopic) setTopic(initialTopic);
  }, [initialTopic]);

  const facultyOptions = useMemo(
    () => [
      { label: "All Faculties", value: "All" },
      ...departments.map((d) => ({ label: d.name, value: d.name, color: d.color })),
    ],
    [departments]
  );

  const loadFeed = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [res, servedAds] = await Promise.all([
        questionsApi.list({
          filter,
          topic,
          discovery: discovery || undefined,
          search: localSearch.trim() || undefined,
        }),
        adsApi.serve("feed").catch(() => []),
      ]);
      setItems(res.results || []);
      setAds(servedAds || []);
    } catch (e) {
      toast && toast(e.message || "Could not load feed.", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, topic, discovery, localSearch, toast]);

  useEffect(() => { loadFeed(false); }, [loadFeed]);

  // Prepend newly created post/poll from FAB immediately without manual refresh
  useEffect(() => {
    if (newPostSignal?.id) {
      setItems((prev) => [newPostSignal, ...prev.filter((x) => x.id !== newPostSignal.id)]);
    }
  }, [newPostSignal]);

  // Fix Trending Lock Bug: switching filter clears any active discovery lock cleanly!
  const handleSelectFilter = (nextFilter) => {
    if (discovery && onClearDiscovery) onClearDiscovery();
    setFilter(nextFilter);
  };

  const handleSelectTopic = (nextTopic) => {
    if (discovery && onClearDiscovery) onClearDiscovery();
    setTopic(nextTopic);
  };

  const handleVote = async (q, dir) => {
    if (!user) { onRequireAuth("vote on posts"); return; }
    const prevVoted = q.voted;
    const nextVoted = prevVoted === dir ? null : dir;
    const delta =
      (nextVoted === "up" ? 1 : nextVoted === "down" ? -1 : 0) -
      (prevVoted === "up" ? 1 : prevVoted === "down" ? -1 : 0);
    setItems((prev) => prev.map((it) => (it.id === q.id ? { ...it, voted: nextVoted, votes: (it.votes || 0) + delta } : it)));
    try {
      const res = await questionsApi.vote(q.id, dir);
      setItems((prev) => prev.map((it) => (it.id === q.id ? { ...it, votes: res.votes, voted: res.voted } : it)));
    } catch {
      loadFeed(false);
    }
  };

  const handleLike = async (q) => {
    if (!user) { onRequireAuth("like posts"); return; }
    setItems((prev) =>
      prev.map((it) =>
        it.id === q.id
          ? { ...it, liked: !it.liked, likes: Math.max(0, (it.likes || 0) + (it.liked ? -1 : 1)) }
          : it
      )
    );
    try {
      const res = await questionsApi.like(q.id);
      setItems((prev) => prev.map((it) => (it.id === q.id ? { ...it, liked: res.liked, likes: res.likes } : it)));
    } catch {
      loadFeed(false);
    }
  };

  const handleBookmark = async (q) => {
    if (!user) { onRequireAuth("save posts"); return; }
    try {
      const res = await questionsApi.bookmark(q.id);
      setItems((prev) => prev.map((it) => (it.id === q.id ? { ...it, saved: !!res.saved } : it)));
      toast && toast(res.saved ? "Saved to your bookmarks" : "Removed from saved", "info");
    } catch (e) { toast && toast(e.message, "error"); }
  };

  const handleVotePoll = async (q, optionId) => {
    if (!user) { onRequireAuth("vote in polls"); return; }
    try {
      const res = await questionsApi.votePoll(q.id, optionId);
      setItems((prev) =>
        prev.map((it) =>
          it.id === q.id
            ? {
                ...it,
                pollOptions: res.poll_options || [],
                pollTotalVotes: res.poll_total_votes || 0,
                myPollOption: res.my_poll_option,
              }
            : it
        )
      );
    } catch (e) { toast && toast(e.message || "Could not submit vote.", "error"); }
  };

  const handleSeeLess = async (q) => {
    setMenuItem(null);
    if (!user) { onRequireAuth("customize your feed"); return; }
    try {
      await questionsApi.hide(q.id);
      setItems((prev) => prev.filter((it) => it.id !== q.id));
      toast && toast("We'll show you less like this.", "info");
    } catch (e) { toast && toast(e.message, "error"); }
  };

  const handleReport = async (q) => {
    setMenuItem(null);
    if (!user) { onRequireAuth("report posts"); return; }
    Alert.alert("Report Post", "Select a reason to report this post to moderators:", [
      { text: "Spam or misleading", onPress: () => submitReport(q.id, "Spam or misleading content") },
      { text: "Harassment or abuse", onPress: () => submitReport(q.id, "Harassment or abusive content") },
      { text: "Inappropriate content", onPress: () => submitReport(q.id, "Inappropriate campus content") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const submitReport = async (id, reason) => {
    try {
      await questionsApi.report(id, reason);
      toast && toast("Report submitted to moderators.", "success");
    } catch (e) { toast && toast(e.message, "error"); }
  };

  const handleOpenAnalytics = async (q) => {
    setMenuItem(null);
    setAnalyticsBusy(true);
    try {
      const data = await questionsApi.likers(q.id);
      setAnalytics({ ...data, title: q.title });
    } catch (e) {
      toast && toast(e.message || "Only the post author can view analytics.", "error");
    } finally {
      setAnalyticsBusy(false);
    }
  };

  const handleDelete = (q) => {
    setMenuItem(null);
    Alert.alert("Delete Post?", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await questionsApi.delete(q.id);
            setItems((p) => p.filter((x) => x.id !== q.id));
            toast && toast("Post deleted.", "info");
          } catch (e) { toast && toast(e.message, "error"); }
        },
      },
    ]);
  };

  const renderCard = ({ item: q, index }) => {
    const firstImg = q.media?.find((m) => m.kind === "image" || m.url)?.url;
    const isAuthor = user && (q.userId === user.id || q.canEdit || q.canDelete);
    const adAfter = index === 2 && ads[0] ? ads[0] : index === 6 && ads[1] ? ads[1] : null;

    return (
      <View style={{ gap: 12 }}>
        <ClayCard theme={theme} level={1} style={{ padding: 16, gap: 10 }}>
          {/* Author Header: Avatar + Real Display Name + @username directly beneath + 3-Dot Menu */}
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <Pressable onPress={() => q.userId && onOpenAuthor && onOpenAuthor(q.userId)}>
              <UserAvatar src={q.avatarUrl} av={q.av} bg={q.bg} size={42} />
            </Pressable>

            <Pressable style={{ flex: 1 }} onPress={() => q.userId && onOpenAuthor && onOpenAuthor(q.userId)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }}>{q.user}</Text>
                {q.isVerifiedStudent ? <VerifiedBadge size={14} /> : null}
                {q.staff ? <SugBadge /> : null}
              </View>
              {q.username ? (
                <Text style={{ color: theme.accent, fontSize: 12.5, fontWeight: "600" }}>@{q.username}</Text>
              ) : null}
              <Text style={{ color: theme.faint, fontSize: 11.5, marginTop: 1 }}>
                {q.dept} · {q.time}
              </Text>
            </Pressable>

            {/* 3-Dot Menu Button on EVERY post */}
            <Pressable
              onPress={() => setMenuItem(q)}
              hitSlop={10}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.recessBg,
              }}
              accessibilityLabel="Post options"
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={theme.mut} />
            </Pressable>
          </View>

          {/* Status Pill */}
          <View style={{ flexDirection: "row", gap: 6 }}>
            <View
              style={{
                backgroundColor: q.answered ? "rgba(16,185,129,0.16)" : "rgba(59,130,246,0.16)",
                paddingHorizontal: 9,
                paddingVertical: 3,
                borderRadius: 99,
              }}
            >
              <Text style={{ color: q.answered ? "#10B981" : "#60A5FA", fontSize: 10.5, fontWeight: "800" }}>
                {q.answered ? "ANSWERED" : "OPEN"}
              </Text>
            </View>
            {q.promoted ? (
              <View style={{ backgroundColor: "rgba(245,158,11,0.16)", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99 }}>
                <Text style={{ color: "#F59E0B", fontSize: 10.5, fontWeight: "800" }}>PROMOTED</Text>
              </View>
            ) : null}
          </View>

          {/* Post Title, Body & Media */}
          <Pressable onPress={() => onOpenQuestion(q)} style={{ gap: 6 }}>
            <Text style={{ color: theme.txt, fontSize: 16.5, fontWeight: "800", lineHeight: 22 }}>{q.title}</Text>
            {q.body && q.body !== q.title ? (
              <Text style={{ color: theme.mut, fontSize: 14, lineHeight: 21 }} numberOfLines={4}>
                {q.body}
              </Text>
            ) : null}
            {firstImg ? (
              <Image
                source={{ uri: firstImg }}
                style={{ width: "100%", height: 210, borderRadius: RADII.md, marginTop: 4, backgroundColor: theme.recessBg }}
                resizeMode="cover"
              />
            ) : null}
          </Pressable>

          {/* Interactive Poll Options */}
          {q.pollOptions?.length > 0 ? (
            <View style={{ gap: 7, marginTop: 2 }}>
              {q.pollOptions.map((opt) => (
                <Pressable
                  key={opt.id}
                  onPress={() => handleVotePoll(q, opt.id)}
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: 12,
                    backgroundColor: theme.recessBg,
                    borderWidth: 1,
                    borderColor: opt.voted ? theme.accent : "transparent",
                    paddingHorizontal: 13,
                    paddingVertical: 10,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${opt.percent || 0}%`,
                      backgroundColor: opt.voted ? "rgba(59,130,246,0.24)" : "rgba(148,163,184,0.14)",
                    }}
                  />
                  <Text style={{ color: theme.txt, fontWeight: opt.voted ? "800" : "600", fontSize: 13.5, flex: 1 }}>
                    {opt.text}
                  </Text>
                  <Text style={{ color: opt.voted ? theme.accent : theme.mut, fontWeight: "800", fontSize: 12.5 }}>
                    {opt.percent || 0}%
                  </Text>
                </Pressable>
              ))}
              <Text style={{ color: theme.faint, fontSize: 11.5 }}>
                {q.pollTotalVotes || 0} vote{q.pollTotalVotes === 1 ? "" : "s"}
              </Text>
            </View>
          ) : null}

          {/* Tags */}
          {q.tags?.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {q.tags.map((tg) => (
                <View key={tg} style={{ backgroundColor: theme.recessBg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99 }}>
                  <Text style={{ color: theme.mut, fontSize: 11.5, fontWeight: "600" }}>#{tg}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Full Website-Parity Action Bar: Upvote/Downvote, Like, Comment, ShareFan, Views, Save */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 6, borderTopWidth: 1, borderTopColor: theme.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {/* Upvote / Downvote */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.recessBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 }}>
                <Pressable onPress={() => handleVote(q, "up")} hitSlop={6}>
                  <Ionicons name="chevron-up" size={17} color={q.voted === "up" ? theme.accent : theme.mut} />
                </Pressable>
                <Text style={{ color: q.voted ? theme.accent : theme.txt, fontWeight: "800", fontSize: 12.5 }}>
                  {q.votes ?? 0}
                </Text>
                <Pressable onPress={() => handleVote(q, "down")} hitSlop={6}>
                  <Ionicons name="chevron-down" size={17} color={q.voted === "down" ? theme.danger : theme.mut} />
                </Pressable>
              </View>

              {/* Animated Like (long-press or author tap opens Liked By!) */}
              <AnimatedLikeButton
                liked={!!q.liked}
                count={q.likes ?? 0}
                inactiveColor={theme.mut}
                onPress={() => handleLike(q)}
                onLongPress={() => isAuthor && handleOpenAnalytics(q)}
              />

              {/* Comments */}
              <Pressable
                onPress={() => onOpenQuestion(q)}
                style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4, paddingHorizontal: 4 }}
              >
                <Ionicons name="chatbubble-outline" size={16} color={theme.mut} />
                <Text style={{ color: theme.mut, fontWeight: "700", fontSize: 12.5 }}>{q.ans ?? 0}</Text>
              </Pressable>

              {/* Radial ShareFan */}
              <Pressable
                onPress={() => setShareItem(q)}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 4 }}
              >
                <Ionicons name="paper-plane-outline" size={16} color={theme.mut} />
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name="eye-outline" size={14} color={theme.faint} />
                <Text style={{ color: theme.faint, fontSize: 12, fontWeight: "600" }}>{q.views ?? 0}</Text>
              </View>
              <Pressable onPress={() => handleBookmark(q)} hitSlop={8}>
                <Ionicons name={q.saved ? "bookmark" : "bookmark-outline"} size={18} color={q.saved ? "#F59E0B" : theme.faint} />
              </Pressable>
            </View>
          </View>
        </ClayCard>

        {/* Real Backend-Driven Feed Ad */}
        {adAfter ? <NativeAdCard theme={theme} ad={adAfter} placement="feed" /> : null}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <FlatList
        data={loading ? [] : items}
        keyExtractor={(q) => String(q.id)}
        renderItem={renderCard}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 14, paddingBottom: 120, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadFeed(true)} tintColor={theme.accent} />}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            {/* Top Row: Reusable FacultyDropdown + MorphismSearchInput */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <FacultyDropdown
                theme={theme}
                options={facultyOptions}
                value={topic}
                onChange={handleSelectTopic}
                placeholder="All Faculties"
                style={{ flex: 1 }}
              />
              <MorphismSearchInput
                theme={theme}
                value={localSearch}
                onChangeText={setLocalSearch}
                placeholder="Search feed..."
              />
            </View>

            {/* Active Trending Discovery Banner (easily dismissible!) */}
            {discovery ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: theme.accentSoft, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 }}>
                <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 12.5, flex: 1 }} numberOfLines={1}>
                  Trending topic: {discovery}
                </Text>
                <Pressable onPress={onClearDiscovery} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={theme.accent} />
                </Pressable>
              </View>
            ) : null}

            {/* Group 1 Filters intact: Trending, Most Recent, Unanswered, Answered */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -14 }}
              contentContainerStyle={{ paddingHorizontal: 14, gap: 8, paddingVertical: 2 }}
            >
              {FILTERS.map((f) => (
                <ClayPill key={f} theme={theme} label={f} active={filter === f} onPress={() => handleSelectFilter(f)} />
              ))}
            </ScrollView>

            {loading ? <FeedSkeletonList theme={theme} count={3} /> : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <ClayCard theme={theme} style={{ padding: 28, alignItems: "center", gap: 8 }}>
              <Ionicons name="newspaper-outline" size={38} color={theme.faint} />
              <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }}>No discussions found</Text>
              <Text style={{ color: theme.mut, fontSize: 13, textAlign: "center" }}>
                Try switching faculty or filter, or tap the + button below to start a discussion!
              </Text>
            </ClayCard>
          ) : null
        }
      />

      {/* Radial ShareFan */}
      <ShareSheet
        visible={!!shareItem}
        onClose={() => setShareItem(null)}
        theme={theme}
        title={shareItem?.title}
        url={shareItem ? `${WEB_ORIGIN}/q/${shareItem.publicId || shareItem.id}` : WEB_ORIGIN}
        toast={toast}
      />

      {/* 3-Dot Post Menu Bottom Sheet */}
      <Modal visible={!!menuItem} transparent animationType="fade" onRequestClose={() => setMenuItem(null)}>
        <Pressable onPress={() => setMenuItem(null)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.52)", justifyContent: "flex-end", padding: 14 }}>
          <ClayCard theme={theme} level={3} style={{ padding: 14, gap: 4 }}>
            <Text style={{ color: theme.mut, fontSize: 12, fontWeight: "800", paddingHorizontal: 10, paddingBottom: 6 }}>
              POST OPTIONS
            </Text>

            {user && (menuItem?.userId === user.id || menuItem?.canEdit || menuItem?.canDelete) ? (
              <Pressable
                onPress={() => handleOpenAnalytics(menuItem)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12 }}
              >
                <Ionicons name="bar-chart-outline" size={19} color={theme.accent} />
                <Text style={{ color: theme.txt, fontWeight: "700", fontSize: 14.5 }}>Post Analytics &amp; Liked By</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => { const m = menuItem; setMenuItem(null); handleBookmark(m); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12 }}
            >
              <Ionicons name={menuItem?.saved ? "bookmark" : "bookmark-outline"} size={19} color="#F59E0B" />
              <Text style={{ color: theme.txt, fontWeight: "700", fontSize: 14.5 }}>
                {menuItem?.saved ? "Remove from Saved" : "Save Post"}
              </Text>
            </Pressable>

            <Pressable
              onPress={async () => {
                const url = `${WEB_ORIGIN}/q/${menuItem?.publicId || menuItem?.id}`;
                setMenuItem(null);
                await Clipboard.setStringAsync(url);
                toast && toast("Link copied!", "success");
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12 }}
            >
              <Ionicons name="link-outline" size={19} color={theme.mut} />
              <Text style={{ color: theme.txt, fontWeight: "700", fontSize: 14.5 }}>Copy Link</Text>
            </Pressable>

            <Pressable
              onPress={() => handleSeeLess(menuItem)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12 }}
            >
              <Ionicons name="eye-off-outline" size={19} color={theme.mut} />
              <Text style={{ color: theme.txt, fontWeight: "700", fontSize: 14.5 }}>See less of this</Text>
            </Pressable>

            <Pressable
              onPress={() => handleReport(menuItem)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12 }}
            >
              <Ionicons name="flag-outline" size={19} color={theme.danger} />
              <Text style={{ color: theme.danger, fontWeight: "700", fontSize: 14.5 }}>Report Post</Text>
            </Pressable>

            {menuItem?.canDelete ? (
              <Pressable
                onPress={() => handleDelete(menuItem)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12 }}
              >
                <Ionicons name="trash-outline" size={19} color={theme.danger} />
                <Text style={{ color: theme.danger, fontWeight: "800", fontSize: 14.5 }}>Delete Post</Text>
              </Pressable>
            ) : null}
          </ClayCard>
        </Pressable>
      </Modal>

      {/* Post Analytics & "Liked By" Modal */}
      <Modal visible={!!analytics || analyticsBusy} transparent animationType="slide" onRequestClose={() => setAnalytics(null)}>
        <Pressable onPress={() => setAnalytics(null)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end", padding: 14 }}>
          <ClayCard theme={theme} level={3} style={{ padding: 18, maxHeight: "76%", gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: theme.txt, fontSize: 18, fontWeight: "900" }}>Post Analytics &amp; Liked By</Text>
              <Pressable onPress={() => setAnalytics(null)}><Ionicons name="close" size={22} color={theme.mut} /></Pressable>
            </View>
            {analyticsBusy ? (
              <ActivityIndicator color={theme.accent} style={{ marginVertical: 24 }} />
            ) : analytics ? (
              <>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { k: "Views", v: analytics.views },
                    { k: "Likes", v: analytics.likes },
                    { k: "Upvotes", v: analytics.upvotes },
                    { k: "Comments", v: analytics.comments },
                    { k: "Saved", v: analytics.bookmarks },
                  ].map((s) => (
                    <View key={s.k} style={{ width: "31%", padding: 10, borderRadius: 12, backgroundColor: theme.recessBg, alignItems: "center" }}>
                      <Text style={{ color: theme.txt, fontWeight: "900", fontSize: 18 }}>{s.v ?? 0}</Text>
                      <Text style={{ color: theme.mut, fontSize: 11.5 }}>{s.k}</Text>
                    </View>
                  ))}
                </View>

                <Text style={{ color: theme.mut, fontSize: 12, fontWeight: "800", marginTop: 4 }}>
                  LIKED BY ({analytics.likers?.length || 0})
                </Text>
                <ScrollView style={{ maxHeight: 240 }} contentContainerStyle={{ gap: 8 }}>
                  {!analytics.likers?.length ? (
                    <Text style={{ color: theme.faint, textAlign: "center", paddingVertical: 14 }}>No likes yet.</Text>
                  ) : analytics.likers.map((u) => (
                    <Pressable
                      key={u.id}
                      onPress={() => { setAnalytics(null); onOpenAuthor && onOpenAuthor(u.id); }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: 12, backgroundColor: theme.recessBg }}
                    >
                      <UserAvatar src={u.avatar_url} av={u.av} bg={u.bg} size={36} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Text style={{ color: theme.txt, fontWeight: "700", fontSize: 14 }}>{u.name}</Text>
                          {u.is_verified_student ? <VerifiedBadge size={13} /> : null}
                        </View>
                        <Text style={{ color: theme.mut, fontSize: 12 }}>@{u.username}</Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}
          </ClayCard>
        </Pressable>
      </Modal>
    </View>
  );
}
