import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../auth/auth_provider.dart';
import '../auth/landing_screen.dart';

/// Profile & Activity Dashboard redesigned per PROFILE + ACTIVITY references:
/// - Avatar with quick camera upload overlay + badges + bio
/// - 3-stat horizontal pill (Followers | Following | Questions) — Answers grid removed!
/// - Tapping Followers / Following opens real interactive follower/following lists
/// - "Account & Activity" shortcuts (Notifications, Communities -> My Communities,
///   Questions, Saved, Verification -> /verification, Settings -> /settings, Ads -> /ads)
/// - Real ACTIVITY vertical bar chart backed by GET /api/auth/me/activity/?days=14
///   with tap-to-inspect tooltip showing exact day + questions + answers.
class MeScreen extends ConsumerStatefulWidget {
  const MeScreen({super.key});

  @override
  ConsumerState<MeScreen> createState() => _MeScreenState();
}

class _MeScreenState extends ConsumerState<MeScreen> {
  String _contentTab = 'questions'; // 'questions' | 'saved'
  bool _canUpload = false;
  List<QuestionItem> _myQuestions = [];
  List<QuestionItem> _savedQuestions = [];
  List<Map<String, dynamic>> _activitySeries = [];
  int _selectedBarIdx = -1;
  bool _loadingActivity = false;

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    final user = ref.read(authProvider).user;
    if (user == null) return;
    ref.read(authProvider.notifier).refreshMe();
    final api = ref.read(apiClientProvider);
    setState(() => _loadingActivity = true);
    try {
      final results = await Future.wait([
        api.dio.get('/library/permissions/').catchError((_) => Response(requestOptions: RequestOptions(path: ''), data: {})),
        api.dio.get('/auth/me/activity/', queryParameters: {'days': 14}).catchError((_) => Response(requestOptions: RequestOptions(path: ''), data: {})),
      ]);
      if (mounted) {
        final perm = results[0].data is Map ? results[0].data as Map : {};
        final act = results[1].data is Map ? results[1].data as Map : {};
        final series = (act['series'] as List? ?? [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        setState(() {
          _canUpload = perm['can_upload'] == true;
          _activitySeries = series;
          _selectedBarIdx = series.isNotEmpty ? series.length - 1 : -1;
        });
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingActivity = false);
    }
    await _loadPosts();
  }

  Future<void> _loadPosts() async {
    final user = ref.read(authProvider).user;
    if (user == null) return;
    final api = ref.read(apiClientProvider);
    try {
      final res = await api.dio.get(
        '/questions/',
        queryParameters: _contentTab == 'questions' ? {'mine': '1'} : {'saved': '1'},
      );
      final raw = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
      final items = raw.whereType<Map>().map((e) => QuestionItem.fromJson(Map<String, dynamic>.from(e))).toList();
      if (mounted) {
        setState(() {
          if (_contentTab == 'questions') {
            _myQuestions = items;
          } else {
            _savedQuestions = items;
          }
        });
      }
    } catch (_) {}
  }

  Future<void> _quickUploadAvatar() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85, maxWidth: 900);
    if (picked == null) return;
    try {
      final form = FormData.fromMap({
        'avatar': await MultipartFile.fromFile(picked.path, filename: picked.name),
      });
      final res = await ref.read(apiClientProvider).dio.post('/auth/me/avatar/', data: form);
      ref.read(authProvider.notifier).updateUser(CNUser.fromJson(Map<String, dynamic>.from(res.data as Map)));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile picture updated!')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    }
  }

