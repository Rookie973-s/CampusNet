import { useEffect, useRef, useState } from 'react';
import { googleLogin } from '../api/auth';
import { ApiError } from '../api/client';
import { useI18n } from '../i18n';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const SRC = "https://accounts.google.com/gsi/client";

/** True when a Google client id is configured at build time. */
export const googleEnabled = !!CLIENT_ID;

let loader = null;
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SRC; s.async = true; s.defer = true;
      s.onload = resolve; s.onerror = () => { loader = null; reject(new Error("Could not load Google sign-in.")); };
      document.head.appendChild(s);
    });
  }
  return loader;
}

/**
 * "Continue with Google" using Google Identity Services. Renders nothing unless
 * VITE_GOOGLE_CLIENT_ID is set. The Google ID token is sent to POST /api/auth/google/, where
 * the server verifies it; the normal Campus Connect JWTs come back. No separate session.
 */
export default function GoogleButton({ onUser, onError, width = 280 }) {
  const { t, lang } = useI18n();
  const box = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGsi().then(() => {
      if (cancelled || !box.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async ({ credential }) => {
          try { onUser(await googleLogin(credential)); }
          catch (e) { onError?.(e instanceof ApiError ? e.message : t("auth.googleFailed")); }
        },
      });
      window.google.accounts.id.renderButton(box.current, { theme: "outline", size: "large", shape: "pill", width, text: "continue_with", locale: lang });
    }).catch(() => setFailed(true));
    return () => { cancelled = true; };
  }, [lang, width]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!CLIENT_ID) return null;
  if (failed) return <p className="auth-err" role="alert">{t("auth.googleFailed")}</p>;
  return <div ref={box} style={{ display: "flex", justifyContent: "center", minHeight: 44 }} aria-label={t("auth.google")} />;
}
