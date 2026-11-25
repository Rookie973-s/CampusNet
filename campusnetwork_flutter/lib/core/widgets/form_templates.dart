import 'package:flutter/material.dart';

import '../motion/liquid_motion.dart';
import '../theme/app_theme.dart';

/// ============================================================================
/// 1. CURVED ORGANIC GREEN SINGLE-STEP FORM (Login, Sign Up, Create Community)
///    Matches the user's "Welcome Back" curved upper-green botanical reference.
/// ============================================================================
class CurvedGreenFormSheet extends StatelessWidget {
  const CurvedGreenFormSheet({
    super.key,
    required this.title,
    required this.subtitle,
    required this.child,
    this.headerHeight = 148,
    this.onBack,
  });

  final String title;
  final String subtitle;
  final Widget child;
  final double headerHeight;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;
    final sheetBg = isDark ? const Color(0xFF101613) : Colors.white;
    final titleColor = isDark ? const Color(0xFF6EE7B7) : const Color(0xFF1D4E38);
    final subColor = isDark ? const Color(0xFF94A39B) : const Color(0xFF6B7B73);

    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.92),
      decoration: BoxDecoration(
        color: sheetBg,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
      ),
      clipBehavior: Clip.antiAlias,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Organic curved lush green upper banner with subtle botanical arcs
            SizedBox(
              height: headerHeight,
              width: double.infinity,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: ClipPath(
                      clipper: _WaveHeaderClipper(),
                      child: Container(
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              Color(0xFF0E2F20),
                              Color(0xFF1E563B),
                              Color(0xFF2D6E4E),
                            ],
                          ),
                        ),
                        child: CustomPaint(painter: _BotanicalLeafPainter()),
                      ),
                    ),
                  ),
                  Positioned(
                    top: 16,
                    left: 16,
                    child: LiquidTap(
                      onTap: onBack ?? () => Navigator.of(context).pop(),
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.92),
                          shape: BoxShape.circle,
                          boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 8, offset: Offset(0, 2))],
                        ),
                        child: const Icon(Icons.chevron_left_rounded, color: Color(0xFF1B4D3E), size: 22),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Clean form body
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 2, 24, 28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 27,
                      fontWeight: FontWeight.w900,
                      color: titleColor,
                      letterSpacing: -0.4,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13.5, color: subColor, height: 1.4),
                  ),
                  const SizedBox(height: 22),
                  child,
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WaveHeaderClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final p = Path()
      ..lineTo(0, size.height * 0.84)
      ..cubicTo(
        size.width * 0.28,
        size.height * 1.02,
        size.width * 0.65,
        size.height * 0.54,
        size.width,
        size.height * 0.72,
      )
      ..lineTo(size.width, 0)
      ..close();
    return p;
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}

class _BotanicalLeafPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p1 = Paint()..color = Colors.white.withValues(alpha: 0.08);
    final p2 = Paint()
      ..color = Colors.white.withValues(alpha: 0.12)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4;

    // Subtle organic botanical curves
    canvas.drawCircle(Offset(size.width * 0.16, size.height * 0.42), 64, p1);
    canvas.drawCircle(Offset(size.width * 0.82, size.height * 0.28), 78, p1);
    canvas.drawCircle(Offset(size.width * 0.56, size.height * 0.78), 54, p1);

    final vein = Path()
      ..moveTo(size.width * 0.62, size.height * 0.05)
      ..quadraticBezierTo(size.width * 0.78, size.height * 0.35, size.width * 0.94, size.height * 0.52);
    canvas.drawPath(vein, p2);

    final vein2 = Path()
      ..moveTo(size.width * 0.08, size.height * 0.75)
      ..quadraticBezierTo(size.width * 0.26, size.height * 0.42, size.width * 0.45, size.height * 0.18);
    canvas.drawPath(vein2, p2);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Soft sage-green rounded input box with leading icon (matches Image 1).
class SageInputField extends StatelessWidget {
  const SageInputField({
    super.key,
    required this.controller,
    required this.hint,
    required this.icon,
    this.obscureText = false,
    this.keyboardType,
    this.maxLines = 1,
    this.suffix,
    this.onChanged,
  });

