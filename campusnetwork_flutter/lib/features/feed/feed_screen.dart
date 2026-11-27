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
import '../../core/theme/clay_system.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../../core/widgets/rich_mention_text.dart';
import '../../core/widgets/skeleton_widgets.dart';
import '../auth/auth_provider.dart';
import '../auth/landing_screen.dart';

const _kFeedFilters = ['Trending', 'Most Recent', 'Unanswered', 'Answered'];

class FeedState {
  const FeedState({
    this.items = const [],
    this.ads = const [],
    this.filter = 'Trending',
    this.topic = 'All',
    this.discovery = '',
    this.discoveryLabel = '',
    this.loading = true,
    this.newPostsCount = 0,
    this.error,
  });

  final List<QuestionItem> items;
  final List<ServedAd> ads;
  final String filter;
  final String topic;
  final String discovery;
  final String discoveryLabel;
  final bool loading;
  final int newPostsCount;
  final String? error;

  FeedState copyWith({
    List<QuestionItem>? items,
    List<ServedAd>? ads,
    String? filter,
    String? topic,
    String? discovery,
    String? discoveryLabel,
    bool? loading,
    int? newPostsCount,
    String? error,
  }) =>
      FeedState(
        items: items ?? this.items,
        ads: ads ?? this.ads,
        filter: filter ?? this.filter,
        topic: topic ?? this.topic,
        discovery: discovery ?? this.discovery,
        discoveryLabel: discoveryLabel ?? this.discoveryLabel,
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
  int _latestKnownId = 0;

  @override
  void dispose() {
    _syncTimer?.cancel();
    super.dispose();
  }

  Future<void> _checkForNewPosts() async {
    if (state.loading || _latestKnownId <= 0) return;
    try {
      final params = <String, dynamic>{'ordering': 'newest'};
      if (state.topic != 'All') params['topic'] = state.topic;
      final res = await _api.dio.get('/questions/', queryParameters: params);
      final raw = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
      final existingIds = state.items.map((e) => e.id).toSet();
      int newer = 0;
      for (final m in raw.whereType<Map>()) {
        final id = (m['id'] as num?)?.toInt() ?? 0;
        if (id > _latestKnownId && !existingIds.contains(id)) newer++;
      }
      if (mounted && newer != state.newPostsCount) {
        state = state.copyWith(newPostsCount: newer);
      }
    } catch (_) {}
  }

  Future<void> load({
    String? filter,
    String? topic,
    String? discovery,
    String? discoveryLabel,
    bool clearDiscovery = false,
  }) async {
    final nextFilter = filter ?? state.filter;
    final nextTopic = topic ?? state.topic;
    final nextDiscovery = clearDiscovery ? '' : (discovery ?? state.discovery);
    final nextDiscoveryLabel = clearDiscovery ? '' : (discoveryLabel ?? discovery ?? state.discoveryLabel);
    state = state.copyWith(
      filter: nextFilter,
      topic: nextTopic,
      discovery: nextDiscovery,
      discoveryLabel: nextDiscoveryLabel,
      loading: true,
      newPostsCount: 0,
      error: null,
    );

    const orderMap = {
      'Trending': 'trending',
      'Most Recent': 'newest',
      'Unanswered': 'unanswered',
      'Answered': 'trending',
    };

    try {
      final params = <String, dynamic>{'ordering': orderMap[nextFilter] ?? 'trending'};
      if (nextTopic != 'All') params['topic'] = nextTopic;
      if (nextDiscovery.isNotEmpty) params['discovery'] = nextDiscovery;
      final newestParams = <String, dynamic>{'ordering': 'newest'};
      if (nextTopic != 'All') newestParams['topic'] = nextTopic;

      final results = await Future.wait([
        _api.dio.get('/questions/', queryParameters: params),
        _api.dio
            .get('/ads/serve/', queryParameters: {'placement': 'feed'})
            .catchError((_) => Response(requestOptions: RequestOptions(path: ''), data: [])),
        if (params['ordering'] != 'newest')
          _api.dio
              .get('/questions/', queryParameters: newestParams)
              .catchError((_) => Response(requestOptions: RequestOptions(path: ''), data: []))
        else
          Future.value(Response(requestOptions: RequestOptions(path: ''), data: [])),
      ]);

      final qRaw = results[0].data is List ? results[0].data as List : (results[0].data['results'] as List? ?? []);
      var parsed = qRaw.whereType<Map>().map((m) => QuestionItem.fromJson(Map<String, dynamic>.from(m))).toList();
      if (nextFilter == 'Answered') parsed = parsed.where((q) => q.answered).toList();

      final adRaw = results[1].data is List ? results[1].data as List : [];
      final parsedAds = adRaw.whereType<Map>().map((m) => ServedAd.fromJson(Map<String, dynamic>.from(m))).toList();

      // Establish true highest known post ID across both current list & newest baseline
      int maxId = _latestKnownId;
      for (final q in parsed) {
        if (q.id > maxId) maxId = q.id;
      }
      final newestRaw = results[2].data is List
          ? results[2].data as List
          : (results[2].data is Map ? (results[2].data['results'] as List? ?? []) : const []);
      for (final m in newestRaw.whereType<Map>()) {
        final id = (m['id'] as num?)?.toInt() ?? 0;
        if (id > maxId) maxId = id;
      }
      _latestKnownId = maxId;

      state = state.copyWith(items: parsed, ads: parsedAds, loading: false, newPostsCount: 0);
    } catch (e) {
      state = state.copyWith(loading: false, error: parseApiError(e));
    }
  }

  void prependQuestion(QuestionItem q) {
    if (q.id > _latestKnownId) _latestKnownId = q.id;
    state = state.copyWith(items: [q, ...state.items.where((x) => x.id != q.id)], newPostsCount: 0);
  }

  Future<void> editPost(QuestionItem q, {required String title, required String body}) async {
    final res = await _api.dio.patch('/questions/${q.id}/', data: {'title': title, 'body': body});
    final updated = QuestionItem.fromJson(Map<String, dynamic>.from(res.data as Map));
    _replace(updated);
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
    final deptsAsync = ref.watch(departmentsProvider);
    final depts = deptsAsync.valueOrNull ?? const <DepartmentItem>[];
    if (deptsAsync.hasError) {
      Future.microtask(() => ref.read(departmentsProvider.notifier).ensureLoaded());
    }
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
                      // Active Trending Now topic banner (when user taps a Trending topic in drawer)
                      if (feed.discovery.isNotEmpty) ...[
                        Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
                          decoration: BoxDecoration(
                            color: c.accentSoft,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.trending_up_rounded, size: 17, color: c.accent),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'Trending: ${feed.discoveryLabel.isNotEmpty ? feed.discoveryLabel : feed.discovery}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: c.accent, fontWeight: FontWeight.w800, fontSize: 13),
                                ),
                              ),
                              GestureDetector(
                                onTap: () => ref.read(feedProvider.notifier).load(clearDiscovery: true),
                                child: Icon(Icons.close_rounded, size: 18, color: c.accent),
                              ),
                            ],
                          ),
                        ),
                      ],
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
                                decoration: ClayDecorations.pill(context, active: active),
                                child: Text(
                                  f,
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    color: active ? Colors.white : c.textPrimary,
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                      if (feed.loading)
                        const Padding(
                          padding: EdgeInsets.only(top: 10),
                          child: FeedSkeletonList(count: 4),
                        ),
                    ],
                  ),
                );
              }

              if (feed.items.isEmpty) {
                final hasFacultyFilter = feed.topic.isNotEmpty && feed.topic != 'All';
                return Padding(
                  padding: const EdgeInsets.all(20),
                  child: MorphismCard(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
                    child: Column(
                      children: [
                        ClayIconPill(
                          icon: hasFacultyFilter ? Icons.school_outlined : Icons.article_outlined,
                          color: c.accent,
                          size: 48,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          hasFacultyFilter ? 'No posts in ${feed.topic} yet' : 'No discussions found',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: c.textPrimary),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          feed.error ??
                              (hasFacultyFilter
                                  ? 'No user has posted under ${feed.topic} yet. Tap + below to post the first one or switch back to All Faculties.'
                                  : 'Switch filters or tap + below to start a conversation.'),
                          textAlign: TextAlign.center,
                          style: TextStyle(color: c.textSecondary, fontSize: 13.5, height: 1.45),
                        ),
                        if (hasFacultyFilter) ...[
                          const SizedBox(height: 14),
                          LiquidTap(
                            onTap: () => ref.read(feedProvider.notifier).load(topic: 'All'),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                              decoration: BoxDecoration(
                                color: c.accent,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: const Text(
                                'Show All Faculties',
                                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13),
                              ),
                            ),
                          ),
                        ] else if (feed.error != null) ...[
                          const SizedBox(height: 12),
                          ElevatedButton(onPressed: () => ref.read(feedProvider.notifier).load(), child: const Text('Retry')),
                        ],
                      ],
                    ),
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
                    isAuthor: user != null && q.userId == user.id,
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
                onTap: () => ref.read(feedProvider.notifier).load(filter: 'Most Recent'),
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
    final isDark = context.isDark;
    final user = ref.watch(authProvider.select((s) => s.user));
    final depts = ref.watch(departmentsProvider).valueOrNull ?? const <DepartmentItem>[];
    final firstImg = q.media.where((m) => m.kind == 'image' && m.url.isNotEmpty).firstOrNull?.url;

    // Faculty-colored subtle clay background ONLY when posted to a specific faculty (NOT General / All Faculties).
    // Strictly NO card border (keeps X-style edge-to-edge feed separation).
    final deptClean = q.dept.trim();
    final hasSpecificFaculty = deptClean.isNotEmpty &&
        deptClean.toLowerCase() != 'general' &&
        deptClean.toLowerCase() != 'all' &&
        deptClean.toLowerCase() != 'all faculties';
    Color? facultyTint;
    if (hasSpecificFaculty) {
      final matched = depts.where((d) => d.name.toLowerCase() == deptClean.toLowerCase()).firstOrNull;
      facultyTint = matched != null
          ? hexToColor(matched.color, fallback: const Color(0xFF2563EB))
          : _fallbackFacultyColor(deptClean);
    }

    return Container(
      decoration: facultyTint != null
          ? BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: isDark
                    ? [
                        Color.lerp(c.background, facultyTint, 0.14)!,
                        Color.lerp(c.background, facultyTint, 0.05)!,
                      ]
                    : [
                        Color.lerp(Colors.white, facultyTint, 0.11)!,
                        Color.lerp(Colors.white, facultyTint, 0.03)!,
                      ],
              ),
            )
          : null,
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
                  RichMentionText(q.title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, height: 1.3, color: c.textPrimary)),
                if (q.body.isNotEmpty && q.body != q.title) ...[
                  const SizedBox(height: 4),
                  RichMentionText(
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
              // Upvote / Score / Downvote clay pill
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                decoration: ClayDecorations.pill(context),
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

              // Comments clay pill
              LiquidTap(
                onTap: () => context.push('/question/${q.publicId}', extra: q),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: ClayDecorations.pill(context),
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

              // Like clay pill
              LiquidTap(
                onTap: () => user == null ? onRequireAuth() : ref.read(feedProvider.notifier).toggleLike(q),
                onLongPress: isAuthor ? () => _showAnalyticsModal(context, ref) : null,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: q.liked
                      ? ClayDecorations.pill(context, active: true, activeColor: c.danger)
                      : ClayDecorations.pill(context),
                  child: Row(
                    children: [
                      Icon(q.liked ? Icons.favorite_rounded : Icons.favorite_border_rounded, size: 15, color: q.liked ? Colors.white : c.textSecondary),
                      const SizedBox(width: 5),
                      Text('${q.likes}', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: q.liked ? Colors.white : c.textPrimary)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),

              // Share clay pill
              LiquidTap(
                onTap: () => showRadialShareFan(context, title: q.title, url: '$kWebOrigin/q/${q.publicId}'),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
                  decoration: ClayDecorations.pill(context),
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

  Color _fallbackFacultyColor(String name) {
    const palette = [
      Color(0xFF2563EB),
      Color(0xFF059669),
      Color(0xFF7C3AED),
      Color(0xFFD97706),
      Color(0xFFDB2777),
      Color(0xFF0891B2),
    ];
    final idx = name.codeUnits.fold<int>(0, (a, b) => a + b) % palette.length;
    return palette[idx];
  }

  void _openEditModal(BuildContext context, WidgetRef ref) {
    final titleCtrl = TextEditingController(text: q.title);
    final bodyCtrl = TextEditingController(text: q.body);
    bool busy = false;
    AppBottomSheet.show(
      context,
      builder: (sheetCtx) => StatefulBuilder(
        builder: (ctx, setS) => Padding(
          padding: EdgeInsets.fromLTRB(20, 12, 20, MediaQuery.viewInsetsOf(ctx).bottom + 24),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Edit Post', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: ctx.cn.textPrimary)),
                const SizedBox(height: 14),
                ClayTextField(controller: titleCtrl, label: 'Headline', hint: 'Headline', prefixIcon: Icons.title_rounded),
                const SizedBox(height: 12),
                ClayTextField(controller: bodyCtrl, label: 'Post Content', hint: 'Write your post...', prefixIcon: Icons.edit_note_rounded, maxLines: 5),
                const SizedBox(height: 18),
                ClayButton(
                  label: busy ? 'Saving...' : 'Save Changes',
                  busy: busy,
                  onTap: busy
                      ? null
                      : () async {
                          final t = titleCtrl.text.trim();
                          final b = bodyCtrl.text.trim();
                          if (t.isEmpty || b.isEmpty) return;
                          setS(() => busy = true);
                          try {
                            await ref.read(feedProvider.notifier).editPost(q, title: t, body: b);
                            if (ctx.mounted) Navigator.of(ctx, rootNavigator: true).pop();
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Post updated!')));
                            }
                          } catch (e) {
                            setS(() => busy = false);
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
                            }
                          }
                        },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _openThreeDotMenu(BuildContext context, WidgetRef ref) {
    final c = context.cn;
    final currentUser = ref.read(authProvider).user;
    // STRICT: ONLY the post's own author (if verified student or verified SUG) can edit their own post!
    final canEdit = isAuthor &&
        (q.canEdit ||
            (currentUser?.isVerifiedStudent ?? false) ||
            (currentUser?.isVerifiedStaff ?? false));

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
              if (canEdit)
                ListTile(
                  leading: Icon(Icons.edit_outlined, color: c.success),
                  title: Text('Edit Post', style: TextStyle(fontWeight: FontWeight.w800, color: c.textPrimary)),
                  subtitle: Text('Verified Student & SUG benefit', style: TextStyle(fontSize: 11.5, color: c.textSecondary)),
                  onTap: () {
                    Navigator.of(ctx, rootNavigator: true).pop();
                    _openEditModal(context, ref);
                  },
                ),
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
