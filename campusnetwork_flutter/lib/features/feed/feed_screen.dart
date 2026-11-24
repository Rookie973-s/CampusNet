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
    this.search = '',
    this.loading = true,
    this.error,
  });

  final List<QuestionItem> items;
  final List<ServedAd> ads;
  final String filter;
  final String topic;
  final String search;
  final bool loading;
  final String? error;

  FeedState copyWith({
    List<QuestionItem>? items,
    List<ServedAd>? ads,
    String? filter,
    String? topic,
    String? search,
    bool? loading,
    String? error,
  }) =>
      FeedState(
        items: items ?? this.items,
        ads: ads ?? this.ads,
        filter: filter ?? this.filter,
        topic: topic ?? this.topic,
        search: search ?? this.search,
        loading: loading ?? this.loading,
        error: error,
      );
}

class FeedNotifier extends StateNotifier<FeedState> {
  FeedNotifier(this._api) : super(const FeedState()) {
    load();
  }

  final ApiClient _api;

  Future<void> load({String? filter, String? topic, String? search}) async {
    final nextFilter = filter ?? state.filter;
    final nextTopic = topic ?? state.topic;
    final nextSearch = search ?? state.search;
    state = state.copyWith(filter: nextFilter, topic: nextTopic, search: nextSearch, loading: true, error: null);

    const orderMap = {
      'Trending': 'trending',
      'Most Recent': 'newest',
      'Unanswered': 'unanswered',
      'Answered': 'trending',
    };

    try {
      final params = <String, dynamic>{'ordering': orderMap[nextFilter] ?? 'trending'};
      if (nextTopic != 'All') params['topic'] = nextTopic;
      if (nextSearch.trim().isNotEmpty) params['search'] = nextSearch.trim();

      final results = await Future.wait([
        _api.dio.get('/questions/', queryParameters: params),
        _api.dio.get('/ads/serve/', queryParameters: {'placement': 'feed'}).catchError((_) => Response(requestOptions: RequestOptions(path: ''), data: [])),
      ]);

      final qRaw = results[0].data is List ? results[0].data as List : (results[0].data['results'] as List? ?? []);
      var parsed = qRaw.whereType<Map>().map((m) => QuestionItem.fromJson(Map<String, dynamic>.from(m))).toList();
      if (nextFilter == 'Answered') parsed = parsed.where((q) => q.answered).toList();

      final adRaw = results[1].data is List ? results[1].data as List : [];
      final parsedAds = adRaw.whereType<Map>().map((m) => ServedAd.fromJson(Map<String, dynamic>.from(m))).toList();

      state = state.copyWith(items: parsed, ads: parsedAds, loading: false);
    } catch (e) {
      state = state.copyWith(loading: false, error: parseApiError(e));
    }
  }

