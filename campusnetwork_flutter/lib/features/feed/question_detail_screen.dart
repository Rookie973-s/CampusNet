import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../auth/auth_provider.dart';
import '../auth/landing_screen.dart';

const _kCommentSortOptions = [
  DropdownOption(label: 'Recommended', value: 'recommended'),
  DropdownOption(label: 'Most Recent', value: 'recent'),
  DropdownOption(label: 'Most Liked', value: 'liked'),
  DropdownOption(label: 'Most Disliked', value: 'disliked'),
  DropdownOption(label: 'Oldest First', value: 'oldest'),
];

/// Redesigned Comments Screen (COMMENTS reference):
/// - Preserves the working comment composer
/// - Threaded comment bubbles with vertical connecting lines (CustomPainter)
/// - Interactions: Reply, Upvote, Downvote, AND Comment Like (POST /answers/{id}/like/)
/// - Compact Sorting Dropdown (replaces horizontal chips) + Comment-placement AdCard
class QuestionDetailScreen extends ConsumerStatefulWidget {
  const QuestionDetailScreen({super.key, required this.questionId, this.initialQuestion});
  final String questionId;
  final QuestionItem? initialQuestion;

  @override
  ConsumerState<QuestionDetailScreen> createState() => _QuestionDetailScreenState();
}

