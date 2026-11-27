import 'package:flutter/material.dart';

import '../motion/liquid_motion.dart';
import 'app_theme.dart';

/// ============================================================================
/// CAMPUSNETWORK GLOBAL CLAYMORPHISM + SOFT NEUMORPHISM DESIGN SYSTEM
/// ============================================================================
/// Centralized visual primitives translating the Soft 3D Claymorphism reference
/// across BOTH Light Mode and Dark Mode while preserving CampusNetwork's exact
/// brand color identity (Accent Blue, Forest Green, Verified Emerald, SUG Gold).
///
/// Visual Anatomy:
/// - Soft inflated matte-clay vertical/diagonal gradient (never noisy or glossy)
/// - Crisp luminous top-left specular rim highlight
/// - Dual outer shadows: deep soft ambient cushion + tight contact shadow
/// - Top-left soft catchlight in light mode & delicate edge glow in dark mode
/// - Tactile recessed surfaces for troughs, inputs & pressed/active indicators

enum ClayElevation { low, medium, high }

class ClayDecorations {
  /// Raised 3D Claymorphism Card / Tile / Panel decoration.
  static BoxDecoration card(
    BuildContext context, {
    double radius = 24,
    Color? color,
    Color? tint,
    ClayElevation elevation = ClayElevation.medium,
  }) {
    final c = context.cn;
    final isDark = context.isDark;
    final rawBase = color ?? c.surface;
    final base = tint != null
        ? Color.alphaBlend(tint.withValues(alpha: isDark ? 0.14 : 0.08), rawBase)
        : rawBase;

    final topColor = isDark
        ? Color.lerp(base, Colors.white, 0.06)!
        : Color.lerp(base, Colors.white, 0.65)!;
    final bottomColor = isDark
        ? Color.lerp(base, Colors.black, 0.16)!
        : Color.lerp(base, const Color(0xFFD6E0EE), 0.24)!;

    final double blurMain = switch (elevation) {
      ClayElevation.low => 12,
      ClayElevation.medium => 22,
      ClayElevation.high => 32,
    };
    final double offsetY = switch (elevation) {
      ClayElevation.low => 5,
      ClayElevation.medium => 10,
      ClayElevation.high => 16,
    };

    return BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [topColor, base, bottomColor],
      ),
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(
        color: isDark
            ? Colors.white.withValues(alpha: 0.10)
            : Colors.white.withValues(alpha: 0.94),
        width: 1.35,
      ),
      boxShadow: [
        // Deep ambient cushion shadow (soft 3D lift)
        BoxShadow(
          color: isDark
              ? Colors.black.withValues(alpha: 0.56)
              : (tint ?? const Color(0xFF1E293B)).withValues(alpha: 0.11),
          blurRadius: blurMain,
          spreadRadius: -3,
          offset: Offset(0, offsetY),
        ),
        // Soft close contact shadow
        BoxShadow(
          color: isDark
              ? Colors.black.withValues(alpha: 0.34)
              : const Color(0xFF0F172A).withValues(alpha: 0.05),
          blurRadius: blurMain * 0.36,
          offset: const Offset(0, 3),
        ),
        // Top-left clay catchlight
        BoxShadow(
          color: isDark
              ? Colors.white.withValues(alpha: 0.045)
              : Colors.white.withValues(alpha: 0.95),
          blurRadius: 8,
          offset: const Offset(-3, -3),
        ),
      ],
    );
  }

  /// Soft Recessed Claymorphism Trough / Well (for stat trays, nested panels, troughs).
  static BoxDecoration recessed(
    BuildContext context, {
    double radius = 18,
    Color? color,
  }) {
    final c = context.cn;
    final isDark = context.isDark;
    final base = color ?? c.surfaceMuted;
    return BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: isDark
            ? [Color.lerp(base, Colors.black, 0.25)!, base, Color.lerp(base, Colors.white, 0.03)!]
            : [Color.lerp(base, const Color(0xFFCBD5E1), 0.24)!, base, Colors.white.withValues(alpha: 0.85)],
      ),
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(
        color: isDark
            ? Colors.black.withValues(alpha: 0.45)
            : const Color(0xFF94A3B8).withValues(alpha: 0.20),
        width: 1.0,
      ),
      boxShadow: [
        BoxShadow(
          color: isDark
              ? Colors.white.withValues(alpha: 0.04)
              : Colors.white.withValues(alpha: 0.85),
          blurRadius: 4,
          offset: const Offset(1, 2),
        ),
      ],
    );
  }

  /// Reference-Image Tactile Clay Input Capsule (soft elevated matte clay pill with focus glow).
  static BoxDecoration input(
    BuildContext context, {
    double radius = 18,
    bool focused = false,
    Color? fillColor,
  }) {
    final c = context.cn;
    final isDark = context.isDark;
    final base = fillColor ?? (isDark ? c.surfaceElevated : Colors.white);
    final top = isDark
        ? Color.lerp(base, Colors.white, 0.05)!
        : Colors.white;
    final bottom = isDark
        ? Color.lerp(base, Colors.black, 0.14)!
        : const Color(0xFFF3F6FB);

    return BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [top, base, bottom],
      ),
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(
        color: focused
            ? c.accent.withValues(alpha: 0.75)
            : (isDark ? Colors.white.withValues(alpha: 0.10) : Colors.white.withValues(alpha: 0.96)),
        width: focused ? 1.6 : 1.3,
      ),
      boxShadow: [
        if (focused)
          BoxShadow(
            color: c.accent.withValues(alpha: isDark ? 0.30 : 0.22),
            blurRadius: 16,
            spreadRadius: 1,
            offset: const Offset(0, 4),
          ),
        BoxShadow(
          color: isDark
              ? Colors.black.withValues(alpha: 0.48)
              : const Color(0xFF1E293B).withValues(alpha: 0.09),
          blurRadius: 14,
          spreadRadius: -2,
          offset: const Offset(0, 6),
        ),
        BoxShadow(
          color: isDark
              ? Colors.white.withValues(alpha: 0.035)
              : Colors.white.withValues(alpha: 0.95),
          blurRadius: 6,
          offset: const Offset(-2, -2),
        ),
      ],
    );
  }

  /// Inflated 3D Clay Button (like the reference image's pillowy dome Login button!).
  static BoxDecoration button(
    BuildContext context, {
    Color? color,
    double radius = 999,
    bool disabled = false,
  }) {
    final c = context.cn;
    final isDark = context.isDark;
    final base = color ?? c.accent;
    final eff = disabled ? base.withValues(alpha: 0.48) : base;
    final top = Color.lerp(eff, Colors.white, isDark ? 0.18 : 0.24)!;
    final bottom = Color.lerp(eff, Colors.black, 0.18)!;

    return BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [top, eff, bottom],
      ),
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(
        color: Colors.white.withValues(alpha: disabled ? 0.12 : (isDark ? 0.24 : 0.45)),
        width: 1.25,
      ),
      boxShadow: disabled
          ? null
          : [
              BoxShadow(
                color: base.withValues(alpha: isDark ? 0.45 : 0.38),
                blurRadius: 18,
                spreadRadius: -2,
                offset: const Offset(0, 8),
              ),
              BoxShadow(
                color: Colors.black.withValues(alpha: isDark ? 0.35 : 0.10),
                blurRadius: 6,
                offset: const Offset(0, 3),
              ),
            ],
    );
  }

  /// Tactile Clay Pill / Filter Chip / Action Pill (raised neutral or inflated colored when active).
  static BoxDecoration pill(
    BuildContext context, {
    bool active = false,
    Color? activeColor,
    double radius = 999,
  }) {
    final c = context.cn;
    if (active) {
      return button(context, color: activeColor ?? c.accent, radius: radius);
    }
    return card(context, radius: radius, elevation: ClayElevation.low);
  }

  /// Claymorphic Modal / Bottom Sheet Surface (soft elevated dome with bright top rim).
  static BoxDecoration modal(BuildContext context, {double radius = 30}) {
    final c = context.cn;
    final isDark = context.isDark;
    final top = isDark
        ? Color.lerp(c.surface, Colors.white, 0.05)!
        : Colors.white;
    final bottom = isDark
        ? Color.lerp(c.surface, Colors.black, 0.12)!
        : const Color(0xFFF3F6FB);
    return BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [top, c.surface, bottom],
      ),
      borderRadius: BorderRadius.vertical(top: Radius.circular(radius)),
      border: Border(
        top: BorderSide(
          color: isDark ? Colors.white.withValues(alpha: 0.14) : Colors.white,
          width: 1.5,
        ),
      ),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withValues(alpha: isDark ? 0.65 : 0.18),
          blurRadius: 34,
          offset: const Offset(0, -10),
        ),
      ],
    );
  }
}

