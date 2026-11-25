import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
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

const _kFeedFilters = ['Trending', 'Most Recent', 'Unanswered', 'Answered'];

class FeedState {
  const FeedState({
    this.items = const [],
    this.ads = const [],
    this.filter = 'Trending',
    this.topic = 'All',
    this.loading = true,
    this.newPostsCount = 0,
    this.error,
  });

  final List<QuestionItem> items;
  final List<ServedAd> ads;
  final String filter;
  final String topic;
  final bool loading;
  final int newPostsCount;
  final String? error;

  FeedState copyWith({
    List<QuestionItem>? items,
    List<ServedAd>? ads,
    String? filter,
    String? topic,
    bool? loading,
    int? newPostsCount,
    String? error,
  }) =>
      FeedState(
        items: items ?? this.items,
        ads: ads ?? this.ads,
        filter: filter ?? this.filter,
        topic: topic ?? this.topic,
        loading: loading ?? this.loading,
        newPostsCount: newPostsCount ?? this.newPostsCount,
        error: error,
      );
}

class FeedNotifier extends StateNotifier<FeedState> {
  FeedNotifier(this._api) : super(const FeedState()) {
    load();
    _syncTimer = Timer.periodic(const Duration(seconds: 25), (_) => _checkForNewPosts());
  }

  final ApiClient _api;
  Timer? _syncTimer;

  @override
  void dispose() {
    _syncTimer?.cancel();
    super.dispose();
  }

  Future<void> _checkForNewPosts() async {
    if (state.loading || state.items.isEmpty) return;
    try {
      final res = await _api.dio.get('/questions/', queryParameters: {'ordering': 'newest'});
      final raw = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
      final topId = state.items.first.id;
      int newer = 0;
      for (final m in raw.whereType<Map>()) {
        final id = (m['id'] as num?)?.toInt() ?? 0;
        if (id > topId) newer++;
      }
      if (newer > 0 && mounted) state = state.copyWith(newPostsCount: newer);
    } catch (_) {}
  }

  Future<void> load({String? filter, String? topic}) async {
    final nextFilter = filter ?? state.filter;
    final nextTopic = topic ?? state.topic;
    state = state.copyWith(filter: nextFilter, topic: nextTopic, loading: true, newPostsCount: 0, error: null);

    const orderMap = {
      'Trending': 'trending',
      'Most Recent': 'newest',
      'Unanswered': 'unanswered',
      'Answered': 'trending',
    };

    try {
      final params = <String, dynamic>{'ordering': orderMap[nextFilter] ?? 'trending'};
      if (nextTopic != 'All') params['topic'] = nextTopic;

      final results = await Future.wait([
        _api.dio.get('/questions/', queryParameters: params),
        _api.dio
            .get('/ads/serve/', queryParameters: {'placement': 'feed'})
            .catchError((_) => Response(requestOptions: RequestOptions(path: ''), data: [])),
      ]);

      final qRaw = results[0].data is List ? results[0].data as List : (results[0].data['results'] as List? ?? []);
      var parsed = qRaw.whereType<Map>().map((m) => QuestionItem.fromJson(Map<String, dynamic>.from(m))).toList();
      if (nextFilter == 'Answered') parsed = parsed.where((q) => q.answered).toList();

      final adRaw = results[1].data is List ? results[1].data as List : [];
      final parsedAds = adRaw.whereType<Map>().map((m) => ServedAd.fromJson(Map<String, dynamic>.from(m))).toList();

      state = state.copyWith(items: parsed, ads: parsedAds, loading: false, newPostsCount: 0);
    } catch (e) {
      state = state.copyWith(loading: false, error: parseApiError(e));
    }
  }

  void prependQuestion(QuestionItem q) {
    state = state.copyWith(items: [q, ...state.items.where((x) => x.id != q.id)], newPostsCount: 0);
  }

  Future<void> toggleVote(QuestionItem q, String dir) async {
    final nextVoted = q.voted == dir ? null : dir;
    final delta = (nextVoted == 'up' ? 1 : nextVoted == 'down' ? -1 : 0) - (q.voted == 'up' ? 1 : q.voted == 'down' ? -1 : 0);
    _replace(q.copyWith(votes: q.votes + delta, voted: nextVoted, clearVoted: nextVoted == null));
    try {
      final res = await _api.dio.post('/questions/${q.id}/vote/', data: {'direction': dir});
      _replace(q.copyWith(
        votes: (res.data['votes'] as num?)?.toInt() ?? q.votes,
        voted: res.data['voted']?.toString(),
        clearVoted: res.data['voted'] == null,
      ));
    } catch (_) {
      _replace(q);
    }
  }

