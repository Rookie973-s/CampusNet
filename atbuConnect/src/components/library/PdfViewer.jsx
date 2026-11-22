import { useEffect, useState } from 'react';
import Ic from '../Ic';
import useDialog from '../../hooks/useDialog';
import { fetchDocumentBlob } from '../../api/library';
import { useI18n } from '../../i18n';

/** Full-screen reader. The PDF is fetched with the user's token (never a public URL) and shown from a blob. */
export default function PdfViewer({ doc, onClose, onNeedLogin, toast }) {
  const { t } = useI18n();
  const { ref, closing, requestClose } = useDialog(onClose);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState("");
  const [signIn, setSignIn] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let dead = false, made = null;
    setUrl(null); setError(""); setSignIn(false);
    fetchDocumentBlob(doc.id)
      .then((u) => { if (dead) URL.revokeObjectURL(u); else { made = u; setUrl(u); } })
      .catch((e) => {
        if (dead) return;
        if (e.message === "SIGN_IN") setSignIn(true);
        else setError(e.message === "GONE" ? t("library.gone") : t("library.loadError"));
      });
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [doc.id, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async () => {
    try {
      const u = await fetchDocumentBlob(doc.id, { download: true });
      const a = document.createElement("a");
      a.href = u; a.download = doc.originalName || `${doc.title}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 10000);
    } catch (e) {
      if (e.message === "SIGN_IN") { requestClose(); onNeedLogin(); } else toast(t("library.downloadFail"), "error");
    }
  };

  return (
    <div className="lib-viewer" role="dialog" aria-modal="true" aria-label={t("library.viewing", { title: doc.title })} ref={ref} tabIndex={-1}
      style={closing ? { animation: "fadeOut .18s ease both" } : undefined}>
      <div className="lv-bar">
        <button type="button" className="btn btn-out" style={{ height: 42 }} onClick={requestClose} aria-label={t("library.closeViewer")}><Ic n="arrowL" s={16} />{t("common.back")}</button>
        <div className="lv-title">
          <strong>{doc.title}</strong>
          <span>{doc.courseCode} · {doc.level}L · {doc.departmentName}</span>
        </div>
        {url && <a className="btn btn-out" style={{ height: 42 }} href={url} target="_blank" rel="noopener noreferrer"><Ic n="external" s={15} />{t("library.newTab")}</a>}
        <button type="button" className="btn btn-navy" style={{ height: 42 }} onClick={download}><Ic n="download" s={15} />{t("library.download")}</button>
      </div>
      {!url && !error && !signIn && <div className="lv-center" role="status"><span className="auth-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} /><p>{t("library.loadingDoc")}</p></div>}
      {signIn && (
        <div className="lv-center"><Ic n="lock" s={38} c="var(--faint)" /><p>{t("library.signInToOpen")}</p>
          <button type="button" className="btn btn-navy" onClick={() => { requestClose(); onNeedLogin(); }}>{t("nav.login")}</button></div>
      )}
      {error && <div className="lv-center" role="alert"><Ic n="file" s={38} c="var(--faint)" /><p>{error}</p><button type="button" className="btn btn-navy" onClick={() => setAttempt((a) => a + 1)}>{t("common.retry")}</button></div>}
      {url && <iframe title={doc.title} src={url} />}
      {url && <p className="lv-note hide-desktop">{t("library.mobileNote")}</p>}
    </div>
  );
}
