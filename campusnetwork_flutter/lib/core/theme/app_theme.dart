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
    background: Color(0xFF0A0D12),
    surface: Color(0xFF151B24),
    surfaceElevated: Color(0xFF1E2633),
    surfaceMuted: Color(0xFF0F141B),
    divider: Color(0xFF28313E),
    textPrimary: Color(0xFFEDF2F7),
    textSecondary: Color(0xFF8C97A8),
    textDisabled: Color(0xFF566070),
    accent: Color(0xFF1D9BF0),
    onAccent: Colors.white,
    accentSoft: Color(0x281D9BF0),
    success: Color(0xFF00BA7C),
    successSoft: Color(0x2800BA7C),
    warning: Color(0xFFF59E0B),
    warningSoft: Color(0x28F59E0B),
    danger: Color(0xFFF4212E),
    dangerSoft: Color(0x28F4212E),
    gold: Color(0xFFF59E0B),
    scrim: Color(0xA6000000),
    glassFill: Color(0xCC151B24),
    glassBorder: Color(0x2BFFFFFF),
    activityScale: [
      Color(0xFF1E2633),
      Color(0xFF0E4429),
      Color(0xFF006D32),
      Color(0xFF26A641),
      Color(0xFF39D353),
    ],
  );

  static const light = CampusColors(
    background: Color(0xFFF1F5FA),
    surface: Color(0xFFFFFFFF),
    surfaceElevated: Color(0xFFFFFFFF),
    surfaceMuted: Color(0xFFE7EEF6),
    divider: Color(0xFFDDE5F0),
    textPrimary: Color(0xFF0F172A),
    textSecondary: Color(0xFF526277),
    textDisabled: Color(0xFF94A3B8),
    accent: Color(0xFF1D9BF0),
    onAccent: Colors.white,
    accentSoft: Color(0x1C1D9BF0),
    success: Color(0xFF00BA7C),
    successSoft: Color(0x2200BA7C),
    warning: Color(0xFFD97706),
    warningSoft: Color(0x22D97706),
    danger: Color(0xFFF4212E),
    dangerSoft: Color(0x1CF4212E),
    gold: Color(0xFFD97706),
    scrim: Color(0x660F172A),
    glassFill: Color(0xD9FFFFFF),
    glassBorder: Color(0xE6FFFFFF),
    activityScale: [
      Color(0xFFE7EEF6),
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
        fillColor: brightness == Brightness.dark ? c.surfaceElevated : Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        labelStyle: TextStyle(color: c.textSecondary, fontWeight: FontWeight.w700, fontSize: 13.5),
        hintStyle: TextStyle(color: c.textSecondary.withValues(alpha: 0.78), fontWeight: FontWeight.w500),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide(
            color: brightness == Brightness.dark ? Colors.white.withValues(alpha: 0.10) : c.divider,
            width: 1.25,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide(color: c.accent.withValues(alpha: 0.78), width: 1.6),
        ),
      ),
      cardTheme: CardThemeData(
        color: c.surface,
        elevation: 6,
        shadowColor: brightness == Brightness.dark ? Colors.black87 : const Color(0xFF1E293B).withValues(alpha: 0.14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: c.surface,
        elevation: 16,
        shadowColor: Colors.black54,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(28),
          side: BorderSide(
            color: brightness == Brightness.dark ? Colors.white.withValues(alpha: 0.12) : Colors.white,
            width: 1.3,
          ),
        ),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) => Colors.white),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected) ? c.accent : c.surfaceMuted,
        ),
      ),
      checkboxTheme: CheckboxThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
        fillColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected) ? c.accent : Colors.transparent,
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: c.surface,
        selectedColor: c.accentSoft,
        elevation: 3,
        pressElevation: 1,
        shadowColor: brightness == Brightness.dark ? Colors.black54 : const Color(0xFF1E293B).withValues(alpha: 0.12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
          side: BorderSide(color: brightness == Brightness.dark ? Colors.white.withValues(alpha: 0.08) : Colors.white),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: c.accent,
          foregroundColor: Colors.white,
          elevation: 6,
          shadowColor: c.accent.withValues(alpha: 0.45),
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(999),
            side: BorderSide(color: Colors.white.withValues(alpha: 0.26), width: 1.1),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          backgroundColor: c.surface,
          foregroundColor: c.textPrimary,
          elevation: 3,
          shadowColor: brightness == Brightness.dark ? Colors.black54 : const Color(0xFF1E293B).withValues(alpha: 0.10),
          side: BorderSide(
            color: brightness == Brightness.dark ? Colors.white.withValues(alpha: 0.12) : Colors.white,
            width: 1.2,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
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