  Future<void> toggleLike(QuestionItem q) async {
    _replace(q.copyWith(liked: !q.liked, likes: (q.likes + (q.liked ? -1 : 1)).clamp(0, 999999)));
    try {
      final res = await _api.dio.post('/questions/${q.id}/like/');
      _replace(q.copyWith(
        liked: res.data['liked'] == true,
        likes: (res.data['likes'] as num?)?.toInt() ?? q.likes,
      ));
    } catch (_) {
      _replace(q);
    }
  }

  Future<void> toggleBookmark(QuestionItem q) async {
    _replace(q.copyWith(saved: !q.saved));
    try {
      final res = await _api.dio.post('/questions/${q.id}/bookmark/');
      _replace(q.copyWith(saved: res.data['saved'] == true));
    } catch (_) {
      _replace(q);
    }
  }

  Future<void> votePoll(QuestionItem q, int optionId) async {
    try {
      final res = await _api.dio.post('/questions/${q.id}/vote-poll/', data: {'option_id': optionId});
      final opts = (res.data['poll_options'] as List? ?? [])
          .whereType<Map>()
          .map((e) => PollOptionItem.fromJson(Map<String, dynamic>.from(e)))
          .toList();
      _replace(q.copyWith(
        pollOptions: opts,
        pollTotalVotes: (res.data['poll_total_votes'] as num?)?.toInt() ?? q.pollTotalVotes,
      ));
    } catch (_) {}
  }

  Future<void> hidePost(int id) async {
    state = state.copyWith(items: state.items.where((x) => x.id != id).toList());
    try {
      await _api.dio.post('/questions/$id/hide/');
    } catch (_) {}
  }

  Future<void> reportPost(int id, String reason) async {
    await _api.dio.post('/questions/$id/report/', data: {'reason': reason});
  }

  Future<void> deletePost(int id) async {
    await _api.dio.delete('/questions/$id/');
    state = state.copyWith(items: state.items.where((x) => x.id != id).toList());
  }

  void _replace(QuestionItem updated) {
    state = state.copyWith(items: state.items.map((x) => x.id == updated.id ? updated : x).toList());
  }
}

final feedProvider = StateNotifierProvider<FeedNotifier, FeedState>(
  (ref) => FeedNotifier(ref.watch(apiClientProvider)),
);

/// X-Style Feed Screen (FEEDS reference):
/// - NO duplicate search icon beside All Faculties
/// - NO heavy rectangular borders around posts; separated by crisp 0.5dp dividers
/// - NO white divider line between post content and action row
/// - Globally clickable UserIdentity + Shield SUG badge + Multi-campaign rotated Ads
class FeedScreen extends ConsumerWidget {
  const FeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.cn;
    final feed = ref.watch(feedProvider);
    final depts = ref.watch(departmentsProvider).valueOrNull ?? const <DepartmentItem>[];
    final user = ref.watch(authProvider.select((s) => s.user));
    final api = ref.watch(apiClientProvider);

    final facultyOpts = [
      const DropdownOption(label: 'All Faculties', value: 'All'),
      ...depts.map((d) => DropdownOption(label: d.name, value: d.name, colorHex: d.color)),
    ];

    return Stack(
      children: [
        RefreshIndicator(
          color: c.accent,
          backgroundColor: c.surface,
          edgeOffset: 68,
          onRefresh: () => ref.read(feedProvider.notifier).load(),
          child: ListView.builder(
            padding: const EdgeInsets.only(top: 68, bottom: 120),
            itemCount: feed.loading ? 1 : (feed.items.isEmpty ? 2 : feed.items.length + 1),
            itemBuilder: (context, index) {
              if (index == 0) {
                return Padding(
                  padding: const EdgeInsets.fromLTRB(14, 6, 14, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Clean FacultyDropdown ONLY (no duplicate search icon!)
                      FacultyDropdown(
                        options: facultyOpts,
                        value: feed.topic,
                        onChanged: (v) => ref.read(feedProvider.notifier).load(topic: v),
                      ),
                      const SizedBox(height: 10),
                      SizedBox(
                        height: 36,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: _kFeedFilters.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 8),
                          itemBuilder: (_, i) {
                            final f = _kFeedFilters[i];
                            final active = feed.filter == f;
                            return LiquidTap(
                              onTap: () => ref.read(feedProvider.notifier).load(filter: f),
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 180),
                                padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 7),
                                decoration: BoxDecoration(
                                  color: active ? c.accentSoft : c.surface,
                                  borderRadius: BorderRadius.circular(999),
                                  border: Border.all(color: active ? c.accent : c.divider),
                                ),
                                child: Text(
                                  f,
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: active ? c.accent : c.textPrimary,
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                      if (feed.loading)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 46),
                          child: Center(child: CircularProgressIndicator()),
                        ),
                    ],
                  ),
                );
              }

              if (feed.items.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    children: [
                      Icon(Icons.article_outlined, size: 42, color: c.textSecondary),
                      const SizedBox(height: 10),
                      Text('No discussions found', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5, color: c.textPrimary)),
                      const SizedBox(height: 4),
                      Text(
                        feed.error ?? 'Switch filters or tap + below to start a conversation.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: c.textSecondary, fontSize: 13),
                      ),
                      if (feed.error != null) ...[
                        const SizedBox(height: 12),
                        ElevatedButton(onPressed: () => ref.read(feedProvider.notifier).load(), child: const Text('Retry')),
                      ],
                    ],
                  ),
                );
              }

