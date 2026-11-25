import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _kThemeModeKey = 'cn_theme_mode';

/// Centralised Semantic Design Tokens (X-Style Near-Black Dark + Crisp Light Mode).
@immutable
class CampusColors extends ThemeExtension<CampusColors> {
  const CampusColors({
    required this.background,
    required this.surface,
    required this.surfaceElevated,
    required this.surfaceMuted,
    required this.divider,
    required this.textPrimary,
    required this.textSecondary,
    required this.textDisabled,
    required this.accent,
    required this.onAccent,
    required this.accentSoft,
    required this.success,
    required this.successSoft,
    required this.warning,
    required this.warningSoft,
    required this.danger,
    required this.dangerSoft,
    required this.gold,
    required this.scrim,
    required this.glassFill,
    required this.glassBorder,
    required this.activityScale,
  });

  final Color background;
  final Color surface;
  final Color surfaceElevated;
  final Color surfaceMuted;
  final Color divider;
  final Color textPrimary;
  final Color textSecondary;
  final Color textDisabled;
  final Color accent;
  final Color onAccent;
  final Color accentSoft;
  final Color success;
  final Color successSoft;
  final Color warning;
  final Color warningSoft;
  final Color danger;
  final Color dangerSoft;
  final Color gold;
  final Color scrim;
  final Color glassFill;
  final Color glassBorder;
  final List<Color> activityScale;

  // Semantic convenience aliases matching legacy & v2 screen tokens
  Color get bg => background;
  Color get surfaceHigh => surfaceElevated;
  Color get surfaceRecessed => surfaceMuted;
  Color get borderSubtle => divider;
  Color get borderBright => glassBorder;
  Color get accentLight => accent;
  Color get textMuted => textSecondary;
  Color get textFaint => textDisabled;
  Color get goldSoft => warningSoft;

  static const dark = CampusColors(
    background: Color(0xFF000000),
    surface: Color(0xFF16181C),
    surfaceElevated: Color(0xFF1D1F23),
    surfaceMuted: Color(0xFF101215),
    divider: Color(0xFF2F3336),
    textPrimary: Color(0xFFE7E9EA),
    textSecondary: Color(0xFF71767B),
    textDisabled: Color(0xFF4B5056),
    accent: Color(0xFF1D9BF0),
    onAccent: Colors.white,
    accentSoft: Color(0x241D9BF0),
    success: Color(0xFF00BA7C),
    successSoft: Color(0x2400BA7C),
    warning: Color(0xFFF59E0B),
    warningSoft: Color(0x24F59E0B),
    danger: Color(0xFFF4212E),
    dangerSoft: Color(0x24F4212E),
    gold: Color(0xFFF59E0B),
    scrim: Color(0x99000000),
    glassFill: Color(0xB816181C),
    glassBorder: Color(0x26FFFFFF),
    activityScale: [
      Color(0xFF1D1F23),
      Color(0xFF0E4429),
      Color(0xFF006D32),
      Color(0xFF26A641),
      Color(0xFF39D353),
    ],
  );

  static const light = CampusColors(
    background: Color(0xFFFFFFFF),
    surface: Color(0xFFF7F9F9),
    surfaceElevated: Color(0xFFFFFFFF),
    surfaceMuted: Color(0xFFEFF3F4),
    divider: Color(0xFFEFF3F4),
    textPrimary: Color(0xFF0F1419),
    textSecondary: Color(0xFF536471),
    textDisabled: Color(0xFF9AA5B1),
    accent: Color(0xFF1D9BF0),
    onAccent: Colors.white,
    accentSoft: Color(0x1A1D9BF0),
    success: Color(0xFF00BA7C),
    successSoft: Color(0x1F00BA7C),
    warning: Color(0xFFD97706),
    warningSoft: Color(0x1FD97706),
    danger: Color(0xFFF4212E),
    dangerSoft: Color(0x1AF4212E),
    gold: Color(0xFFD97706),
    scrim: Color(0x66000000),
    glassFill: Color(0xCCF7F9F9),
    glassBorder: Color(0x220F1419),
    activityScale: [
      Color(0xFFEFF3F4),
      Color(0xFF9BE9A8),
      Color(0xFF40C463),
      Color(0xFF30A14E),
      Color(0xFF216E39),
    ],
  );

  @override
  CampusColors copyWith({Color? background}) => this;

