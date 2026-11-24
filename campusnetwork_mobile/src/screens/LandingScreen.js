/**
 * Website-Faithful Mobile Landing Screen (mirrors /welcome LandingPage.jsx)
 * Shown ONLY to unauthenticated users on app launch.
 * Preserves website imagery, branding, typography, colors, and hierarchy.
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BrandMark, ClayButton } from "../components/ClayUI";

const HERO_SLIDES = [
  require("../../assets/bg.webp"),
  require("../../assets/bgg.webp"),
  require("../../assets/bggg.webp"),
  require("../../assets/bgggg.webp"),
];

export default function LandingScreen({ theme, onLogin, onRegister, onGuest }) {
  const [slideIdx, setSlideIdx] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const t = setInterval(() => {
      Animated.timing(fade, { toValue: 0.35, duration: 350, useNativeDriver: true }).start(() => {
        setSlideIdx((p) => (p + 1) % HERO_SLIDES.length);
        Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      });
    }, 4800);
    return () => clearInterval(t);
  }, [fade]);

  return (
    <View style={{ flex: 1, backgroundColor: "#0B0D14" }}>
      {/* Top Hero Photography with cross-fade */}
      <View style={{ height: "46%", width: "100%", overflow: "hidden", position: "relative" }}>
        <Animated.Image
          source={HERO_SLIDES[slideIdx]}
          style={[StyleSheet.absoluteFill, { opacity: fade }]}
          resizeMode="cover"
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: "rgba(9,12,22,0.58)",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              paddingBottom: 24,
            },
          ]}
        >
          <BrandMark size={64} />
          <Text style={{ color: "#FFFFFF", fontSize: 26, fontWeight: "900", letterSpacing: -0.4 }}>
            Campus<Text style={{ color: "#60A5FA" }}>Network</Text>
          </Text>
        </View>
      </View>

      {/* Curved Dark Morphism Sheet matching website /welcome */}
      <View
        style={{
          flex: 1,
          marginTop: -36,
          backgroundColor: "#11131B",
          borderTopLeftRadius: 36,
          borderTopRightRadius: 36,
          paddingHorizontal: 26,
          paddingTop: 32,
          paddingBottom: 34,
          justifyContent: "space-between",
          borderTopWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        <View style={{ alignItems: "center", gap: 12 }}>
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 30,
              fontWeight: "900",
              textAlign: "center",
              lineHeight: 36,
              letterSpacing: -0.5,
            }}
          >
            Your Campus.{"\n"}Your Community.{"\n"}Your Connection.
          </Text>
          <Text
            style={{
              color: "#94A3B8",
              fontSize: 14.5,
              textAlign: "center",
              lineHeight: 22,
              maxWidth: 320,
            }}
          >
            Discover campus conversations, explore academic PDF resources, and stay connected with the ATBU community.
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          <ClayButton theme={theme} variant="pri" label="Log In" onPress={onLogin} />
          <ClayButton theme={theme} variant="out" label="Sign Up" onPress={onRegister} />
          <Pressable
            onPress={onGuest}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 }}
          >
            <Text style={{ color: "#60A5FA", fontWeight: "700", fontSize: 14 }}>Continue as Guest</Text>
            <Ionicons name="chevron-forward" size={16} color="#60A5FA" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
