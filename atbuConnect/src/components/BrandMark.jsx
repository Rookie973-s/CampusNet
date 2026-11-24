import cenetLogo from '../images/cenet-logo.png';

/** CampusNetwork (Cenet) official transparent C-graduation-cap logo, responsive across all pages. */
export default function BrandMark({ size = 40, bare = true, className = "", style = {} }) {
  return (
    <img
      src={cenetLogo}
      alt="CampusNetwork (Cenet) logo"
      width={size}
      height={size}
      className={`brand-mark-img${className ? ` ${className}` : ""}`}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
        flexShrink: 0,
        filter: "drop-shadow(0 2px 5px rgba(2,8,23,.28))",
        ...style,
      }}
      decoding="async"
    />
  );
}
