/**
 * CampusNetwork (Cenet) Morphism Native UI Kit
 * - Transparent BrandMark (white background removed!)
 * - Soft dark/light morphism cards, buttons, pills, rock-solid ClayInput
 * - Reusable FacultyDropdown (Modal overlay — ALWAYS renders above all cards!)
 * - Reusable MorphismSearchInput (matches SEARCH BEHAVIOR video!)
 * - Real backend-driven NativeAdCard for Feed & Library
 * - X/Instagram AnimatedLikeButton + Skeleton loaders
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Image, Linking, Modal, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { clayShadow, RADII } from "../theme/tokens";
import { adsApi } from "../api";

const LOGO_SRC = require("../../assets/cenet-logo.png");

/** Transparent CampusNetwork official logo (white background removed!). */
export function BrandMark({ size = 36, style }) {
  return (
    <Image
      source={LOGO_SRC}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
    />
  );
}

/** Raised soft-clay / glass-morphism surface. */
export function ClayCard({ theme, level = 1, style, children }) {
  return (
    <View
      style={[
        {
          backgroundColor: theme.surf,
          borderRadius: RADII.lg,
          borderWidth: 1,
          borderColor: theme.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
          ...clayShadow(theme, level),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Tactile spring-animated button matching website .btn variants (pri | navy | out | ghost | danger). */
export function ClayButton({
  theme,
  variant = "pri",
  label,
  icon,
  onPress,
  disabled = false,
  loading = false,
  compact = false,
  style,
  textStyle,
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 42, bounciness: 6 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 32, bounciness: 8 }).start();

  const bgMap = {
    pri: theme.accent,
    navy: theme.navy,
    out: theme.surf,
    ghost: "transparent",
    danger: theme.danger,
  };
  const fgMap = {
    pri: "#FFFFFF",
    navy: theme.navyTxt,
    out: theme.txt,
    ghost: theme.mut,
    danger: "#FFFFFF",
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled || loading}
        style={[
          {
            minHeight: compact ? 36 : 46,
            paddingHorizontal: compact ? 14 : 20,
            borderRadius: compact ? RADII.pill : RADII.md,
            backgroundColor: bgMap[variant] || theme.accent,
            borderWidth: variant === "out" ? 1 : 0,
            borderColor: theme.isDark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.08)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: disabled || loading ? 0.52 : 1,
          },
          variant !== "ghost" && clayShadow(theme, 1),
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={fgMap[variant]} />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={compact ? 15 : 17} color={fgMap[variant]} /> : null}
            {label ? (
              <Text style={[{ color: fgMap[variant], fontWeight: "700", fontSize: compact ? 13 : 14.5 }, textStyle]}>
                {label}
              </Text>
            ) : null}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Rock-solid recessed morphism input field (zero elevation toggle on focus!). */
export function ClayInput({
  theme,
  label,
  error,
  leftIcon,
  rightSlot,
  style,
  inputStyle,
  onFocus,
  onBlur,
  multiline,
  ...props
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  return (
    <View style={[{ marginBottom: 12 }, style]}>
      {label ? (
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: theme.mut, marginBottom: 6, marginLeft: 4 }}>
          {label}
        </Text>
      ) : null}
      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={{
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          backgroundColor: focused ? theme.surf : theme.recessBg,
          borderRadius: RADII.md,
          paddingHorizontal: 14,
          minHeight: multiline ? 96 : 48,
          gap: 8,
          borderWidth: 1.5,
          borderColor: error
            ? theme.danger
            : focused
            ? theme.accent
            : theme.isDark
            ? "rgba(255,255,255,0.07)"
            : "rgba(15,23,42,0.06)",
        }}
      >
        {leftIcon ? (
          <Ionicons
            name={leftIcon}
            size={17}
            color={focused ? theme.accent : theme.faint}
            style={multiline ? { marginTop: 14 } : undefined}
          />
        ) : null}
        <TextInput
          ref={inputRef}
          multiline={multiline}
          placeholderTextColor={theme.faint}
          selectionColor={theme.accent}
          underlineColorAndroid="transparent"
          {...props}
          onFocus={(e) => {
            setFocused(true);
            onFocus && onFocus(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur && onBlur(e);
          }}
          style={[
            {
              flex: 1,
              color: theme.txt,
              fontSize: 14.5,
              minHeight: multiline ? 88 : 44,
              paddingVertical: multiline ? 12 : 10,
              textAlignVertical: multiline ? "top" : "center",
            },
            inputStyle,
          ]}
        />
        {rightSlot}
      </Pressable>
      {error ? (
        <Text style={{ color: theme.danger, fontSize: 12, fontWeight: "600", marginTop: 5, marginLeft: 4 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Reusable FacultyDropdown — replaces horizontal faculty filter bars across Feed, Library, SUG & Communities.
 * Renders via a transparent Modal overlay so it ALWAYS appears above every card and never clips!
 */
export function FacultyDropdown({
  theme,
  options = [], // [{ label, value, color? }]
  value,
  onChange,
  placeholder = "All Faculties",
  icon = "school-outline",
  style,
}) {
  const [open, setOpen] = useState(false);
  const scale = useRef(new Animated.Value(0.94)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const activeObj = options.find((o) => String(o.value) === String(value));
  const activeLabel = activeObj?.label || placeholder;

  const openMenu = () => {
    setOpen(true);
    scale.setValue(0.94);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 6 }),
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
  };

  return (
    <View style={style}>
      <Pressable
        onPress={openMenu}
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: theme.surf,
            borderRadius: RADII.pill,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: value && value !== "All"
              ? theme.accent
              : theme.isDark
              ? "rgba(255,255,255,0.09)"
              : "rgba(15,23,42,0.08)",
            gap: 8,
          },
          clayShadow(theme, 1),
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          {activeObj?.color ? (
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: activeObj.color }} />
          ) : (
            <Ionicons name={icon} size={15} color={theme.accent} />
          )}
          <Text style={{ color: theme.txt, fontWeight: "700", fontSize: 13.5 }} numberOfLines={1}>
            {activeLabel}
          </Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={theme.mut} />
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.48)", justifyContent: "center", padding: 20 }}
        >
          <Animated.View
            style={{
              opacity,
              transform: [{ scale }],
              backgroundColor: theme.surf,
              borderRadius: RADII.xl,
              padding: 14,
              maxHeight: "68%",
              borderWidth: 1,
              borderColor: theme.isDark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.08)",
              ...clayShadow(theme, 3),
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 6, paddingBottom: 10 }}>
              <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15.5 }}>{placeholder}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={theme.mut} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
              {options.map((opt) => {
                const selected = String(opt.value) === String(value);
                return (
                  <Pressable
                    key={String(opt.value)}
                    onPress={() => {
                      onChange && onChange(opt.value);
                      setOpen(false);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 11,
                      borderRadius: RADII.md,
                      backgroundColor: selected ? theme.accentSoft : "transparent",
                    }}
                  >
                    {opt.color ? (
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: opt.color }} />
                    ) : (
                      <Ionicons name={icon} size={15} color={selected ? theme.accent : theme.faint} />
                    )}
                    <Text
                      style={{
                        flex: 1,
                        color: selected ? theme.accent : theme.txt,
                        fontWeight: selected ? "800" : "600",
                        fontSize: 14,
                      }}
                    >
                      {opt.label}
                    </Text>
                    {selected ? <Ionicons name="checkmark" size={18} color={theme.accent} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

/**
 * Reusable MorphismSearchInput — matches SEARCH BEHAVIOR reference video:
 * Compact rounded square search button -> expands smoothly into a full-width morphism pill
 * with magnifying glass left + animated close (×) button right.
 */
export function MorphismSearchInput({
  theme,
  value,
  onChangeText,
  placeholder = "Search...",
  defaultExpanded = false,
  style,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded || !!value);
  const anim = useRef(new Animated.Value(defaultExpanded || value ? 1 : 0)).current;
  const inputRef = useRef(null);

  const expand = () => {
    setExpanded(true);
    Animated.spring(anim, { toValue: 1, useNativeDriver: false, speed: 22, bounciness: 6 }).start(() => {
      inputRef.current?.focus();
    });
  };

  const collapse = () => {
    onChangeText && onChangeText("");
    inputRef.current?.blur();
    Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: false }).start(() => {
      setExpanded(false);
    });
  };

  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] });

  if (!expanded) {
    return (
      <Pressable
        onPress={expand}
        style={[
          {
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: theme.isDark ? "#1C212D" : "#0F172A",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.1)",
          },
          clayShadow(theme, 2),
          style,
        ]}
        accessibilityLabel="Expand search"
      >
        <Ionicons name="search" size={19} color="#FFFFFF" />
      </Pressable>
    );
  }

  return (
    <Animated.View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: theme.surf,
          borderRadius: 16,
          paddingHorizontal: 14,
          height: 46,
          gap: 10,
          borderWidth: 1,
          borderColor: theme.isDark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.08)",
          opacity: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.5, 1, 1] }),
        },
        clayShadow(theme, 2),
        style,
      ]}
    >
      <Ionicons name="search" size={18} color={theme.accent} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.faint}
        selectionColor={theme.accent}
        returnKeyType="search"
        style={{ flex: 1, color: theme.txt, fontSize: 14.5, paddingVertical: 8 }}
      />
      <Pressable onPress={collapse} hitSlop={8}>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="close" size={19} color={theme.mut} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** Real backend-driven Advertisement Card for Feed & Library (mirrors AdCard.jsx). */
