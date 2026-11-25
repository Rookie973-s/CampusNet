import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/auth_provider.dart';
import '../../features/auth/landing_screen.dart';
import '../../features/feed/create_post_modals.dart';
import '../motion/liquid_motion.dart';
import '../network/api_client.dart';
import '../theme/app_theme.dart';
import '../widgets/morphism_widgets.dart';
import 'scroll_chrome.dart';

/// AppShell (v2):
/// - Liquid-Glass Floating TopBar (TOP NAVBAR ref): ONLY Logo + CampusNetwork + Hamburger (Search icon REMOVED!)
/// - Curved Notched BottomBar (NAVIGATION BAR ref): Feed | Library | [ + FAB -> Post / Poll / Search ] | SUG | Me (unread dot)
/// - Smooth coordinated Hide-on-Scroll for BOTH bars (zero setState per scroll tick!)
/// - Hamburger Drawer with live TRENDING NOW + Dark/Light Mode switch + Sign Out
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
    _fabCtrl.animateWith(SpringSimulation(LiquidSprings.bouncy, _fabCtrl.value, next ? 1.0 : 0.0, 0));
  }

  void _openCreatePost() {
    _toggleFab(false);
    if (ref.read(authProvider).user == null) {
      showAuthSheet(context);
      return;
    }
    showAskNetworkModal(context);
  }

  void _openCreatePoll() {
    _toggleFab(false);
    if (ref.read(authProvider).user == null) {
      showAuthSheet(context);
      return;
    }
    showCreatePollModal(context);
  }

  void _openSearch() {
    _toggleFab(false);
    context.push('/search');
  }

  @override
  Widget build(BuildContext context) {
    final c = context.cn;
    final unread = ref.watch(unreadNotificationsCountProvider);
    final user = ref.watch(authProvider.select((s) => s.user));
    final chromeCtrl = ref.watch(chromeVisibilityProvider);
    final idx = widget.navigationShell.currentIndex;
    final keyboardOpen = MediaQuery.viewInsetsOf(context).bottom > 20;

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: c.background,
      endDrawer: _HamburgerDrawer(user: user, unread: unread),
      body: NotificationListener<ScrollNotification>(
        onNotification: (n) => chromeCtrl.handleScroll(n, keyboardOpen: keyboardOpen || _fabOpen),
        child: Stack(
          children: [
            // Main Screen Content
            Positioned.fill(
              child: Padding(
                padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
                child: widget.navigationShell,
              ),
            ),

            // Liquid-Glass Floating Top Navbar (TOP NAVBAR reference — NO search icon!)
            Positioned(
              top: MediaQuery.paddingOf(context).top + 8,
              left: 14,
              right: 14,
              child: ValueListenableBuilder<bool>(
                valueListenable: chromeCtrl,
                builder: (_, visible, child) => AnimatedSlide(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  offset: visible ? Offset.zero : const Offset(0, -1.6),
                  child: AnimatedOpacity(
                    duration: const Duration(milliseconds: 200),
                    opacity: visible ? 1.0 : 0.0,
                    child: IgnorePointer(ignoring: !visible, child: child),
                  ),
                ),
                child: GlassContainer(
                  radius: 28,
                  sigma: 16,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  child: Row(
                    children: [
                      LiquidTap(
                        onTap: () {
                          chromeCtrl.show();
                          widget.navigationShell.goBranch(0, initialLocation: idx == 0);
                        },
                        child: Row(
                          children: [
                            const BrandMark(size: 30),
                            const SizedBox(width: 8),
                            RichText(
                              text: TextSpan(
                                style: const TextStyle(fontSize: 17.5, fontWeight: FontWeight.w900, letterSpacing: -0.3, decoration: TextDecoration.none),
                                children: [
                                  TextSpan(text: 'Campus', style: TextStyle(color: c.textPrimary)),
                                  TextSpan(text: 'Network', style: TextStyle(color: c.accent)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Spacer(),
                      LiquidTap(
                        onTap: () => _scaffoldKey.currentState?.openEndDrawer(),
                        child: Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: c.surfaceMuted.withValues(alpha: 0.7),
                            shape: BoxShape.circle,
                            border: Border.all(color: c.glassBorder),
                          ),
                          child: Icon(Icons.menu_rounded, size: 21, color: c.textPrimary),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // Scrim when central 3-action menu is open
            if (_fabOpen)
              Positioned.fill(
                child: GestureDetector(
                  onTap: () => _toggleFab(false),
                  child: Container(color: c.scrim),
                ),
              ),

            // Curved Notched Bottom Navigation Bar (NAVIGATION BAR ref) + 3-Action FAB (Post, Poll, Search)
            Positioned(
              left: 14,
              right: 14,
              bottom: MediaQuery.paddingOf(context).bottom + 10,
              child: ValueListenableBuilder<bool>(
                valueListenable: chromeCtrl,
                builder: (_, visible, child) => AnimatedSlide(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  offset: visible || _fabOpen ? Offset.zero : const Offset(0, 1.8),
                  child: AnimatedOpacity(
                    duration: const Duration(milliseconds: 200),
                    opacity: visible || _fabOpen ? 1.0 : 0.0,
                    child: IgnorePointer(ignoring: !visible && !_fabOpen, child: child),
                  ),
                ),
                child: SizedBox(
                  height: 165,
                  child: Stack(
                    alignment: Alignment.bottomCenter,
                    clipBehavior: Clip.none,
                    children: [
                      // 3 Expandable Radial Actions: Create Post (left), Create Poll (top-center), Search (right)
                      _RadialFabAction(
                        ctrl: _fabCtrl,
                        open: _fabOpen,
                        dx: -80,
                        dy: -78,
                        icon: Icons.edit_rounded,
                        label: 'Post',
                        color: c.accent,
                        onTap: _openCreatePost,
                      ),
                      _RadialFabAction(
                        ctrl: _fabCtrl,
                        open: _fabOpen,
                        dx: 0,
                        dy: -108,
                        icon: Icons.bar_chart_rounded,
                        label: 'Poll',
                        color: const Color(0xFF00BA7C),
                        onTap: _openCreatePoll,
                      ),
                      _RadialFabAction(
                        ctrl: _fabCtrl,
                        open: _fabOpen,
                        dx: 80,
                        dy: -78,
                        icon: Icons.search_rounded,
                        label: 'Search',
                        color: const Color(0xFF8B5CF6),
                        onTap: _openSearch,
                      ),

                      // Concave Notched Bottom Bar Shape (NAVIGATION BAR reference!)
                      RepaintBoundary(
                        child: ClipPath(
                          clipper: _NotchedNavClipper(),
                          child: BackdropFilter(
                            filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                            child: CustomPaint(
                              painter: _NotchedNavPainter(fill: c.glassFill, border: c.glassBorder),
                              child: SizedBox(
                                height: 68,
                                width: double.infinity,
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 10),
                                  child: Row(
                                    children: [
                                      _NavTab(
                                        icon: Icons.article_outlined,
                                        activeIcon: Icons.article_rounded,
                                        label: 'Feed',
                                        active: idx == 0,
                                        onTap: () {
                                          _toggleFab(false);
                                          chromeCtrl.show();
                                          widget.navigationShell.goBranch(0, initialLocation: idx == 0);
                                        },
                                      ),
                                      _NavTab(
                                        icon: Icons.menu_book_outlined,
                                        activeIcon: Icons.menu_book_rounded,
                                        label: 'Library',
                                        active: idx == 1,
                                        onTap: () {
                                          _toggleFab(false);
                                          chromeCtrl.show();
                                          widget.navigationShell.goBranch(1, initialLocation: idx == 1);
                                        },
                                      ),
                                      const SizedBox(width: 72),
                                      _NavTab(
                                        icon: Icons.people_outline_rounded,
                                        activeIcon: Icons.people_rounded,
                                        label: 'SUG',
                                        active: idx == 2,
                                        onTap: () {
                                          _toggleFab(false);
                                          chromeCtrl.show();
                                          widget.navigationShell.goBranch(2, initialLocation: idx == 2);
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
                                          chromeCtrl.show();
                                          widget.navigationShell.goBranch(3, initialLocation: idx == 3);
                                        },
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),

                      // Central Floating Action Button nestled inside the concave notch
                      Positioned(
                        bottom: 30,
                        child: LiquidTap(
                          onTap: () => _toggleFab(),
                          child: Container(
                            width: 56,
                            height: 56,
                            decoration: BoxDecoration(
                              color: c.accent,
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(color: c.accent.withValues(alpha: 0.45), blurRadius: 16, offset: const Offset(0, 5)),
                              ],
                            ),
                            child: AnimatedBuilder(
                              animation: _fabCtrl,
                              builder: (_, child) => Transform.rotate(angle: _fabCtrl.value * 0.785398, child: child),
                              child: const Icon(Icons.add_rounded, size: 28, color: Colors.white),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NotchedNavClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) => _buildNotchedPath(size);
  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}

class _NotchedNavPainter extends CustomPainter {
  _NotchedNavPainter({required this.fill, required this.border});
  final Color fill;
  final Color border;

  @override
  void paint(Canvas canvas, Size size) {
    final path = _buildNotchedPath(size);
    canvas.drawPath(path, Paint()..color = fill);
    canvas.drawPath(
      path,
      Paint()
        ..color = border
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.1,
    );
  }

  @override
  bool shouldRepaint(covariant _NotchedNavPainter old) => old.fill != fill || old.border != border;
}

Path _buildNotchedPath(Size size) {
  final w = size.width;
  final h = size.height;
  final r = 28.0;
  final mid = w / 2;
  final path = Path()
    ..moveTo(r, 0)
    ..lineTo(mid - 50, 0)
    ..cubicTo(mid - 26, 0, mid - 26, 30, mid, 30)
    ..cubicTo(mid + 26, 30, mid + 26, 0, mid + 50, 0)
    ..lineTo(w - r, 0)
    ..quadraticBezierTo(w, 0, w, r)
    ..lineTo(w, h - r)
    ..quadraticBezierTo(w, h, w - r, h)
    ..lineTo(r, h)
    ..quadraticBezierTo(0, h, 0, h - r)
    ..lineTo(0, r)
    ..quadraticBezierTo(0, 0, r, 0)
    ..close();
  return path;
}

class _RadialFabAction extends StatelessWidget {
  const _RadialFabAction({
    required this.ctrl,
    required this.open,
    required this.dx,
    required this.dy,
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  final AnimationController ctrl;
  final bool open;
  final double dx;
  final double dy;
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: ctrl,
      builder: (_, child) {
        final v = ctrl.value.clamp(0.0, 1.2);
        return IgnorePointer(
          ignoring: !open,
          child: Opacity(
            opacity: v.clamp(0.0, 1.0),
            child: Transform.translate(
              offset: Offset(dx * v, dy * v - 22),
              child: Transform.scale(scale: (0.35 + 0.65 * v).clamp(0.2, 1.08), child: child),
            ),
          ),
        );
      },
      child: Material(
        type: MaterialType.transparency,
        child: LiquidTap(
          onTap: onTap,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: color,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white30, width: 1.5),
                  boxShadow: const [BoxShadow(color: Colors.black45, blurRadius: 10, offset: Offset(0, 4))],
                ),
                child: Icon(icon, color: Colors.white, size: 21),
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: const Color(0xDD0B1220), borderRadius: BorderRadius.circular(99)),
                child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800, decoration: TextDecoration.none)),
              ),
            ],
          ),
        ),
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
    final c = context.cn;
    return Expanded(
      child: LiquidTap(
        onTap: onTap,
        child: SizedBox(
          height: 52,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Icon(active ? activeIcon : icon, size: 22, color: active ? c.accent : c.textSecondary),
                  if (hasUnread)
                    Positioned(
                      top: -2,
                      right: -4,
                      child: Container(
                        width: 9,
                        height: 9,
                        decoration: BoxDecoration(
                          color: c.danger,
                          shape: BoxShape.circle,
                          border: Border.all(color: c.surface, width: 1.5),
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
                  color: active ? c.accent : c.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HamburgerDrawer extends ConsumerStatefulWidget {
  const _HamburgerDrawer({this.user, required this.unread});
  final dynamic user;
  final int unread;

  @override
  ConsumerState<_HamburgerDrawer> createState() => _HamburgerDrawerState();
}

class _HamburgerDrawerState extends ConsumerState<_HamburgerDrawer> {
  List<Map<String, dynamic>> _trending = [];

  @override
  void initState() {
    super.initState();
    _loadTrending();
  }

  Future<void> _loadTrending() async {
    try {
      final res = await ref.read(apiClientProvider).dio.get('/questions/trending-topics/');
      if (mounted && res.data is List) {
        setState(() => _trending = (res.data as List).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList());
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final c = context.cn;
    final dark = context.isDark;
    final items = [
      (Icons.explore_outlined, 'Communities', '/communities'),
      (Icons.chat_bubble_outline_rounded, 'SUG Chats', '/chats'),
      (Icons.campaign_outlined, 'Place Ads', '/ads'),
      (Icons.school_outlined, 'SUG Access', '/apply-sug'),
      (Icons.info_outline_rounded, 'About, Help & Privacy', '/about'),
    ];

    return Drawer(
      backgroundColor: c.background,
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const BrandMark(size: 34),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('CampusNetwork', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: c.textPrimary)),
                        Text('ATBU Student Hub', style: TextStyle(color: c.textSecondary, fontSize: 11.5)),
                      ],
                    ),
                  ),
                  IconButton(icon: Icon(Icons.close, color: c.textSecondary), onPressed: () => Navigator.of(context).pop()),
                ],
              ),
            ),
            Divider(height: 1, color: c.divider),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(14),
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
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(14)),
                          child: Row(
                            children: [
                              Icon(it.$1, size: 19, color: c.accent),
                              const SizedBox(width: 12),
                              Expanded(child: Text(it.$2, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: c.textPrimary))),
                              Icon(Icons.chevron_right_rounded, size: 18, color: c.textSecondary),
                            ],
                          ),
                        ),
                      ),
                    ),
                  if (_trending.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Icon(Icons.trending_up_rounded, size: 16, color: c.accent),
                        const SizedBox(width: 6),
                        Text('TRENDING NOW', style: TextStyle(color: c.textSecondary, fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 0.6)),
                      ],
                    ),
                    const SizedBox(height: 10),
                    for (int i = 0; i < _trending.take(4).length; i++) ...[
                      LiquidTap(
                        onTap: () {
                          Navigator.of(context).pop();
                          context.push('/search', extra: (_trending[i]['title'] ?? '').toString());
                        },
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SizedBox(
                                width: 22,
                                child: Text('${i + 1}', style: TextStyle(color: c.accent, fontWeight: FontWeight.w900, fontSize: 15)),
                              ),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text((_trending[i]['title'] ?? '').toString(), maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: c.textPrimary)),
                                    const SizedBox(height: 2),
                                    Text('${_trending[i]['dept'] ?? 'General'} · ${_trending[i]['answers'] ?? 0} answers · Explore topic →', style: TextStyle(color: c.textSecondary, fontSize: 12)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      Divider(height: 1, color: c.divider),
                    ],
                  ],
                ],
              ),
            ),

            // Bottom Dark/Light Mode + Sign Out Row (matching reference drawer!)
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(border: Border(top: BorderSide(color: c.divider))),
              child: Row(
                children: [
                  Expanded(
                    child: LiquidTap(
                      onTap: () => ref.read(themeModeProvider.notifier).toggleDarkLight(dark),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: c.surface,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: c.divider),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined, size: 17, color: c.textPrimary),
                            const SizedBox(width: 6),
                            Text(dark ? 'Light Mode' : 'Dark Mode', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: c.textPrimary)),
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (widget.user != null) ...[
                    const SizedBox(width: 10),
                    Expanded(
                      child: LiquidTap(
                        onTap: () async {
                          Navigator.of(context).pop();
                          await ref.read(authProvider.notifier).logout();
                          if (context.mounted) context.go('/landing');
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          decoration: BoxDecoration(
                            color: c.dangerSoft,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: c.danger.withValues(alpha: 0.35)),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.logout_rounded, size: 17, color: c.danger),
                              const SizedBox(width: 6),
                              Text('Sign Out', style: TextStyle(color: c.danger, fontWeight: FontWeight.w800, fontSize: 13)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
