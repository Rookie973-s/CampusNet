import 'dart:math' as math;
import 'dart:ui';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/models.dart';
import '../motion/liquid_motion.dart';
import '../theme/app_theme.dart';

/// Transparent CampusNetwork Logo (white background removed!).
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 34});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/images/cenet-logo.png',
      width: size,
      height: size,
      fit: BoxFit.contain,
    );
  }
}

/// Dark-morphism card with subtle rim highlight and elevation.
class MorphismCard extends StatelessWidget {
  const MorphismCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.radius = 20,
    this.color = CNColors.surface,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: CNColors.borderSubtle),
        boxShadow: const [
          BoxShadow(color: Color(0x55000000), blurRadius: 18, offset: Offset(0, 8)),
        ],
      ),
      child: child,
    );
  }
}

/// Impeller-safe Glassmorphism container wrapped in RepaintBoundary.
class GlassContainer extends StatelessWidget {
  const GlassContainer({
    super.key,
    required this.child,
    this.radius = 24,
    this.sigma = 14,
    this.color = CNColors.glassBar,
    this.padding = EdgeInsets.zero,
  });

  final Widget child;
  final double radius;
  final double sigma;
  final Color color;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: sigma, sigmaY: sigma),
          child: Container(
            padding: padding,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(radius),
              border: Border.all(color: CNColors.borderBright),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

Color parseHexColor(String hex, [Color fallback = CNColors.accent]) {
  final clean = hex.replaceFirst('#', '').trim();
  if (clean.length == 6) {
    final val = int.tryParse('FF$clean', radix: 16);
    if (val != null) return Color(val);
  }
  return fallback;
}

class UserAvatar extends StatelessWidget {
  const UserAvatar({
    super.key,
    this.url,
    required this.initials,
    this.bgHex = '#3B82F6',
    this.size = 42,
  });

  final String? url;
  final String initials;
  final String bgHex;
  final double size;

  @override
  Widget build(BuildContext context) {
    final bg = parseHexColor(bgHex);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
      clipBehavior: Clip.antiAlias,
      alignment: Alignment.center,
      child: url != null && url!.isNotEmpty
          ? CachedNetworkImage(
              imageUrl: url!,
              width: size,
              height: size,
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) => _initials(),
            )
          : _initials(),
    );
  }

  Widget _initials() => Text(
        initials.length > 2 ? initials.substring(0, 2).toUpperCase() : initials.toUpperCase(),
        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: size * 0.36),
      );
}

class DropdownOption {
  const DropdownOption({required this.label, required this.value, this.colorHex});
  final String label;
  final String value;
  final String? colorHex;
}

/// Reusable FacultyDropdown — renders via modal overlay ABOVE every card, zero clipping!
class FacultyDropdown extends StatelessWidget {
  const FacultyDropdown({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
    this.placeholder = 'All Faculties',
    this.icon = Icons.school_outlined,
  });

  final List<DropdownOption> options;
  final String value;
  final ValueChanged<String> onChanged;
  final String placeholder;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final active = options.cast<DropdownOption?>().firstWhere(
          (o) => o?.value == value,
          orElse: () => null,
        );

