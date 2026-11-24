/**
 * Redesigned SUG Directory Screen
 * - Reusable FacultyDropdown + MorphismSearchInput
 * - Implements the SUG CARD vertical 3-slot stacked wheel/accordion motion from reference video:
 *   Top peeking compact summary pill -> Smoothly expanded Center Active Card -> Bottom peeking summary pill
 * - Tap peeking card or swipe/arrow to animate next/prev SUG official smoothly into focus!
 * - Fixed SUG Messaging (/api/chats/start/), Rating Modal, and clickable profiles
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated, KeyboardAvoidingView, Modal, PanResponder, Platform,
  Pressable, RefreshControl, ScrollView, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ClayButton, ClayCard, ClayInput, FacultyDropdown, FeedSkeletonList,
  MorphismSearchInput, UserAvatar, VerifiedBadge,
} from "../components/ClayUI";
import { chatApi, staffApi, usersApi } from "../api";

export default function SugScreen({
  theme,
  user,
  departments = [],
  onRequireAuth,
  onOpenChat,
  onOpenApplySug,
  onOpenAuthor,
  toast,
}) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [activeIdx, setActiveIdx] = useState(0);
  const [msgBusyId, setMsgBusyId] = useState(null);

  // Card wheel animation
  const cardAnim = useRef(new Animated.Value(1)).current;
  const slideY = useRef(new Animated.Value(0)).current;

  // Rate modal
  const [rateTarget, setRateTarget] = useState(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [ratingBusy, setRatingBusy] = useState(false);

  const facultyOptions = useMemo(
    () => [
      { label: "All Faculties", value: "All" },
      ...departments.map((d) => ({ label: d.name, value: d.name, color: d.color })),
    ],
    [departments]
  );

  const loadSug = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await staffApi.list();
      setList(data || []);
    } catch (e) {
      toast && toast(e.message || "Could not load SUG directory.", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, toast]);

  useEffect(() => { loadSug(false); }, [loadSug]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((s) => {
      if (deptFilter !== "All" && s.dept_name !== deptFilter && s.dept !== deptFilter) return false;
      if (!q) return true;
      return (
        (s.name || "").toLowerCase().includes(q) ||
        (s.username || "").toLowerCase().includes(q) ||
        (s.title || "").toLowerCase().includes(q)
      );
    });
  }, [list, search, deptFilter]);

  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(0);
  }, [filtered.length, activeIdx]);

  const transitionTo = useCallback((nextIndex, direction = 1) => {
    if (!filtered.length) return;
    const wrapped = (nextIndex + filtered.length) % filtered.length;
    slideY.setValue(direction * 36);
    cardAnim.setValue(0.92);
    setActiveIdx(wrapped);
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 7 }),
      Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 7 }),
    ]).start();
  }, [filtered.length, slideY, cardAnim]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 18 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderRelease: (_, g) => {
          if (g.dy < -32 && filtered.length > 1) transitionTo(activeIdx + 1, 1);
          else if (g.dy > 32 && filtered.length > 1) transitionTo(activeIdx - 1, -1);
        },
      }),
    [activeIdx, filtered.length, transitionTo]
  );

  const handleMessage = async (rep) => {
    if (!user) { onRequireAuth("message SUG officials"); return; }
    setMsgBusyId(rep.id);
    try {
      const convo = await chatApi.start(rep.id);
      if (convo?.id && onOpenChat) onOpenChat(convo.id);
      else toast && toast("Conversation opened!", "success");
    } catch (e) {
      toast && toast(e.message || "Could not start conversation.", "error");
    } finally {
      setMsgBusyId(null);
    }
  };

  const handleSubmitRating = async () => {
    if (!rateTarget) return;
    setRatingBusy(true);
    try {
      await usersApi.rateSug(rateTarget.id, stars, comment.trim());
      toast && toast("Thanks for rating this SUG representative!", "success");
      setRateTarget(null);
      setComment("");
      setStars(5);
      loadSug(false);
    } catch (e) {
      toast && toast(e.message || "Could not submit rating.", "error");
    } finally {
      setRatingBusy(false);
    }
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, padding: 20, justifyContent: "center" }}>
        <ClayCard theme={theme} level={2} style={{ padding: 26, alignItems: "center", gap: 10 }}>
          <Ionicons name="shield-checkmark-outline" size={48} color="#F59E0B" />
          <Text style={{ color: theme.txt, fontSize: 20, fontWeight: "800" }}>Meet the SUG</Text>
          <Text style={{ color: theme.mut, fontSize: 13.5, textAlign: "center", lineHeight: 20 }}>
            Sign in to view verified Student Union representatives, rate performance, and send private messages.
          </Text>
          <ClayButton theme={theme} variant="pri" label="Sign In to View SUG" onPress={() => onRequireAuth("view the SUG directory")} />
        </ClayCard>
      </View>
    );
  }

  const activeRep = filtered[activeIdx] || null;
  const prevRep = filtered.length > 1 ? filtered[(activeIdx - 1 + filtered.length) % filtered.length] : null;
  const nextRep = filtered.length > 1 ? filtered[(activeIdx + 1) % filtered.length] : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 14, paddingBottom: 120, gap: 12 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadSug(true)} tintColor={theme.accent} />}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: theme.txt, fontSize: 22, fontWeight: "900" }}>Meet the SUG</Text>
        <Pressable onPress={onOpenApplySug}>
          <Text style={{ color: theme.accent, fontWeight: "800", fontSize: 13.5 }}>Apply for SUG</Text>
        </Pressable>
      </View>

      {/* Reusable FacultyDropdown + MorphismSearchInput */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <FacultyDropdown
          theme={theme}
          options={facultyOptions}
          value={deptFilter}
          onChange={setDeptFilter}
          placeholder="All Faculties"
          style={{ flex: 1 }}
        />
        <MorphismSearchInput
          theme={theme}
          value={search}
          onChangeText={setSearch}
          placeholder="Search SUG..."
        />
      </View>

      {loading ? (
        <FeedSkeletonList theme={theme} count={2} />
      ) : !activeRep ? (
        <ClayCard theme={theme} style={{ padding: 28, alignItems: "center", gap: 8 }}>
          <Ionicons name="people-outline" size={38} color={theme.faint} />
          <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }}>No SUG officials found</Text>
          <Text style={{ color: theme.mut, fontSize: 13 }}>Try adjusting your search or faculty filter.</Text>
        </ClayCard>
      ) : (
        <View style={{ gap: 10, marginTop: 4 }} {...panResponder.panHandlers}>
          {/* Top Peeking Pill (SUG CARD reference!) */}
          {prevRep ? (
            <Pressable onPress={() => transitionTo(activeIdx - 1, -1)} style={{ paddingHorizontal: 10, opacity: 0.78 }}>
              <ClayCard theme={theme} level={1} style={{ paddingHorizontal: 14, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 20 }}>
                <UserAvatar src={prevRep.avatar_url} av={prevRep.av || "SG"} bg={prevRep.bg} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 13.5 }} numberOfLines={1}>{prevRep.name}</Text>
                  <Text style={{ color: theme.mut, fontSize: 11.5 }} numberOfLines={1}>{prevRep.title || "SUG Official"}</Text>
                </View>
                <Ionicons name="chevron-up" size={18} color={theme.faint} />
              </ClayCard>
            </Pressable>
          ) : null}

          {/* Center Expanded Active SUG Card with Spring Motion */}
          <Animated.View style={{ transform: [{ translateY: slideY }, { scale: cardAnim }] }}>
            <ClayCard theme={theme} level={3} style={{ overflow: "hidden", borderRadius: 24 }}>
              <View
                style={{
                  backgroundColor: "#0B1220",
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="shield-checkmark" size={15} color="#60A5FA" />
                  <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13 }}>Verified SUG</Text>
                </View>
                {activeRep.dept_name || activeRep.dept ? (
                  <View style={{ backgroundColor: "rgba(255,255,255,0.14)", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 }}>
                    <Text style={{ color: "#E2E8F0", fontSize: 11.5, fontWeight: "700" }}>{activeRep.dept_name || activeRep.dept}</Text>
                  </View>
                ) : null}
              </View>

              <View style={{ padding: 18, gap: 14 }}>
                <Pressable
                  onPress={() => activeRep.id && onOpenAuthor && onOpenAuthor(activeRep.id)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
                >
                  <UserAvatar src={activeRep.avatar_url} av={activeRep.av || "SG"} bg={activeRep.bg} size={64} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={{ color: theme.txt, fontWeight: "900", fontSize: 18 }} numberOfLines={1}>
                        {activeRep.name}
                      </Text>
                      {activeRep.is_verified_student ? <VerifiedBadge size={15} /> : null}
                    </View>
                    {activeRep.username ? (
                      <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 13 }}>@{activeRep.username}</Text>
                    ) : null}
                    <Text style={{ color: theme.mut, fontSize: 13, marginTop: 2 }}>{activeRep.title || "SUG Official"}</Text>
                  </View>
                </Pressable>

                {activeRep.bio ? (
                  <Text style={{ color: theme.txt, fontSize: 13.5, lineHeight: 20 }}>{activeRep.bio}</Text>
                ) : null}

                <View
                  style={{
                    flexDirection: "row",
                    backgroundColor: theme.recessBg,
                    borderRadius: 16,
                    padding: 13,
                    alignItems: "center",
                    justifyContent: "space-around",
                  }}
                >
                  <View style={{ alignItems: "center", gap: 3 }}>
                    <View style={{ flexDirection: "row", gap: 2 }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Ionicons
                          key={n}
                          name={n <= Math.round(Number(activeRep.sug_rating || 0)) ? "star" : "star-outline"}
                          size={15}
                          color="#F59E0B"
                        />
                      ))}
                    </View>
                    <Text style={{ color: theme.mut, fontSize: 11.5, fontWeight: "600" }}>
                      {activeRep.sug_ratings_count > 0
                        ? `${Number(activeRep.sug_rating).toFixed(1)} (${activeRep.sug_ratings_count})`
                        : "Not rated yet"}
                    </Text>
                  </View>
                  <View style={{ width: 1, height: 28, backgroundColor: theme.faint, opacity: 0.3 }} />
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ color: theme.txt, fontWeight: "900", fontSize: 18 }}>{activeRep.answers || 0}</Text>
                    <Text style={{ color: theme.mut, fontSize: 11.5, fontWeight: "600" }}>Answers on Cenet</Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <ClayButton
                    theme={theme}
                    variant="navy"
                    compact
                    style={{ flex: 1 }}
                    label="Rate Official"
                    icon="star-outline"
                    onPress={() => setRateTarget(activeRep)}
                  />
                  <ClayButton
                    theme={theme}
                    variant="pri"
                    compact
                    style={{ flex: 1 }}
                    label="Message"
                    icon="chatbubble-outline"
                    loading={msgBusyId === activeRep.id}
                    onPress={() => handleMessage(activeRep)}
                  />
                </View>
              </View>
            </ClayCard>
          </Animated.View>

          {/* Bottom Peeking Pill (SUG CARD reference!) */}
          {nextRep ? (
            <Pressable onPress={() => transitionTo(activeIdx + 1, 1)} style={{ paddingHorizontal: 10, opacity: 0.78 }}>
              <ClayCard theme={theme} level={1} style={{ paddingHorizontal: 14, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 20 }}>
                <UserAvatar src={nextRep.avatar_url} av={nextRep.av || "SG"} bg={nextRep.bg} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 13.5 }} numberOfLines={1}>{nextRep.name}</Text>
                  <Text style={{ color: theme.mut, fontSize: 11.5 }} numberOfLines={1}>{nextRep.title || "Tap or swipe up to view"}</Text>
                </View>
                <Ionicons name="chevron-down" size={18} color={theme.faint} />
              </ClayCard>
            </Pressable>
          ) : null}

          {filtered.length > 1 ? (
            <Text style={{ color: theme.faint, textAlign: "center", fontSize: 12, fontWeight: "700", marginTop: 2 }}>
              {activeIdx + 1} / {filtered.length} · Swipe card or tap pills to cycle
            </Text>
          ) : null}
        </View>
      )}

      {/* Rate SUG Modal */}
      <Modal visible={!!rateTarget} transparent animationType="slide" onRequestClose={() => setRateTarget(null)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={{ backgroundColor: theme.surf, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, gap: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: theme.txt, fontSize: 18, fontWeight: "800" }}>Rate {rateTarget?.name}</Text>
              <Pressable onPress={() => setRateTarget(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.mut} />
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 12, paddingVertical: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setStars(n)} hitSlop={6}>
                  <Ionicons name={n <= stars ? "star" : "star-outline"} size={34} color="#F59E0B" />
                </Pressable>
              ))}
            </View>
            <ClayInput theme={theme} label="Performance Feedback (Optional)" placeholder="Share constructive feedback..." multiline value={comment} onChangeText={setComment} />
            <ClayButton theme={theme} variant="pri" label="Submit Rating" loading={ratingBusy} onPress={handleSubmitRating} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}
