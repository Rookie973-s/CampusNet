import { useEffect, useRef, useState } from "react";
import Ic from "../Ic";
import { recordAdClick, recordAdImpression } from "../../api/ads";
import { normalizeMediaUrl } from "../../api/client";

/**
 * Native in-feed / in-comment sponsored ad card.
 * Records genuine impressions via IntersectionObserver and clicks on CTA.
 */
export default function AdCard({ ad, placement = "feed" }) {
  const ref = useRef(null);
  const seen = useRef(false);
  const [imgFailed, setImgFailed] = useState(false);
  const imgUrl = normalizeMediaUrl(ad?.image_url);

  useEffect(() => { setImgFailed(false); }, [imgUrl]);

  useEffect(() => {
    if (!ad?.id || seen.current || !ref.current) return;
    if (typeof IntersectionObserver === "undefined") {
      seen.current = true;
      recordAdImpression(ad.id, placement);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !seen.current) {
          seen.current = true;
          recordAdImpression(ad.id, placement);
          obs.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ad?.id, placement]);

  if (!ad) return null;

  const onCtaClick = () => {
    recordAdClick(ad.id, placement);
    if (ad.destination_url) {
      window.open(ad.destination_url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <aside ref={ref} className="ad-card raised" aria-label="Sponsored advertisement">
      <div className="ad-card-head">
        <span className="ad-pill"><Ic n="megaphone" s={11} /> Sponsored</span>
        <span style={{ fontSize: 11, color: "var(--faint)" }}>CampusNetwork Ads</span>
      </div>
      <div className="ad-card-body">
        {imgUrl && !imgFailed && (
          <img
            src={imgUrl}
            alt={ad.headline}
            className="ad-card-img"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ fontSize: 16, fontFamily: "'DM Sans',sans-serif", fontWeight: 800, marginBottom: 4 }}>{ad.headline}</h4>
          <p style={{ fontSize: 13.5, color: "var(--mut)", lineHeight: 1.55, marginBottom: 10 }}>{ad.description}</p>
          {ad.destination_url && (
            <button type="button" className="btn btn-pri" style={{ height: 36, minHeight: 36, padding: "0 16px", fontSize: 13 }} onClick={onCtaClick}>
              {ad.cta_text || "Learn More"} <Ic n="external" s={13} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