    return LiquidTap(
      onTap: () => _openSheet(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
          color: CNColors.surface,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: value.isNotEmpty && value != 'All' ? CNColors.accent : CNColors.borderBright,
          ),
        ),
        child: Row(
          children: [
            if (active?.colorHex != null)
              Container(
                width: 9,
                height: 9,
                margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(color: parseHexColor(active!.colorHex!), shape: BoxShape.circle),
              )
            else
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Icon(icon, size: 16, color: CNColors.accentLight),
              ),
            Expanded(
              child: Text(
                active?.label ?? placeholder,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5),
              ),
            ),
            const Icon(Icons.keyboard_arrow_down_rounded, size: 18, color: CNColors.textMuted),
          ],
        ),
      ),
    );
  }

  void _openSheet(BuildContext context) {
    showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: placeholder,
      barrierColor: Colors.black54,
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (_, __, ___) => Center(
        child: Material(
          color: Colors.transparent,
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 22),
            constraints: const BoxConstraints(maxHeight: 440, maxWidth: 420),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: CNColors.surface,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: CNColors.borderBright),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(placeholder, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: options.length,
                    itemBuilder: (_, idx) {
                      final opt = options[idx];
                      final selected = opt.value == value;
                      return LiquidTap(
                        onTap: () {
                          onChanged(opt.value);
                          Navigator.of(context).pop();
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                          margin: const EdgeInsets.symmetric(vertical: 2),
                          decoration: BoxDecoration(
                            color: selected ? CNColors.accentSoft : Colors.transparent,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Row(
                            children: [
                              if (opt.colorHex != null)
                                Container(
                                  width: 10,
                                  height: 10,
                                  margin: const EdgeInsets.only(right: 10),
                                  decoration: BoxDecoration(
                                    color: parseHexColor(opt.colorHex!),
                                    shape: BoxShape.circle,
                                  ),
                                ),
                              Expanded(
                                child: Text(
                                  opt.label,
                                  style: TextStyle(
                                    fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                                    color: selected ? CNColors.accentLight : CNColors.textPrimary,
                                  ),
                                ),
                              ),
                              if (selected) const Icon(Icons.check_rounded, size: 18, color: CNColors.accentLight),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      transitionBuilder: (_, anim, __, child) => FadeTransition(
        opacity: anim,
        child: ScaleTransition(scale: Tween(begin: 0.93, end: 1.0).animate(anim), child: child),
      ),
    );
  }
}

/// Expanding MorphismSearchInput matching the SEARCH BEHAVIOR video.
class MorphismSearchInput extends StatefulWidget {
  const MorphismSearchInput({
    super.key,
    required this.value,
    required this.onChanged,
    this.placeholder = 'Search...',
  });

  final String value;
  final ValueChanged<String> onChanged;
  final String placeholder;

  @override
  State<MorphismSearchInput> createState() => _MorphismSearchInputState();
}

class _MorphismSearchInputState extends State<MorphismSearchInput> {
  bool _expanded = false;
  late final TextEditingController _ctrl;
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.value);
    _expanded = widget.value.isNotEmpty;
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
      width: _expanded ? 210 : 44,
      height: 44,
      decoration: BoxDecoration(
        color: _expanded ? CNColors.surface : CNColors.surfaceHigh,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: CNColors.borderBright),
      ),
      child: _expanded
          ? Row(
              children: [
                const SizedBox(width: 10),
                const Icon(Icons.search_rounded, size: 18, color: CNColors.accentLight),
                const SizedBox(width: 6),
                Expanded(
                  child: TextField(
                    controller: _ctrl,
                    focusNode: _focus,
                    onChanged: widget.onChanged,
                    style: const TextStyle(fontSize: 13.5, color: CNColors.textPrimary),
                    decoration: InputDecoration(
                      hintText: widget.placeholder,
                      hintStyle: const TextStyle(color: CNColors.textFaint, fontSize: 13),
                      border: InputBorder.none,
                      isDense: true,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded, size: 18, color: CNColors.textMuted),
                  onPressed: () {
                    _ctrl.clear();
                    widget.onChanged('');
                    _focus.unfocus();
                    setState(() => _expanded = false);
                  },
                ),
              ],
            )
          : LiquidTap(
              onTap: () {
                setState(() => _expanded = true);
                Future.delayed(const Duration(milliseconds: 120), () => _focus.requestFocus());
              },
              child: const Center(child: Icon(Icons.search_rounded, size: 19, color: Colors.white)),
            ),
    );
  }
}

/// Real Backend-Driven Sponsored Ad Card (fixes blank dark media box!).
class NativeAdCard extends StatelessWidget {
  const NativeAdCard({
    super.key,
    required this.ad,
    this.onTapCta,
  });

  final ServedAd ad;
  final VoidCallback? onTapCta;

  @override
  Widget build(BuildContext context) {
    return MorphismCard(
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.campaign_rounded, size: 15, color: CNColors.warning),
              const SizedBox(width: 6),
              const Text(
                'SPONSORED',
                style: TextStyle(color: CNColors.warning, fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6),
              ),
              const Spacer(),
              Text(ad.advertiserName, style: const TextStyle(color: CNColors.textFaint, fontSize: 11.5)),
            ],
          ),
          if (ad.imageUrl != null && ad.imageUrl!.isNotEmpty) ...[
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: CachedNetworkImage(
                imageUrl: ad.imageUrl!,
                width: double.infinity,
                height: 165,
                fit: BoxFit.cover,
                errorWidget: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
          ],
          const SizedBox(height: 10),
          Text(ad.headline, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800)),
          if (ad.description.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              ad.description,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: CNColors.textMuted, fontSize: 13.5, height: 1.4),
            ),
          ],
          if (ad.destinationUrl != null && ad.destinationUrl!.isNotEmpty) ...[
            const SizedBox(height: 12),
            LiquidTap(
              onTap: () {
                onTapCta?.call();
                final uri = Uri.tryParse(ad.destinationUrl!);
                if (uri != null) launchUrl(uri, mode: LaunchMode.externalApplication);
              },
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 11),
                decoration: BoxDecoration(
                  color: CNColors.accent,
                  borderRadius: BorderRadius.circular(999),
                ),
                alignment: Alignment.center,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.open_in_new_rounded, size: 15, color: Colors.white),
                    const SizedBox(width: 6),
                    Text(ad.ctaText, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Radial Fan Share Animation matching the Share Button video.
Future<void> showRadialShareFan(BuildContext context, {required String title, required String url}) {
  return showGeneralDialog(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Share',
    barrierColor: Colors.black54,
    transitionDuration: const Duration(milliseconds: 260),
    pageBuilder: (ctx, _, __) => _RadialShareFanDialog(title: title, url: url),
  );
}

class _RadialShareFanDialog extends StatefulWidget {
  const _RadialShareFanDialog({required this.title, required this.url});
  final String title;
  final String url;

  @override
  State<_RadialShareFanDialog> createState() => _RadialShareFanDialogState();
}

class _RadialShareFanDialogState extends State<_RadialShareFanDialog> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController.unbounded(vsync: this, value: 0);
    final sim = SpringSimulation(LiquidSprings.bouncy, 0, 1, 0);
    _ctrl.animateWith(sim);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final actions = [
      (Icons.alternate_email_rounded, 'X', const Color(0xFF111827), () {
        launchUrl(
          Uri.parse('https://twitter.com/intent/tweet?text=${Uri.encodeComponent(widget.title)}&url=${Uri.encodeComponent(widget.url)}'),
          mode: LaunchMode.externalApplication,
        );
      }),
      (Icons.business_center_rounded, 'LinkedIn', const Color(0xFF0A66C2), () {
        launchUrl(
          Uri.parse('https://www.linkedin.com/sharing/share-offsite/?url=${Uri.encodeComponent(widget.url)}'),
          mode: LaunchMode.externalApplication,
        );
      }),
      (Icons.chat_rounded, 'WhatsApp', const Color(0xFF25D366), () {
        launchUrl(
          Uri.parse('https://wa.me/?text=${Uri.encodeComponent('${widget.title} ${widget.url}')}'),
          mode: LaunchMode.externalApplication,
        );
      }),
      (Icons.mail_rounded, 'Email', const Color(0xFFF59E0B), () {
        launchUrl(
          Uri.parse('mailto:?subject=${Uri.encodeComponent(widget.title)}&body=${Uri.encodeComponent('${widget.title}\n\n${widget.url}')}'),
        );
      }),
      (Icons.link_rounded, 'Copy', CNColors.accent, () {
        Clipboard.setData(ClipboardData(text: widget.url));
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Link copied!')));
      }),
    ];
    const angles = [165.0, 132.0, 90.0, 48.0, 15.0];
    const radius = 98.0;

    return GestureDetector(
      onTap: () => Navigator.of(context).pop(),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: Align(
          alignment: Alignment.bottomCenter,
          child: Padding(
            padding: const EdgeInsets.only(bottom: 112),
            child: SizedBox(
              width: 260,
              height: 165,
              child: AnimatedBuilder(
                animation: _ctrl,
                builder: (_, __) {
                  final v = _ctrl.value.clamp(0.0, 1.25);
                  return Stack(
                    alignment: Alignment.bottomCenter,
                    children: [
                      for (int i = 0; i < actions.length; i++)
                        Transform.translate(
                          offset: Offset(
                            math.cos(angles[i] * math.pi / 180) * radius * v,
                            -math.sin(angles[i] * math.pi / 180) * radius * v - 18,
                          ),
                          child: Transform.scale(
                            scale: v.clamp(0.2, 1.05),
                            child: LiquidTap(
                              onTap: () {
                                Navigator.of(context).pop();
                                actions[i].$4();
                              },
                              child: Container(
                                width: 48,
                                height: 48,
                                decoration: BoxDecoration(
                                  color: actions[i].$3,
                                  shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white24, width: 1.5),
                                ),
                                child: Icon(actions[i].$1, color: Colors.white, size: 20),
                              ),
                            ),
                          ),
                        ),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          LiquidTap(
                            onTap: () {
                              Navigator.of(context).pop();
                              Share.share('${widget.title}\n${widget.url}');
                            },
                            child: GlassContainer(
                              radius: 99,
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.share_rounded, size: 16, color: CNColors.accentLight),
                                  SizedBox(width: 6),
                                  Text('More Apps', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}