export function NativeAdCard({ theme, ad, placement = "feed" }) {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (ad?.id && !trackedRef.current) {
      trackedRef.current = true;
      adsApi.impression(ad.id, placement);
    }
  }, [ad?.id, placement]);

  if (!ad) return null;
  const imgUrl = ad.image_url || ad.media_url;
  const dest = ad.destination_url || ad.cta_url;

  const handleTap = () => {
    adsApi.click(ad.id, placement);
    if (dest) Linking.openURL(dest).catch(() => {});
  };

  return (
    <ClayCard theme={theme} level={1} style={{ padding: 15, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="megaphone" size={13} color="#F59E0B" />
          <Text style={{ color: "#F59E0B", fontSize: 11, fontWeight: "800", letterSpacing: 0.6 }}>SPONSORED</Text>
        </View>
        <Text style={{ color: theme.faint, fontSize: 11.5 }}>{ad.advertiser_name || "Campus Partner"}</Text>
      </View>

      {imgUrl ? (
        <Image
          source={{ uri: imgUrl }}
          style={{ width: "100%", height: 165, borderRadius: RADII.md, backgroundColor: theme.recessBg }}
          resizeMode="cover"
        />
      ) : null}

      <Text style={{ color: theme.txt, fontSize: 15.5, fontWeight: "800", lineHeight: 21 }}>{ad.title || ad.headline}</Text>
      {ad.body || ad.description ? (
        <Text style={{ color: theme.mut, fontSize: 13.5, lineHeight: 19 }} numberOfLines={3}>
          {ad.body || ad.description}
        </Text>
      ) : null}

      {dest ? (
        <ClayButton
          theme={theme}
          variant="pri"
          compact
          icon="open-outline"
          label={ad.cta_text || "Learn More"}
          onPress={handleTap}
        />
      ) : null}
    </ClayCard>
  );
}

/** X / Instagram style animated Like button with spring heart bounce + sparkle burst. */
const SPARKLE_ANGLES = [0, 60, 120, 180, 240, 300];
export function AnimatedLikeButton({ liked, count = 0, onPress, onLongPress, color, inactiveColor }) {
  const heartScale = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const activeColor = color || "#F43F5E";

  const handlePress = () => {
    if (!liked) {
      burst.setValue(0);
      Animated.parallel([
        Animated.sequence([
          Animated.spring(heartScale, { toValue: 1.42, useNativeDriver: true, speed: 50, bounciness: 14 }),
          Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 8 }),
        ]),
        Animated.timing(burst, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.sequence([
        Animated.timing(heartScale, { toValue: 0.82, duration: 90, useNativeDriver: true }),
        Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 35, bounciness: 6 }),
      ]).start();
    }
    onPress && onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      hitSlop={8}
      style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4, paddingHorizontal: 4 }}
    >
      <View style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>
        {SPARKLE_ANGLES.map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const tx = burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(rad) * 16] });
          const ty = burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(rad) * 16] });
          const op = burst.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 0] });
          const sc = burst.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.3, 1, 0.2] });
          return (
            <Animated.View
              key={deg}
              pointerEvents="none"
              style={{
                position: "absolute",
                width: 4.5,
                height: 4.5,
                borderRadius: 3,
                backgroundColor: deg % 120 === 0 ? "#F43F5E" : "#F59E0B",
                opacity: op,
                transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
              }}
            />
          );
        })}
        <Animated.View style={{ transform: [{ scale: heartScale }] }}>
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={18}
            color={liked ? activeColor : inactiveColor || "#78859E"}
          />
        </Animated.View>
      </View>
      <Text style={{ fontSize: 12.5, fontWeight: "700", color: liked ? activeColor : inactiveColor || "#78859E" }}>
        {count}
      </Text>
    </Pressable>
  );
}

