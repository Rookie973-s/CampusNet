import 'dart:math' as math;
import 'dart:ui';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/models.dart';
import '../motion/liquid_motion.dart';
import '../network/api_client.dart';
import '../theme/app_theme.dart';

/// Parse `#RRGGBB` hex string into a Flutter [Color] safely.
Color hexToColor(String hex, {Color fallback = const Color(0xFF1D9BF0)}) {
  final cleaned = hex.trim().replaceFirst('#', '');
  if (cleaned.length == 6) {
    final v = int.tryParse('FF$cleaned', radix: 16);
    if (v != null) return Color(v);
  } else if (cleaned.length == 8) {
    final v = int.tryParse(cleaned, radix: 16);
    if (v != null) return Color(v);
  }
  return fallback;
}

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

/// Shared Root-Navigator Overlay Helpers (fixes bottom-nav overlap & black-screen pop bugs!).
class AppBottomSheet {
  static Future<T?> show<T>(
    BuildContext context, {
    required WidgetBuilder builder,
    bool isScrollControlled = true,
  }) {
    final c = context.cn;
    return showModalBottomSheet<T>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: isScrollControlled,
      useSafeArea: true,
      backgroundColor: c.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (sheetCtx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(sheetCtx).bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(sheetCtx).height * 0.9),
          child: builder(sheetCtx),
        ),
      ),
    );
  }
}

/// Theme-aware Surface Card.
class MorphismCard extends StatelessWidget {
  const MorphismCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.radius = 20,
    this.color,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = context.cn;
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? c.surface,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: c.divider, width: 0.9),
      ),
      child: child,
    );
  }
}

/// Impeller-safe Glassmorphism container wrapped in RepaintBoundary (with solid fallback).
class GlassContainer extends StatelessWidget {
  const GlassContainer({
    super.key,
    required this.child,
    this.radius = 24,
    this.sigma = 14,
    this.color,
    this.padding = EdgeInsets.zero,
  });

  final Widget child;
  final double radius;
  final double sigma;
  final Color? color;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final c = context.cn;
    final reduced = LiquidSprings.reducedMotion(context);
    final inner = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? c.glassFill,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: c.glassBorder, width: 1),
      ),
      child: child,
    );
    if (reduced) return ClipRRect(borderRadius: BorderRadius.circular(radius), child: inner);
    return RepaintBoundary(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: sigma, sigmaY: sigma),
          child: inner,
        ),
      ),
    );
  }
}

Color parseHexColor(String hex, [Color fallback = const Color(0xFF1D9BF0)]) {
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
        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: size * 0.36, decoration: TextDecoration.none),
      );
}

/// Shared BadgeRow: Verified Student blue checkmark + Official Website SUG Shield Icon (replaces "SUG" text!).
class BadgeRow extends StatelessWidget {
  const BadgeRow({
    super.key,
    this.verified = false,
    this.staff = false,
    this.isVerifiedStudent = false,
    this.isVerifiedStaff = false,
    this.size = 15,
  });

  final bool verified;
  final bool staff;
  final bool isVerifiedStudent;
  final bool isVerifiedStaff;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = context.cn;
    final showVerified = verified || isVerifiedStudent;
    final showStaff = staff || isVerifiedStaff;
    if (!showVerified && !showStaff) return const SizedBox.shrink();
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (showVerified)
          Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Tooltip(
              message: 'Verified Student',
              child: Icon(Icons.verified_rounded, size: size, color: c.success),
            ),
          ),
        if (showStaff)
          Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Tooltip(
              message: 'Verified SUG Official',
              child: Icon(Icons.verified_user_rounded, size: size, color: c.gold),
            ),
          ),
      ],
    );
  }
}

/// Reusable Globally Clickable UserIdentity Widget (Part 10.5)
/// Clicking Avatar, Full Name, OR @username navigates to the user's Public Profile (or Me if current user).
class UserIdentity extends StatelessWidget {
  const UserIdentity({
    super.key,
    required this.userId,
    required this.name,
    required this.username,
    required this.initials,
    required this.bgHex,
    this.avatarUrl,
    this.verified = false,
    this.staff = false,
    this.subtitle,
    this.avatarSize = 40,
    this.currentUserId,
  });

