import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../auth/auth_provider.dart';
import '../auth/landing_screen.dart';

/// Meet the SUG — Horizontal snapping PageView carousel with smooth
/// scroll-driven scale/parallax (matching SUG video reference) + Popular strip.
class SugScreen extends ConsumerStatefulWidget {
  const SugScreen({super.key});

  @override
  ConsumerState<SugScreen> createState() => _SugScreenState();
}

class _SugScreenState extends ConsumerState<SugScreen> {
  List<Map<String, dynamic>> _all = [];
  String _dept = 'All';
  bool _loading = true;
  late final PageController _pageCtrl;
  double _page = 0;

  @override
  void initState() {
    super.initState();
    _pageCtrl = PageController(viewportFraction: 0.84)
      ..addListener(() {
        if (_pageCtrl.hasClients) {
          setState(() => _page = _pageCtrl.page ?? 0);
        }
      });
    _load();
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (ref.read(authProvider).user == null) {
      setState(() => _loading = false);
      return;
    }
    setState(() => _loading = true);
    try {
      final res = await ref.read(apiClientProvider).dio.get('/staff/');
      final raw = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
      setState(() => _all = raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList());
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _messageRep(Map<String, dynamic> rep) async {
    try {
      final res = await ref.read(apiClientProvider).dio.post(
            '/chats/start/',
            data: {'sug_id': rep['id'], 'message': ''},
          );
      final convoId = (res.data['id'] as num?)?.toInt();
      if (mounted) context.push('/chats', extra: convoId);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    }
  }

  void _openRateModal(Map<String, dynamic> rep) {
    int stars = 5;
    final note = TextEditingController();
    AppBottomSheet.show(
      context,
      builder: (sheetCtx) {
        final cn = sheetCtx.cn;
        return StatefulBuilder(
          builder: (ctx, setS) => Padding(
            padding: EdgeInsets.fromLTRB(20, 8, 20, MediaQuery.of(ctx).viewInsets.bottom + 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Rate ${rep['name']}',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: cn.textPrimary),
                ),
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (int n = 1; n <= 5; n++)
                      IconButton(
                        icon: Icon(
                          n <= stars ? Icons.star_rounded : Icons.star_border_rounded,
                          color: cn.gold,
                          size: 36,
                        ),
                        onPressed: () {
                          HapticFeedback.selectionClick();
                          setS(() => stars = n);
                        },
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: note,
                  maxLines: 3,
                  decoration: const InputDecoration(hintText: 'Share constructive feedback...'),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () async {
                      try {
                        await ref.read(apiClientProvider).dio.post(
                              '/users/${rep['id']}/rate-sug/',
                              data: {'score': stars, 'comment': note.text.trim()},
                            );
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Rating submitted!')),
                          );
                        }
                        _load();
                      } catch (e) {
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
                        }
                      }
                    },
                    child: const Text('Submit Rating'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final user = ref.watch(authProvider.select((s) => s.user));
    final depts = ref.watch(departmentsProvider).valueOrNull ?? const <DepartmentItem>[];

    if (user == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: MorphismCard(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.shield_rounded, size: 46, color: cn.gold),
                const SizedBox(height: 10),
                Text('Meet the SUG', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                const SizedBox(height: 6),
                Text(
                  'Sign in to view verified SUG officials, rate their service, and message them directly.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: cn.textMuted),
                ),
                const SizedBox(height: 14),
                ElevatedButton(onPressed: () => showAuthSheet(context), child: const Text('Sign In')),
              ],
            ),
          ),
        ),
      );
    }

    final filtered = _all.where((s) {
      if (_dept != 'All' && s['dept_name'] != _dept && s['dept'] != _dept) return false;
      return true;
    }).toList();

    final popular = [...filtered]
      ..sort((a, b) {
        final ra = (a['sug_rating'] as num?)?.toDouble() ?? 0;
        final rb = (b['sug_rating'] as num?)?.toDouble() ?? 0;
        if (rb != ra) return rb.compareTo(ra);
        return ((b['answers'] as num?)?.toInt() ?? 0).compareTo((a['answers'] as num?)?.toInt() ?? 0);
      });

    return RefreshIndicator(
      color: cn.accent,
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(0, 10, 0, 130),
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Meet the SUG', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                      Text('Verified Student Union Government reps', style: TextStyle(color: cn.textMuted, fontSize: 12.5)),
                    ],
                  ),
                ),
                LiquidTap(
                  onTap: () => context.push('/apply-sug'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                    decoration: BoxDecoration(
                      color: cn.accentSoft,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      'Apply for SUG',
                      style: TextStyle(color: cn.accentLight, fontWeight: FontWeight.w800, fontSize: 12.5),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: FacultyDropdown(
              options: [
                const DropdownOption(label: 'All Faculties', value: 'All'),
                ...depts.map((d) => DropdownOption(label: d.name, value: d.name, colorHex: d.color)),
              ],
              value: _dept,
              onChanged: (v) {
                setState(() {
                  _dept = v;
                  _page = 0;
                });
                if (_pageCtrl.hasClients) _pageCtrl.jumpToPage(0);
              },
            ),
          ),
          const SizedBox(height: 18),
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(42), child: CircularProgressIndicator()))
          else if (filtered.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: MorphismCard(
                child: Center(
                  child: Text('No SUG officials found for this faculty.', style: TextStyle(color: cn.textMuted)),
                ),
              ),
            )
          else ...[
            // Horizontal snapping PageView with scroll-driven scale/parallax (SUG video ref)
            SizedBox(
              height: 410,
              child: PageView.builder(
                controller: _pageCtrl,
                itemCount: filtered.length,
                onPageChanged: (_) => HapticFeedback.selectionClick(),
                itemBuilder: (ctx, i) {
                  final delta = (_page - i).clamp(-1.0, 1.0);
                  final scale = 1.0 - (delta.abs() * 0.08);
                  final translateY = delta.abs() * 14.0;
                  final opacity = (1.0 - delta.abs() * 0.25).clamp(0.7, 1.0);
                  return Transform.translate(
                    offset: Offset(0, translateY),
                    child: Transform.scale(
                      scale: scale,
                      child: Opacity(
                        opacity: opacity,
                        child: _SugHeroCard(
                          rep: filtered[i],
                          parallax: delta,
                          onRate: () => _openRateModal(filtered[i]),
                          onMessage: () => _messageRep(filtered[i]),
                          onTapProfile: () {
                            final id = (filtered[i]['id'] as num?)?.toInt();
                            if (id != null) context.push('/user/$id');
                          },
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 12),
            // Page indicator dots
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (int i = 0; i < math.min(filtered.length, 10); i++)
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: _page.round() == i ? 20 : 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: _page.round() == i ? cn.accent : cn.borderBright,
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 22),
            // Popular / Top-Rated strip
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Text('Popular Officials', style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                  const Spacer(),
                  Text('${filtered.length} verified', style: TextStyle(color: cn.textFaint, fontSize: 12)),
                ],
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 104,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: popular.length,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (_, i) {
                  final rep = popular[i];
                  return LiquidTap(
                    onTap: () {
                      final idx = filtered.indexOf(rep);
                      if (idx >= 0 && _pageCtrl.hasClients) {
                        _pageCtrl.animateToPage(
                          idx,
                          duration: const Duration(milliseconds: 360),
                          curve: Curves.easeOutCubic,
                        );
                      }
                    },
                    child: Container(
                      width: 215,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: cn.surface,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: cn.borderSubtle),
                      ),
                      child: Row(
                        children: [
                          UserAvatar(
                            url: normalizeMediaUrl(rep['avatar_url']?.toString()),
                            initials: (rep['av'] ?? 'SG').toString(),
                            bgHex: (rep['bg'] ?? '#1D9BF0').toString(),
                            size: 46,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Row(
                                  children: [
                                    Flexible(
                                      child: Text(
                                        (rep['name'] ?? '').toString(),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: cn.textPrimary),
                                      ),
                                    ),
                                    const SizedBox(width: 4),
                                    const BadgeRow(isVerifiedStaff: true, size: 13),
                                  ],
                                ),
                                Text(
                                  (rep['title'] ?? 'SUG Official').toString(),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: cn.textMuted, fontSize: 11.5),
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    Icon(Icons.star_rounded, size: 13, color: cn.gold),
                                    const SizedBox(width: 3),
                                    Text(
                                      (rep['sug_ratings_count'] ?? 0) > 0 ? '${rep['sug_rating']}' : 'New',
                                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 11.5, color: cn.textPrimary),
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      '${rep['answers'] ?? 0} ans',
                                      style: TextStyle(color: cn.textFaint, fontSize: 11),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SugHeroCard extends StatelessWidget {
  const _SugHeroCard({
    required this.rep,
    required this.parallax,
    required this.onRate,
    required this.onMessage,
    required this.onTapProfile,
  });
  final Map<String, dynamic> rep;
  final double parallax;
  final VoidCallback onRate;
  final VoidCallback onMessage;
  final VoidCallback onTapProfile;

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final isDark = context.isDark;
    final bgHex = (rep['bg'] ?? '#1D9BF0').toString();
    final tint = hexToColor(bgHex);
    final ratingCount = (rep['sug_ratings_count'] as num?)?.toInt() ?? 0;
    final rating = (rep['sug_rating'] as num?)?.toDouble() ?? 0;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      decoration: BoxDecoration(
        color: cn.surface,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: cn.borderSubtle),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.45 : 0.10),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: Column(
          children: [
            // Parallax visual banner
            SizedBox(
              height: 152,
              width: double.infinity,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Transform.translate(
                    offset: Offset(parallax * -24, 0),
                    child: Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            tint.withValues(alpha: 0.85),
                            isDark ? const Color(0xFF0A0F1A) : const Color(0xFF1E293B),
                          ],
                        ),
                      ),
                    ),
                  ),
                  // Top pill row
                  Positioned(
                    top: 14,
                    left: 14,
                    right: 14,
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.42),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              BadgeRow(isVerifiedStaff: true, size: 13),
                              SizedBox(width: 5),
                              Text('Verified SUG', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 11.5)),
                            ],
                          ),
                        ),
                        const Spacer(),
                        if (rep['dept_name'] != null || rep['dept'] != null)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.42),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              (rep['dept_name'] ?? rep['dept']).toString(),
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 11),
                            ),
                          ),
                      ],
                    ),
                  ),
                  // Centered clickable avatar
                  Align(
                    alignment: Alignment.bottomLeft,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      child: LiquidTap(
                        onTap: onTapProfile,
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(2.5),
                              decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                              child: UserAvatar(
                                url: normalizeMediaUrl(rep['avatar_url']?.toString()),
                                initials: (rep['av'] ?? 'SG').toString(),
                                bgHex: bgHex,
                                size: 62,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    (rep['name'] ?? '').toString(),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900),
                                  ),
                                  Text(
                                    (rep['title'] ?? 'SUG Official').toString(),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5, fontWeight: FontWeight.w600),
                                  ),
                                  if (rep['username'] != null)
                                    Text(
                                      '@${rep['username']}',
                                      style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 11.5),
                                    ),
                                ],
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
            // Body content
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        (rep['bio'] ?? '').toString().isNotEmpty
                            ? rep['bio'].toString()
                            : 'Official Student Union Government representative available to answer campus questions and guide students.',
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 13.5, height: 1.45, color: cn.textMuted),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(color: cn.surfaceRecessed, borderRadius: BorderRadius.circular(16)),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          Column(
                            children: [
                              Row(
                                children: [
                                  for (int n = 1; n <= 5; n++)
                                    Icon(
                                      n <= rating.round() ? Icons.star_rounded : Icons.star_border_rounded,
                                      size: 15,
                                      color: cn.gold,
                                    ),
                                ],
                              ),
                              const SizedBox(height: 2),
                              Text(
                                ratingCount > 0 ? '${rep['sug_rating']} ($ratingCount)' : 'No ratings yet',
                                style: TextStyle(color: cn.textMuted, fontSize: 11),
                              ),
                            ],
                          ),
                          Container(width: 1, height: 28, color: cn.borderSubtle),
                          Column(
                            children: [
                              Text('${rep['answers'] ?? 0}', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                              Text('Answers', style: TextStyle(color: cn.textMuted, fontSize: 11)),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: LiquidTap(
                            onTap: onRate,
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              decoration: BoxDecoration(
                                color: isDark ? Colors.white : cn.surfaceHigh,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              alignment: Alignment.center,
                              child: Text(
                                'Rate Official',
                                style: TextStyle(
                                  color: isDark ? Colors.black : cn.textPrimary,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 13.5,
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: LiquidTap(
                            onTap: onMessage,
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              decoration: BoxDecoration(
                                color: cn.accent,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              alignment: Alignment.center,
                              child: const Text(
                                'Message',
                                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13.5),
                              ),
                            ),
                          ),
                        ),
                      ],
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