/** Smooth pulsing morphism Skeleton block. */
export function ClaySkeleton({ theme, width = "100%", height = 16, radius = 10, style }) {
  const opacity = useRef(new Animated.Value(0.42)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.88, duration: 680, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.42, duration: 680, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: theme.recessBg, opacity }, style]} />
  );
}

export function FeedSkeletonList({ theme, count = 3 }) {
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: count }).map((_, idx) => (
        <ClayCard key={idx} theme={theme} level={1} style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ClaySkeleton theme={theme} width={38} height={38} radius={19} />
            <View style={{ flex: 1, gap: 6 }}>
              <ClaySkeleton theme={theme} width="48%" height={13} />
              <ClaySkeleton theme={theme} width="32%" height={10} />
            </View>
          </View>
          <ClaySkeleton theme={theme} width="88%" height={16} />
          <ClaySkeleton theme={theme} width="96%" height={12} />
          <ClaySkeleton theme={theme} width="65%" height={12} />
        </ClayCard>
      ))}
    </View>
  );
}

/** Circular user avatar with graceful image fallback to initials + optional online dot. */
export function UserAvatar({ src, av = "?", bg = "#3B82F6", size = 40, online = false, style }) {
  const [err, setErr] = useState(false);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg || "#3B82F6",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        },
        style,
      ]}
    >
      {src && !err ? (
        <Image
          source={{ uri: src }}
          onError={() => setErr(true)}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: Math.max(11, Math.round(size * 0.36)) }}>
          {String(av || "?").slice(0, 2).toUpperCase()}
        </Text>
      )}
      {online ? (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: Math.max(10, Math.round(size * 0.24)),
            height: Math.max(10, Math.round(size * 0.24)),
            borderRadius: 99,
            backgroundColor: "#10B981",
            borderWidth: 2,
            borderColor: "#141418",
          }}
        />
      ) : null}
    </View>
  );
}

