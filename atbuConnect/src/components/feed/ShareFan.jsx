import { useCallback, useEffect, useRef, useState } from 'react';
import Ic from '../Ic';
import { useI18n } from '../../i18n';

/* Brand marks (simple, recognisable glyphs). */
const XIcon = () => (<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M18.2 2.2h3.3l-7.2 8.3 8.5 11.3h-6.7l-5.2-6.8-6 6.8H1.6l7.7-8.8L1.2 2.2H8l4.7 6.2zm-1.2 17.6h1.8L7 4.1H5.1z"/></svg>);
const LinkedInIcon = () => (<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4v11.5H3zM9.5 9.75h3.8v1.6h.06c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.77 2.65 4.77 6.1v5.85h-4v-5.2c0-1.24-.02-2.84-1.73-2.84-1.73 0-2 1.35-2 2.75v5.29h-4z"/></svg>);
const WhatsAppIcon = () => (<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.25-.12-1.46-.72-1.69-.8-.22-.08-.39-.12-.55.12-.17.25-.64.8-.78.96-.14.17-.29.19-.53.06-.25-.12-1.04-.38-1.97-1.22-.73-.65-1.22-1.45-1.36-1.7-.14-.24-.02-.38.1-.5.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.17 0-.43.06-.65.31-.22.25-.85.83-.85 2.03 0 1.2.87 2.36 1 2.52.12.17 1.71 2.6 4.14 3.65.58.25 1.03.4 1.38.51.58.18 1.1.16 1.52.1.46-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.14-1.17-.06-.1-.22-.17-.47-.29z"/></svg>);

/** Builds the real sharing endpoints. Nothing is "published" for the user — each opens the network's own share flow. */
export function shareTargets({ url, text }) {
  const u = encodeURIComponent(url), tx = encodeURIComponent(text);
  return {
    x: `https://twitter.com/intent/tweet?text=${tx}&url=${u}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    email: `mailto:?subject=${tx}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
  };
}

/**
 * Angles (degrees, 0° = right, 90° = up) for n items, picked so the fan stays inside the
 * viewport: normally an upper half-circle; tilted right near the left edge, left near the
 * right edge, and flipped downward near the top of the screen.
 */
export function fanAngles(n, rect, radius, vw, vh) {
  const pad = radius + 28;
  let lo = 20, hi = 160, down = false;
  const cx = rect.left + rect.width / 2;
  if (cx < pad) { lo = 8; hi = 105; }
  else if (vw - cx < pad) { lo = 75; hi = 172; }
  if (rect.top < radius + 70) down = true;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = hi - (n === 1 ? 0 : ((hi - lo) / (n - 1)) * i);
    out.push(down ? -a : a);
  }
  return out;
}

export default function ShareFan({ url, text, toast, label }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [angles, setAngles] = useState([]);
  const [radius, setRadius] = useState(84);
  const wrap = useRef(null);
  const btn = useRef(null);

  const items = [
    { id: "x", label: "X", icon: <XIcon /> },
    { id: "linkedin", label: "LinkedIn", icon: <LinkedInIcon /> },
    { id: "whatsapp", label: "WhatsApp", icon: <WhatsAppIcon /> },
    { id: "email", label: t("share.email"), icon: <Ic n="mail" s={18} /> },
    { id: "copy", label: t("share.copy"), icon: <Ic n="link" s={18} /> },
  ];

  const close = useCallback((refocus) => { setOpen(false); if (refocus) btn.current?.focus(); }, []);

  const toggle = () => {
    if (open) { close(false); return; }
    const r = btn.current.getBoundingClientRect();
    const rad = window.innerWidth < 420 ? 84 : 100;
    setRadius(rad);
    setAngles(fanAngles(items.length, r, rad, window.innerWidth, window.innerHeight));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const outside = (e) => { if (wrap.current && !wrap.current.contains(e.target)) close(false); };
    const key = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(true); }
      if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) {
        const els = [...wrap.current.querySelectorAll(".fan-item")];
        const i = els.indexOf(document.activeElement);
        const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
        e.preventDefault();
        els[(i + dir + els.length) % els.length]?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    const first = setTimeout(() => wrap.current?.querySelector(".fan-item")?.focus(), 60);
    const onScroll = () => close(false);
    window.addEventListener("resize", onScroll);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); window.removeEventListener("resize", onScroll); clearTimeout(first); };
  }, [open, close]);

  const links = shareTargets({ url, text });

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast(t("share.copied"), "success"); }
    catch { toast(t("share.copyFail"), "error"); }
    close(true);
  };

  return (
    <span className="fan-wrap" ref={wrap}>
      <button ref={btn} type="button" className={`qa-btn${open ? " on" : ""}`} onClick={toggle}
        aria-haspopup="menu" aria-expanded={open} aria-label={t("share.aria", { title: label })}>
        <Ic n="send" s={14} />{t("share.share")}
      </button>
      {open && (
        <div className="fan" role="menu" aria-label={t("share.menu")}>
          {items.map((it, n) => {
            const a = (angles[n] * Math.PI) / 180;
            const style = { "--x": `${Math.cos(a) * radius}px`, "--y": `${-Math.sin(a) * radius}px`, "--d": `${n * 45}ms` };
            const common = { className: "fan-item", role: "menuitem", style, title: it.label, "aria-label": it.label };
            return it.id === "copy" ? (
              <button key={it.id} type="button" {...common} onClick={copy}>{it.icon}</button>
            ) : (
              <a key={it.id} href={links[it.id]} target={it.id === "email" ? undefined : "_blank"} rel="noopener noreferrer" {...common} onClick={() => close(false)}>{it.icon}</a>
            );
          })}
        </div>
      )}
    </span>
  );
}
