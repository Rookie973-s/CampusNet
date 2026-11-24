/**
 * Website-Faithful About, Help Centre, Privacy Policy & Terms Screen (mirrors AboutPage.jsx)
 */
import React from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BrandMark, ClayButton, ClayCard } from "../components/ClayUI";

const PILLARS = [
  {
    icon: "chatbubbles-outline",
    title: "Q&A Feed & Discussions",
    desc: "Ask questions, share insights, mention peers with @username, and discover trending campus topics.",
  },
  {
    icon: "compass-outline",
    title: "Student Communities",
    desc: "Follow campus clubs, tech groups, departmental channels, and the official CampusNetwork community.",
  },
  {
    icon: "people-outline",
    title: "SUG Directory & Direct Chat",
    desc: "Rate SUG officials on real campus performance and message verified representatives directly.",
  },
  {
    icon: "book-outline",
    title: "Academic PDF Library",
    desc: "Access course notes and past questions curated by approved class representatives.",
  },
];

export default function AboutScreen({ theme, onBack, onExploreFeed }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 14, paddingBottom: 120, gap: 14 }}
    >
      <Pressable onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="arrow-back" size={18} color={theme.accent} />
        <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 14 }}>Back</Text>
      </Pressable>

      <ClayCard theme={theme} level={2} style={{ padding: 20, gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <BrandMark size={52} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.txt, fontSize: 20, fontWeight: "900" }}>
              About CampusNetwork
            </Text>
            <Text style={{ color: theme.mut, fontSize: 13 }}>
              The Student Community & Academic Hub for ATBU
            </Text>
          </View>
        </View>

        <Text style={{ color: theme.txt, fontSize: 14.5, lineHeight: 22 }}>
          CampusNetwork (Cenet) connects students, class representatives, verified Student Union Government (SUG)
          officials, and academic departments across Abubakar Tafawa Balewa University in one unified, student-first
          platform.
        </Text>

        <View style={{ gap: 10 }}>
          {PILLARS.map((item) => (
            <View
              key={item.title}
              style={{
                padding: 14,
                borderRadius: 14,
                backgroundColor: theme.recessBg,
                gap: 4,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name={item.icon} size={18} color={theme.accent} />
                <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 14.5 }}>{item.title}</Text>
              </View>
              <Text style={{ color: theme.mut, fontSize: 13, lineHeight: 19 }}>{item.desc}</Text>
            </View>
          ))}
        </View>
      </ClayCard>

      <ClayCard theme={theme} level={1} style={{ padding: 18, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="shield-checkmark-outline" size={20} color={theme.accent} />
          <Text style={{ color: theme.txt, fontSize: 16.5, fontWeight: "800" }}>
            Privacy Policy & Terms of Service
          </Text>
        </View>
        <Text style={{ color: theme.mut, fontSize: 13.5, lineHeight: 20 }}>
          CampusNetwork respects your privacy in line with the Nigeria Data Protection Act (NDPA). Private student
          information (phone numbers, email addresses, verification documents, and private SUG chats) is never exposed
          publicly. Users may delete their account and associated data at any time from Profile Settings. By using
          CampusNetwork, you agree to keep discussions respectful, refrain from impersonation or harassment, and comply
          with university community standards.
        </Text>
      </ClayCard>

      <ClayCard theme={theme} level={1} style={{ padding: 18, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="help-buoy-outline" size={20} color={theme.accent} />
          <Text style={{ color: theme.txt, fontSize: 16.5, fontWeight: "800" }}>Help Centre & Support</Text>
        </View>
        <Text style={{ color: theme.mut, fontSize: 13.5, lineHeight: 20 }}>
          Need help with verification, academic PDFs, communities, or reporting an issue? Reach our student support
          team directly by email.
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <ClayButton
            theme={theme}
            variant="out"
            compact
            style={{ flex: 1 }}
            icon="mail-outline"
            label="Email Support"
            onPress={() => Linking.openURL("mailto:support@campusnetwork.edu.ng?subject=CampusNetwork%20Mobile%20Support")}
          />
          <ClayButton
            theme={theme}
            variant="navy"
            compact
            style={{ flex: 1 }}
            icon="arrow-forward"
            label="Explore Feed"
            onPress={onExploreFeed}
          />
        </View>
      </ClayCard>
    </ScrollView>
  );
}
