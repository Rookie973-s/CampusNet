/**
 * CampusNetwork (Cenet) Mobile Design System Tokens
 * Single source of truth mirrored directly from the React.js website (GlobalStyle.jsx & clay.css).
 *
 * - True neutral dark mode (#0A0A0D / #141418 / #1C1C22) matching the website
 * - Soft claymorphism / skeuomorphic raised & recessed depth (NO conventional borders)
 * - Tactile elevation shadows & radii
 */

export const LIGHT_THEME = {
  mode: "light",
  isDark: false,
  bg: "#F4F5F7",
  surf: "#FFFFFF",
  surfH: "#EEF1F6",
  surfA: "#E4E8F0",
  txt: "#111827",
  mut: "#4B5563",
  faint: "#6B7280",
  accent: "#2563EB",
  accentSoft: "rgba(37,99,235,0.12)",
  navy: "#111827",
  navyTxt: "#FFFFFF",
  topBar: "#111115",
  topBarTxt: "#FFFFFF",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#DC2626",
  shadowColor: "#1E293B",
  shadowOpacity1: 0.10,
  shadowOpacity2: 0.16,
  shadowOpacity3: 0.24,
  highlightTop: "rgba(255,255,255,0.92)",
  recessBg: "#EAEEF5",
};

export const DARK_THEME = {
  mode: "dark",
  isDark: true,
  bg: "#0A0A0D",
  surf: "#141418",
  surfH: "#1C1C22",
  surfA: "#24242D",
  txt: "#F3F4F6",
  mut: "#A1A1AA",
  faint: "#71717A",
  accent: "#60A5FA",
  accentSoft: "rgba(96,165,250,0.15)",
  navy: "#F3F4F6",
  navyTxt: "#0A0A0D",
  topBar: "#111115",
  topBarTxt: "#FFFFFF",
  success: "#34D399",
  warning: "#FBBF24",
  danger: "#F87171",
  shadowColor: "#000000",
  shadowOpacity1: 0.42,
  shadowOpacity2: 0.56,
  shadowOpacity3: 0.72,
  highlightTop: "rgba(255,255,255,0.06)",
  recessBg: "#0F0F13",
};

export const RADII = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

export const SPACING = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
};

/** Soft claymorphic raised card shadow (no visible conventional border). */
export function clayShadow(theme, level = 1) {
  if (level === 3) {
    return {
      shadowColor: theme.shadowColor,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: theme.shadowOpacity3,
      shadowRadius: 24,
      elevation: 12,
    };
  }
  if (level === 2) {
    return {
      shadowColor: theme.shadowColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: theme.shadowOpacity2,
      shadowRadius: 16,
      elevation: 7,
    };
  }
  return {
    shadowColor: theme.shadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: theme.shadowOpacity1,
    shadowRadius: 10,
    elevation: 4,
  };
}