  void prependQuestion(QuestionItem q) {
    state = state.copyWith(items: [q, ...state.items.where((x) => x.id != q.id)]);
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

class FeedScreen extends ConsumerWidget {
  const FeedScreen({super.key, this.autoFocusSearch = false});
  final bool autoFocusSearch;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(feedProvider);
    final depts = ref.watch(departmentsProvider).valueOrNull ?? const <DepartmentItem>[];
    final user = ref.watch(authProvider.select((s) => s.user));

    final facultyOpts = [
      const DropdownOption(label: 'All Faculties', value: 'All'),
      ...depts.map((d) => DropdownOption(label: d.name, value: d.name, colorHex: d.color)),
    ];

    return RefreshIndicator(
      color: CNColors.accentLight,
      backgroundColor: CNColors.surface,
      onRefresh: () => ref.read(feedProvider.notifier).load(),
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 126),
        itemCount: feed.loading ? 1 : (feed.items.isEmpty ? 2 : feed.items.length + 1),
        itemBuilder: (context, index) {
          if (index == 0) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: FacultyDropdown(
                        options: facultyOpts,
                        value: feed.topic,
                        onChanged: (v) => ref.read(feedProvider.notifier).load(topic: v),
                      ),
                    ),
                    const SizedBox(width: 10),
                    MorphismSearchInput(
                      value: feed.search,
                      placeholder: 'Search feed...',
                      onChanged: (s) => ref.read(feedProvider.notifier).load(search: s),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 38,
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
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 8),
                          decoration: BoxDecoration(
                            color: active ? CNColors.accentSoft : CNColors.surface,
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: active ? CNColors.accent : CNColors.borderSubtle),
                          ),
                          child: Text(
                            f,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: active ? CNColors.accentLight : CNColors.textPrimary,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 14),
                if (feed.loading)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Center(child: CircularProgressIndicator(color: CNColors.accentLight)),
                  ),
              ],
            );
          }

          if (feed.items.isEmpty) {
            return MorphismCard(
              child: Column(
                children: [
                  const Icon(Icons.article_outlined, size: 38, color: CNColors.textFaint),
                  const SizedBox(height: 8),
                  const Text('No discussions found', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                  const SizedBox(height: 4),
                  Text(
                    feed.error ?? 'Switch filters or tap + below to start a discussion!',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: CNColors.textMuted, fontSize: 13),
                  ),
                ],
              ),
            );
          }

          final qIdx = index - 1;
          final q = feed.items[qIdx];
          final adAfter = qIdx == 2 && feed.ads.isNotEmpty ? feed.ads.first : null;

          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(
              children: [
                _PostCard(
                  q: q,
                  isAuthor: user != null && (q.userId == user.id || q.canEdit || q.canDelete),
                  onRequireAuth: () => showAuthSheet(context),
                ),
                if (adAfter != null) ...[
                  const SizedBox(height: 12),
                  NativeAdCard(ad: adAfter),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _PostCard extends ConsumerWidget {
  const _PostCard({required this.q, required this.isAuthor, required this.onRequireAuth});
  final QuestionItem q;
  final bool isAuthor;
  final VoidCallback onRequireAuth;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider.select((s) => s.user));
    final firstImg = q.media.where((m) => m.kind == 'image' && m.url.isNotEmpty).firstOrNull?.url;

    return MorphismCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: Avatar + Real Display Name + @username + Verified/SUG + 3-Dot Menu
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              UserAvatar(url: q.authorAvatarUrl, initials: q.authorAv, bgHex: q.authorBg, size: 42),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            q.authorName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                          ),
                        ),
                        if (q.authorVerified)
                          const Padding(
                            padding: EdgeInsets.only(left: 4),
                            child: Icon(Icons.verified_rounded, size: 15, color: CNColors.accentLight),
                          ),
                        if (q.authorStaff)
                          Container(
                            margin: const EdgeInsets.only(left: 5),
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(color: CNColors.warningSoft, borderRadius: BorderRadius.circular(99)),
                            child: const Text('SUG', style: TextStyle(color: CNColors.gold, fontSize: 10, fontWeight: FontWeight.w900)),
                          ),
                      ],
                    ),
                    if (q.authorUsername.isNotEmpty)
                      Text('@${q.authorUsername}', style: const TextStyle(color: CNColors.accentLight, fontSize: 12.5, fontWeight: FontWeight.w600)),
                    Text('${q.dept} · ${q.time}', style: const TextStyle(color: CNColors.textFaint, fontSize: 11.5)),
                  ],
                ),
              ),
              LiquidTap(
                onTap: () => _openThreeDotMenu(context, ref),
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: const BoxDecoration(color: CNColors.surfaceRecessed, shape: BoxShape.circle),
                  child: const Icon(Icons.more_horiz_rounded, size: 18, color: CNColors.textMuted),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Status pill
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
            decoration: BoxDecoration(
              color: q.answered ? CNColors.successSoft : CNColors.accentSoft,
              borderRadius: BorderRadius.circular(99),
            ),
            child: Text(
              q.answered ? 'ANSWERED' : 'OPEN',
              style: TextStyle(color: q.answered ? CNColors.success : CNColors.accentLight, fontSize: 10.5, fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 8),

          // Title, Body & Media
          GestureDetector(
            onTap: () => context.push('/question/${q.publicId}', extra: q),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(q.title, style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800, height: 1.3)),
                if (q.body.isNotEmpty && q.body != q.title) ...[
                  const SizedBox(height: 5),
                  Text(
                    q.body,
                    maxLines: 4,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: CNColors.textMuted, fontSize: 14, height: 1.45),
                  ),
                ],
                if (firstImg != null) ...[
                  const SizedBox(height: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: CachedNetworkImage(
                      imageUrl: firstImg,
                      width: double.infinity,
                      height: 205,
                      fit: BoxFit.cover,
                      errorWidget: (_, __, ___) => const SizedBox.shrink(),
                    ),
                  ),
                ],
              ],
            ),
          ),

          // Interactive Poll Options
          if (q.pollOptions.isNotEmpty) ...[
            const SizedBox(height: 10),
            for (final opt in q.pollOptions)
              Padding(
                padding: const EdgeInsets.only(bottom: 7),
                child: LiquidTap(
                  onTap: () {
                    if (user == null) return onRequireAuth();
                    ref.read(feedProvider.notifier).votePoll(q, opt.id);
                  },
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Stack(
                      children: [
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
                          decoration: BoxDecoration(
                            color: CNColors.surfaceRecessed,
                            border: Border.all(color: opt.voted ? CNColors.accent : Colors.transparent),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              Expanded(child: Text(opt.text, style: TextStyle(fontWeight: opt.voted ? FontWeight.w800 : FontWeight.w600))),
                              Text('${opt.percent}%', style: TextStyle(color: opt.voted ? CNColors.accentLight : CNColors.textMuted, fontWeight: FontWeight.w800, fontSize: 12.5)),
                            ],
                          ),
                        ),
                        Positioned.fill(
                          child: FractionallySizedBox(
                            alignment: Alignment.centerLeft,
                            widthFactor: (opt.percent / 100).clamp(0.0, 1.0),
                            child: IgnorePointer(
                              child: Container(
                                color: opt.voted ? CNColors.accent.withValues(alpha: 0.22) : Colors.white.withValues(alpha: 0.06),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            Text('${q.pollTotalVotes} vote${q.pollTotalVotes == 1 ? '' : 's'}', style: const TextStyle(color: CNColors.textFaint, fontSize: 11.5)),
          ],

          // Tags
          if (q.tags.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: q.tags
                  .map((t) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                        decoration: BoxDecoration(color: CNColors.surfaceRecessed, borderRadius: BorderRadius.circular(99)),
                        child: Text('#$t', style: const TextStyle(color: CNColors.textMuted, fontSize: 11.5, fontWeight: FontWeight.w600)),
                      ))
                  .toList(),
            ),
          ],

          const SizedBox(height: 10),
          const Divider(height: 1),
          const SizedBox(height: 8),

          // Action Row: Upvote/Downvote, Like, Comment, Radial ShareFan, Views, Save
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: CNColors.surfaceRecessed, borderRadius: BorderRadius.circular(99)),
                child: Row(
                  children: [
                    LiquidTap(
                      onTap: () => user == null ? onRequireAuth() : ref.read(feedProvider.notifier).toggleVote(q, 'up'),
                      child: Icon(Icons.keyboard_arrow_up_rounded, size: 20, color: q.voted == 'up' ? CNColors.accentLight : CNColors.textMuted),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Text('${q.votes}', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: q.voted != null ? CNColors.accentLight : CNColors.textPrimary)),
                    ),
                    LiquidTap(
                      onTap: () => user == null ? onRequireAuth() : ref.read(feedProvider.notifier).toggleVote(q, 'down'),
                      child: Icon(Icons.keyboard_arrow_down_rounded, size: 20, color: q.voted == 'down' ? CNColors.danger : CNColors.textMuted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              LiquidTap(
                onTap: () => user == null ? onRequireAuth() : ref.read(feedProvider.notifier).toggleLike(q),
                onLongPress: isAuthor ? () => _showAnalyticsModal(context, ref) : null,
                child: Row(
                  children: [
                    Icon(q.liked ? Icons.favorite_rounded : Icons.favorite_border_rounded, size: 19, color: q.liked ? CNColors.danger : CNColors.textMuted),
                    const SizedBox(width: 4),
                    Text('${q.likes}', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: q.liked ? CNColors.danger : CNColors.textMuted)),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              LiquidTap(
                onTap: () => context.push('/question/${q.publicId}', extra: q),
                child: Row(
                  children: [
                    const Icon(Icons.chat_bubble_outline_rounded, size: 17, color: CNColors.textMuted),
                    const SizedBox(width: 4),
                    Text('${q.ans}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: CNColors.textMuted)),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              LiquidTap(
                onTap: () => showRadialShareFan(context, title: q.title, url: '$kWebOrigin/q/${q.publicId}'),
                child: const Icon(Icons.send_rounded, size: 17, color: CNColors.textMuted),
              ),
              const Spacer(),
              const Icon(Icons.remove_red_eye_outlined, size: 14, color: CNColors.textFaint),
              const SizedBox(width: 3),
              Text('${q.views}', style: const TextStyle(color: CNColors.textFaint, fontSize: 12)),
              const SizedBox(width: 10),
              LiquidTap(
                onTap: () => user == null ? onRequireAuth() : ref.read(feedProvider.notifier).toggleBookmark(q),
                child: Icon(q.saved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded, size: 19, color: q.saved ? CNColors.gold : CNColors.textFaint),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _openThreeDotMenu(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      backgroundColor: CNColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (isAuthor)
                ListTile(
                  leading: const Icon(Icons.bar_chart_rounded, color: CNColors.accentLight),
                  title: const Text('Post Analytics & Liked By', style: TextStyle(fontWeight: FontWeight.w700)),
                  onTap: () {
                    Navigator.of(ctx).pop();
                    _showAnalyticsModal(context, ref);
                  },
                ),
              ListTile(
                leading: const Icon(Icons.link_rounded, color: CNColors.textMuted),
                title: const Text('Copy Link', style: TextStyle(fontWeight: FontWeight.w700)),
                onTap: () {
                  Navigator.of(ctx).pop();
                  Clipboard.setData(ClipboardData(text: '$kWebOrigin/q/${q.publicId}'));
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Link copied!')));
                },
              ),
              ListTile(
                leading: const Icon(Icons.visibility_off_outlined, color: CNColors.textMuted),
                title: const Text('See less of this', style: TextStyle(fontWeight: FontWeight.w700)),
                onTap: () {
                  Navigator.of(ctx).pop();
                  ref.read(feedProvider.notifier).hidePost(q.id);
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("We'll show you less like this.")));
                },
              ),
              ListTile(
                leading: const Icon(Icons.flag_outlined, color: CNColors.danger),
                title: const Text('Report Post', style: TextStyle(color: CNColors.danger, fontWeight: FontWeight.w700)),
                onTap: () async {
                  Navigator.of(ctx).pop();
                  await ref.read(feedProvider.notifier).reportPost(q.id, 'Reported by mobile user');
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Report submitted to moderators.')));
                  }
                },
              ),
              if (q.canDelete)
                ListTile(
                  leading: const Icon(Icons.delete_outline_rounded, color: CNColors.danger),
                  title: const Text('Delete Post', style: TextStyle(color: CNColors.danger, fontWeight: FontWeight.w800)),
                  onTap: () async {
                    Navigator.of(ctx).pop();
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
    try {
      final api = ref.read(apiClientProvider);
      final res = await api.dio.get('/questions/${q.id}/likers/');
      final data = Map<String, dynamic>.from(res.data as Map);
      final likers = (data['likers'] as List? ?? []).whereType<Map>().map((e) => CNUser.fromJson(Map<String, dynamic>.from(e))).toList();
      if (!context.mounted) return;
      showModalBottomSheet(
        context: context,
        backgroundColor: CNColors.surface,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        builder: (_) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Post Analytics & Liked By', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 12,
                  runSpacing: 8,
                  children: [
                    Text('Views: ${data['views'] ?? 0}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text('Likes: ${data['likes'] ?? 0}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text('Upvotes: ${data['upvotes'] ?? 0}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text('Comments: ${data['comments'] ?? 0}', style: const TextStyle(fontWeight: FontWeight.w700)),
                  ],
                ),
                const SizedBox(height: 14),
                Text('LIKED BY (${likers.length})', style: const TextStyle(color: CNColors.textFaint, fontSize: 11.5, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                if (likers.isEmpty)
                  const Padding(padding: EdgeInsets.symmetric(vertical: 14), child: Text('No likes yet.', style: TextStyle(color: CNColors.textMuted)))
                else
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 240),
                    child: ListView.separated(
                      shrinkWrap: true,
                      itemCount: likers.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final u = likers[i];
                        return Row(
                          children: [
                            UserAvatar(url: u.avatarUrl, initials: u.av, bgHex: u.bg, size: 36),
                            const SizedBox(width: 10),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(u.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                                Text('@${u.username}', style: const TextStyle(color: CNColors.textMuted, fontSize: 12)),
                              ],
                            ),
                          ],
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
