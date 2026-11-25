import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../../core/widgets/skeleton_widgets.dart';
import '../auth/auth_provider.dart';
import '../auth/landing_screen.dart';

/// Public User Profile screen triggered when tapping any user avatar/name/handle
/// across Feeds, Comments, Search, SUG, or Followers lists (USER CLICK ref).
class PublicProfileScreen extends ConsumerStatefulWidget {
  const PublicProfileScreen({super.key, required this.userId});
  final int userId;

  @override
  ConsumerState<PublicProfileScreen> createState() => _PublicProfileScreenState();
}

class _PublicProfileScreenState extends ConsumerState<PublicProfileScreen> {
  Map<String, dynamic>? _profile;
  List<QuestionItem> _posts = [];
  bool _loading = true;
  bool _followBusy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      final res = await api.dio.get('/users/${widget.userId}/');
      final profile = Map<String, dynamic>.from(res.data as Map);
      List<QuestionItem> posts = [];
      try {
        final qRes = await api.dio.get('/questions/', queryParameters: {'author': widget.userId});
        final raw = qRes.data is List ? qRes.data as List : (qRes.data['results'] as List? ?? []);
        posts = raw.whereType<Map>().map((e) => QuestionItem.fromJson(Map<String, dynamic>.from(e))).toList();
      } catch (_) {}
      setState(() {
        _profile = profile;
        _posts = posts;
      });
    } catch (e) {
      setState(() => _error = parseApiError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggleFollow() async {
    final me = ref.read(authProvider).user;
    if (me == null) {
      showAuthSheet(context);
      return;
    }
    if (_profile == null || _followBusy) return;
    HapticFeedback.lightImpact();
    final wasFollowing = _profile!['is_following'] == true;
    final prevCount = (_profile!['followers_count'] ?? _profile!['followers'] ?? 0) as int;

    setState(() {
      _followBusy = true;
      _profile!['is_following'] = !wasFollowing;
      _profile!['followers_count'] = wasFollowing ? (prevCount - 1).clamp(0, 999999) : prevCount + 1;
    });

    try {
      final api = ref.read(apiClientProvider);
      final res = wasFollowing
          ? await api.dio.delete('/users/${widget.userId}/follow/')
          : await api.dio.post('/users/${widget.userId}/follow/');
      final d = Map<String, dynamic>.from(res.data as Map);
      setState(() {
        _profile!['is_following'] = d['is_following'] ?? !wasFollowing;
        if (d['followers'] != null) _profile!['followers_count'] = d['followers'];
      });
      ref.read(authProvider.notifier).refreshMe();
    } catch (e) {
      setState(() {
        _profile!['is_following'] = wasFollowing;
        _profile!['followers_count'] = prevCount;
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    } finally {
      if (mounted) setState(() => _followBusy = false);
    }
  }

  Future<void> _messageSug() async {
    try {
      final res = await ref.read(apiClientProvider).dio.post(
            '/chats/start/',
            data: {'sug_id': widget.userId, 'message': ''},
          );
      final convoId = (res.data['id'] as num?)?.toInt();
      if (mounted) context.push('/chats', extra: convoId);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final me = ref.watch(authProvider.select((s) => s.user));
    final isSelf = me != null && me.id == widget.userId;

    return Scaffold(
      backgroundColor: cn.bg,
      appBar: AppBar(
        title: Text(
          _profile != null ? '@${_profile!['username'] ?? ''}' : 'Profile',
          style: TextStyle(fontWeight: FontWeight.w800, color: cn.textPrimary),
        ),
      ),
      body: _loading
          ? const ProfileHeroSkeleton()
          : _error != null || _profile == null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error ?? 'User not found', style: TextStyle(color: cn.danger)),
                      const SizedBox(height: 10),
                      ElevatedButton(onPressed: _load, child: const Text('Retry')),
                    ],
                  ),
                )
              : RefreshIndicator(
                  color: cn.accent,
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
                    children: [
                      // Portrait Hero Card (USER CLICK reference)
                      _PortraitHeroCard(
                        profile: _profile!,
                        isSelf: isSelf,
                        followBusy: _followBusy,
                        onToggleFollow: _toggleFollow,
                        onMessageSug: (_profile!['staff'] == true || _profile!['is_verified_staff'] == true) && !isSelf
                            ? _messageSug
                            : null,
                      ),
                      const SizedBox(height: 20),
                      Text(
                        'Recent Posts (${_posts.length})',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: cn.textPrimary),
                      ),
                      const SizedBox(height: 10),
                      if (_posts.isEmpty)
                        MorphismCard(
                          child: Center(
                            child: Text('No public posts yet.', style: TextStyle(color: cn.textMuted)),
                          ),
                        )
                      else
                        for (final q in _posts)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: LiquidTap(
                              onTap: () => context.push('/question/${q.publicId}', extra: q),
                              child: MorphismCard(
                                padding: const EdgeInsets.all(14),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      q.title,
                                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: cn.textPrimary),
                                    ),
                                    if (q.body.isNotEmpty && q.body != q.title) ...[
                                      const SizedBox(height: 4),
                                      Text(
                                        q.body,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(color: cn.textMuted, fontSize: 13.5, height: 1.4),
                                      ),
                                    ],
                                    const SizedBox(height: 8),
                                    Text(
                                      '${q.dept} · ${q.ans} comments · ${q.likes} likes · ${q.time}',
                                      style: TextStyle(color: cn.textFaint, fontSize: 12),
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

class _PortraitHeroCard extends StatelessWidget {
  const _PortraitHeroCard({
    required this.profile,
    required this.isSelf,
    required this.followBusy,
    required this.onToggleFollow,
    this.onMessageSug,
  });

  final Map<String, dynamic> profile;
  final bool isSelf;
  final bool followBusy;
  final VoidCallback onToggleFollow;
  final VoidCallback? onMessageSug;

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final isDark = context.isDark;
    final bgHex = (profile['bg'] ?? '#1D9BF0').toString();
    final tint = hexToColor(bgHex);
    final name = (profile['name'] ?? profile['display_name'] ?? profile['username'] ?? 'Student').toString();
    final username = (profile['username'] ?? '').toString();
    final bio = (profile['bio'] ?? '').toString();
    final dept = (profile['dept_name'] ?? profile['department_name'] ?? profile['dept'] ?? '').toString();
    final level = (profile['level'] ?? '').toString();
    final followers = (profile['followers_count'] ?? profile['followers'] ?? 0);
    final following = (profile['following_count'] ?? profile['following'] ?? 0);
    final questions = (profile['questions_count'] ?? profile['questions'] ?? 0);
    final isFollowing = profile['is_following'] == true;
    final isVerifiedStudent = profile['is_verified_student'] == true;
    final isVerifiedStaff = profile['staff'] == true || profile['is_verified_staff'] == true;
    final avatarUrl = normalizeMediaUrl(profile['avatar_url']?.toString());

    return Container(
      decoration: BoxDecoration(
        color: cn.surface,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: cn.borderSubtle),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.45 : 0.08),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top hero gradient + portrait avatar
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(20, 26, 20, 22),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  tint.withValues(alpha: isDark ? 0.48 : 0.28),
                  cn.surface,
                ],
              ),
            ),
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: cn.accent.withValues(alpha: 0.7), width: 2),
                  ),
                  child: UserAvatar(
                    url: avatarUrl,
                    initials: (profile['av'] ?? name).toString(),
                    bgHex: bgHex,
                    size: 92,
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Flexible(
                      child: Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: cn.textPrimary),
                      ),
                    ),
                    if (isVerifiedStudent || isVerifiedStaff) ...[
                      const SizedBox(width: 6),
                      BadgeRow(
                        isVerifiedStudent: isVerifiedStudent,
                        isVerifiedStaff: isVerifiedStaff,
                        size: 18,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 3),
                Text('@$username', style: TextStyle(color: cn.textMuted, fontSize: 13.5, fontWeight: FontWeight.w600)),
                if (dept.isNotEmpty || level.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    decoration: BoxDecoration(color: cn.accentSoft, borderRadius: BorderRadius.circular(999)),
                    child: Text(
                      [if (dept.isNotEmpty) dept, if (level.isNotEmpty) '$level Level'].join(' · '),
                      style: TextStyle(color: cn.accentLight, fontWeight: FontWeight.w700, fontSize: 12),
                    ),
                  ),
                ],
                if (bio.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(
                    bio,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: cn.textPrimary, fontSize: 14, height: 1.45),
                  ),
                ],
                const SizedBox(height: 18),
                // 3-stat pill bar
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
                  decoration: BoxDecoration(
                    color: cn.surfaceRecessed,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: cn.borderSubtle),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _HeroStat(value: '$followers', label: 'Followers'),
                      Container(width: 1, height: 26, color: cn.borderSubtle),
                      _HeroStat(value: '$following', label: 'Following'),
                      Container(width: 1, height: 26, color: cn.borderSubtle),
                      _HeroStat(value: '$questions', label: 'Questions'),
                    ],
                  ),
                ),
                if (!isSelf) ...[
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: LiquidTap(
                          onTap: followBusy ? null : onToggleFollow,
                          child: Container(
                            height: 46,
                            decoration: BoxDecoration(
                              color: isFollowing ? cn.surfaceHigh : (isDark ? Colors.white : cn.accent),
                              borderRadius: BorderRadius.circular(999),
                              border: isFollowing ? Border.all(color: cn.borderBright) : null,
                            ),
                            alignment: Alignment.center,
                            child: Text(
                              isFollowing ? 'Following' : 'Follow',
                              style: TextStyle(
                                color: isFollowing
                                    ? cn.textPrimary
                                    : (isDark ? Colors.black : Colors.white),
                                fontWeight: FontWeight.w900,
                                fontSize: 14.5,
                              ),
                            ),
                          ),
                        ),
                      ),
                      if (onMessageSug != null) ...[
                        const SizedBox(width: 10),
                        Expanded(
                          child: LiquidTap(
                            onTap: onMessageSug,
                            child: Container(
                              height: 46,
                              decoration: BoxDecoration(
                                color: cn.accent,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              alignment: Alignment.center,
                              child: const Text(
                                'Message SUG',
                                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 14.5),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({required this.value, required this.label});
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    return Column(
      children: [
        Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: cn.textPrimary)),
        const SizedBox(height: 2),
        Text(label, style: TextStyle(color: cn.textMuted, fontSize: 11.5, fontWeight: FontWeight.w600)),
      ],
    );
  }
}