              final qIdx = index - 1;
              final q = feed.items[qIdx];
              // Multi-campaign frequency control: 1 ad every 6 posts starting after post #3, rotating across all active ads
              ServedAd? slotAd;
              if (feed.ads.isNotEmpty && qIdx >= 3 && (qIdx - 3) % 6 == 0) {
                final slotNum = (qIdx - 3) ~/ 6;
                slotAd = feed.ads[slotNum % feed.ads.length];
              }

              return Column(
                children: [
                  PostTile(
                    q: q,
                    currentUserId: user?.id,
                    isAuthor: user != null && (q.userId == user.id || q.canEdit || q.canDelete),
                    onRequireAuth: () => showAuthSheet(context),
                  ),
                  Divider(height: 0.6, thickness: 0.6, color: c.divider),
                  if (slotAd != null) ...[
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      child: NativeAdCard(ad: slotAd, placement: 'feed', api: api),
                    ),
                    Divider(height: 0.6, thickness: 0.6, color: c.divider),
                  ],
                ],
              );
            },
          ),
        ),

        // Live "N new posts" pill (never jumps scroll automatically!)
        if (feed.newPostsCount > 0)
          Positioned(
            top: 72,
            left: 0,
            right: 0,
            child: Center(
              child: LiquidTap(
                onTap: () => ref.read(feedProvider.notifier).load(),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: c.accent,
                    borderRadius: BorderRadius.circular(99),
                    boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 10, offset: Offset(0, 4))],
                  ),
                  child: Text(
                    '↑ ${feed.newPostsCount} new post${feed.newPostsCount == 1 ? '' : 's'}',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12.5),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Reusable X-Style PostTile (used across Feed, Profile, Saved, Communities, Search).
class PostTile extends ConsumerWidget {
  const PostTile({
    super.key,
    required this.q,
    this.currentUserId,
    required this.isAuthor,
    required this.onRequireAuth,
  });

