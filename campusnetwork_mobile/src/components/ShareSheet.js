/**
 * Radial Fan Share Animation (matches website ShareFan.jsx & Share Button reference video!)
 * - 5 circular buttons (X, LinkedIn, WhatsApp, Email, Copy Link) fan out in an upper arc
 *   with staggered spring animation, tap-outside dismissal, and real working share actions.
 */
import React, { useEffect, useRef } from "react";
import { Animated, Linking, Modal, Pressable, Share, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { clayShadow } from "../theme/tokens";

const ANGLES_DEG = [165, 132, 90, 48, 15]; // Upper semicircle fan arc
const RADIUS = 96;

export default function ShareSheet({ visible, onClose, theme, url, title, toast }) {
  const anims = useRef(ANGLES_DEG.map(() => new Animated.Value(0))).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      backdrop.setValue(0);
      anims.forEach((a) => a.setValue(0));
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.stagger(
          38,
          anims.map((a) =>
            Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 11 })
          )
        ),
      ]).start();
    }
  }, [visible, anims, backdrop]);

  if (!visible) return null;

  const shareUrl = url || "https://campusnetwork-sooty.vercel.app";
  const shareText = title || "Check this out on CampusNetwork";

  const items = [
    {
      id: "x",
      label: "X",
      icon: "logo-twitter",
      color: "#F8FAFC",
      bg: "#111827",
      run: async () => {
        await Linking.openURL(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
        );
        onClose();
      },
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      icon: "logo-linkedin",
      color: "#FFFFFF",
      bg: "#0A66C2",
      run: async () => {
        await Linking.openURL(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`);
        onClose();
      },
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      icon: "logo-whatsapp",
      color: "#FFFFFF",
      bg: "#25D366",
      run: async () => {
        await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`);
        onClose();
      },
    },
    {
      id: "email",
      label: "Email",
      icon: "mail",
      color: "#FFFFFF",
      bg: "#F59E0B",
      run: async () => {
        await Linking.openURL(
          `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`
        );
        onClose();
      },
    },
    {
      id: "copy",
      label: "Copy",
      icon: "link",
      color: "#FFFFFF",
      bg: "#2563EB",
      run: async () => {
        await Clipboard.setStringAsync(shareUrl);
        toast && toast("Link copied to clipboard!", "success");
        onClose();
      },
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: "flex-end", alignItems: "center", paddingBottom: 110 }}>
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.45)",
            opacity: backdrop,
          }}
        />

        {/* Radial Fan Anchor */}
        <View style={{ width: 260, height: 150, alignItems: "center", justifyContent: "flex-end" }}>
          {items.map((it, idx) => {
            const rad = (ANGLES_DEG[idx] * Math.PI) / 180;
            const targetX = Math.cos(rad) * RADIUS;
            const targetY = -Math.sin(rad) * RADIUS;
            const tx = anims[idx].interpolate({ inputRange: [0, 1], outputRange: [0, targetX] });
            const ty = anims[idx].interpolate({ inputRange: [0, 1], outputRange: [0, targetY] });
            const sc = anims[idx].interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
            const op = anims[idx].interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] });

            return (
              <Animated.View
                key={it.id}
                style={{
                  position: "absolute",
                  bottom: 14,
                  opacity: op,
                  transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
                }}
              >
                <Pressable
                  onPress={it.run}
                  style={[
                    {
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: it.bg,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1.5,
                      borderColor: "rgba(255,255,255,0.22)",
                    },
                    clayShadow(theme, 2),
                  ]}
                  accessibilityLabel={it.label}
                >
                  <Ionicons name={it.icon} size={20} color={it.color} />
                </Pressable>
              </Animated.View>
            );
          })}

          {/* Center System Share + Close pill */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable
              onPress={async () => {
                onClose();
                await Share.share({ message: `${shareText}\n${shareUrl}`, url: shareUrl, title: shareText }).catch(() => {});
              }}
              style={[
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 99,
                  backgroundColor: theme.surf,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                },
                clayShadow(theme, 2),
              ]}
            >
              <Ionicons name="share-social-outline" size={16} color={theme.accent} />
              <Text style={{ color: theme.txt, fontWeight: "700", fontSize: 13 }}>More Apps</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "#0B1220",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
