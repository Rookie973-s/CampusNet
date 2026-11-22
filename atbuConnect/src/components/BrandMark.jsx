import cenetLogo from '../images/cenet-logo.png';

/** CampusNetwork (Cenet) official C-graduation-cap chat logo, responsive across all pages. */
export default function BrandMark({ size = 40, bare = false, className = "", style = {} }) {
  const img = (
    <img
      src={cenetLogo}
      alt="CampusNetwork (Cenet) logo"
      width={bare ? size : Math.round(size * 0.84)}
      height={bare ? size : Math.round(size * 0.84)}
      className={`brand-mark-img${className ? ` ${className}` : ""}`}
      style={{
        width: bare ? size : "84%",
        height: bare ? size : "84%",
        objectFit: "contain",
        display: "block",
        flexShrink: 0,
        filter: "drop-shadow(0 1px 3px rgba(2,8,23,.22))",
        ...(bare ? style : {}),
      }}
      decoding="async"
    />
  );

  if (bare) return img;

  return (
    <span
      className={`brand-mark-badge${className ? ` ${className}` : ""}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: "linear-gradient(180deg, #FFFFFF 0%, #EDF3FC 100%)",
        boxShadow: "0 2px 8px rgba(2,8,23,.28), inset 0 1px 0 #FFFFFF",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        overflow: "hidden",
        ...style,
      }}
    >
      {img}
    </span>
  );
}