class _QuestionDetailScreenState extends ConsumerState<QuestionDetailScreen> {
  QuestionItem? _question;
  List<Map<String, dynamic>> _comments = const [];
  List<ServedAd> _ads = const [];
  String _sort = 'recommended';
  bool _loading = true;
  bool _sending = false;
  Map<String, dynamic>? _replyTo;
  final _ctrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _question = widget.initialQuestion;
    _load();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(apiClientProvider);
      final qRes = await api.dio.get('/questions/${widget.questionId}/');
      final q = QuestionItem.fromJson(Map<String, dynamic>.from(qRes.data as Map));
      final res = await Future.wait([
        api.dio.get('/questions/${q.id}/comments/', queryParameters: {'sort': _sort}),
        api.dio
            .get('/ads/serve/', queryParameters: {'placement': 'comments'})
            .catchError((_) => Response(requestOptions: RequestOptions(path: ''), data: [])),
      ]);
      final raw = res[0].data is List ? res[0].data as List : (res[0].data['results'] as List? ?? []);
      final adRaw = res[1].data is List ? res[1].data as List : [];
      if (mounted) {
        setState(() {
          _question = q;
          _comments = raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
          _ads = adRaw.whereType<Map>().map((e) => ServedAd.fromJson(Map<String, dynamic>.from(e))).toList();
        });
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _sendComment() async {
    if (ref.read(authProvider).user == null) {
      showAuthSheet(context);
      return;
    }
    final text = _ctrl.text.trim();
    if (text.isEmpty || _question == null) return;
    setState(() => _sending = true);
    try {
      await ref.read(apiClientProvider).dio.post('/questions/${_question!.id}/answer/', data: {
        'body': text,
        if (_replyTo != null) 'parent': _replyTo!['id'],
      });
      _ctrl.clear();
      setState(() => _replyTo = null);
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _voteComment(int id, String dir) async {
    if (ref.read(authProvider).user == null) {
      showAuthSheet(context);
      return;
    }
    try {
      await ref.read(apiClientProvider).dio.post('/answers/$id/vote/', data: {'direction': dir});
      await _load();
    } catch (_) {}
  }

  Future<void> _likeComment(int id) async {
    if (ref.read(authProvider).user == null) {
      showAuthSheet(context);
      return;
    }
    try {
      await ref.read(apiClientProvider).dio.post('/answers/$id/like/');
      await _load();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final c = context.cn;
    final q = _question;
    final api = ref.watch(apiClientProvider);
    final currentUserId = ref.watch(authProvider.select((s) => s.user?.id));

    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(title: const Text('Discussion', style: TextStyle(fontWeight: FontWeight.w800))),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(14),
              children: [
                if (q != null) ...[
                  UserIdentity(
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
                  const SizedBox(height: 10),
                  Text(q.title, style: TextStyle(fontSize: 18.5, fontWeight: FontWeight.w900, color: c.textPrimary)),
                  if (q.body.isNotEmpty && q.body != q.title) ...[
                    const SizedBox(height: 6),
                    Text(q.body, style: TextStyle(fontSize: 14.5, height: 1.5, color: c.textPrimary)),
                  ],
                  const SizedBox(height: 14),
                  Divider(color: c.divider, height: 1),
                ],
                const SizedBox(height: 14),

                // Header + Compact Sorting Dropdown (replaces horizontal chips!)
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Comments (${_comments.length})',
                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: c.textPrimary),
                      ),
                    ),
                    SizedBox(
                      width: 170,
                      child: FacultyDropdown(
                        options: _kCommentSortOptions,
                        value: _sort,
                        placeholder: 'Sort',
                        icon: Icons.sort_rounded,
                        onChanged: (v) {
                          setState(() => _sort = v);
                          _load();
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                if (_loading)
                  const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
                else if (_comments.isEmpty) ...[
                  MorphismCard(
                    child: Center(
                      child: Text('No comments yet. Start the discussion!', style: TextStyle(color: c.textSecondary)),
                    ),
                  ),
                  if (_ads.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    NativeAdCard(ad: _ads.first, placement: 'comments', api: api),
                  ],
                ] else ...[
                  for (int i = 0; i < _comments.length; i++) ...[
                    _ThreadedCommentNode(
                      raw: _comments[i],
                      depth: 0,
                      currentUserId: currentUserId,
                      onVote: _voteComment,
                      onLike: _likeComment,
                      onReply: (node) => setState(() => _replyTo = node),
                    ),
                    if (i == 0 && _ads.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      NativeAdCard(ad: _ads.first, placement: 'comments', api: api),
                      const SizedBox(height: 12),
                    ],
                  ],
                ],
              ],
            ),
          ),

          // Preserved Working Comment Composer
          Container(
            color: c.surface,
            padding: EdgeInsets.fromLTRB(12, 8, 12, MediaQuery.paddingOf(context).bottom + 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_replyTo != null)
                  Row(
                    children: [
                      Text(
                        'Replying to @${(_replyTo!['user'] is Map ? _replyTo!['user']['username'] : '') ?? ''}',
                        style: TextStyle(color: c.accent, fontSize: 12, fontWeight: FontWeight.w700),
                      ),
                      const Spacer(),
                      IconButton(icon: Icon(Icons.close, size: 16, color: c.textSecondary), onPressed: () => setState(() => _replyTo = null)),
                    ],
                  ),
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        decoration: BoxDecoration(color: c.surfaceMuted, borderRadius: BorderRadius.circular(14)),
                        child: TextField(
                          controller: _ctrl,
                          style: TextStyle(color: c.textPrimary),
                          decoration: InputDecoration(
                            hintText: _replyTo != null ? 'Write a reply...' : 'Add a helpful answer...',
                            hintStyle: TextStyle(color: c.textSecondary),
                            border: InputBorder.none,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    LiquidTap(
                      onTap: _sending ? null : _sendComment,
                      child: Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(color: c.accent, borderRadius: BorderRadius.circular(14)),
                        child: const Icon(Icons.send_rounded, color: Colors.white, size: 19),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Threaded Comment Card matching COMMENTS reference (vertical connecting line + floating pill reaction bar).
class _ThreadedCommentNode extends StatelessWidget {
  const _ThreadedCommentNode({
    required this.raw,
    required this.depth,
    required this.currentUserId,
    required this.onVote,
    required this.onLike,
    required this.onReply,
  });

  final Map<String, dynamic> raw;
  final int depth;
  final int? currentUserId;
  final Future<void> Function(int id, String dir) onVote;
  final Future<void> Function(int id) onLike;
  final ValueChanged<Map<String, dynamic>> onReply;

  @override
  Widget build(BuildContext context) {
    final c = context.cn;
    final id = (raw['id'] as num?)?.toInt() ?? 0;
    final u = raw['user'] is Map ? Map<String, dynamic>.from(raw['user'] as Map) : <String, dynamic>{};
    final replies = (raw['replies'] as List? ?? []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    final liked = raw['liked'] == true;
    final likes = (raw['likes'] as num?)?.toInt() ?? 0;
    final upvotes = (raw['upvotes'] as num?)?.toInt() ?? 0;
    final downvotes = (raw['downvotes'] as num?)?.toInt() ?? 0;
    final myVote = raw['my_vote']?.toString();

    return Padding(
      padding: EdgeInsets.only(left: depth > 0 ? 22.0 : 0.0, bottom: 12),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Avatar + Vertical Thread Connecting Line
            Column(
              children: [
                GestureDetector(
                  onTap: () {
                    final uid = (u['id'] as num?)?.toInt();
                    if (uid == null) return;
                    // handled via UserIdentity too
                  },
                  child: UserAvatar(
                    url: normalizeMediaUrl(u['avatar_url']?.toString()),
                    initials: (u['av'] ?? '?').toString(),
                    bgHex: (u['bg'] ?? '#3B82F6').toString(),
                    size: depth > 0 ? 30 : 36,
                  ),
                ),
                if (replies.isNotEmpty)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      decoration: BoxDecoration(color: c.divider, borderRadius: BorderRadius.circular(2)),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.fromLTRB(14, 11, 14, 22),
                        decoration: BoxDecoration(
                          color: c.surface,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: c.divider, width: 0.7),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    (u['name'] ?? 'Student').toString(),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: c.textPrimary),
                                  ),
                                ),
                                BadgeRow(verified: u['is_verified_student'] == true, staff: u['staff'] == true, size: 13),
                                const SizedBox(width: 6),
                                Text((raw['time'] ?? '').toString(), style: TextStyle(color: c.textSecondary, fontSize: 11)),
                              ],
                            ),
                            const SizedBox(height: 5),
                            Text((raw['body'] ?? '').toString(), style: TextStyle(fontSize: 14, height: 1.45, color: c.textPrimary)),
                          ],
                        ),
                      ),

                      // Floating overlapping reaction pill (Like, Upvote, Downvote, Reply)
                      Positioned(
                        right: 8,
                        bottom: -11,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: c.surfaceElevated,
                            borderRadius: BorderRadius.circular(99),
                            border: Border.all(color: c.divider),
                            boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 6, offset: Offset(0, 2))],
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              LiquidTap(
                                onTap: () => onLike(id),
                                child: Row(
                                  children: [
                                    Icon(liked ? Icons.favorite_rounded : Icons.favorite_border_rounded, size: 14, color: liked ? c.danger : c.textSecondary),
                                    const SizedBox(width: 3),
                                    Text('$likes', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: liked ? c.danger : c.textPrimary)),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 10),
                              LiquidTap(
                                onTap: () => onVote(id, 'up'),
                                child: Row(
                                  children: [
                                    Icon(Icons.arrow_upward_rounded, size: 14, color: myVote == 'up' ? c.accent : c.textSecondary),
                                    Text('$upvotes', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: myVote == 'up' ? c.accent : c.textPrimary)),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              LiquidTap(
                                onTap: () => onVote(id, 'down'),
                                child: Row(
                                  children: [
                                    Icon(Icons.arrow_downward_rounded, size: 14, color: myVote == 'down' ? c.danger : c.textSecondary),
                                    Text('$downvotes', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: myVote == 'down' ? c.danger : c.textPrimary)),
                                  ],
                                ),
                              ),
                              if (depth < 3) ...[
                                const SizedBox(width: 10),
                                LiquidTap(
                                  onTap: () => onReply(raw),
                                  child: Text('Reply', style: TextStyle(color: c.accent, fontSize: 11.5, fontWeight: FontWeight.w800)),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  for (final rep in replies)
                    _ThreadedCommentNode(
                      raw: rep,
                      depth: depth + 1,
                      currentUserId: currentUserId,
                      onVote: onVote,
                      onLike: onLike,
                      onReply: onReply,
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
