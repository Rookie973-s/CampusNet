/**
 * Distinct Student Verification Badge — an animated academic checkmark seal with
 * a subtle graduation-cap flourish. Completely distinct from the SUG/Staff shield badge.
 * Respects `prefers-reduced-motion` via CSS class `.vbadge-student`.
 */
export default function VerifiedBadge({ size = 16, showLabel = false, title = "Verified ATBU Student" }) {
  return (
    <span className="vbadge-student" title={title} aria-label={title}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="vsGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
        {/* Scalloped academic rosette */}
        <path
          className="vbadge-seal"
          d="M12 1.8l2.2 1.7 2.8-.2 1.2 2.5 2.5 1.2-.2 2.8 1.7 2.2-1.7 2.2.2 2.8-2.5 1.2-1.2 2.5-2.8-.2-2.2 1.7-2.2-1.7-2.8.2-1.2-2.5-2.5-1.2.2-2.8L1.8 12l1.7-2.2-.2-2.8 2.5-1.2 1.2-2.5 2.8.2L12 1.8z"
          fill="url(#vsGrad)"
        />
        {/* Subtle mortarboard accent peak */}
        <path d="M8.5 7.6L12 6l3.5 1.6L12 9.2 8.5 7.6z" fill="#D1FAE5" opacity="0.85" />
        {/* Crisp animated checkmark */}
        <path
          className="vbadge-check"
          d="M8.2 12.9l2.5 2.5 5.2-5.4"
          stroke="#FFFFFF"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showLabel && <span className="vbadge-label">Verified Student</span>}
    </span>
  );
}
