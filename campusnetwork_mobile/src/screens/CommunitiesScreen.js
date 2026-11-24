/**
 * Website-Faithful Communities Screen (mirrors CommunitiesPage.jsx & CommunityDetailPage.jsx)
 * - Creator Edit Modal (Name, Description, Category, Rules, Avatar & Cover Photo Picker!)
 * - Notification Preference selector (All posts / Important / Muted)
 * - Followers List modal + Post Likes (AnimatedLikeButton) + Post Comments
 * - Edge-to-edge category pills (zero clipping) + onScroll nav auto-hide
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, ScrollView, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  AnimatedLikeButton, ClayButton, ClayCard, ClayInput, ClayPill,
  FacultyDropdown, FeedSkeletonList, MorphismSearchInput, UserAvatar,
} from "../components/ClayUI";
import { communitiesApi } from "../api";
import { RADII } from "../theme/tokens";

const CATEGORIES = ["All", "Campus Life", "Tech & Innovation", "Academics", "Sports & Clubs", "Faith & Culture", "General"];
const NOTIF_OPTIONS = [
  { key: "all", label: "All posts" },
  { key: "important", label: "Important" },
  { key: "none", label: "Muted" },
];

export default function CommunitiesScreen({ theme, user, onRequireAuth, onScroll, toast }) {
  const [list, setList] = useState([]);
  const [category, setCategory] = useState("All");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Detail state
  const [active, setActive] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [newPost, setNewPost] = useState("");
  const [posting, setPosting] = useState(false);

  // Post Comments Modal
  const [commentPost, setCommentPost] = useState(null);
  const [postComments, setPostComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  // Followers Modal
  const [followersOpen, setFollowersOpen] = useState(false);
  const [followersList, setFollowersList] = useState([]);

  // Create Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cCat, setCCat] = useState("Campus Life");
  const [cBusy, setCBusy] = useState(false);

  // Creator Edit Modal
  const [editOpen, setEditOpen] = useState(false);
  const [eName, setEName] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eCat, setECat] = useState("Campus Life");
  const [eRules, setERules] = useState("");
  const [eAvatar, setEAvatar] = useState(null);
  const [eCover, setECover] = useState(null);
  const [eBusy, setEBusy] = useState(false);

  const loadList = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await communitiesApi.list({ category, q });
      setList(data || []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, q]);

  useEffect(() => {
    if (!active) loadList(false);
  }, [active, loadList]);

  const openCommunity = async (comm) => {
    setActive(comm);
    setLoadingDetail(true);
    try {
      const [detail, cPosts] = await Promise.all([
        communitiesApi.get(comm.slug),
        communitiesApi.posts(comm.slug),
      ]);
      setActive(detail);
      setPosts(cPosts || []);
    } catch {
      // keep preview
    } finally {
      setLoadingDetail(false);
    }
  };

  const toggleFollow = async (comm) => {
    if (!user) { onRequireAuth("follow communities"); return; }
    try {
      if (comm.is_following) {
        await communitiesApi.unfollow(comm.slug);
        toast && toast(`Unfollowed ${comm.name}`, "info");
      } else {
        await communitiesApi.follow(comm.slug);
        toast && toast(`Following ${comm.name}!`, "success");
      }
      if (active?.slug === comm.slug) openCommunity(comm);
      else loadList(false);
    } catch (e) { toast && toast(e.message, "error"); }
  };

  const handleSetNotif = async (level) => {
    if (!active) return;
    try {
      await communitiesApi.setNotifications(active.slug, level);
      setActive((p) => ({ ...p, notification_level: level }));
      toast && toast(`Community notifications: ${level}`, "success");
    } catch (e) { toast && toast(e.message, "error"); }
  };

  const handleOpenFollowers = async () => {
    if (!active) return;
    setFollowersOpen(true);
    try {
      const data = await communitiesApi.followers(active.slug);
      setFollowersList(data || []);
    } catch { setFollowersList([]); }
  };

  const handleCreatePost = async () => {
    if (!newPost.trim() || !active) return;
    setPosting(true);
    try {
      const created = await communitiesApi.createPost(active.slug, { body: newPost.trim() });
      setPosts((p) => [created, ...p]);
      setNewPost("");
      toast && toast("Update published!", "success");
    } catch (e) { toast && toast(e.message, "error"); }
    finally { setPosting(false); }
  };

  const handleLikePost = async (post) => {
    if (!user) { onRequireAuth("like community posts"); return; }
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, is_liked: !p.is_liked, likes_count: Math.max(0, (p.likes_count || 0) + (p.is_liked ? -1 : 1)) }
          : p
      )
    );
    try {
      const res = await communitiesApi.likePost(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, is_liked: res.liked, likes_count: res.likes } : p)));
    } catch {
      if (active) openCommunity(active);
    }
  };

  const openPostComments = async (post) => {
    setCommentPost(post);
    setPostComments([]);
    try {
      setPostComments(await communitiesApi.postComments(post.id));
    } catch { setPostComments([]); }
  };

  const handleSendPostComment = async () => {
    if (!user) { onRequireAuth("comment on posts"); return; }
    if (!commentText.trim() || !commentPost) return;
    setCommentBusy(true);
    try {
      const created = await communitiesApi.addPostComment(commentPost.id, commentText.trim());
      setPostComments((p) => [...p, created]);
      setCommentText("");
    } catch (e) { toast && toast(e.message, "error"); }
    finally { setCommentBusy(false); }
  };

  const handleCreateCommunity = async () => {
    if (!cName.trim() || !cDesc.trim()) {
      toast && toast("Enter a community name and description.", "error");
      return;
    }
    setCBusy(true);
    try {
      const created = await communitiesApi.create({ name: cName.trim(), description: cDesc.trim(), category: cCat });
      setCreateOpen(false);
      setCName("");
      setCDesc("");
      toast && toast("Community created!", "success");
      openCommunity(created);
    } catch (e) { toast && toast(e.message, "error"); }
    finally { setCBusy(false); }
  };

  const openEditModal = () => {
    if (!active) return;
    setEName(active.name || "");
    setEDesc(active.description || "");
    setECat(active.category || "Campus Life");
    setERules(active.rules || "");
    setEAvatar(null);
    setECover(null);
    setEditOpen(true);
  };

  const pickImageFor = async (target) => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: target === "avatar" ? [1, 1] : [16, 6],
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const file = { uri: a.uri, name: a.fileName || `${target}_${Date.now()}.jpg`, type: a.mimeType || "image/jpeg" };
    if (target === "avatar") setEAvatar(file);
    else setECover(file);
  };

  const handleSaveEdit = async () => {
    if (!active || !eName.trim()) return;
    setEBusy(true);
    try {
      const form = new FormData();
      form.append("name", eName.trim());
      form.append("description", eDesc.trim());
      form.append("category", eCat);
      form.append("rules", eRules.trim());
      if (eAvatar) form.append("avatar", eAvatar);
      if (eCover) form.append("cover", eCover);
      const updated = await communitiesApi.update(active.slug, form);
      setActive(updated);
      setEditOpen(false);
      toast && toast("Community updated!", "success");
    } catch (e) { toast && toast(e.message || "Could not update community.", "error"); }
    finally { setEBusy(false); }
  };

  if (active) {
    const isCreator = user && (active.creator === user.id || active.is_admin || active.can_post);
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, paddingBottom: 120, gap: 14 }}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <Pressable onPress={() => setActive(null)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="arrow-back" size={18} color={theme.accent} />
            <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 14 }}>All Communities</Text>
          </Pressable>

          <ClayCard theme={theme} level={2} style={{ overflow: "hidden" }}>
            <View style={{ height: 126, backgroundColor: "#142038" }}>
              {active.cover_url ? (
                <Image source={{ uri: active.cover_url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
              ) : null}
            </View>
            <View style={{ padding: 16, gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: -38 }}>
                <UserAvatar src={active.avatar_url} av={(active.name || "C").slice(0, 2)} bg={theme.accent} size={62} />
                <View style={{ flex: 1, paddingTop: 22 }}>
                  <Text style={{ color: theme.txt, fontWeight: "900", fontSize: 18 }}>{active.name}</Text>
                  <Text style={{ color: theme.mut, fontSize: 12.5 }}>
                    {active.category} · {active.followers_count || 0} followers
                  </Text>
                </View>
              </View>

              {active.description ? (
                <Text style={{ color: theme.txt, fontSize: 13.5, lineHeight: 20 }}>{active.description}</Text>
              ) : null}

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <ClayButton
                  theme={theme}
                  variant={active.is_following ? "out" : "pri"}
                  compact
                  label={active.is_following ? "Following" : "Follow"}
                  onPress={() => toggleFollow(active)}
                />
                <ClayButton theme={theme} variant="out" compact icon="people-outline" label="Followers" onPress={handleOpenFollowers} />
                {isCreator ? (
                  <ClayButton theme={theme} variant="navy" compact icon="create-outline" label="Edit" onPress={openEditModal} />
                ) : null}
              </View>

              {active.is_following ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", paddingTop: 4 }}>
                  <Text style={{ color: theme.mut, fontSize: 12, fontWeight: "700" }}>Alerts:</Text>
                  {NOTIF_OPTIONS.map((opt) => (
                    <ClayPill
                      key={opt.key}
                      theme={theme}
                      label={opt.label}
                      active={(active.notification_level || "all") === opt.key}
                      onPress={() => handleSetNotif(opt.key)}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          </ClayCard>

          {active.can_post ? (
            <ClayCard theme={theme} level={1} style={{ padding: 14, gap: 8 }}>
              <ClayInput
                theme={theme}
                placeholder="Share an official community update..."
                multiline
                value={newPost}
                onChangeText={setNewPost}
                style={{ marginBottom: 4 }}
              />
              <ClayButton theme={theme} variant="pri" compact label="Publish Update" loading={posting} onPress={handleCreatePost} />
            </ClayCard>
          ) : null}

          {loadingDetail ? (
            <ActivityIndicator color={theme.accent} style={{ marginVertical: 20 }} />
          ) : posts.length === 0 ? (
            <ClayCard theme={theme} style={{ padding: 24, alignItems: "center" }}>
              <Text style={{ color: theme.mut }}>No community updates yet.</Text>
            </ClayCard>
          ) : (
            posts.map((p) => (
              <ClayCard key={p.id} theme={theme} level={1} style={{ padding: 15, gap: 10 }}>
                <Text style={{ color: theme.txt, fontSize: 14.5, lineHeight: 21 }}>{p.body}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <AnimatedLikeButton
                      liked={!!p.is_liked}
                      count={p.likes_count || 0}
                      inactiveColor={theme.mut}
                      onPress={() => handleLikePost(p)}
                    />
                    <Pressable onPress={() => openPostComments(p)} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Ionicons name="chatbubble-outline" size={16} color={theme.mut} />
                      <Text style={{ color: theme.mut, fontWeight: "700", fontSize: 12.5 }}>
                        {p.comments_count ?? 0} Comments
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: theme.faint, fontSize: 11.5 }}>{p.time || ""}</Text>
                </View>
              </ClayCard>
            ))
          )}
        </ScrollView>

        {/* Creator Edit Modal */}
        <Modal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.52)", justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <View style={{ backgroundColor: theme.surf, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, maxHeight: "88%" }}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Text style={{ color: theme.txt, fontSize: 18, fontWeight: "800" }}>Edit Community</Text>
                  <Pressable onPress={() => setEditOpen(false)}><Ionicons name="close" size={22} color={theme.mut} /></Pressable>
                </View>
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                  <ClayButton theme={theme} variant="out" compact style={{ flex: 1 }} icon="image-outline" label={eAvatar ? "Avatar Ready ✓" : "Change Avatar"} onPress={() => pickImageFor("avatar")} />
                  <ClayButton theme={theme} variant="out" compact style={{ flex: 1 }} icon="albums-outline" label={eCover ? "Cover Ready ✓" : "Change Cover"} onPress={() => pickImageFor("cover")} />
                </View>
                <ClayInput theme={theme} label="Community Name" value={eName} onChangeText={setEName} />
                <ClayInput theme={theme} label="Description" multiline value={eDesc} onChangeText={setEDesc} />
                <ClayInput theme={theme} label="Community Rules / Guidelines" multiline value={eRules} onChangeText={setERules} />
                <ClayButton theme={theme} variant="pri" label="Save Community" loading={eBusy} onPress={handleSaveEdit} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Post Comments Modal */}
        <Modal visible={!!commentPost} transparent animationType="slide" onRequestClose={() => setCommentPost(null)}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.52)", justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <View style={{ backgroundColor: theme.surf, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, maxHeight: "80%", gap: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: theme.txt, fontSize: 17, fontWeight: "800" }}>Post Discussion</Text>
                <Pressable onPress={() => setCommentPost(null)}><Ionicons name="close" size={22} color={theme.mut} /></Pressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
                {postComments.length === 0 ? (
                  <Text style={{ color: theme.mut, textAlign: "center", paddingVertical: 16 }}>No comments yet.</Text>
                ) : postComments.map((cm) => (
                  <View key={cm.id} style={{ padding: 10, borderRadius: 12, backgroundColor: theme.recessBg }}>
                    <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 12.5 }}>{cm.author_name || "Student"}</Text>
                    <Text style={{ color: theme.txt, fontSize: 13.5, marginTop: 2 }}>{cm.body}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <ClayInput theme={theme} style={{ flex: 1, marginBottom: 0 }} placeholder="Write a comment..." value={commentText} onChangeText={setCommentText} />
                <ClayButton theme={theme} variant="pri" compact icon="send" loading={commentBusy} onPress={handleSendPostComment} />
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Followers Modal */}
        <Modal visible={followersOpen} transparent animationType="slide" onRequestClose={() => setFollowersOpen(false)}>
          <Pressable onPress={() => setFollowersOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: theme.surf, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, maxHeight: "70%", gap: 10 }}>
              <Text style={{ color: theme.txt, fontSize: 17, fontWeight: "800" }}>Followers ({followersList.length})</Text>
              <ScrollView contentContainerStyle={{ gap: 10 }}>
                {followersList.map((f, idx) => (
                  <View key={f.id || idx} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <UserAvatar src={f.avatar_url} av={f.av || "ST"} bg={f.bg} size={36} />
                    <View>
                      <Text style={{ color: theme.txt, fontWeight: "700" }}>{f.name || f.username}</Text>
                      <Text style={{ color: theme.mut, fontSize: 12 }}>@{f.username}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <FlatList
        data={loading ? [] : list}
        keyExtractor={(c) => String(c.id)}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 14, paddingBottom: 120, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadList(true)} tintColor={theme.accent} />}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: theme.txt, fontSize: 22, fontWeight: "900" }}>Communities</Text>
              <ClayButton
                theme={theme}
                variant="pri"
                compact
                icon="add"
                label="Create"
                onPress={() => (user ? setCreateOpen(true) : onRequireAuth("create a community"))}
              />
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <FacultyDropdown
                theme={theme}
                options={CATEGORIES.map((c) => ({ label: c, value: c }))}
                value={category}
                onChange={setCategory}
                placeholder="All Categories"
                icon="compass-outline"
                style={{ flex: 1 }}
              />
              <MorphismSearchInput
                theme={theme}
                value={q}
                onChangeText={setQ}
                placeholder="Search..."
              />
            </View>

            {loading ? <FeedSkeletonList theme={theme} count={3} /> : null}
          </View>
        }
        renderItem={({ item: comm }) => (
          <Pressable onPress={() => openCommunity(comm)}>
            <ClayCard theme={theme} level={1} style={{ padding: 15, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <UserAvatar src={comm.avatar_url} av={(comm.name || "C").slice(0, 2)} bg={theme.accent} size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15.5 }} numberOfLines={1}>{comm.name}</Text>
                <Text style={{ color: theme.mut, fontSize: 12.5 }} numberOfLines={1}>
                  {comm.category} · {comm.followers_count || 0} followers
                </Text>
                {comm.description ? (
                  <Text style={{ color: theme.mut, fontSize: 12.5 }} numberOfLines={2}>{comm.description}</Text>
                ) : null}
              </View>
              <ClayButton
                theme={theme}
                variant={comm.is_following ? "out" : "pri"}
                compact
                label={comm.is_following ? "Joined" : "Follow"}
                onPress={() => toggleFollow(comm)}
              />
            </ClayCard>
          </Pressable>
        )}
      />

      {/* Create Community Modal */}
      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.52)", justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={{ backgroundColor: theme.surf, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20 }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <Text style={{ color: theme.txt, fontSize: 18, fontWeight: "800" }}>Create Community</Text>
                <Pressable onPress={() => setCreateOpen(false)}><Ionicons name="close" size={22} color={theme.mut} /></Pressable>
              </View>
              <ClayInput theme={theme} label="Community Name *" value={cName} onChangeText={setCName} />
              <ClayInput theme={theme} label="Description *" multiline value={cDesc} onChangeText={setCDesc} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
                {CATEGORIES.filter((c) => c !== "All").map((cat) => (
                  <ClayPill key={cat} theme={theme} label={cat} active={cCat === cat} onPress={() => setCCat(cat)} />
                ))}
              </ScrollView>
              <ClayButton theme={theme} variant="pri" label="Create Community" loading={cBusy} onPress={handleCreateCommunity} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
