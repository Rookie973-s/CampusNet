import { useEffect, useRef, useState } from "react";
import Ic from "../Ic";

const PROMPTS = [
  "Look straight at the camera",
  "Blink your eyes twice",
  "Slowly nod your head up and down",
];

/**
 * Interactive Camera Liveness Scanner (blink + head nod).
 * Requests front-camera access, guides the student through liveness actions,
 * records a short video clip (webm/mp4) for Django Admin verification review,
 * and calls `onComplete(file)` with the recorded video File.
 */
export default function LivenessScanner({ videoFile, onComplete, disabled = false }) {
  const [phase, setPhase] = useState(videoFile ? "done" : "idle"); // idle | ready | recording | done | error
  const [promptIdx, setPromptIdx] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const timersRef = useRef([]);

  const stopCamera = () => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
    if (recRef.current && recRef.current.state !== "inactive") {
      try { recRef.current.stop(); } catch { /* ignore */ }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => () => {
    stopCamera();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCamera = async () => {
    setErrMsg("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrMsg("Camera access is not supported in this browser. Use a modern mobile or desktop browser over HTTPS.");
      setPhase("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setPhase("ready");
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setErrMsg("Camera permission denied. Please allow camera access in your browser settings to complete liveness verification.");
      setPhase("error");
    }
  };

  const startScan = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    setPromptIdx(0);
    setPhase("recording");

    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";

    try {
      const rec = new MediaRecorder(streamRef.current, { mimeType: mime });
      recRef.current = rec;
      rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime.split(";")[0] });
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const file = new File([blob], `liveness_scan_${Date.now()}.${ext}`, { type: blob.type });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(blob));
        onComplete && onComplete(file);
        stopCamera();
        setPhase("done");
      };
      rec.start(250);

      timersRef.current.push(setTimeout(() => setPromptIdx(1), 2200));
      timersRef.current.push(setTimeout(() => setPromptIdx(2), 4600));
      timersRef.current.push(setTimeout(() => {
        if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
      }, 7200));
    } catch {
      setErrMsg("Could not record video on this device. Please try Chrome or Safari.");
      stopCamera();
      setPhase("error");
    }
  };

  const reset = () => {
    stopCamera();
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    onComplete && onComplete(null);
    setPhase("idle");
  };

  return (
    <div style={{ padding: 14, borderRadius: 14, background: "var(--surfH)", border: "1px solid var(--brdS)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Ic n="camera" s={16} c="var(--accent)" />
          <strong style={{ fontSize: 14 }}>Live Camera Verification (Blink &amp; Nod) *</strong>
        </div>
        {phase === "done" && (
          <span style={{ fontSize: 12, fontWeight: 800, color: "#10B981" }}>Scan Recorded ✓</span>
        )}
      </div>

      {phase === "idle" && (
        <>
          <p style={{ fontSize: 12.5, color: "var(--mut)", lineHeight: 1.5 }}>
            Tap below to open your front camera. Follow the quick 7-second prompt (look ahead, blink twice, nod your head) so administrators can verify your identity.
          </p>
          <button type="button" className="btn btn-out" style={{ alignSelf: "flex-start", height: 38, minHeight: 38, fontSize: 13 }} onClick={openCamera} disabled={disabled}>
            <Ic n="camera" s={14} /> Start Camera Scan
          </button>
        </>
      )}

      {(phase === "ready" || phase === "recording") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 320, aspectRatio: "4/3", borderRadius: 16, overflow: "hidden", background: "#000", border: phase === "recording" ? "3px solid #2563EB" : "2px solid var(--brdS)" }}>
            <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
            <div style={{ position: "absolute", left: 10, right: 10, bottom: 10, padding: "8px 12px", borderRadius: 10, background: "rgba(0,0,0,.76)", color: "#fff", fontSize: 13, fontWeight: 700, textAlign: "center" }}>
              {phase === "recording" ? `Step ${promptIdx + 1}/3: ${PROMPTS[promptIdx]}` : "Center your face, then tap Record Scan"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {phase === "ready" && (
              <button type="button" className="btn btn-pri" style={{ height: 38, minHeight: 38, fontSize: 13 }} onClick={startScan}>
                Record 7s Liveness Scan
              </button>
            )}
            <button type="button" className="btn btn-out" style={{ height: 38, minHeight: 38, fontSize: 13 }} onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {previewUrl && <video src={previewUrl} controls muted playsInline style={{ width: 96, height: 72, borderRadius: 10, objectFit: "cover", background: "#000" }} />}
            <div style={{ fontSize: 12.5, color: "var(--mut)" }}>
              <strong style={{ color: "var(--txt)", display: "block" }}>Liveness video ready</strong>
              Will be attached securely for admin verification review.
            </div>
          </div>
          <button type="button" className="btn btn-out" style={{ height: 34, minHeight: 34, fontSize: 12, padding: "0 12px" }} onClick={reset} disabled={disabled}>
            Retake
          </button>
        </div>
      )}

      {phase === "error" && (
        <div>
          <p className="field-err" role="alert">{errMsg}</p>
          <button type="button" className="btn btn-out" style={{ marginTop: 8, height: 36, minHeight: 36, fontSize: 12.5 }} onClick={openCamera}>
            Try Camera Again
          </button>
        </div>
      )}
    </div>
  );
}
