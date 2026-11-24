import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// CampusNetwork Dark-Morphism & Light Design System
/// Preserves the deep dark surfaces (#0A0D12 - #161B26), subtle rim borders,
/// and signature sky/electric blue accent (#4A90FF / #60A5FA).
class CNColors {
  // Core dark morphism palette
  static const bg = Color(0xFF0A0D12);
  static const surface = Color(0xFF12161F);
  static const surfaceHigh = Color(0xFF191F2C);
  static const surfaceRecessed = Color(0xFF0D1017);
  static const glassBar = Color(0xE60C1018);

  // Typography
  static const textPrimary = Color(0xFFF3F6FC);
  static const textMuted = Color(0xFF9AA5B8);
  static const textFaint = Color(0xFF647087);

  // Brand & semantic accents
  static const accent = Color(0xFF4A90FF);
  static const accentLight = Color(0xFF60A5FA);
  static const accentSoft = Color(0x264A90FF);
  static const success = Color(0xFF10B981);
  static const successSoft = Color(0x2610B981);
  static const warning = Color(0xFFF59E0B);
  static const warningSoft = Color(0x26F59E0B);
  static const danger = Color(0xFFF43F5E);
  static const dangerSoft = Color(0x26F43F5E);
  static const gold = Color(0xFFF59E0B);

  // Subtle rim borders
  static const borderSubtle = Color(0x14FFFFFF);
  static const borderBright = Color(0x24FFFFFF);
}

class AppTheme {
  static ThemeData dark() {
    final base = ThemeData.dark(useMaterial3: true);
    return base.copyWith(
      scaffoldBackgroundColor: CNColors.bg,
      colorScheme: const ColorScheme.dark(
        primary: CNColors.accent,
        secondary: CNColors.accentLight,
        surface: CNColors.surface,
        error: CNColors.danger,
        onPrimary: Colors.white,
        onSurface: CNColors.textPrimary,
      ),
      textTheme: GoogleFonts.dmSansTextTheme(base.textTheme).apply(
        bodyColor: CNColors.textPrimary,
        displayColor: CNColors.textPrimary,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: CNColors.textPrimary,
      ),
      dividerColor: CNColors.borderSubtle,
      splashFactory: NoSplash.splashFactory,
      highlightColor: Colors.transparent,
    );
  }
}
