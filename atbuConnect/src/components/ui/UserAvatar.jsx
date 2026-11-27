import { useEffect, useState } from "react";
import { normalizeMediaUrl } from "../../api/client";

/** Consistent circular avatar: shows uploaded profile picture if available, else initials on bg. */
export default function UserAvatar({
  src, av = "?", bg = "#3B82F6", size = 40, online = false, border = "2px solid var(--surf)", style = {}, alt = "",
}) {
  const safeSrc = normalizeMediaUrl(src);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [safeSrc]);

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: "#fff",
        fontWeight: 800,
        fontSize: Math.max(10, Math.round(size * 0.34)),
        flexShrink: 0,
        border,
        overflow: "visible",
        ...style,
      }}
    >
      {safeSrc && !failed ? (
        <img
          src={safeSrc}
          alt={alt}
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <span>{av}</span>
      )}
      {online && (
        <span
          aria-label="Online"
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: Math.max(10, Math.round(size * 0.24)),
            height: Math.max(10, Math.round(size * 0.24)),
            background: "#10B981",
            borderRadius: "50%",
            border: "2px solid var(--surf)",
          }}
        />
      )}
    </span>
  );
}
