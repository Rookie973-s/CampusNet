import { useEffect, useState } from 'react';
import Ic from '../Ic';
import useDialog from '../../hooks/useDialog';
import { useI18n } from '../../i18n';

const MAX_TILES = 4;

function Lightbox({ images, start, title, onClose }) {
  const { t } = useI18n();
  const { ref, closing, requestClose } = useDialog(onClose);
  const [i, setI] = useState(start);
  useEffect(() => {
    const k = (e) => {
      if (e.key === "ArrowRight") setI((x) => (x + 1) % images.length);
      if (e.key === "ArrowLeft") setI((x) => (x - 1 + images.length) % images.length);
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [images.length]);
  return (
    <div className={`overlay${closing ? " closing" : ""}`} style={{ zIndex: 2200, background: "rgba(2,8,23,.88)" }} onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={t("media.viewer")} tabIndex={-1} className="lb">
        <button type="button" className="lb-x" onClick={requestClose} aria-label={t("common.close")}><Ic n="x" s={18} /></button>
        <img src={images[i].url} alt={t("media.alt", { n: i + 1, total: images.length, title })} />
        {images.length > 1 && (
          <>
            <button type="button" className="lb-nav lb-prev" onClick={() => setI((x) => (x - 1 + images.length) % images.length)} aria-label={t("home.prev")}><Ic n="arrowL" s={18} /></button>
            <button type="button" className="lb-nav lb-next" onClick={() => setI((x) => (x + 1) % images.length)} aria-label={t("home.next")}><Ic n="arrow" s={18} /></button>
            <span className="lb-count">{i + 1} / {images.length}</span>
          </>
        )}
      </div>
    </div>
  );
}

function Video({ m, title }) {
  const { t } = useI18n();
  const [err, setErr] = useState(false);
  if (err) return <div className="mg-video-err" role="alert"><Ic n="video" s={22} />{t("media.videoError")}</div>;
  return (
    <div className="mg-video">
      <video controls preload="metadata" playsInline src={m.url} onError={() => setErr(true)} aria-label={t("media.videoLabel", { title })} />
    </div>
  );
}

/** Images keep their aspect ratio (single) or fill a fixed-height grid (2+); +N overlay for extras. */
export default function MediaGrid({ media, title }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(null);
  if (!media?.length) return null;
  const video = media.find((m) => m.kind === "video");
  if (video) return <Video m={video} title={title} />;

  const images = media.filter((m) => m.kind === "image");
  const shown = images.slice(0, MAX_TILES);
  const extra = images.length - shown.length;
  const alt = (n) => t("media.alt", { n: n + 1, total: images.length, title });

  return (
    <>
      <div className={`mg mg--${Math.min(shown.length, 4)}`}>
        {shown.map((m, n) => (
          <button key={m.id} type="button" className="mg-tile" onClick={() => setOpen(n)} aria-label={t("media.open", { n: n + 1, total: images.length })}>
            <img src={m.url} alt={alt(n)} loading="lazy" decoding="async" width={m.width || undefined} height={m.height || undefined} />
            {extra > 0 && n === shown.length - 1 && <span className="mg-more" aria-hidden="true">+{extra}</span>}
          </button>
        ))}
      </div>
      {open !== null && <Lightbox images={images} start={open} title={title} onClose={() => setOpen(null)} />}
    </>
  );
}
