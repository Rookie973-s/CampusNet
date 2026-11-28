import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/clay_system.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../../core/widgets/skeleton_widgets.dart';
import '../auth/auth_provider.dart';

/// Relocated Search Screen — reached exclusively from the central '+' Expandable Action Menu (Part 7.4).
/// Debounced 350ms live search across People, Posts, and Communities (zero yellow underlines!).
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key, this.initialQuery = ''});
  final String initialQuery;

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  late final TextEditingController _ctrl;
  Timer? _debounce;
  bool _loading = false;
  String? _error;
  List<CNUser> _people = const [];
  List<QuestionItem> _posts = const [];
  List<Map<String, dynamic>> _comments = const [];
  List<Map<String, dynamic>> _communities = const [];
  List<Map<String, dynamic>> _communityPosts = const [];
  List<Map<String, dynamic>> _communityComments = const [];
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.initialQuery);
    if (widget.initialQuery.trim().length >= 2) {
      _runSearch(widget.initialQuery.trim());
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _onChanged(String val) {
    _debounce?.cancel();
    final q = val.trim();
    if (q.length < 2) {
      setState(() {
        _loading = false;
        _people = const [];
        _posts = const [];
        _comments = const [];
        _communities = const [];
        _communityPosts = const [];
        _communityComments = const [];
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () => _runSearch(q));
  }

  Future<void> _runSearch(String q) async {
    final reqId = ++_seq;
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    try {
      final res = await api.dio.get('/search/', queryParameters: {'q': q.replaceFirst('@', '')});
      if (reqId != _seq || !mounted) return;
      final data = res.data is Map ? Map<String, dynamic>.from(res.data as Map) : <String, dynamic>{};
      final uRaw = data['people'] as List? ?? [];
      final pRaw = data['posts'] as List? ?? [];
      final cmRaw = data['comments'] as List? ?? [];
      final cRaw = data['communities'] as List? ?? [];
      final cpRaw = data['community_posts'] as List? ?? [];
      final ccRaw = data['community_comments'] as List? ?? [];
      setState(() {
        _people = uRaw.whereType<Map>().map((e) => CNUser.fromJson(Map<String, dynamic>.from(e))).toList();
        _posts = pRaw.whereType<Map>().map((e) => QuestionItem.fromJson(Map<String, dynamic>.from(e))).toList();
        _comments = cmRaw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        _communities = cRaw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        _communityPosts = cpRaw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        _communityComments = ccRaw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        _loading = false;
      });
    } catch (e) {
      if (reqId != _seq || !mounted) return;
      setState(() {
        _loading = false;
        _error = parseApiError(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.cn;
    final currentUserId = ref.watch(authProvider.select((s) => s.user?.id));

    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        backgroundColor: c.background,
        titleSpacing: 0,
        title: Container(
          height: 46,
          margin: const EdgeInsets.only(right: 14),
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: ClayDecorations.input(context, radius: 999),
          child: Row(
            children: [
              ClayIconPill(icon: Icons.search_rounded, color: c.accent, size: 30, iconSize: 16),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _ctrl,
                  autofocus: true,
                  onChanged: _onChanged,
                  style: TextStyle(color: c.textPrimary, fontSize: 14.5, fontWeight: FontWeight.w600),
                  decoration: InputDecoration(
                    hintText: 'Search people, posts, communities...',
                    hintStyle: TextStyle(color: c.textSecondary, fontSize: 14),
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    filled: false,
                    isDense: true,
                  ),
                ),
              ),
              if (_ctrl.text.isNotEmpty)
                GestureDetector(
                  onTap: () {
                    _ctrl.clear();
                    _onChanged('');
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    child: Icon(Icons.close_rounded, size: 18, color: c.textSecondary),
                  ),
                ),
            ],
          ),
        ),
      ),
      body: _loading
          ? const FeedSkeletonList(count: 4)
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!, style: TextStyle(color: c.textSecondary)),
                      const SizedBox(height: 10),
                      ElevatedButton(onPressed: () => _runSearch(_ctrl.text.trim()), child: const Text('Retry')),
                    ],
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(14),
                  children: [
                    if (_ctrl.text.trim().length < 2)
                      Padding(
                        padding: const EdgeInsets.only(top: 60),
                        child: Column(
                          children: [
                            Icon(Icons.search_rounded, size: 46, color: c.textSecondary),
                            const SizedBox(height: 10),
                            Text('Search CampusNetwork', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: c.textPrimary)),
                            const SizedBox(height: 4),
                            Text('Type at least 2 characters to find students, questions, and communities.', textAlign: TextAlign.center, style: TextStyle(color: c.textSecondary, fontSize: 13)),
                          ],
                        ),
                      ),
                    if (_people.isNotEmpty) ...[
                      Text('PEOPLE', style: TextStyle(color: c.textSecondary, fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 0.6)),
                      const SizedBox(height: 8),
                      for (final u in _people.take(6))
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: MorphismCard(
                            padding: const EdgeInsets.all(12),
                            child: UserIdentity(
                              userId: u.id,
                              currentUserId: currentUserId,
                              name: u.name,
                              username: u.username,
                              initials: u.av,
                              bgHex: u.bg,
                              avatarUrl: u.avatarUrl,
                              verified: u.isVerifiedStudent,
                              staff: u.isVerifiedStaff,
                              avatarSize: 40,
                            ),
                          ),
                        ),
                      const SizedBox(height: 8),
                    ],
                    if (_communities.isNotEmpty) ...[
                      Text('COMMUNITIES', style: TextStyle(color: c.textSecondary, fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 0.6)),
                      const SizedBox(height: 8),
                      for (final comm in _communities.take(5))
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: LiquidTap(
                            onTap: () => context.push('/community/${comm['slug']}', extra: comm),
                            child: MorphismCard(
                              padding: const EdgeInsets.all(12),
                              child: Row(
                                children: [
                                  UserAvatar(
                                    url: normalizeMediaUrl(comm['avatar_url']?.toString()),
                                    initials: (comm['name'] ?? 'C').toString(),
                                    size: 40,
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text((comm['name'] ?? '').toString(), style: TextStyle(fontWeight: FontWeight.w800, color: c.textPrimary)),
                                        Text('${comm['category']} · ${comm['followers_count'] ?? 0} members', style: TextStyle(color: c.textSecondary, fontSize: 12)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      const SizedBox(height: 8),
                    ],
                    if (_posts.isNotEmpty) ...[
                      Text('POSTS & QUESTIONS', style: TextStyle(color: c.textSecondary, fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 0.6)),
                      const SizedBox(height: 8),
                      for (final p in _posts.take(10))
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: LiquidTap(
                            onTap: () => context.push('/question/${p.publicId}', extra: p),
                            child: MorphismCard(
                              padding: const EdgeInsets.all(13),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    p.title.isNotEmpty ? p.title : p.body,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(fontWeight: FontWeight.w800, color: c.textPrimary),
                                  ),
                                  const SizedBox(height: 4),
                                  Text('${p.authorName} · ${p.dept} · ${p.ans} comments', style: TextStyle(color: c.textSecondary, fontSize: 12)),
                                ],
                              ),
                            ),
                          ),
                        ),
                      const SizedBox(height: 8),
                    ],
                    if (_comments.isNotEmpty) ...[
                      Text('MATCHING COMMENTS', style: TextStyle(color: c.textSecondary, fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 0.6)),
                      const SizedBox(height: 8),
                      for (final cm in _comments.take(8))
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: LiquidTap(
                            onTap: () => context.push('/question/${cm['question_public_id'] ?? cm['question_id']}'),
                            child: MorphismCard(
                              padding: const EdgeInsets.all(13),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text((cm['body'] ?? '').toString(), maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700, color: c.textPrimary)),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Comment by @${(cm['author'] is Map ? cm['author']['username'] : '') ?? 'student'} · ${(cm['question_title'] ?? '').toString()}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(color: c.textSecondary, fontSize: 12),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      const SizedBox(height: 8),
                    ],
                    if (_communityPosts.isNotEmpty) ...[
                      Text('COMMUNITY POSTS', style: TextStyle(color: c.textSecondary, fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 0.6)),
                      const SizedBox(height: 8),
                      for (final cp in _communityPosts.take(8))
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: LiquidTap(
                            onTap: () => context.push('/community/${cp['community_slug']}'),
                            child: MorphismCard(
                              padding: const EdgeInsets.all(13),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    ((cp['title'] ?? '').toString().isNotEmpty ? cp['title'] : cp['body']).toString(),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(fontWeight: FontWeight.w800, color: c.textPrimary),
                                  ),
                                  const SizedBox(height: 4),
                                  Text('In ${cp['community_name'] ?? 'Community'}', style: TextStyle(color: c.accent, fontSize: 12, fontWeight: FontWeight.w700)),
                                ],
                              ),
                            ),
                          ),
                        ),
                      const SizedBox(height: 8),
                    ],
                    if (_communityComments.isNotEmpty) ...[
                      Text('COMMUNITY COMMENTS', style: TextStyle(color: c.textSecondary, fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 0.6)),
                      const SizedBox(height: 8),
                      for (final cc in _communityComments.take(6))
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: LiquidTap(
                            onTap: () => context.push('/community/${cc['community_slug']}'),
                            child: MorphismCard(
                              padding: const EdgeInsets.all(13),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text((cc['body'] ?? '').toString(), maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700, color: c.textPrimary)),
                                  const SizedBox(height: 4),
                                  Text('In ${cc['community_name'] ?? 'Community'}', style: TextStyle(color: c.textSecondary, fontSize: 12)),
                                ],
                              ),
                            ),
                          ),
                        ),
                    ],
                    if (_ctrl.text.trim().length >= 2 &&
                        _people.isEmpty &&
                        _posts.isEmpty &&
                        _comments.isEmpty &&
                        _communities.isEmpty &&
                        _communityPosts.isEmpty &&
                        _communityComments.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 48),
                        child: Center(child: Text('No results found for "${_ctrl.text.trim()}"', style: TextStyle(color: c.textSecondary))),
                      ),
                  ],
                ),
    );
  }
}