/** Sleek dark top-popping toast notification. */
export function TopToast({ toast }) {
  if (!toast) return null;
  const icon = toast.type === "success" ? "checkmark-circle" : toast.type === "error" ? "close-circle" : "notifications";
  const color = toast.type === "success" ? "#34D399" : toast.type === "error" ? "#F87171" : "#60A5FA";
  return (
    <View pointerEvents="none" style={styles.toastWrap}>
      <View style={styles.toastPill}>
        <Ionicons name={icon} size={17} color={color} />
        <Text style={styles.toastTxt} numberOfLines={2}>{toast.msg}</Text>
      </View>
    </View>
  );
}

/** Soft pill chip without harsh border. */
export function ClayPill({ theme, label, active = false, dot, icon, onPress, style }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: RADII.pill,
          backgroundColor: active ? theme.accentSoft : theme.surf,
          borderWidth: 1,
          borderColor: active ? theme.accent : theme.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
          ...clayShadow(theme, 1),
        },
        style,
      ]}
    >
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      {icon ? <Ionicons name={icon} size={14} color={active ? theme.accent : theme.mut} /> : null}
      <Text style={{ fontSize: 13, fontWeight: "700", color: active ? theme.accent : theme.txt }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function VerifiedBadge({ size = 15 }) {
  return <Ionicons name="checkmark-circle" size={size} color="#3B82F6" style={{ marginLeft: 3 }} />;
}

export function SugBadge() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        backgroundColor: "rgba(245,158,11,0.16)",
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 99,
      }}
    >
      <Ionicons name="shield-checkmark" size={11} color="#F59E0B" />
      <Text style={{ fontSize: 10.5, fontWeight: "800", color: "#F59E0B" }}>SUG</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toastWrap: {
    position: "absolute",
    top: 52,
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: "center",
  },
  toastPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#0B1220",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    maxWidth: 420,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 14,
  },
  toastTxt: {
    color: "#F8FAFC",
    fontSize: 13.5,
    fontWeight: "600",
    flexShrink: 1,
  },
});
