import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../auth/auth_provider.dart';
import '../auth/landing_screen.dart';

const _kCommentSorts = [
  ('recommended', 'Recommended'),
  ('recent', 'Most Recent'),
  ('liked', 'Most Liked'),
  ('disliked', 'Most Disliked'),
  ('oldest', 'Oldest First'),
];

class QuestionDetailScreen extends ConsumerStatefulWidget {
  const QuestionDetailScreen({super.key, required this.questionId, this.initialQuestion});
  final String questionId;
  final QuestionItem? initialQuestion;

  @override
  ConsumerState<QuestionDetailScreen> createState() => _QuestionDetailScreenState();
}

class _QuestionDetailScreenState extends ConsumerState<QuestionDetailScreen> {
  QuestionItem? _question;
  List<CommentItem> _comments = const [];
  String _sort = 'recommended';
  bool _loading = true;
  bool _sending = false;
  CommentItem? _replyTo;
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
      final cRes = await api.dio.get('/questions/${q.id}/comments/', queryParameters: {'sort': _sort});
      final raw = cRes.data is List ? cRes.data as List : (cRes.data['results'] as List? ?? []);
      setState(() {
        _question = q;
        _comments = raw.whereType<Map>().map((e) => CommentItem.fromJson(Map<String, dynamic>.from(e))).toList();
      });
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _sendComment() async {
    final user = ref.read(authProvider).user;
    if (user == null) {
      showAuthSheet(context);
      return;
    }
    final text = _ctrl.text.trim();
    if (text.isEmpty || _question == null) return;
    setState(() => _sending = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.dio.post('/questions/${_question!.id}/answer/', data: {
        'body': text,
        if (_replyTo != null) 'parent': _replyTo!.id,
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
    final user = ref.read(authProvider).user;
    if (user == null) {
      showAuthSheet(context);
      return;
    }
    try {
      await ref.read(apiClientProvider).dio.post('/answers/$id/vote/', data: {'direction': dir});
      await _load();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final q = _question;
    return Scaffold(
      backgroundColor: CNColors.bg,
      appBar: AppBar(title: const Text('Discussion', style: TextStyle(fontWeight: FontWeight.w800))),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(14),
              children: [
                if (q != null)
                  MorphismCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            UserAvatar(url: q.authorAvatarUrl, initials: q.authorAv, bgHex: q.authorBg, size: 42),
                            const SizedBox(width: 10),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(q.authorName, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                                Text('@${q.authorUsername} · ${q.dept}', style: const TextStyle(color: CNColors.accentLight, fontSize: 12)),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(q.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                        const SizedBox(height: 8),
                        Text(q.body, style: const TextStyle(fontSize: 14.5, height: 1.5)),
                      ],
                    ),
                  ),
                const SizedBox(height: 16),
                Text('Answers & Comments (${_comments.length})', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 8),
                SizedBox(
                  height: 36,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _kCommentSorts.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (_, i) {
                      final opt = _kCommentSorts[i];
                      final active = _sort == opt.$1;
                      return LiquidTap(
                        onTap: () {
                          setState(() => _sort = opt.$1);
                          _load();
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                          decoration: BoxDecoration(
                            color: active ? CNColors.accentSoft : CNColors.surface,
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: active ? CNColors.accent : CNColors.borderSubtle),
                          ),
                          child: Text(opt.$2, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: active ? CNColors.accentLight : CNColors.textPrimary)),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 12),
                if (_loading)
                  const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
                else if (_comments.isEmpty)
                  const MorphismCard(child: Center(child: Text('No comments yet. Start the discussion!', style: TextStyle(color: CNColors.textMuted))))
                else
                  for (final c in _comments) _buildComment(c, 0),
              ],
            ),
          ),

          // Sticky Reply Composer
          Container(
            color: CNColors.surface,
            padding: EdgeInsets.fromLTRB(12, 8, 12, MediaQuery.of(context).padding.bottom + 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_replyTo != null)
                  Row(
                    children: [
                      Text('Replying to ${_replyTo!.authorName}', style: const TextStyle(color: CNColors.accentLight, fontSize: 12, fontWeight: FontWeight.w700)),
                      const Spacer(),
                      IconButton(icon: const Icon(Icons.close, size: 16), onPressed: () => setState(() => _replyTo = null)),
                    ],
                  ),
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        decoration: BoxDecoration(color: CNColors.surfaceRecessed, borderRadius: BorderRadius.circular(14)),
                        child: TextField(
                          controller: _ctrl,
                          decoration: InputDecoration(
                            hintText: _replyTo != null ? 'Write a reply...' : 'Add a helpful answer...',
                            hintStyle: const TextStyle(color: CNColors.textFaint),
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
                        decoration: BoxDecoration(color: CNColors.accent, borderRadius: BorderRadius.circular(14)),
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

  Widget _buildComment(CommentItem c, int depth) {
    return Padding(
      padding: EdgeInsets.only(left: depth * 18.0, bottom: 10),
      child: Column(
        children: [
          MorphismCard(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    UserAvatar(url: c.authorAvatarUrl, initials: c.authorAv, bgHex: c.authorBg, size: 32),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(c.authorName, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                          Text('@${c.authorUsername} · ${c.time}', style: const TextStyle(color: CNColors.textFaint, fontSize: 11)),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(c.body, style: const TextStyle(fontSize: 14, height: 1.45)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    LiquidTap(
                      onTap: () => _voteComment(c.id, 'up'),
                      child: Row(
                        children: [
                          Icon(Icons.arrow_upward_rounded, size: 16, color: c.myVote == 'up' ? CNColors.accentLight : CNColors.textMuted),
                          const SizedBox(width: 3),
                          Text('${c.upvotes}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 14),
                    LiquidTap(
                      onTap: () => _voteComment(c.id, 'down'),
                      child: Row(
                        children: [
                          Icon(Icons.arrow_downward_rounded, size: 16, color: c.myVote == 'down' ? CNColors.danger : CNColors.textMuted),
                          const SizedBox(width: 3),
                          Text('${c.downvotes}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 16),
                    if (depth < 2)
                      LiquidTap(
                        onTap: () => setState(() => _replyTo = c),
                        child: const Text('Reply', style: TextStyle(color: CNColors.accentLight, fontSize: 12.5, fontWeight: FontWeight.w700)),
                      ),
                  ],
                ),
              ],
            ),
          ),
          for (final r in c.replies) _buildComment(r, depth + 1),
        ],
      ),
    );
  }
}