  @override
  CampusColors lerp(ThemeExtension<CampusColors>? other, double t) {
    if (other is! CampusColors) return this;
    return t < 0.5 ? this : other;
  }
}

extension CampusThemeX on BuildContext {
  CampusColors get cn => Theme.of(this).extension<CampusColors>() ?? CampusColors.dark;
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
}

/// Legacy compatibility shim so untouched refs keep working cleanly.
class CNColors {
  static const bg = Color(0xFF000000);
  static const surface = Color(0xFF16181C);
  static const surfaceHigh = Color(0xFF1D1F23);
  static const surfaceRecessed = Color(0xFF101215);
  static const glassBar = Color(0xCC16181C);
  static const textPrimary = Color(0xFFE7E9EA);
  static const textMuted = Color(0xFF71767B);
  static const textFaint = Color(0xFF71767B);
  static const accent = Color(0xFF1D9BF0);
  static const accentLight = Color(0xFF1D9BF0);
  static const accentSoft = Color(0x241D9BF0);
  static const success = Color(0xFF00BA7C);
  static const successSoft = Color(0x2400BA7C);
  static const warning = Color(0xFFF59E0B);
  static const warningSoft = Color(0x24F59E0B);
  static const danger = Color(0xFFF4212E);
  static const dangerSoft = Color(0x24F4212E);
  static const gold = Color(0xFFF59E0B);
  static const borderSubtle = Color(0xFF2F3336);
  static const borderBright = Color(0x26FFFFFF);
}

class AppTheme {
  /// Can be disabled in offline unit/widget tests to avoid HTTP font fetches.
  static bool useGoogleFonts = true;

  static ThemeData dark() => _build(Brightness.dark, CampusColors.dark);
  static ThemeData light() => _build(Brightness.light, CampusColors.light);

  static ThemeData _build(Brightness brightness, CampusColors c) {
    final base = brightness == Brightness.dark ? ThemeData.dark(useMaterial3: true) : ThemeData.light(useMaterial3: true);
    final rawTextTheme = useGoogleFonts ? GoogleFonts.dmSansTextTheme(base.textTheme) : base.textTheme;
    final textTheme = rawTextTheme.apply(
      bodyColor: c.textPrimary,
      displayColor: c.textPrimary,
      decoration: TextDecoration.none, // Prevents yellow double underlines in overlays
    );
    return base.copyWith(
      scaffoldBackgroundColor: c.background,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: c.accent,
        onPrimary: c.onAccent,
        secondary: c.accent,
        onSecondary: c.onAccent,
        error: c.danger,
        onError: Colors.white,
        surface: c.surface,
        onSurface: c.textPrimary,
      ),
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: c.background,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: c.textPrimary,
      ),
      dividerColor: c.divider,
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.surfaceMuted,
        contentPadding: const EdgeInsets.symmetric(horizontal: 15, vertical: 13),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(
            color: brightness == Brightness.dark ? Colors.white.withValues(alpha: 0.06) : Colors.black.withValues(alpha: 0.04),
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: c.accent.withValues(alpha: 0.55), width: 1.2),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: c.accent,
          foregroundColor: Colors.white,
          elevation: 2,
          shadowColor: c.accent.withValues(alpha: 0.35),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: c.textPrimary,
          side: BorderSide(color: c.divider.withValues(alpha: 0.7)),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
        ),
      ),
      splashFactory: NoSplash.splashFactory,
      highlightColor: Colors.transparent,
      extensions: [c],
    );
  }
}

/// Persisted ThemeMode (System default, Light, Dark) with instant switching & zero launch flash.
class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  ThemeModeNotifier(super.initial);

  Future<void> setMode(ThemeMode mode) async {
    state = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kThemeModeKey, mode.name);
  }

  Future<void> toggleDarkLight(bool currentlyDark) =>
      setMode(currentlyDark ? ThemeMode.light : ThemeMode.dark);
}

Future<ThemeMode> loadSavedThemeMode() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kThemeModeKey);
    if (raw == 'light') return ThemeMode.light;
    if (raw == 'dark') return ThemeMode.dark;
  } catch (_) {}
  return ThemeMode.system;
}

final initialThemeModeProvider = Provider<ThemeMode>((_) => ThemeMode.system);

final themeModeProvider = StateNotifierProvider<ThemeModeNotifier, ThemeMode>(
  (ref) => ThemeModeNotifier(ref.watch(initialThemeModeProvider)),
);