/// Universal Tactile Claymorphism TextField (matches reference image's rounded clay input
/// with optional raised circular 3D icon badge, focus halo, clear placeholder & high contrast).
class ClayTextField extends StatefulWidget {
  const ClayTextField({
    super.key,
    required this.controller,
    this.label,
    this.hint,
    this.prefixIcon,
    this.prefixText,
    this.iconColor,
    this.suffix,
    this.obscureText = false,
    this.keyboardType,
    this.maxLines = 1,
    this.minLines,
    this.autofocus = false,
    this.onChanged,
    this.onSubmitted,
    this.fillColor,
    this.radius = 18,
  });

  final TextEditingController controller;
  final String? label;
  final String? hint;
  final IconData? prefixIcon;
  final String? prefixText;
  final Color? iconColor;
  final Widget? suffix;
  final bool obscureText;
  final TextInputType? keyboardType;
  final int maxLines;
  final int? minLines;
  final bool autofocus;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final Color? fillColor;
  final double radius;

  @override
  State<ClayTextField> createState() => _ClayTextFieldState();
}

class _ClayTextFieldState extends State<ClayTextField> {
  final FocusNode _focus = FocusNode();
  bool _focused = false;

  @override
  void initState() {
    super.initState();
    _focus.addListener(() {
      if (mounted && _focused != _focus.hasFocus) {
        setState(() => _focused = _focus.hasFocus);
      }
    });
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.cn;
    final isDark = context.isDark;
    final badgeColor = widget.iconColor ?? c.accent;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.label != null && widget.label!.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.only(left: 6, bottom: 6),
            child: Text(
              widget.label!,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w800,
                color: c.textSecondary,
              ),
            ),
          ),
        ],
        AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          decoration: ClayDecorations.input(
            context,
            radius: widget.radius,
            focused: _focused,
            fillColor: widget.fillColor,
          ),
          padding: EdgeInsets.symmetric(
            horizontal: widget.prefixIcon != null ? 8 : 14,
            vertical: widget.maxLines > 1 ? 6 : 3,
          ),
          child: Row(
            crossAxisAlignment: widget.maxLines > 1 ? CrossAxisAlignment.start : CrossAxisAlignment.center,
            children: [
              if (widget.prefixIcon != null)
                Padding(
                  padding: EdgeInsets.only(top: widget.maxLines > 1 ? 6 : 0, right: 10),
                  child: Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          Color.lerp(badgeColor, Colors.white, isDark ? 0.20 : 0.30)!,
                          badgeColor,
                          Color.lerp(badgeColor, Colors.black, 0.16)!,
                        ],
                      ),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: isDark ? 0.22 : 0.65),
                        width: 1.1,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: badgeColor.withValues(alpha: 0.34),
                          blurRadius: 8,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    child: Icon(widget.prefixIcon, size: 17, color: Colors.white),
                  ),
                ),
              Expanded(
                child: TextField(
                  controller: widget.controller,
                  focusNode: _focus,
                  obscureText: widget.obscureText,
                  keyboardType: widget.keyboardType,
                  maxLines: widget.maxLines,
                  minLines: widget.minLines,
                  autofocus: widget.autofocus,
                  onChanged: widget.onChanged,
                  onSubmitted: widget.onSubmitted,
                  style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: c.textPrimary),
                  decoration: InputDecoration(
                    hintText: widget.hint,
                    prefixText: widget.prefixText,
                    prefixStyle: TextStyle(color: c.accent, fontWeight: FontWeight.w800, fontSize: 14.5),
                    hintStyle: TextStyle(color: c.textSecondary.withValues(alpha: 0.8), fontSize: 14, fontWeight: FontWeight.w500),
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    filled: false,
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(vertical: 12),
                    suffixIcon: widget.suffix,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Inflated 3D Clay Primary Button with tactile spring tap.
class ClayButton extends StatelessWidget {
  const ClayButton({
    super.key,
    required this.label,
    required this.onTap,
    this.icon,
    this.color,
    this.height = 50,
    this.radius = 999,
    this.busy = false,
  });

  final String label;
  final VoidCallback? onTap;
  final IconData? icon;
  final Color? color;
  final double height;
  final double radius;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null || busy;
    return LiquidTap(
      onTap: disabled ? null : onTap,
      enabled: !disabled,
      scaleDown: 0.94,
      child: Container(
        width: double.infinity,
        height: height,
        decoration: ClayDecorations.button(context, color: color, radius: radius, disabled: disabled),
        alignment: Alignment.center,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (busy)
              const Padding(
                padding: EdgeInsets.only(right: 10),
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
                ),
              )
            else if (icon != null)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Icon(icon, size: 18, color: Colors.white),
              ),
            Text(
              label,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15),
            ),
          ],
        ),
      ),
    );
  }
}