  final int? userId;
  final String name;
  final String username;
  final String initials;
  final String bgHex;
  final String? avatarUrl;
  final bool verified;
  final bool staff;
  final String? subtitle;
  final double avatarSize;
  final int? currentUserId;

  void _openProfile(BuildContext context) {
    if (userId == null) return;
    if (currentUserId != null && userId == currentUserId) {
      context.go('/me');
    } else {
      context.push('/user/$userId');
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.cn;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _openProfile(context),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          UserAvatar(url: avatarUrl, initials: initials, bgHex: bgHex, size: avatarSize),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5, color: c.textPrimary),
                      ),
                    ),
                    BadgeRow(verified: verified, staff: staff, size: 15),
                  ],
                ),
                if (username.isNotEmpty)
                  Text(
                    '@$username${subtitle != null && subtitle!.isNotEmpty ? ' · $subtitle' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: c.textSecondary, fontSize: 12.5),
                  )
                else if (subtitle != null && subtitle!.isNotEmpty)
                  Text(subtitle!, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.textSecondary, fontSize: 12.5)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class DropdownOption {
  const DropdownOption({required this.label, required this.value, this.colorHex});
  final String label;
  final String value;
  final String? colorHex;
}

/// FIXED Reusable FacultyDropdown (Root-Navigator Modal Sheet — ZERO blank/black screen bugs!).
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
    final c = context.cn;
    final active = options.cast<DropdownOption?>().firstWhere(
          (o) => o?.value == value,
          orElse: () => null,
        );

    return LiquidTap(
      onTap: () => _openSheet(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: value.isNotEmpty && value != 'All' ? c.accent : c.divider,
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
                child: Icon(icon, size: 16, color: c.accent),
              ),
            Expanded(
              child: Text(
                active?.label ?? placeholder,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, color: c.textPrimary),
              ),
            ),
            Icon(Icons.keyboard_arrow_down_rounded, size: 18, color: c.textSecondary),
          ],
        ),
      ),
    );
  }

  void _openSheet(BuildContext context) {
    final c = context.cn;
    AppBottomSheet.show(
      context,
      builder: (sheetCtx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 38, height: 4, decoration: BoxDecoration(color: c.divider, borderRadius: BorderRadius.circular(99))),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Text(placeholder, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: c.textPrimary)),
                  ),
                  IconButton(
                    icon: Icon(Icons.close, size: 20, color: c.textSecondary),
                    onPressed: () {
                      if (Navigator.of(sheetCtx, rootNavigator: true).canPop()) {
                        Navigator.of(sheetCtx, rootNavigator: true).pop();
                      }
                    },
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
                        if (Navigator.of(sheetCtx, rootNavigator: true).canPop()) {
                          Navigator.of(sheetCtx, rootNavigator: true).pop();
                        }
                        onChanged(opt.value);
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
                        margin: const EdgeInsets.symmetric(vertical: 2),
                        decoration: BoxDecoration(
                          color: selected ? c.accentSoft : Colors.transparent,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          children: [
                            if (opt.colorHex != null)
                              Container(
                                width: 10,
                                height: 10,
                                margin: const EdgeInsets.only(right: 10),
                                decoration: BoxDecoration(color: parseHexColor(opt.colorHex!), shape: BoxShape.circle),
                              ),
                            Expanded(
                              child: Text(
                                opt.label,
                                style: TextStyle(
                                  fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                                  color: selected ? c.accent : c.textPrimary,
                                ),
                              ),
                            ),
                            if (selected) Icon(Icons.check_rounded, size: 18, color: c.accent),
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
    );
  }
}