  final TextEditingController controller;
  final String hint;
  final IconData icon;
  final bool obscureText;
  final TextInputType? keyboardType;
  final int maxLines;
  final Widget? suffix;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;
    final fill = isDark ? const Color(0xFF1A2520) : const Color(0xFFE5EFE9);
    final iconColor = isDark ? const Color(0xFF6EE7B7) : const Color(0xFF2B5E44);
    final textColor = isDark ? Colors.white : const Color(0xFF142D22);
    final hintColor = isDark ? const Color(0xFF7B9387) : const Color(0xFF5D7A6C);

    return Container(
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(14),
      ),
      padding: EdgeInsets.symmetric(horizontal: 14, vertical: maxLines > 1 ? 6 : 2),
      child: Row(
        crossAxisAlignment: maxLines > 1 ? CrossAxisAlignment.start : CrossAxisAlignment.center,
        children: [
          Padding(
            padding: EdgeInsets.only(top: maxLines > 1 ? 10 : 0, right: 10),
            child: Icon(icon, size: 19, color: iconColor),
          ),
          Expanded(
            child: TextField(
              controller: controller,
              obscureText: obscureText,
              keyboardType: keyboardType,
              maxLines: maxLines,
              onChanged: onChanged,
              style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: textColor),
              decoration: InputDecoration(
                hintText: hint,
                hintStyle: TextStyle(color: hintColor, fontSize: 14, fontWeight: FontWeight.w500),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                filled: false,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
                suffixIcon: suffix,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Full-width deep-forest-green pill button (matches Image 1).
class ForestPillButton extends StatelessWidget {
  const ForestPillButton({super.key, required this.label, this.onTap});
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return LiquidTap(
      onTap: onTap,
      enabled: onTap != null,
      child: Container(
        width: double.infinity,
        height: 52,
        decoration: BoxDecoration(
          color: onTap == null ? const Color(0xFF2E6B47).withValues(alpha: 0.5) : const Color(0xFF2E6B47),
          borderRadius: BorderRadius.circular(999),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF1F5638).withValues(alpha: 0.32),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15.5),
        ),
      ),
    );
  }
}

/// ============================================================================
/// 2. SUMMARY SCREEN (Entry screen for SUG Access, Student Verification, Ads)
///    Matches Image 3 ("SUMMARY SCREEN"): atmospheric dark hero, bold white
///    headline, concise benefits, prominent white pill CTA + info action.
/// ============================================================================
class FlowSummaryScreen extends StatelessWidget {
  const FlowSummaryScreen({
    super.key,
    required this.headline,
    required this.summary,
    required this.highlights,
    required this.ctaLabel,
    required this.ctaIcon,
    required this.onContinue,
    this.secondaryLabel,
    this.onSecondary,
    this.onInfo,
    this.infoTooltip,
    this.badgeText,
  });

  final String headline;
  final String summary;
  final List<(IconData, String)> highlights;
  final String ctaLabel;
  final IconData ctaIcon;
  final VoidCallback onContinue;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;
  final VoidCallback? onInfo;
  final String? infoTooltip;
  final String? badgeText;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0D0C),
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment(0.25, -0.35),
            radius: 1.25,
            colors: [
              Color(0xFF22342C),
              Color(0xFF121A17),
              Color(0xFF080A09),
            ],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 10, 24, 22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Top bar with subtle pill & close X
                Row(
                  children: [
                    if (badgeText != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
                        ),
                        child: Text(
                          badgeText!,
                          style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w800),
                        ),
                      ),
                    const Spacer(),
                    IconButton(
                      icon: const Icon(Icons.close_rounded, color: Colors.white70, size: 26),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
                const Spacer(flex: 2),

                // Giant crisp white editorial display headline (Image 3 style)
                Text(
                  headline.toUpperCase(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 34,
                    fontWeight: FontWeight.w900,
                    height: 1.12,
                    letterSpacing: -0.6,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  summary,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.78),
                    fontSize: 14.5,
                    height: 1.55,
                  ),
                ),
                const SizedBox(height: 26),

                // Compact translucent highlights
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
                  ),
                  child: Column(
                    children: [
                      for (int i = 0; i < highlights.length; i++) ...[
                        Row(
                          children: [
                            Icon(highlights[i].$1, size: 19, color: const Color(0xFF4ADE80)),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                highlights[i].$2,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.w600,
                                  height: 1.35,
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (i < highlights.length - 1) const SizedBox(height: 11),
                      ],
                    ],
                  ),
                ),

                const Spacer(flex: 3),

                // Bold white rounded pill primary CTA button (Image 3 style)
                LiquidTap(
                  onTap: onContinue,
                  child: Container(
                    height: 56,
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.35),
                          blurRadius: 20,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 22),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(ctaIcon, size: 20, color: const Color(0xFF0F172A)),
                        const SizedBox(width: 10),
                        Flexible(
                          child: Text(
                            ctaLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Color(0xFF0F172A),
                              fontSize: 15.5,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Icon(Icons.arrow_forward_rounded, size: 19, color: Color(0xFF0F172A)),
                      ],
                    ),
                  ),
                ),

                if (secondaryLabel != null && onSecondary != null) ...[
                  const SizedBox(height: 12),
                  Center(
                    child: TextButton(
                      onPressed: onSecondary,
                      child: Text(
                        secondaryLabel!,
                        style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w700, fontSize: 13.5),
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 8),
                // Bottom-right info button (Image 3 style)
                Align(
                  alignment: Alignment.centerRight,
                  child: onInfo != null
                      ? Tooltip(
                          message: infoTooltip ?? 'More info',
                          child: IconButton(
                            icon: const Icon(Icons.info_outline_rounded, color: Colors.white60, size: 23),
                            onPressed: onInfo,
                          ),
                        )
                      : const SizedBox(height: 24),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// ============================================================================
/// 3. STEPS FORM SCAFFOLD & INPUT CARDS (SUG Access, Student Verification, Ads)
///    Matches Image 2 ("Steps Form"): sage-mint top band with graduation cap,
///    large rounded light-mint form sheet, elevated white icon input cards,
///    and dark-teal rounded-rectangle primary CTA button.
/// ============================================================================
class StepsFormScaffold extends StatelessWidget {
  const StepsFormScaffold({
    super.key,
    required this.stepTitle,
    required this.currentStep,
    required this.totalSteps,
    required this.body,
    required this.primaryLabel,
    required this.onPrimary,
    this.subtitle,
    this.onBack,
    this.headerAction,
    this.primaryBusy = false,
  });

  final String stepTitle;
  final String? subtitle;
  final int currentStep; // 0-based
  final int totalSteps;
  final Widget body;
  final String primaryLabel;
  final VoidCallback? onPrimary;
  final VoidCallback? onBack;
  final Widget? headerAction;
  final bool primaryBusy;

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;
    final headerBg = isDark ? const Color(0xFF17362E) : const Color(0xFFA7CFC3);
    final sheetBg = isDark ? const Color(0xFF0E1513) : const Color(0xFFF3FAF7);
    final titleColor = isDark ? const Color(0xFFE6F4F0) : const Color(0xFF0F2C2E);
    final subColor = isDark ? const Color(0xFF94ABA4) : const Color(0xFF4F6B66);

    return Scaffold(
      backgroundColor: headerBg,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            // Top sage-mint header with graduation cap + back + step pill
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
              child: Row(
                children: [
                  LiquidTap(
                    onTap: onBack ?? () => Navigator.of(context).pop(),
                    child: Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: isDark ? Colors.white12 : Colors.white.withValues(alpha: 0.55),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.arrow_back_rounded, size: 20, color: isDark ? Colors.white : const Color(0xFF0F2C2E)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Icon(Icons.school_rounded, size: 32, color: isDark ? const Color(0xFF6EE7B7) : const Color(0xFF0B1F1D)),
                  const Spacer(),
                  if (headerAction != null) ...[
                    headerAction!,
                    const SizedBox(width: 8),
                  ],
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
                    decoration: BoxDecoration(
                      color: isDark ? Colors.white12 : Colors.white.withValues(alpha: 0.65),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      'Step ${currentStep + 1} / $totalSteps',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: isDark ? Colors.white : const Color(0xFF0F2C2E),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Rounded mint-white sheet (Image 2 style)
            Expanded(
              child: Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: sheetBg,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(34)),
                ),
                child: Column(
                  children: [
                    // Segmented step bar
                    Padding(
                      padding: const EdgeInsets.fromLTRB(24, 18, 24, 0),
                      child: Row(
                        children: [
                          for (int i = 0; i < totalSteps; i++)
                            Expanded(
                              child: Container(
                                height: 4,
                                margin: EdgeInsets.only(right: i < totalSteps - 1 ? 5 : 0),
                                decoration: BoxDecoration(
                                  color: i <= currentStep
                                      ? const Color(0xFF0E4D45)
                                      : (isDark ? Colors.white12 : const Color(0xFFD5E6E0)),
                                  borderRadius: BorderRadius.circular(99),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(24, 22, 24, 24),
                        children: [
                          Text(
                            stepTitle,
                            style: TextStyle(
                              fontSize: 27,
                              fontWeight: FontWeight.w900,
                              color: titleColor,
                              letterSpacing: -0.5,
                              height: 1.15,
                            ),
                          ),
                          if (subtitle != null && subtitle!.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text(subtitle!, style: TextStyle(color: subColor, fontSize: 13.5, height: 1.45)),
                          ],
                          const SizedBox(height: 22),
                          body,
                          const SizedBox(height: 26),
                          StepPrimaryButton(
                            label: primaryBusy ? 'Please wait...' : primaryLabel,
                            onTap: primaryBusy ? null : onPrimary,
                          ),
                          if (onBack != null && currentStep > 0) ...[
                            const SizedBox(height: 10),
                            Center(
                              child: TextButton(
                                onPressed: onBack,
                                child: Text(
                                  'Go Back',
                                  style: TextStyle(color: subColor, fontWeight: FontWeight.w700),
                                ),
                              ),
                            ),
                          ],
                          SizedBox(height: MediaQuery.paddingOf(context).bottom + 16),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Elevated pure-white icon input card matching Image 2 ("Steps Form").
class StepCardInput extends StatelessWidget {
  const StepCardInput({
    super.key,
    required this.controller,
    required this.hint,
    required this.icon,
    this.label,
    this.helperText,
    this.helperColor,
    this.keyboardType,
    this.maxLines = 1,
    this.obscureText = false,
    this.onChanged,
  });

  final TextEditingController controller;
  final String hint;
  final String? label;
  final String? helperText;
  final Color? helperColor;
  final IconData icon;
  final TextInputType? keyboardType;
  final int maxLines;
  final bool obscureText;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;
    final cardBg = isDark ? const Color(0xFF18221F) : Colors.white;
    final textColor = isDark ? Colors.white : const Color(0xFF0F2C2E);
    final hintColor = isDark ? const Color(0xFF7D938D) : const Color(0xFF839691);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null) ...[
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 6),
            child: Text(
              label!,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: isDark ? const Color(0xFF9EB5AE) : const Color(0xFF3E5B57),
              ),
            ),
          ),
        ],
        Container(
          decoration: BoxDecoration(
            color: cardBg,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: isDark ? 0.25 : 0.06),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          padding: EdgeInsets.symmetric(horizontal: 14, vertical: maxLines > 1 ? 6 : 2),
          child: Row(
            crossAxisAlignment: maxLines > 1 ? CrossAxisAlignment.start : CrossAxisAlignment.center,
            children: [
              Padding(
                padding: EdgeInsets.only(top: maxLines > 1 ? 10 : 0, right: 10),
                child: Icon(icon, size: 19, color: hintColor),
              ),
              Expanded(
                child: TextField(
                  controller: controller,
                  keyboardType: keyboardType,
                  maxLines: maxLines,
                  obscureText: obscureText,
                  onChanged: onChanged,
                  style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: textColor),
                  decoration: InputDecoration(
                    hintText: hint,
                    hintStyle: TextStyle(color: hintColor, fontSize: 14),
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    filled: false,
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
            ],
          ),
        ),
        if (helperText != null) ...[
          Padding(
            padding: const EdgeInsets.only(left: 6, top: 5),
            child: Text(
              helperText!,
              style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: helperColor ?? hintColor),
            ),
          ),
        ],
      ],
    );
  }
}

/// Dark-teal rounded-rectangle primary button matching Image 2 ("Steps Form").
class StepPrimaryButton extends StatelessWidget {
  const StepPrimaryButton({super.key, required this.label, this.onTap});
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return LiquidTap(
      onTap: onTap,
      enabled: onTap != null,
      child: Container(
        width: double.infinity,
        height: 52,
        decoration: BoxDecoration(
          color: onTap == null ? const Color(0xFF0E4D45).withValues(alpha: 0.5) : const Color(0xFF0E4D45),
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF0E4D45).withValues(alpha: 0.28),
              blurRadius: 14,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15.5),
        ),
      ),
    );
  }
}