  final QuestionItem q;
  final int? currentUserId;
  final bool isAuthor;
  final VoidCallback onRequireAuth;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.cn;
    final user = ref.watch(authProvider.select((s) => s.user));
    final firstImg = q.media.where((m) => m.kind == 'image' && m.url.isNotEmpty).firstOrNull?.url;

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: Globally clickable UserIdentity + 3-Dot Menu
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: UserIdentity(
                  userId: q.userId,
                  currentUserId: currentUserId,
                  name: q.authorName,
                  username: q.authorUsername,
                  initials: q.authorAv,
                  bgHex: q.authorBg,
                  avatarUrl: q.authorAvatarUrl,
                  verified: q.authorVerified,
                  staff: q.authorStaff,
                  subtitle: '${q.dept} · ${q.time}',
                ),
              ),
              LiquidTap(
                onTap: () => _openThreeDotMenu(context, ref),
                child: SizedBox(
                  width: 36,
                  height: 36,
                  child: Icon(Icons.more_horiz_rounded, size: 20, color: c.textSecondary),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Body + Media (NO card border, NO divider above actions!)
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => context.push('/question/${q.publicId}', extra: q),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (q.title.isNotEmpty)
                  Text(q.title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, height: 1.3, color: c.textPrimary)),
                if (q.body.isNotEmpty && q.body != q.title) ...[
                  const SizedBox(height: 4),
                  Text(
                    q.body,
                    maxLines: 5,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: c.textPrimary.withValues(alpha: 0.9), fontSize: 14.5, height: 1.45),
                  ),
                ],
                if (q.tags.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    children: q.tags
                        .map((t) => Text('#$t', style: TextStyle(color: c.accent, fontSize: 13, fontWeight: FontWeight.w600)))
                        .toList(),
                  ),
                ],
                if (firstImg != null) ...[
                  const SizedBox(height: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: CachedNetworkImage(
                      imageUrl: firstImg,
                      width: double.infinity,
                      height: 215,
                      fit: BoxFit.cover,
                      errorWidget: (_, __, ___) => const SizedBox.shrink(),
                    ),
                  ),
                ],
              ],
            ),
          ),

          // Inline Interactive Poll
          if (q.pollOptions.isNotEmpty) ...[
            const SizedBox(height: 10),
            for (final opt in q.pollOptions)
              Padding(
                padding: const EdgeInsets.only(bottom: 7),
                child: LiquidTap(
                  onTap: () => user == null ? onRequireAuth() : ref.read(feedProvider.notifier).votePoll(q, opt.id),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Stack(
                      children: [
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
                          decoration: BoxDecoration(
                            color: c.surface,
                            border: Border.all(color: opt.voted ? c.accent : c.divider),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              Expanded(child: Text(opt.text, style: TextStyle(fontWeight: opt.voted ? FontWeight.w800 : FontWeight.w600, color: c.textPrimary))),
                              Text('${opt.percent}%', style: TextStyle(color: opt.voted ? c.accent : c.textSecondary, fontWeight: FontWeight.w800, fontSize: 12.5)),
                            ],
                          ),
                        ),
                        Positioned.fill(
                          child: FractionallySizedBox(
                            alignment: Alignment.centerLeft,
                            widthFactor: (opt.percent / 100).clamp(0.0, 1.0),
                            child: IgnorePointer(
                              child: Container(
                                color: opt.voted ? c.accent.withValues(alpha: 0.22) : c.textSecondary.withValues(alpha: 0.12),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            Text('${q.pollTotalVotes} vote${q.pollTotalVotes == 1 ? '' : 's'}', style: TextStyle(color: c.textSecondary, fontSize: 12)),
          ],

          const SizedBox(height: 12),

          // Compact Pill Action Row (exact FEEDS reference — NO white divider above!)
          Row(
            children: [
              // Upvote / Score / Downvote pill
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(99)),
                child: Row(
                  children: [
                    LiquidTap(
                      onTap: () => user == null ? onRequireAuth() : ref.read(feedProvider.notifier).toggleVote(q, 'up'),
                      child: Icon(Icons.keyboard_arrow_up_rounded, size: 19, color: q.voted == 'up' ? c.accent : c.textSecondary),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Text('${q.votes}', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: q.voted != null ? c.accent : c.textPrimary)),
                    ),
                    LiquidTap(
                      onTap: () => user == null ? onRequireAuth() : ref.read(feedProvider.notifier).toggleVote(q, 'down'),
                      child: Icon(Icons.keyboard_arrow_down_rounded, size: 19, color: q.voted == 'down' ? c.danger : c.textSecondary),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),

              // Comments pill
              LiquidTap(
                onTap: () => context.push('/question/${q.publicId}', extra: q),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
                  decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(99)),
                  child: Row(
                    children: [
                      Icon(Icons.chat_bubble_outline_rounded, size: 15, color: c.textSecondary),
                      const SizedBox(width: 5),
                      Text('${q.ans}', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: c.textPrimary)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),

              // Like pill
              LiquidTap(
                onTap: () => user == null ? onRequireAuth() : ref.read(feedProvider.notifier).toggleLike(q),
                onLongPress: isAuthor ? () => _showAnalyticsModal(context, ref) : null,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
                  decoration: BoxDecoration(color: q.liked ? c.dangerSoft : c.surface, borderRadius: BorderRadius.circular(99)),
                  child: Row(
                    children: [
                      Icon(q.liked ? Icons.favorite_rounded : Icons.favorite_border_rounded, size: 15, color: q.liked ? c.danger : c.textSecondary),
                      const SizedBox(width: 5),
                      Text('${q.likes}', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: q.liked ? c.danger : c.textPrimary)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),

              // Share pill
              LiquidTap(
                onTap: () => showRadialShareFan(context, title: q.title, url: '$kWebOrigin/q/${q.publicId}'),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(99)),
                  child: Icon(Icons.send_rounded, size: 15, color: c.textSecondary),
                ),
              ),
              const Spacer(),

              // Bookmark
              LiquidTap(
                onTap: () => user == null ? onRequireAuth() : ref.read(feedProvider.notifier).toggleBookmark(q),
                child: Padding(
                  padding: const EdgeInsets.all(6),
                  child: Icon(q.saved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded, size: 19, color: q.saved ? c.gold : c.textSecondary),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _openThreeDotMenu(BuildContext context, WidgetRef ref) {
    final c = context.cn;
    AppBottomSheet.show(
      context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 38, height: 4, decoration: BoxDecoration(color: c.divider, borderRadius: BorderRadius.circular(99))),
              const SizedBox(height: 10),
              if (isAuthor)
                ListTile(
                  leading: Icon(Icons.bar_chart_rounded, color: c.accent),
                  title: Text('Post Analytics & Liked By', style: TextStyle(fontWeight: FontWeight.w700, color: c.textPrimary)),
                  onTap: () {
                    Navigator.of(ctx, rootNavigator: true).pop();
                    _showAnalyticsModal(context, ref);
                  },
                ),
              ListTile(
                leading: Icon(Icons.link_rounded, color: c.textSecondary),
                title: Text('Copy Link', style: TextStyle(fontWeight: FontWeight.w700, color: c.textPrimary)),
                onTap: () {
                  Navigator.of(ctx, rootNavigator: true).pop();
                  Clipboard.setData(ClipboardData(text: '$kWebOrigin/q/${q.publicId}'));
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Link copied!')));
                },
              ),
              ListTile(
                leading: Icon(Icons.visibility_off_outlined, color: c.textSecondary),
                title: Text('See less of this', style: TextStyle(fontWeight: FontWeight.w700, color: c.textPrimary)),
                onTap: () {
                  Navigator.of(ctx, rootNavigator: true).pop();
                  ref.read(feedProvider.notifier).hidePost(q.id);
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("We'll show you less like this.")));
                },
              ),
              ListTile(
                leading: Icon(Icons.flag_outlined, color: c.danger),
                title: Text('Report Post', style: TextStyle(color: c.danger, fontWeight: FontWeight.w700)),
                onTap: () async {
                  Navigator.of(ctx, rootNavigator: true).pop();
                  await ref.read(feedProvider.notifier).reportPost(q.id, 'Reported by mobile user');
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Report submitted to moderators.')));
                  }
                },
              ),
              if (q.canDelete)
                ListTile(
                  leading: Icon(Icons.delete_outline_rounded, color: c.danger),
                  title: Text('Delete Post', style: TextStyle(color: c.danger, fontWeight: FontWeight.w800)),
                  onTap: () async {
                    Navigator.of(ctx, rootNavigator: true).pop();
                    await ref.read(feedProvider.notifier).deletePost(q.id);
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showAnalyticsModal(BuildContext context, WidgetRef ref) async {
    final c = context.cn;
    try {
      final api = ref.read(apiClientProvider);
      final res = await api.dio.get('/questions/${q.id}/likers/');
      final data = Map<String, dynamic>.from(res.data as Map);
      final likers = (data['likers'] as List? ?? []).whereType<Map>().map((e) => CNUser.fromJson(Map<String, dynamic>.from(e))).toList();
      if (!context.mounted) return;
      AppBottomSheet.show(
        context,
        builder: (sheetCtx) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Post Analytics & Liked By', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: c.textPrimary)),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 14,
                  runSpacing: 8,
                  children: [
                    Text('Views: ${data['views'] ?? 0}', style: TextStyle(fontWeight: FontWeight.w700, color: c.textPrimary)),
                    Text('Likes: ${data['likes'] ?? 0}', style: TextStyle(fontWeight: FontWeight.w700, color: c.textPrimary)),
                    Text('Upvotes: ${data['upvotes'] ?? 0}', style: TextStyle(fontWeight: FontWeight.w700, color: c.textPrimary)),
                    Text('Comments: ${data['comments'] ?? 0}', style: TextStyle(fontWeight: FontWeight.w700, color: c.textPrimary)),
                  ],
                ),
                const SizedBox(height: 14),
                Text('LIKED BY (${likers.length})', style: TextStyle(color: c.textSecondary, fontSize: 11.5, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                if (likers.isEmpty)
                  Padding(padding: const EdgeInsets.symmetric(vertical: 14), child: Text('No likes yet.', style: TextStyle(color: c.textSecondary)))
                else
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 240),
                    child: ListView.separated(
                      shrinkWrap: true,
                      itemCount: likers.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) {
                        final u = likers[i];
                        return UserIdentity(
                          userId: u.id,
                          currentUserId: currentUserId,
                          name: u.name,
                          username: u.username,
                          initials: u.av,
                          bgHex: u.bg,
                          avatarUrl: u.avatarUrl,
                          verified: u.isVerifiedStudent,
                          staff: u.isVerifiedStaff,
                          avatarSize: 36,
                        );
                      },
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    }
  }
}
