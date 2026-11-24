import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../auth/auth_provider.dart';
import '../auth/landing_screen.dart';
import 'liveness_camera.dart';

/// Me Dashboard:
/// - Exact tab order: Notifications (immediately before Communities) -> Communities -> Questions -> Saved -> [Uploads ONLY if backend-authorized] -> Verification -> Settings
class MeScreen extends ConsumerStatefulWidget {
  const MeScreen({super.key});

  @override
  ConsumerState<MeScreen> createState() => _MeScreenState();
}

class _MeScreenState extends ConsumerState<MeScreen> {
  String _tab = 'questions';
  bool _canUpload = false;
  List<QuestionItem> _myQuestions = [];
  List<QuestionItem> _savedQuestions = [];
  String? _livenessPath;

  @override
  void initState() {
    super.initState();
    _loadMeta();
  }

  Future<void> _loadMeta() async {
    final user = ref.read(authProvider).user;
    if (user == null) return;
    final api = ref.read(apiClientProvider);
    try {
      final permRes = await api.dio.get('/library/permissions/');
      if (mounted) setState(() => _canUpload = permRes.data['can_upload'] == true);
    } catch (_) {}
    _loadTab();
  }

  Future<void> _loadTab() async {
    final user = ref.read(authProvider).user;
    if (user == null) return;
    final api = ref.read(apiClientProvider);
    try {
      if (_tab == 'questions') {
        final res = await api.dio.get('/questions/', queryParameters: {'mine': '1'});
        final raw = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
        if (mounted) setState(() => _myQuestions = raw.whereType<Map>().map((e) => QuestionItem.fromJson(Map<String, dynamic>.from(e))).toList());
      } else if (_tab == 'saved') {
        final res = await api.dio.get('/questions/', queryParameters: {'saved': '1'});
        final raw = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
        if (mounted) setState(() => _savedQuestions = raw.whereType<Map>().map((e) => QuestionItem.fromJson(Map<String, dynamic>.from(e))).toList());
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
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
                const Icon(Icons.person_outline_rounded, size: 52, color: CNColors.accentLight),
                const SizedBox(height: 10),
                const Text('Your Campus Profile', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                const SizedBox(height: 6),
                const Text('Sign in to view notifications, communities, saved posts, and verification.', textAlign: TextAlign.center, style: TextStyle(color: CNColors.textMuted)),
                const SizedBox(height: 14),
                ElevatedButton(onPressed: () => showAuthSheet(context), child: const Text('Sign In / Register')),
              ],
            ),
          ),
        ),
      );
    }

    final tabs = [
      ('notifications', unread > 0 ? 'Notifications ($unread)' : 'Notifications', Icons.notifications_outlined),
      ('communities', 'Communities', Icons.explore_outlined),
      ('questions', 'Questions', Icons.help_outline_rounded),
      ('saved', 'Saved', Icons.bookmark_border_rounded),
      if (_canUpload) ('uploads', 'Uploads', Icons.cloud_upload_outlined),
      ('verification', 'Verification', Icons.verified_user_outlined),
      ('settings', 'Settings', Icons.settings_outlined),
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 124),
      children: [
        // Profile Header Card
        MorphismCard(
          child: Row(
            children: [
              UserAvatar(url: user.avatarUrl, initials: user.av, bgHex: user.bg, size: 64),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            'Hello, ${user.firstName.isNotEmpty ? user.firstName : user.username}!',
                            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900),
                          ),
                        ),
                        if (user.isVerifiedStudent)
                          const Padding(
                            padding: EdgeInsets.only(left: 5),
                            child: Icon(Icons.verified_rounded, size: 17, color: CNColors.accentLight),
                          ),
                      ],
                    ),
                    Text('@${user.username}', style: const TextStyle(color: CNColors.textMuted, fontSize: 13)),
                    if (!user.emailVerified)
                      Container(
                        margin: const EdgeInsets.only(top: 6),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                        decoration: BoxDecoration(color: CNColors.warningSoft, borderRadius: BorderRadius.circular(99)),
                        child: const Text('Verify Email', style: TextStyle(color: CNColors.warning, fontSize: 11.5, fontWeight: FontWeight.w800)),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // 2x2 Stats Grid
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 2.05,
          children: [
            _StatTile(label: 'Followers', value: user.followersCount),
            _StatTile(label: 'Following', value: user.followingCount),
            _StatTile(label: 'Questions', value: user.questionsCount),
            _StatTile(label: 'Answers', value: user.answersCount),
          ],
        ),
        const SizedBox(height: 12),

        // Horizontal Pill Tabs (Notifications immediately before Communities!)
        SizedBox(
          height: 38,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: tabs.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (_, i) {
              final t = tabs[i];
              final active = _tab == t.$1;
              return LiquidTap(
                onTap: () {
                  if (t.$1 == 'notifications') {
                    context.push('/notifications');
                    return;
                  }
                  if (t.$1 == 'communities') {
                    context.push('/communities');
                    return;
                  }
                  setState(() => _tab = t.$1);
                  _loadTab();
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: active ? CNColors.accentSoft : CNColors.surface,
                    borderRadius: BorderRadius.circular(99),
                    border: Border.all(color: active ? CNColors.accent : CNColors.borderSubtle),
                  ),
                  child: Row(
                    children: [
                      Icon(t.$3, size: 15, color: active ? CNColors.accentLight : CNColors.textMuted),
                      const SizedBox(width: 6),
                      Text(t.$2, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: active ? CNColors.accentLight : CNColors.textPrimary)),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 14),

        if (_tab == 'questions' || _tab == 'saved') ...[
          for (final q in (_tab == 'questions' ? _myQuestions : _savedQuestions))
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: LiquidTap(
                onTap: () => context.push('/question/${q.publicId}', extra: q),
                child: MorphismCard(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(q.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                      const SizedBox(height: 3),
                      Text('${q.dept} · ${q.ans} answers', style: const TextStyle(color: CNColors.textMuted, fontSize: 12)),
                    ],
                  ),
                ),
              ),
            ),
          if ((_tab == 'questions' ? _myQuestions : _savedQuestions).isEmpty)
            MorphismCard(
              child: Center(
                child: Text(
                  _tab == 'questions' ? "You haven't asked any questions yet." : 'No saved posts yet.',
                  style: const TextStyle(color: CNColors.textMuted),
                ),
              ),
            ),
        ] else if (_tab == 'verification') ...[
          MorphismCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Student Verification (₦1,500 / 3 Months)', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                const SizedBox(height: 6),
                const Text('Complete live camera blink & nod verification below.', style: TextStyle(color: CNColors.textMuted, fontSize: 13)),
                const SizedBox(height: 12),
                FlutterLivenessCamera(
                  capturedPath: _livenessPath,
                  onCaptured: (p) => setState(() => _livenessPath = p),
                ),
              ],
            ),
          ),
        ] else if (_tab == 'settings') ...[
          MorphismCard(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.info_outline_rounded, color: CNColors.accentLight),
                  title: const Text('About, Help & Privacy', style: TextStyle(fontWeight: FontWeight.w700)),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => context.push('/about'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.logout_rounded, color: CNColors.danger),
                  title: const Text('Sign Out', style: TextStyle(color: CNColors.danger, fontWeight: FontWeight.w800)),
                  onTap: () async {
                    await ref.read(authProvider.notifier).logout();
                    if (context.mounted) context.go('/landing');
                  },
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value});
  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    return MorphismCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text('$value', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
          Text(label, style: const TextStyle(color: CNColors.textMuted, fontSize: 12.5, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