/// Real Backend-Driven Sponsored Ad Card with automatic impression & click tracking!
class NativeAdCard extends StatefulWidget {
  const NativeAdCard({
    super.key,
    required this.ad,
    this.placement = 'feed',
    this.api,
  });

  final ServedAd ad;
  final String placement;
  final ApiClient? api;

  @override
  State<NativeAdCard> createState() => _NativeAdCardState();
}

class _NativeAdCardState extends State<NativeAdCard> {
  bool _impSent = false;

  @override
  void initState() {
    super.initState();
    _sendImpression();
  }

  Future<void> _sendImpression() async {
    if (_impSent || widget.api == null) return;
    _impSent = true;
    try {
      await widget.api!.dio.post('/ads/${widget.ad.id}/impression/', data: {'placement': widget.placement});
    } catch (_) {}
  }

  Future<void> _handleClick() async {
    try {
      await widget.api?.dio.post('/ads/${widget.ad.id}/click/', data: {'placement': widget.placement});
    } catch (_) {}
    final dest = widget.ad.destinationUrl;
    if (dest != null && dest.isNotEmpty) {
      final uri = Uri.tryParse(dest);
      if (uri != null) launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.cn;
    return MorphismCard(
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.campaign_rounded, size: 15, color: c.warning),
              const SizedBox(width: 6),
              Text(
                'SPONSORED',
                style: TextStyle(color: c.warning, fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6),
              ),
              const Spacer(),
              Text(widget.ad.advertiserName, style: TextStyle(color: c.textSecondary, fontSize: 11.5)),
            ],
          ),
          if (widget.ad.imageUrl != null && widget.ad.imageUrl!.isNotEmpty) ...[
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: CachedNetworkImage(
                imageUrl: widget.ad.imageUrl!,
                width: double.infinity,
                height: 165,
                fit: BoxFit.cover,
                errorWidget: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
          ],
          const SizedBox(height: 10),
          Text(widget.ad.headline, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: c.textPrimary)),
          if (widget.ad.description.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              widget.ad.description,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: c.textSecondary, fontSize: 13.5, height: 1.4),
            ),
          ],
          if (widget.ad.destinationUrl != null && widget.ad.destinationUrl!.isNotEmpty) ...[
            const SizedBox(height: 12),
            LiquidTap(
              onTap: _handleClick,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 11),
                decoration: BoxDecoration(color: c.accent, borderRadius: BorderRadius.circular(999)),
                alignment: Alignment.center,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.open_in_new_rounded, size: 15, color: Colors.white),
                    const SizedBox(width: 6),
                    Text(widget.ad.ctaText, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
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

/// Radial Fan Share Animation (Root Navigator + Material wrapper — zero yellow underlines!).
Future<void> showRadialShareFan(BuildContext context, {required String title, required String url}) {
  return showGeneralDialog(
    context: context,
    useRootNavigator: true,
    barrierDismissible: true,
    barrierLabel: 'Share',
    barrierColor: Colors.black54,
    transitionDuration: const Duration(milliseconds: 240),
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
    _ctrl.animateWith(SpringSimulation(LiquidSprings.bouncy, 0, 1, 0));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.cn;
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
      (Icons.link_rounded, 'Copy', c.accent, () {
        Clipboard.setData(ClipboardData(text: widget.url));
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Link copied!')));
      }),
    ];
    const angles = [165.0, 132.0, 90.0, 48.0, 15.0];
    const radius = 98.0;

    return Material(
      type: MaterialType.transparency,
      child: GestureDetector(
        onTap: () => Navigator.of(context, rootNavigator: true).pop(),
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
                                  Navigator.of(context, rootNavigator: true).pop();
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
                        LiquidTap(
                          onTap: () {
                            Navigator.of(context, rootNavigator: true).pop();
                            Share.share('${widget.title}\n${widget.url}');
                          },
                          child: GlassContainer(
                            radius: 99,
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.share_rounded, size: 16, color: c.accent),
                                const SizedBox(width: 6),
                                Text('More Apps', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: c.textPrimary)),
                              ],
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