  Future<void> _openFollowList(int userId, bool isFollowers) async {
    final endpoint = isFollowers ? '/users/$userId/followers/' : '/users/$userId/following/';
    AppBottomSheet.show(
      context,
      builder: (sheetCtx) => FutureBuilder<Response<dynamic>>(
        future: ref.read(apiClientProvider).dio.get(endpoint),
        builder: (ctx, snap) {
          final cn = ctx.cn;
          final raw = snap.data?.data is List ? snap.data!.data as List : const [];
          final users = raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
          return Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isFollowers ? 'Followers' : 'Following',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: cn.textPrimary),
                ),
                const SizedBox(height: 12),
                if (snap.connectionState == ConnectionState.waiting)
                  const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
                else if (users.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 20),
                    child: Center(
                      child: Text(
                        isFollowers ? 'No followers yet.' : 'Not following anyone yet.',
                        style: TextStyle(color: cn.textMuted),
                      ),
                    ),
                  )
                else
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 380),
                    child: ListView.separated(
                      shrinkWrap: true,
                      itemCount: users.length,
                      separatorBuilder: (_, __) => Divider(height: 1, color: cn.divider),
                      itemBuilder: (_, i) {
                        final u = users[i];
                        final id = (u['id'] as num?)?.toInt();
                        return ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: UserAvatar(
                            url: normalizeMediaUrl(u['avatar_url']?.toString()),
                            initials: (u['av'] ?? u['username'] ?? 'U').toString(),
                            bgHex: (u['bg'] ?? '#1D9BF0').toString(),
                            size: 40,
                          ),
                          title: Row(
                            children: [
                              Flexible(
                                child: Text(
                                  (u['name'] ?? u['username'] ?? '').toString(),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontWeight: FontWeight.w800, color: cn.textPrimary),
                                ),
                              ),
                              const SizedBox(width: 4),
                              BadgeRow(
                                isVerifiedStudent: u['is_verified_student'] == true,
                                isVerifiedStaff: u['is_verified_staff'] == true,
                                size: 14,
                              ),
                            ],
                          ),
                          subtitle: Text('@${u['username'] ?? ''}', style: TextStyle(color: cn.textMuted, fontSize: 12.5)),
                          onTap: () {
                            Navigator.of(sheetCtx).pop();
                            if (id != null) context.push('/user/$id');
                          },
                        );
                      },
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final user = ref.watch(authProvider.select((s) => s.user));
    final unread = ref.watch(unreadNotificationsCountProvider);

    if (user == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: MorphismCard(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.person_outline_rounded, size: 52, color: cn.accentLight),
                const SizedBox(height: 10),
                Text('Your Campus Profile', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                const SizedBox(height: 6),
                Text(
                  'Sign in to track your activity, communities, saved posts, verification, and ads.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: cn.textMuted),
                ),
                const SizedBox(height: 14),
                ElevatedButton(onPressed: () => showAuthSheet(context), child: const Text('Sign In / Register')),
              ],
            ),
          ),
        ),
      );
    }

    final postsList = _contentTab == 'questions' ? _myQuestions : _savedQuestions;

    return RefreshIndicator(
      color: cn.accent,
      onRefresh: _loadAll,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 130),
        children: [
          // Profile Hero Header (PROFILE reference)
          MorphismCard(
            padding: const EdgeInsets.all(18),
            radius: 24,
            child: Column(
              children: [
                Row(
                  children: [
                    LiquidTap(
                      onTap: _quickUploadAvatar,
                      child: Stack(
                        children: [
                          UserAvatar(url: user.avatarUrl, initials: user.av, bgHex: user.bg, size: 68),
                          Positioned(
                            right: 0,
                            bottom: 0,
                            child: Container(
                              width: 24,
                              height: 24,
                              decoration: BoxDecoration(
                                color: cn.accent,
                                shape: BoxShape.circle,
                                border: Border.all(color: cn.surface, width: 2),
                              ),
                              child: const Icon(Icons.camera_alt_rounded, size: 12, color: Colors.white),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  user.name.isNotEmpty ? user.name : user.username,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: cn.textPrimary),
                                ),
                              ),
                              if (user.isVerifiedStudent || user.isVerifiedStaff) ...[
                                const SizedBox(width: 5),
                                BadgeRow(
                                  isVerifiedStudent: user.isVerifiedStudent,
                                  isVerifiedStaff: user.isVerifiedStaff,
                                  size: 16,
                                ),
                              ],
                            ],
                          ),
                          Text('@${user.username}', style: TextStyle(color: cn.textMuted, fontSize: 13)),
                          if (!user.emailVerified)
                            LiquidTap(
                              onTap: () => context.push('/settings'),
                              child: Container(
                                margin: const EdgeInsets.only(top: 6),
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                                decoration: BoxDecoration(color: cn.warningSoft, borderRadius: BorderRadius.circular(999)),
                                child: Text(
                                  'Verify Email →',
                                  style: TextStyle(color: cn.warning, fontSize: 11.5, fontWeight: FontWeight.w800),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: Icon(Icons.settings_outlined, color: cn.textMuted),
                      onPressed: () => context.push('/settings'),
                    ),
                  ],
                ),
                if (user.bio.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(user.bio, style: TextStyle(color: cn.textPrimary, fontSize: 13.5, height: 1.4)),
                  ),
                ],
                const SizedBox(height: 16),
                // 3-stat horizontal pill (Followers | Following | Questions) — NO Answers grid!
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: cn.surfaceRecessed,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: cn.borderSubtle),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: LiquidTap(
                          onTap: () => _openFollowList(user.id, true),
                          child: _ProfileStatItem(label: 'Followers', value: user.followersCount),
                        ),
                      ),
                      Container(width: 1, height: 28, color: cn.borderSubtle),
                      Expanded(
                        child: LiquidTap(
                          onTap: () => _openFollowList(user.id, false),
                          child: _ProfileStatItem(label: 'Following', value: user.followingCount),
                        ),
                      ),
                      Container(width: 1, height: 28, color: cn.borderSubtle),
                      Expanded(
                        child: LiquidTap(
                          onTap: () {
                            setState(() => _contentTab = 'questions');
                            _loadPosts();
                          },
                          child: _ProfileStatItem(label: 'Questions', value: user.questionsCount),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Account & Activity shortcuts (PROFILE reference)
          Text('Account & Activity', style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w900, color: cn.textPrimary)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _ShortcutChip(
                icon: Icons.notifications_outlined,
                label: unread > 0 ? 'Notifications ($unread)' : 'Notifications',
                accent: unread > 0,
                onTap: () => context.push('/notifications'),
              ),
              _ShortcutChip(
                icon: Icons.groups_outlined,
                label: 'Communities',
                onTap: () => context.push('/my-communities'),
              ),
              _ShortcutChip(
                icon: Icons.verified_user_outlined,
                label: user.isVerifiedStudent ? 'Verified ✓' : 'Verification',
                accent: user.isVerifiedStudent,
                onTap: () => context.push('/verification'),
              ),
              _ShortcutChip(
                icon: Icons.campaign_outlined,
                label: 'Advertise',
                onTap: () => context.push('/ads'),
              ),
              _ShortcutChip(
                icon: Icons.settings_outlined,
                label: 'Settings',
                onTap: () => context.push('/settings'),
              ),
              if (_canUpload)
                _ShortcutChip(
                  icon: Icons.cloud_upload_outlined,
                  label: 'Library Uploads',
                  onTap: () => context.go('/library'),
                ),
            ],
          ),
          const SizedBox(height: 18),

          // Real ACTIVITY Bar Graph (ACTIVITY reference)
          _ActivityBarChartCard(
            series: _activitySeries,
            selectedIdx: _selectedBarIdx,
            loading: _loadingActivity,
            onSelectBar: (idx) {
              HapticFeedback.selectionClick();
              setState(() => _selectedBarIdx = idx);
            },
          ),
          const SizedBox(height: 18),

          // Posts / Saved Switcher
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: cn.surface,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: cn.borderSubtle),
            ),
            child: Row(
              children: [
                Expanded(
                  child: LiquidTap(
                    onTap: () {
                      setState(() => _contentTab = 'questions');
                      _loadPosts();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 9),
                      decoration: BoxDecoration(
                        color: _contentTab == 'questions' ? cn.accent : Colors.transparent,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        'My Questions',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 13,
                          color: _contentTab == 'questions' ? Colors.white : cn.textMuted,
                        ),
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: LiquidTap(
                    onTap: () {
                      setState(() => _contentTab = 'saved');
                      _loadPosts();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 9),
                      decoration: BoxDecoration(
                        color: _contentTab == 'saved' ? cn.accent : Colors.transparent,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        'Saved',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 13,
                          color: _contentTab == 'saved' ? Colors.white : cn.textMuted,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          if (postsList.isEmpty)
            MorphismCard(
              child: Center(
                child: Text(
                  _contentTab == 'questions' ? "You haven't asked any questions yet." : 'No saved posts yet.',
                  style: TextStyle(color: cn.textMuted),
                ),
              ),
            )
          else
            for (final q in postsList)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: LiquidTap(
                  onTap: () => context.push('/question/${q.publicId}', extra: q),
                  child: MorphismCard(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(q.title, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: cn.textPrimary)),
                        const SizedBox(height: 4),
                        Text(
                          '${q.dept} · ${q.ans} comments · ${q.likes} likes · ${q.time}',
                          style: TextStyle(color: cn.textMuted, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
        ],
      ),
    );
  }
}

class _ProfileStatItem extends StatelessWidget {
  const _ProfileStatItem({required this.label, required this.value});
  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    return Column(
      children: [
        Text('$value', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: cn.textPrimary)),
        const SizedBox(height: 2),
        Text(label, style: TextStyle(color: cn.textMuted, fontSize: 12, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _ShortcutChip extends StatelessWidget {
  const _ShortcutChip({
    required this.icon,
    required this.label,
    required this.onTap,
    this.accent = false,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    return LiquidTap(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
        decoration: BoxDecoration(
          color: accent ? cn.accentSoft : cn.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: accent ? cn.accent : cn.borderSubtle),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: accent ? cn.accentLight : cn.textMuted),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: accent ? cn.accentLight : cn.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Interactive rounded vertical bar chart backed by GET /api/auth/me/activity/?days=14
/// matching the ACTIVITY reference.
class _ActivityBarChartCard extends StatelessWidget {
  const _ActivityBarChartCard({
    required this.series,
    required this.selectedIdx,
    required this.loading,
    required this.onSelectBar,
  });

  final List<Map<String, dynamic>> series;
  final int selectedIdx;
  final bool loading;
  final ValueChanged<int> onSelectBar;

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final totalAll = series.fold<int>(0, (sum, e) => sum + ((e['total'] as num?)?.toInt() ?? 0));
    final maxVal = series.fold<int>(1, (m, e) => math.max(m, (e['total'] as num?)?.toInt() ?? 0));
    final sel = (selectedIdx >= 0 && selectedIdx < series.length) ? series[selectedIdx] : null;

    return MorphismCard(
      padding: const EdgeInsets.all(16),
      radius: 22,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Activity (14 days)', style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                  Text('$totalAll total contributions', style: TextStyle(color: cn.textMuted, fontSize: 12)),
                ],
              ),
              const Spacer(),
              if (sel != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: cn.accentSoft,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${(sel['date'] ?? '').toString().substring(5)}: ${sel['questions'] ?? 0}Q · ${sel['answers'] ?? 0}A',
                    style: TextStyle(color: cn.accentLight, fontWeight: FontWeight.w800, fontSize: 11.5),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          if (loading && series.isEmpty)
            const SizedBox(height: 110, child: Center(child: CircularProgressIndicator()))
          else if (series.isEmpty)
            SizedBox(
              height: 90,
              child: Center(
                child: Text('Start posting or answering to see your activity graph.', style: TextStyle(color: cn.textMuted, fontSize: 12.5)),
              ),
            )
          else
            SizedBox(
              height: 120,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (int i = 0; i < series.length; i++)
                    Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => onSelectBar(i),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 2.5),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              AnimatedContainer(
                                duration: const Duration(milliseconds: 220),
                                height: 12 + (82 * (((series[i]['total'] as num?)?.toInt() ?? 0) / maxVal)),
                                decoration: BoxDecoration(
                                  color: i == selectedIdx
                                      ? cn.accent
                                      : (((series[i]['total'] as num?)?.toInt() ?? 0) > 0
                                          ? cn.accent.withValues(alpha: 0.45)
                                          : cn.surfaceHigh),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                (series[i]['date'] ?? '').toString().length >= 10
                                    ? (series[i]['date'] as String).substring(8, 10)
                                    : '',
                                style: TextStyle(
                                  fontSize: 9.5,
                                  fontWeight: i == selectedIdx ? FontWeight.w900 : FontWeight.w600,
                                  color: i == selectedIdx ? cn.accentLight : cn.textFaint,
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
        ],
      ),
    );
  }
}
