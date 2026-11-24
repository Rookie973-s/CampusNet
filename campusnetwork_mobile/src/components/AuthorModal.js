/**
 * Author Profile Popup Modal (mirrors AuthorPopover.jsx)
 * Clicking any user's avatar or name in posts/comments/search opens this popup with Follow/Unfollow + stats.
 */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ClayButton, ClayCard, UserAvatar } from "./ClayUI";
import { usersApi } from "../api";
import { RADII } from "../theme/tokens";

export default function AuthorModal({ userId, username, theme, viewer, onClose, onRequireAuth, toast }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId && !username) return;
    setLoading(true);
    const req = userId ? usersApi.profile(userId) : usersApi.profileByUsername(username);
    req.then(setProfile).catch(() => setProfile(null)).finally(() => setLoading(false));
  }, [userId, username]);

  const toggleFollow = async () => {
    if (!viewer) { onClose(); onRequireAuth(); return; }
    if (!profile) return;
    setBusy(true);
    try {
      const res = profile.is_following ? await usersApi.unfollow(profile.id) : await usersApi.follow(profile.id);
      setProfile((p) => ({
        ...p,
        is_following: !p.is_following,
        followers: res?.followers ?? (p.is_following ? Math.max(0, p.followers - 1) : p.followers + 1),
      }));
    } catch (e) { toast && toast(e.message || "Could not update follow.", "error"); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={!!(userId || username)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.bg} onPress={onClose}>
        <ClayCard theme={theme} level={3} style={styles.card}>
          <Pressable onPress={onClose} style={[styles.x, { backgroundColor: theme.surfH }]}>
            <Ionicons name="close" size={16} color={theme.mut} />
          </Pressable>
          {loading ? (
            <ActivityIndicator color={theme.accent} style={{ marginVertical: 36 }} />
          ) : !profile ? (
            <Text style={{ color: theme.mut, textAlign: "center", paddingVertical: 28 }}>Profile unavailable.</Text>
          ) : (
            <View style={{ alignItems: "center" }}>
              <UserAvatar src={profile.avatar_url} av={profile.av} bg={profile.bg} size={74} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
                <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 18 }}>{profile.name}</Text>
                {profile.staff ? <Ionicons name="shield-checkmark" size={16} color={theme.accent} /> : null}
                {profile.is_verified_student ? <Ionicons name="checkmark-circle" size={16} color="#10B981" /> : null}
              </View>
              <Text style={{ color: theme.mut, fontSize: 13, marginTop: 2 }}>
                @{profile.username}{profile.dept ? ` · ${profile.dept}` : ""}
              </Text>
              {profile.bio ? (
                <Text style={{ color: theme.mut, fontSize: 13.5, textAlign: "center", marginTop: 10, lineHeight: 20 }}>
                  {profile.bio}
                </Text>
              ) : null}

              <View style={[styles.stats, { backgroundColor: theme.recessBg }]}>
                <View style={styles.stat}><Text style={[styles.statVal, { color: theme.txt }]}>{profile.followers ?? 0}</Text><Text style={[styles.statLbl, { color: theme.faint }]}>Followers</Text></View>
                <View style={styles.stat}><Text style={[styles.statVal, { color: theme.txt }]}>{profile.following ?? 0}</Text><Text style={[styles.statLbl, { color: theme.faint }]}>Following</Text></View>
                <View style={styles.stat}><Text style={[styles.statVal, { color: theme.txt }]}>{profile.questions ?? 0}</Text><Text style={[styles.statLbl, { color: theme.faint }]}>Posts</Text></View>
              </View>

              {!profile.is_me ? (
                <ClayButton
                  theme={theme}
                  variant={profile.is_following ? "out" : "pri"}
                  label={profile.is_following ? "Following" : "Follow"}
                  icon={profile.is_following ? "checkmark" : "person-add-outline"}
                  loading={busy}
                  onPress={toggleFollow}
                  style={{ width: "100%" }}
                />
              ) : null}
            </View>
          )}
        </ClayCard>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.58)", justifyContent: "center", padding: 24 },
  card: { padding: 22, maxWidth: 340, width: "100%", alignSelf: "center", position: "relative" },
  x: { position: "absolute", top: 12, right: 12, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", zIndex: 5 },
  stats: { flexDirection: "row", borderRadius: RADII.md, paddingVertical: 12, marginVertical: 16, width: "100%" },
  stat: { flex: 1, alignItems: "center" },
  statVal: { fontSize: 17, fontWeight: "800" },
  statLbl: { fontSize: 11, fontWeight: "700", marginTop: 2 },
});
