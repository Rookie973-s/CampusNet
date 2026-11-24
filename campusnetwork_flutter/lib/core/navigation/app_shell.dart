import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/auth_provider.dart';
import '../../features/auth/landing_screen.dart';
import '../../features/feed/create_post_modals.dart';
import '../motion/liquid_motion.dart';
import '../theme/app_theme.dart';
import '../widgets/morphism_widgets.dart';

/// Persistent App Shell:
/// - Fixed Glassmorphism TopBar (NO hide-on-scroll, NO avatar shortcut, transparent logo -> Feed)
/// - Floating Dark-Glass BottomBar with Feed, Library, Central 2-Action Liquid FAB (Post / Poll), SUG, Me (with live unread dot!)
/// - Reorganized Hamburger Drawer (Communities, SUG Chats, Place Ads, SUG Access, About/Help/Privacy, Sign Out)
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key, required this.navigationShell});
  final StatefulNavigationShell navigationShell;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> with SingleTickerProviderStateMixin {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  late final AnimationController _fabCtrl;
  bool _fabOpen = false;

  @override
  void initState() {
    super.initState();
    _fabCtrl = AnimationController.unbounded(vsync: this, value: 0);
  }

  @override
  void dispose() {
    _fabCtrl.dispose();
    super.dispose();
  }

  void _toggleFab([bool? force]) {
    final next = force ?? !_fabOpen;
    if (next == _fabOpen) return;
    HapticFeedback.lightImpact();
    setState(() => _fabOpen = next);
    final sim = SpringSimulation(LiquidSprings.bouncy, _fabCtrl.value, next ? 1.0 : 0.0, 0);
    _fabCtrl.animateWith(sim);
  }

  void _openCreatePost() {
    _toggleFab(false);
    final user = ref.read(authProvider).user;
    if (user == null) {
      showAuthSheet(context);
      return;
    }
    showAskNetworkModal(context);
  }

  void _openCreatePoll() {
    _toggleFab(false);
    final user = ref.read(authProvider).user;
    if (user == null) {
      showAuthSheet(context);
      return;
    }
    showCreatePollModal(context);
  }

  @override
  Widget build(BuildContext context) {
    final unread = ref.watch(unreadNotificationsCountProvider);
    final user = ref.watch(authProvider.select((s) => s.user));
    final idx = widget.navigationShell.currentIndex;

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: CNColors.bg,
      endDrawer: _HamburgerDrawer(user: user, unread: unread),
      body: Stack(
        children: [
          Column(
            children: [
              // Fixed Glassmorphism Top Navigation Bar
              SafeArea(
                bottom: false,
                child: GlassContainer(
                  radius: 0,
                  sigma: 16,
                  color: CNColors.glassBar,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  child: Row(
                    children: [
                      LiquidTap(
                        onTap: () => widget.navigationShell.goBranch(0),
                        child: Row(
                          children: [
                            const BrandMark(size: 34),
                            const SizedBox(width: 9),
                            RichText(
                              text: const TextSpan(
                                style: TextStyle(fontSize: 18.5, fontWeight: FontWeight.w900, letterSpacing: -0.3),
                                children: [
                                  TextSpan(text: 'Campus', style: TextStyle(color: Colors.white)),
                                  TextSpan(text: 'Network', style: TextStyle(color: CNColors.accentLight)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Spacer(),
                      LiquidTap(
                        onTap: () => context.push('/search'),
                        child: Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.search_rounded, size: 19, color: Colors.white),
                        ),
                      ),
                      const SizedBox(width: 8),
                      LiquidTap(
                        onTap: () => _scaffoldKey.currentState?.openEndDrawer(),
                        child: Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.menu_rounded, size: 21, color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(child: widget.navigationShell),
            ],
          ),

          // Dimmed backdrop when 2-Action FAB is expanded
          if (_fabOpen)
            Positioned.fill(
              child: GestureDetector(
                onTap: () => _toggleFab(false),
                child: Container(color: Colors.black54),
              ),
            ),

          // Floating Bottom Navigation + Strictly 2-Action Radial Liquid FAB
          Positioned(
            left: 14,
            right: 14,
            bottom: MediaQuery.of(context).padding.bottom + 12,
            child: SizedBox(
              height: 150,
              child: Stack(
                alignment: Alignment.bottomCenter,
                clipBehavior: Clip.none,
                children: [
                  // Action 1: Create Post (Left Arc)
                  AnimatedBuilder(
                    animation: _fabCtrl,
                    builder: (_, child) {
                      final v = _fabCtrl.value.clamp(0.0, 1.25);
                      return IgnorePointer(
                        ignoring: !_fabOpen,
                        child: Opacity(
                          opacity: v.clamp(0.0, 1.0),
                          child: Transform.translate(
                            offset: Offset(-66 * v, -84 * v - 20),
                            child: Transform.scale(scale: (0.35 + 0.65 * v).clamp(0.2, 1.1), child: child),
                          ),
                        ),
                      );
                    },
                    child: _FabActionItem(
                      icon: Icons.edit_rounded,
                      label: 'Post',
                      color: const Color(0xFF2563EB),
                      onTap: _openCreatePost,
                    ),
                  ),

                  // Action 2: Create Poll (Right Arc)
                  AnimatedBuilder(
                    animation: _fabCtrl,
                    builder: (_, child) {
                      final v = _fabCtrl.value.clamp(0.0, 1.25);
                      return IgnorePointer(
                        ignoring: !_fabOpen,
                        child: Opacity(
                          opacity: v.clamp(0.0, 1.0),
                          child: Transform.translate(
                            offset: Offset(66 * v, -84 * v - 20),
                            child: Transform.scale(scale: (0.35 + 0.65 * v).clamp(0.2, 1.1), child: child),
                          ),
                        ),
                      );
                    },
                    child: _FabActionItem(
                      icon: Icons.bar_chart_rounded,
                      label: 'Poll',
                      color: CNColors.accentLight,
                      onTap: _openCreatePoll,
                    ),
                  ),

                  // Rounded Floating Dark-Glass Bar
                  GlassContainer(
                    radius: 28,
                    sigma: 18,
                    color: const Color(0xEE141824),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
                    child: Row(
                      children: [
                        _NavTab(
                          icon: Icons.article_outlined,
                          activeIcon: Icons.article_rounded,
                          label: 'Feed',
                          active: idx == 0,
                          onTap: () {
                            _toggleFab(false);
                            widget.navigationShell.goBranch(0);
                          },
                        ),
                        _NavTab(
                          icon: Icons.menu_book_outlined,
                          activeIcon: Icons.menu_book_rounded,
                          label: 'Library',
                          active: idx == 1,
                          onTap: () {
                            _toggleFab(false);
                            widget.navigationShell.goBranch(1);
                          },
                        ),
                        const SizedBox(width: 64),
                        _NavTab(
                          icon: Icons.people_outline_rounded,
                          activeIcon: Icons.people_rounded,
                          label: 'SUG',
                          active: idx == 2,
                          onTap: () {
                            _toggleFab(false);
                            widget.navigationShell.goBranch(2);
                          },
                        ),
                        _NavTab(
                          icon: Icons.person_outline_rounded,
                          activeIcon: Icons.person_rounded,
                          label: 'Me',
                          active: idx == 3,
                          hasUnread: unread > 0,
                          onTap: () {
                            _toggleFab(false);
                            widget.navigationShell.goBranch(3);
                          },
                        ),
                      ],
                    ),
                  ),

                  // Central Glowing Blue + FAB
                  Positioned(
                    bottom: 22,
                    child: LiquidTap(
                      onTap: () => _toggleFab(),
                      child: Container(
                        width: 60,
                        height: 60,
                        decoration: BoxDecoration(
                          color: CNColors.accent,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white24, width: 2.5),
                          boxShadow: const [
                            BoxShadow(color: Color(0x884A90FF), blurRadius: 18, offset: Offset(0, 6)),
                          ],
                        ),
                        child: AnimatedBuilder(
                          animation: _fabCtrl,
                          builder: (_, child) => Transform.rotate(
                            angle: _fabCtrl.value * 0.785398, // 45 degrees -> ×
                            child: child,
                          ),
                          child: const Icon(Icons.add_rounded, size: 30, color: Colors.white),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NavTab extends StatelessWidget {
  const _NavTab({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.active,
    required this.onTap,
    this.hasUnread = false,
  });

  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool active;
  final bool hasUnread;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: LiquidTap(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.symmetric(vertical: 7),
          decoration: BoxDecoration(
            color: active ? CNColors.accentSoft : Colors.transparent,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Icon(active ? activeIcon : icon, size: 21, color: active ? CNColors.accentLight : CNColors.textMuted),
                  if (hasUnread)
                    Positioned(
                      top: -2,
                      right: -4,
                      child: Container(
                        width: 9,
                        height: 9,
                        decoration: BoxDecoration(
                          color: CNColors.danger,
                          shape: BoxShape.circle,
                          border: Border.all(color: CNColors.surface, width: 1.5),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                  color: active ? CNColors.accentLight : CNColors.textMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FabActionItem extends StatelessWidget {
  const _FabActionItem({required this.icon, required this.label, required this.color, required this.onTap});
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return LiquidTap(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white30, width: 1.5),
              boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 12, offset: Offset(0, 5))],
            ),
            child: Icon(icon, color: Colors.white, size: 22),
          ),
          const SizedBox(height: 4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(color: const Color(0xDD0B1220), borderRadius: BorderRadius.circular(99)),
            child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }
}

class _HamburgerDrawer extends ConsumerWidget {
  const _HamburgerDrawer({this.user, required this.unread});
  final dynamic user;
  final int unread;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = [
      (Icons.explore_outlined, 'Communities', '/communities'),
      (Icons.chat_bubble_outline_rounded, 'SUG Chats', '/chats'),
      (Icons.campaign_outlined, 'Place Ads', '/ads'),
      (Icons.school_outlined, 'SUG Access', '/apply-sug'),
      (Icons.info_outline_rounded, 'About, Help & Privacy', '/about'),
    ];

    return Drawer(
      backgroundColor: CNColors.surface,
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const BrandMark(size: 36),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('CampusNetwork', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                        Text('ATBU Student Hub', style: TextStyle(color: CNColors.textMuted, fontSize: 11.5)),
                      ],
                    ),
                  ),
                  IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.of(context).pop()),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(12),
                children: [
                  for (final it in items)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: LiquidTap(
                        onTap: () {
                          Navigator.of(context).pop();
                          context.push(it.$3);
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                          decoration: BoxDecoration(
                            color: CNColors.surfaceHigh,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Row(
                            children: [
                              Icon(it.$1, size: 19, color: CNColors.accentLight),
                              const SizedBox(width: 12),
                              Expanded(child: Text(it.$2, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
                              const Icon(Icons.chevron_right_rounded, size: 18, color: CNColors.textFaint),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            if (user != null)
              Padding(
                padding: const EdgeInsets.all(14),
                child: LiquidTap(
                  onTap: () async {
                    Navigator.of(context).pop();
                    await ref.read(authProvider.notifier).logout();
                    if (context.mounted) context.go('/landing');
                  },
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(color: CNColors.dangerSoft, borderRadius: BorderRadius.circular(14)),
                    alignment: Alignment.center,
                    child: const Text('Sign Out', style: TextStyle(color: CNColors.danger, fontWeight: FontWeight.w800)),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
