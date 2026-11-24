/**
 * Native Live Camera Verification Component (FIXED for Expo SDK 58 CameraView)
 * - CRITICAL FIX: <CameraView> is self-closing with NO children (uses sibling absolute overlay)
 * - Eliminates Expo SDK 58 crash/warning and handles permissions, recording, and fallback cleanly
 */
import React, { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { ClayButton, ClayCard } from "./ClayUI";

const PROMPTS = [
  "Look directly into the camera",
  "Blink both eyes slowly twice",
  "Nod your head gently up and down",
  "Hold still — finishing scan...",
];

export default function NativeLivenessCamera({ theme, onComplete, completedFile, toast }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [recording, setRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [promptIdx, setPromptIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(5);
  const cameraRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (completedFile) {
    return (
      <View
        style={{
          padding: 18,
          borderRadius: 16,
          backgroundColor: theme.recessBg,
          alignItems: "center",
          gap: 8,
        }}
      >
        <Ionicons name="checkmark-circle" size={42} color="#10B981" />
        <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }}>
          Live Camera Verification Captured
        </Text>
        <Text style={{ color: theme.mut, fontSize: 12.5, textAlign: "center" }}>
          Your blink & nod scan is ready for submission.
        </Text>
        <ClayButton
          theme={theme}
          variant="out"
          compact
          icon="refresh"
          label="Record Again"
          onPress={() => onComplete(null)}
        />
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={{ padding: 20, alignItems: "center" }}>
        <Text style={{ color: theme.mut, fontSize: 13 }}>Checking camera permissions...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        style={{
          padding: 18,
          borderRadius: 16,
          backgroundColor: theme.recessBg,
          alignItems: "center",
          gap: 10,
        }}
      >
        <Ionicons name="videocam-outline" size={38} color={theme.accent} />
        <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15, textAlign: "center" }}>
          Camera Access Required
        </Text>
        <Text style={{ color: theme.mut, fontSize: 12.5, textAlign: "center", lineHeight: 18 }}>
          CampusNetwork requires a quick 5-second blink & nod camera check to verify your identity.
        </Text>
        <ClayButton
          theme={theme}
          variant="pri"
          compact
          icon="camera-outline"
          label={permission.canAskAgain === false ? "Open App Settings" : "Grant Camera Access"}
          onPress={() => {
            if (permission.canAskAgain === false) Linking.openSettings();
            else requestPermission();
          }}
        />
      </View>
    );
  }

  const startScan = async () => {
    if (recording || !cameraRef.current) return;
    setRecording(true);
    setPromptIdx(0);
    setSecondsLeft(5);

    let tick = 0;
    timerRef.current = setInterval(() => {
      tick += 1;
      setSecondsLeft(Math.max(0, 5 - tick));
      setPromptIdx(Math.min(PROMPTS.length - 1, Math.floor((tick / 5) * PROMPTS.length)));
    }, 1000);

    try {
      if (typeof cameraRef.current.recordAsync === "function") {
        const video = await cameraRef.current.recordAsync({ maxDuration: 5 });
        if (video?.uri) {
          onComplete({ uri: video.uri, name: `liveness_${Date.now()}.mp4`, type: "video/mp4" });
          toast && toast("Live face scan captured!", "success");
          return;
        }
      }
      if (typeof cameraRef.current.takePictureAsync === "function") {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.75 });
        if (photo?.uri) {
          onComplete({ uri: photo.uri, name: `liveness_${Date.now()}.jpg`, type: "image/jpeg" });
          toast && toast("Live verification captured!", "success");
        }
      }
    } catch {
      try {
        const photo = await cameraRef.current?.takePictureAsync({ quality: 0.75 });
        if (photo?.uri) {
          onComplete({ uri: photo.uri, name: `liveness_${Date.now()}.jpg`, type: "image/jpeg" });
          toast && toast("Live verification captured!", "success");
        } else {
          toast && toast("Camera scan interrupted. Please try again.", "error");
        }
      } catch {
        toast && toast("Could not complete camera scan. Please try again.", "error");
      }
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecording(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <ClayCard theme={theme} level={1} style={{ overflow: "hidden", borderRadius: 20, height: 280, position: "relative" }}>
        {/* Self-closing CameraView — zero children! */}
        <CameraView
          ref={cameraRef}
          facing="front"
          mode="video"
          onCameraReady={() => setCameraReady(true)}
          style={StyleSheet.absoluteFill}
        />

        {/* Sibling absolute-positioned guide overlay */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              justifyContent: "space-between",
              alignItems: "center",
              padding: 14,
              backgroundColor: "rgba(0,0,0,0.18)",
            },
          ]}
        >
          <View
            style={{
              backgroundColor: "rgba(11,18,32,0.84)",
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 99,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 12.5 }}>
              {recording ? `${PROMPTS[promptIdx]} (${secondsLeft}s)` : "Position your face inside the oval"}
            </Text>
          </View>

          <View
            style={{
              width: 155,
              height: 195,
              borderRadius: 999,
              borderWidth: 3,
              borderColor: recording ? "#34D399" : "rgba(255,255,255,0.8)",
            }}
          />
          <View style={{ height: 8 }} />
        </View>
      </ClayCard>

      <ClayButton
        theme={theme}
        variant={recording ? "navy" : "pri"}
        icon={recording ? "radio-button-on" : "videocam"}
        label={recording ? `Recording Scan (${secondsLeft}s)...` : cameraReady ? "Start 5-Second Blink & Nod Scan" : "Starting Camera..."}
        disabled={recording}
        onPress={startScan}
      />
    </View>
  );
}
