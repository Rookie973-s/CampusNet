import { Modal } from './ui/shared';
import Ic from './Ic';
import { useI18n } from '../i18n';

/** Shown when a guest tries something that needs an account (like, vote, post, follow...).
 *  The server enforces the same rule - this is only the friendly front door. */
export default function GuestPrompt({ action, onLogin, onRegister, onClose }) {
  const { t } = useI18n();
  return (
    <Modal onClose={onClose} maxW={400} label={t("guest.title")} showClose>
      <div style={{ padding: "34px 26px 26px", textAlign: "center" }}>
        <span style={{ width: 60, height: 60, borderRadius: 20, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--accent)", background: "var(--surfH)", boxShadow: "var(--sh-in)" }}>
          <Ic n="lock" s={26} />
        </span>
        <h3 style={{ fontSize: 21, marginBottom: 8 }}>{t("guest.title")}</h3>
        <p style={{ color: "var(--mut)", fontSize: 14.5, lineHeight: 1.6, marginBottom: 22 }}>
          {action ? t("guest.bodyAction", { action }) : t("guest.body")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" className="btn btn-navy" style={{ width: "100%" }} data-autofocus onClick={() => { onClose(); onLogin(); }}>{t("nav.login")}</button>
          <button type="button" className="btn btn-out" style={{ width: "100%" }} onClick={() => { onClose(); onRegister(); }}>{t("nav.signup")}</button>
          <button type="button" className="btn btn-ghost" style={{ width: "100%" }} onClick={onClose}>{t("guest.notNow")}</button>
        </div>
      </div>
    </Modal>
  );
}
