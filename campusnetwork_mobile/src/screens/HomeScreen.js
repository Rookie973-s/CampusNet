/**
 * Website-Faithful Home Screen (mirrors HomePage.jsx)
 * - Cross-fading 4-image Hero slideshow (bg.webp, bgg.webp, bggg.webp, bgggg.webp)
 * - Auto-advancing Feature Carousel (with manual swipe + dot indicators + touch pause)
 * - Auto-advancing Browse by Faculty strip (manual swipe + zero clipping)
 * - Trending Discussions preview + Auto-hide nav onScroll support
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated, Dimensions, Image, Pressable, RefreshControl, ScrollView, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ClayButton, ClayCard, UserAvatar, VerifiedBadge } from "../components/ClayUI";
import { RADII } from "../theme/tokens";

const { width: SCREEN_W } = Dimensions.get("window");
const FEATURE_CARD_W = SCREEN_W - 28;
const FACULTY_CARD_W = 148;

const HERO_SLIDES = [
  require("../../assets/bg.webp"),
  require("../../assets/bgg.webp"),
  require("../../assets/bggg.webp"),
  require("../../assets/bgggg.webp"),
];

const FEATURES = [
  {
    badge: "Q&A FEED",
    title: "Ask Anything. Get Verified Campus Answers.",
    desc: "Post academic or campus questions, tag faculties, attach photos or videos, and learn from peers and SUG leaders.",
    icon: "chatbubbles",
    color: "#3B82F6",
    tab: "feed",
  },
  {
    badge: "PDF LIBRARY",
    title: "Organized Course Notes & Past Questions",
    desc: "Filter by Academic Faculty, Department, and Level to find curated lecture PDFs uploaded by approved Class Reps.",
    icon: "book",
    color: "#10B981",
    tab: "library",
  },
  {
    badge: "VERIFIED SUG",
    title: "Rate & Message SUG Officials Directly",
    desc: "Browse verified Student Union representatives, submit performance ratings, and start private conversations.",
    icon: "shield-checkmark",
    color: "#F59E0B",
    tab: "sug",
  },
  {
    badge: "COMMUNITIES",
    title: "Join Departmental & Campus Clubs",
    desc: "Follow official announcements, student tech groups, societies, and faculty channels in one place.",
    icon: "compass",
    color: "#8B5CF6",
    tab: "communities",
  },
];

export default function HomeScreen({
  theme,
  user,
  departments = [],
  trendingQuestions = [],
  onNavigate,
  onSelectTopic,
  onOpenQuestion,
  onRequireAuth,
  onRefresh,
  refreshing,
  onScroll,
}) {
  // 1. Cross-fading Hero Slideshow
  const [heroIdx, setHeroIdx] = useState(0);
  const heroFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      Animated.timing(heroFade, { toValue: 0.35, duration: 320, useNativeDriver: true }).start(() => {
        setHeroIdx((prev) => (prev + 1) % HERO_SLIDES.length);
        Animated.timing(heroFade, { toValue: 1, duration: 480, useNativeDriver: true }).start();
      });
    }, 5200);
    return () => clearInterval(timer);
  }, [heroFade]);

  // 2. Auto-Advancing Feature Carousel
  const featureRef = useRef(null);
  const [featureIdx, setFeatureIdx] = useState(0);
  const featurePaused = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      if (featurePaused.current) return;
      setFeatureIdx((prev) => {
        const next = (prev + 1) % FEATURES.length;
        featureRef.current?.scrollTo({ x: next * (FEATURE_CARD_W + 12), animated: true });
        return next;
      });
    }, 4200);
    return () => clearInterval(timer);
  }, []);

  // 3. Auto-Advancing Browse by Faculty Strip
  const facultyRef = useRef(null);
  const facultyIdx = useRef(0);
  const facultyPaused = useRef(false);

  useEffect(() => {
    if (!departments.length) return;
    const timer = setInterval(() => {
      if (facultyPaused.current) return;
      facultyIdx.current = (facultyIdx.current + 1) % departments.length;
      facultyRef.current?.scrollTo({
        x: facultyIdx.current * (FACULTY_CARD_W + 10),
        animated: true,
      });
    }, 3600);
    return () => clearInterval(timer);
  }, [departments.length]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingBottom: 112 }}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      refreshControl={<RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
    >
      {/* Hero Banner with 4 Cross-Fading Slides */}
      <View style={{ height: 320, width: "100%", position: "relative", overflow: "hidden", backgroundColor: "#0B1220" }}>
        <Animated.Image
          source={HERO_SLIDES[heroIdx]}
          style={{ width: "100%", height: "100%", position: "absolute", opacity: heroFade }}
          resizeMode="cover"
        />
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(9,13,24,0.62)",
            paddingHorizontal: 20,
            paddingTop: 28,
            paddingBottom: 22,
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: "rgba(37,99,235,0.28)",
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: RADII.pill,
              }}
            >
              <Ionicons name="sparkles" size={13} color="#93C5FD" />
              <Text style={{ color: "#DBEAFE", fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6 }}>
                ATBU CAMPUS HUB
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 5 }}>
              {HERO_SLIDES.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === heroIdx ? 16 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: i === heroIdx ? "#60A5FA" : "rgba(255,255,255,0.38)",
                  }}
                />
              ))}
            </View>
          </View>

          <View>
            <Text style={{ color: "#FFFFFF", fontSize: 28, fontWeight: "900", lineHeight: 33 }}>
              Your Campus.{"\n"}Your Community.
            </Text>
            <Text style={{ color: "#CBD5E1", fontSize: 13.5, lineHeight: 20, marginTop: 8 }}>
              Ask questions, explore course PDFs, join student communities, and message verified SUG leaders.
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <ClayButton
              theme={theme}
              variant="pri"
              label="Explore Feed"
              icon="arrow-forward"
              style={{ flex: 1 }}
              onPress={() => onNavigate("feed")}
            />
            <ClayButton
              theme={theme}
              variant="out"
              label={user ? "PDF Library" : "Join Free"}
              style={{ flex: 1 }}
              onPress={() => (user ? onNavigate("library") : onRequireAuth("create an account"))}
            />
          </View>
        </View>
      </View>

      {/* Auto-Advancing Feature Carousel */}
      <View style={{ paddingTop: 18 }}>
        <View style={{ paddingHorizontal: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <Text style={{ color: theme.txt, fontSize: 17, fontWeight: "800" }}>What You Can Do</Text>
          <View style={{ flexDirection: "row", gap: 5 }}>
            {FEATURES.map((_, idx) => (
              <Pressable
                key={idx}
                onPress={() => {
                  setFeatureIdx(idx);
                  featureRef.current?.scrollTo({ x: idx * (FEATURE_CARD_W + 12), animated: true });
                }}
              >
                <View
                  style={{
                    width: featureIdx === idx ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: featureIdx === idx ? theme.accent : theme.faint,
                  }}
                />
              </Pressable>
            ))}
          </View>
        </View>

        <ScrollView
          ref={featureRef}
          horizontal
          pagingEnabled={false}
          snapToInterval={FEATURE_CARD_W + 12}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, gap: 12, paddingVertical: 4 }}
          onScrollBeginDrag={() => { featurePaused.current = true; }}
          onScrollEndDrag={() => { setTimeout(() => { featurePaused.current = false; }, 4500); }}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / (FEATURE_CARD_W + 12));
            setFeatureIdx(Math.max(0, Math.min(FEATURES.length - 1, idx)));
          }}
        >
          {FEATURES.map((f) => (
            <Pressable key={f.title} onPress={() => onNavigate(f.tab)} style={{ width: FEATURE_CARD_W }}>
              <ClayCard theme={theme} level={2} style={{ padding: 18, gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: `${f.color}20`,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name={f.icon} size={20} color={f.color} />
                    </View>
                    <Text style={{ color: f.color, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.8 }}>
                      {f.badge}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward-circle" size={24} color={theme.accent} />
                </View>
                <Text style={{ color: theme.txt, fontSize: 17, fontWeight: "800", lineHeight: 22 }}>{f.title}</Text>
                <Text style={{ color: theme.mut, fontSize: 13.5, lineHeight: 20 }}>{f.desc}</Text>
              </ClayCard>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Auto-Advancing Browse by Faculty Strip */}
      {departments.length > 0 ? (
        <View style={{ marginTop: 18 }}>
          <View style={{ paddingHorizontal: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ color: theme.txt, fontSize: 17, fontWeight: "800" }}>Browse by Faculty</Text>
            <Pressable onPress={() => onNavigate("feed")}>
              <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 13 }}>See all</Text>
            </Pressable>
          </View>
          <ScrollView
            ref={facultyRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 14, gap: 10, paddingVertical: 4 }}
            onScrollBeginDrag={() => { facultyPaused.current = true; }}
            onScrollEndDrag={() => { setTimeout(() => { facultyPaused.current = false; }, 5000); }}
          >
            {departments.map((d) => (
              <Pressable
                key={d.id}
                onPress={() => { onSelectTopic && onSelectTopic(d.name); onNavigate("feed"); }}
                style={{ width: FACULTY_CARD_W }}
              >
                <ClayCard theme={theme} level={1} style={{ padding: 14, gap: 8 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: d.color || theme.accent }} />
                  <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 14 }} numberOfLines={1}>{d.name}</Text>
                  <Text style={{ color: theme.mut, fontSize: 12 }}>{d.questions_count || 0} discussions</Text>
                </ClayCard>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Trending Discussions */}
      <View style={{ paddingHorizontal: 14, marginTop: 20, gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: theme.txt, fontSize: 17, fontWeight: "800" }}>Trending Discussions</Text>
          <Pressable onPress={() => onNavigate("feed")}>
            <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 13 }}>Open Feed</Text>
          </Pressable>
        </View>

        {trendingQuestions.slice(0, 4).map((q) => (
          <Pressable key={q.id} onPress={() => onOpenQuestion(q)}>
            <ClayCard theme={theme} level={1} style={{ padding: 14, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <UserAvatar src={q.author_avatar_url} av={q.author_av || "CN"} bg={q.author_bg} size={28} />
                <Text style={{ color: theme.txt, fontWeight: "700", fontSize: 13 }} numberOfLines={1}>
                  {q.author_name || "Student"}
                </Text>
                {q.author_is_verified_student ? <VerifiedBadge size={13} /> : null}
                <Text style={{ color: theme.faint, fontSize: 12, marginLeft: "auto" }}>{q.dept_name}</Text>
              </View>
              <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15, lineHeight: 21 }} numberOfLines={2}>
                {q.title}
              </Text>
              <Text style={{ color: theme.mut, fontSize: 12.5 }}>
                {q.likes_count || 0} likes · {q.answers_count || 0} answers
              </Text>
            </ClayCard>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
