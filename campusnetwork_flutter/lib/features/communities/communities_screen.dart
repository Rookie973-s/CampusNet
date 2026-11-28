import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
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
import '../../core/theme/clay_system.dart';
import '../../core/widgets/form_templates.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../../core/widgets/rich_mention_text.dart';
import '../../core/widgets/skeleton_widgets.dart';
import '../auth/auth_provider.dart';
import '../auth/landing_screen.dart';

/// Exact categories matching Django `communities/models.py` Community.Category.
const kCommunityCategories = [
  'All',
  'Campus Life',
  'Academics',
  'Technology',
  'Sports',
  'Entertainment',
  'Arts and Culture',
  'Entrepreneurship',
  'Faculty and Departments',
  'Other Interests',
];

const _kSorts = [
  ('popular', 'Popular'),
  ('recent', 'Recently Active'),
  ('newest', 'Newest'),
];

/// Communities Discovery & My Communities screen (redesigned per COMMUNITIES ref).
class CommunitiesScreen extends ConsumerStatefulWidget {
  const CommunitiesScreen({super.key, this.mineOnly = false});
  final bool mineOnly;

  @override
  ConsumerState<CommunitiesScreen> createState() => _CommunitiesScreenState();
}

class _CommunitiesScreenState extends ConsumerState<CommunitiesScreen> {
  List<Map<String, dynamic>> _list = [];
  List<ServedAd> _ads = [];
  String _category = 'All';
  String _sort = 'popular';
  String _search = '';
  bool _loading = true;
  Timer? _debounce;
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
    _loadAds();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadAds() async {
    try {
      final res = await ref.read(apiClientProvider).dio.get(
            '/ads/serve/',
            queryParameters: {'placement': 'communities'},
          );
      final raw = res.data is List ? res.data as List : [];
      if (mounted) {
        setState(() => _ads = raw.whereType<Map>().map((e) => ServedAd.fromJson(Map<String, dynamic>.from(e))).toList());
      }
    } catch (_) {}
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final params = <String, dynamic>{'sort': _sort};
      if (widget.mineOnly) params['mine'] = '1';
      if (_category != 'All') params['category'] = _category;
      if (_search.trim().isNotEmpty) params['q'] = _search.trim();
      final res = await ref.read(apiClientProvider).dio.get('/communities/', queryParameters: params);
      final raw = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
      setState(() => _list = raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList());
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggleFollow(Map<String, dynamic> comm) async {
    if (ref.read(authProvider).user == null) {
      showAuthSheet(context);
      return;
    }
    HapticFeedback.lightImpact();
    final slug = comm['slug'].toString();
    final api = ref.read(apiClientProvider);
    try {
      final wasFollowing = comm['is_following'] == true;
      final res = wasFollowing
          ? await api.dio.delete('/communities/$slug/follow/')
          : await api.dio.post('/communities/$slug/follow/');
      final data = Map<String, dynamic>.from(res.data as Map);
      setState(() {
        comm['is_following'] = data['is_following'] ?? !wasFollowing;
        comm['followers_count'] = data['followers_count'] ?? comm['followers_count'];
      });
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    }
  }

  void _openCreateModal() {
    if (ref.read(authProvider).user == null) {
      showAuthSheet(context);
      return;
    }
    final nameCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final rulesCtrl = TextEditingController();
    String category = 'Campus Life';
    bool busy = false;

    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) => StatefulBuilder(
        builder: (ctx, setS) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
          child: CurvedGreenFormSheet(
            title: 'Create Community',
            subtitle: 'Start a campus hub for your club, department, or interest',
            headerHeight: 122,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SageInputField(
                  controller: nameCtrl,
                  hint: 'Community Name (e.g. ATBU Robotics Club)',
                  icon: Icons.groups_rounded,
                ),
                const SizedBox(height: 11),
                FacultyDropdown(
                  options: kCommunityCategories
                      .where((c) => c != 'All')
                      .map((c) => DropdownOption(label: c, value: c))
                      .toList(),
                  value: category,
                  placeholder: 'Category',
                  icon: Icons.category_outlined,
                  onChanged: (v) => setS(() => category = v),
                ),
                const SizedBox(height: 11),
                SageInputField(
                  controller: descCtrl,
                  hint: 'What is this community about?',
                  icon: Icons.description_outlined,
                  maxLines: 3,
                ),
                const SizedBox(height: 11),
                SageInputField(
                  controller: rulesCtrl,
                  hint: 'Community Rules (optional)',
                  icon: Icons.gavel_rounded,
                  maxLines: 2,
                ),
                const SizedBox(height: 18),
                ForestPillButton(
                  label: busy ? 'Creating...' : 'Create Community',
                  onTap: busy
                      ? null
                      : () async {
                          if (nameCtrl.text.trim().isEmpty || descCtrl.text.trim().isEmpty) return;
                          setS(() => busy = true);
                          try {
                            final res = await ref.read(apiClientProvider).dio.post('/communities/', data: {
                              'name': nameCtrl.text.trim(),
                              'description': descCtrl.text.trim(),
                              'category': category,
                              'rules': rulesCtrl.text.trim(),
                              'visibility': 'public',
                            });
                            final slug = res.data['slug']?.toString();
                            if (ctx.mounted) Navigator.of(ctx).pop();
                            _load();
                            if (slug != null && mounted) context.push('/community/$slug');
                          } catch (e) {
                            setS(() => busy = false);
                            if (mounted) {
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

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final featured = _list.isNotEmpty ? _list.first : null;

    return Scaffold(
      backgroundColor: cn.bg,
      appBar: AppBar(
        title: Text(
          widget.mineOnly ? 'My Communities' : 'Communities',
          style: TextStyle(fontWeight: FontWeight.w900, color: cn.textPrimary),
        ),
        actions: [
          if (!widget.mineOnly)
            TextButton.icon(
              onPressed: _openCreateModal,
              icon: Icon(Icons.add_circle_outline_rounded, size: 18, color: cn.accentLight),
              label: Text('Create', style: TextStyle(color: cn.accentLight, fontWeight: FontWeight.w800)),
            ),
        ],
      ),
      body: RefreshIndicator(
        color: cn.accent,
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
          children: [
            // Search input (COMMUNITIES reference)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: ClayDecorations.input(context, radius: 999),
              child: Row(
                children: [
                  ClayIconPill(icon: Icons.search_rounded, color: cn.accent, size: 30, iconSize: 16),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _searchCtrl,
                      onChanged: (v) {
                        _search = v;
                        _debounce?.cancel();
                        _debounce = Timer(const Duration(milliseconds: 280), _load);
                      },
                      style: TextStyle(color: cn.textPrimary, fontSize: 14.5, fontWeight: FontWeight.w600),
                      decoration: InputDecoration(
                        hintText: widget.mineOnly ? 'Filter your communities...' : 'Search communities...',
                        hintStyle: TextStyle(color: cn.textFaint, fontSize: 14),
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        filled: false,
                        isDense: true,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            // Category pills (generous height + Clip.none so Claymorphism shadows never clip!)
            SizedBox(
              height: 54,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                clipBehavior: Clip.none,
                padding: const EdgeInsets.symmetric(vertical: 7),
                itemCount: kCommunityCategories.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final cat = kCommunityCategories[i];
                  final active = _category == cat;
                  return LiquidTap(
                    onTap: () {
                      setState(() => _category = cat);
                      _load();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 8),
                      decoration: ClayDecorations.pill(context, active: active),
                      alignment: Alignment.center,
                      child: Text(
                        cat,
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 12.5,
                          color: active ? Colors.white : cn.textPrimary,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 10),
            // Sort row
            Row(
              children: [
                for (final s in _kSorts)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: LiquidTap(
                      onTap: () {
                        setState(() => _sort = s.$1);
                        _load();
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
                        decoration: BoxDecoration(
                          color: _sort == s.$1 ? cn.accentSoft : Colors.transparent,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: _sort == s.$1 ? cn.accent : cn.borderSubtle),
                        ),
                        child: Text(
                          s.$2,
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700,
                            color: _sort == s.$1 ? cn.accentLight : cn.textMuted,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            if (_loading)
              const CommunitiesSkeletonList()
            else if (_list.isEmpty)
              MorphismCard(
                child: Column(
                  children: [
                    Icon(Icons.groups_outlined, size: 38, color: cn.textFaint),
                    const SizedBox(height: 8),
                    Text(
                      widget.mineOnly
                          ? "You haven't joined any communities yet."
                          : 'No communities found for this filter.',
                      style: TextStyle(color: cn.textMuted),
                    ),
                    if (widget.mineOnly) ...[
                      const SizedBox(height: 10),
                      ElevatedButton(
                        onPressed: () => context.push('/communities'),
                        child: const Text('Explore Communities'),
                      ),
                    ],
                  ],
                ),
              )
            else ...[
              // Featured hero card when viewing all communities
              if (!widget.mineOnly && featured != null && _search.isEmpty) ...[
                _FeaturedCommunityCard(
                  comm: featured,
                  onTap: () => context.push('/community/${featured['slug']}'),
                  onToggleFollow: () => _toggleFollow(featured),
                ),
                const SizedBox(height: 16),
              ],
              if (_ads.isNotEmpty) ...[
                NativeAdCard(ad: _ads.first, placement: 'communities'),
                const SizedBox(height: 14),
              ],
              for (final c in _list)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: LiquidTap(
                    onTap: () => context.push('/community/${c['slug']}'),
                    child: MorphismCard(
                      padding: const EdgeInsets.all(14),
                      child: Row(
                        children: [
                          UserAvatar(
                            url: normalizeMediaUrl(c['avatar_url']?.toString()),
                            initials: (c['name'] ?? 'C').toString(),
                            bgHex: (c['accent_color'] ?? '#2563EB').toString(),
                            size: 48,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Flexible(
                                      child: Text(
                                        (c['name'] ?? '').toString(),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: cn.textPrimary),
                                      ),
                                    ),
                                    if (c['is_official'] == true) ...[
                                      const SizedBox(width: 4),
                                      Icon(Icons.verified_rounded, size: 15, color: cn.accent),
                                    ],
                                  ],
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '${c['category']} · ${c['followers_count'] ?? 0} members',
                                  style: TextStyle(color: cn.textMuted, fontSize: 12),
                                ),
                                if ((c['description'] ?? '').toString().isNotEmpty) ...[
                                  const SizedBox(height: 3),
                                  Text(
                                    c['description'].toString(),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(color: cn.textFaint, fontSize: 12),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          LiquidTap(
                            onTap: () => _toggleFollow(c),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                              decoration: BoxDecoration(
                                color: c['is_following'] == true ? cn.surfaceHigh : cn.accent,
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(color: c['is_following'] == true ? cn.borderSubtle : cn.accent),
                              ),
                              child: Text(
                                c['is_following'] == true ? 'Joined' : 'Join',
                                style: TextStyle(
                                  color: c['is_following'] == true ? cn.textPrimary : Colors.white,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12.5,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _FeaturedCommunityCard extends StatelessWidget {
  const _FeaturedCommunityCard({
    required this.comm,
    required this.onTap,
    required this.onToggleFollow,
  });
  final Map<String, dynamic> comm;
  final VoidCallback onTap;
  final VoidCallback onToggleFollow;

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final accent = hexToColor((comm['accent_color'] ?? '#2563EB').toString());
    final cover = normalizeMediaUrl(comm['cover_url']?.toString() ?? comm['cover_image']?.toString());

    return LiquidTap(
      onTap: onTap,
      child: Container(
        height: 176,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [accent.withValues(alpha: 0.85), const Color(0xFF0A0F1A)],
          ),
          border: Border.all(color: cn.borderSubtle),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (cover != null)
              CachedNetworkImage(imageUrl: cover, fit: BoxFit.cover, errorWidget: (_, __, ___) => const SizedBox()),
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.black.withValues(alpha: 0.20), Colors.black.withValues(alpha: 0.82)],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      comm['is_official'] == true ? 'Featured Official' : (comm['category'] ?? 'Community').toString(),
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 11),
                    ),
                  ),
                  const Spacer(),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              (comm['name'] ?? '').toString(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w900),
                            ),
                            Text(
                              '${comm['followers_count'] ?? 0} members · ${comm['posts_count'] ?? 0} posts',
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 12.5),
                            ),
                          ],
                        ),
                      ),
                      LiquidTap(
                        onTap: onToggleFollow,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          decoration: BoxDecoration(
                            color: comm['is_following'] == true ? Colors.white24 : Colors.white,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            comm['is_following'] == true ? 'Joined' : 'Join',
                            style: TextStyle(
                              color: comm['is_following'] == true ? Colors.white : Colors.black,
                              fontWeight: FontWeight.w900,
                              fontSize: 12.5,
                            ),
                          ),
                        ),
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
  }
}

/// Community Detail Screen: cover, join/leave, notification prefs, rules, posts, publish.
class CommunityDetailScreen extends ConsumerStatefulWidget {
  const CommunityDetailScreen({super.key, required this.slug});
  final String slug;

  @override
  ConsumerState<CommunityDetailScreen> createState() => _CommunityDetailScreenState();
}

class _CommunityDetailScreenState extends ConsumerState<CommunityDetailScreen> {
  Map<String, dynamic>? _comm;
  List<Map<String, dynamic>> _posts = [];
  bool _loading = true;
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
      final res = await Future.wait([
        api.dio.get('/communities/${widget.slug}/'),
        api.dio.get('/communities/${widget.slug}/posts/'),
      ]);
      final comm = Map<String, dynamic>.from(res[0].data as Map);
      final rawPosts = res[1].data is List ? res[1].data as List : (res[1].data['results'] as List? ?? []);
      setState(() {
        _comm = comm;
        _posts = rawPosts.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
      });
    } catch (e) {
      setState(() => _error = parseApiError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggleFollow() async {
    if (_comm == null) return;
    if (ref.read(authProvider).user == null) {
      showAuthSheet(context);
      return;
    }
    try {
      final api = ref.read(apiClientProvider);
      final was = _comm!['is_following'] == true;
      final res = was
          ? await api.dio.delete('/communities/${widget.slug}/follow/')
          : await api.dio.post('/communities/${widget.slug}/follow/');
      final d = Map<String, dynamic>.from(res.data as Map);
      setState(() {
        _comm!['is_following'] = d['is_following'] ?? !was;
        _comm!['followers_count'] = d['followers_count'] ?? _comm!['followers_count'];
      });
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    }
  }

  Future<void> _togglePostLike(Map<String, dynamic> post) async {
    if (ref.read(authProvider).user == null) {
      showAuthSheet(context);
      return;
    }
    final postId = (post['id'] as num?)?.toInt();
    if (postId == null) return;
    HapticFeedback.lightImpact();

    final wasLiked = post['liked'] == true;
    final prevLikes = (post['likes'] as num?)?.toInt() ?? 0;
    setState(() {
      post['liked'] = !wasLiked;
      post['likes'] = wasLiked ? (prevLikes - 1).clamp(0, 999999) : prevLikes + 1;
    });

    try {
      final res = await ref.read(apiClientProvider).dio.post('/community-posts/$postId/like/');
      if (mounted && res.data is Map) {
        setState(() {
          post['liked'] = res.data['liked'] == true;
          post['likes'] = (res.data['likes'] as num?)?.toInt() ?? post['likes'];
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          post['liked'] = wasLiked;
          post['likes'] = prevLikes;
        });
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
      }
    }
  }

  void _openPostComments(Map<String, dynamic> post) {
    final postId = (post['id'] as num?)?.toInt();
    if (postId == null) return;
    AppBottomSheet.show(
      context,
      builder: (_) => _CommunityPostCommentsSheet(
        postId: postId,
        postTitle: (post['title'] ?? '').toString().isNotEmpty
            ? post['title'].toString()
            : (post['body'] ?? 'Post Discussion').toString(),
        onCommentAdded: () {
          if (mounted) {
            setState(() {
              post['comments_count'] = ((post['comments_count'] as num?)?.toInt() ?? 0) + 1;
            });
          }
        },
      ),
    );
  }

  void _openPublishPost() {
    final titleCtrl = TextEditingController();
    final bodyCtrl = TextEditingController();
    XFile? pickedImage;
    bool important = false;
    bool busy = false;

    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) => StatefulBuilder(
        builder: (ctx, setS) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
          child: CurvedGreenFormSheet(
            title: 'Publish Post',
            subtitle: 'Share an announcement with community members',
            headerHeight: 118,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SageInputField(controller: titleCtrl, hint: 'Headline (optional)', icon: Icons.title_rounded),
                const SizedBox(height: 11),
                SageInputField(
                  controller: bodyCtrl,
                  hint: 'Write your announcement...',
                  icon: Icons.edit_note_rounded,
                  maxLines: 4,
                ),
                const SizedBox(height: 11),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(44),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  onPressed: busy
                      ? null
                      : () async {
                          final img = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85, maxWidth: 1400);
                          if (img != null) setS(() => pickedImage = img);
                        },
                  icon: Icon(pickedImage == null ? Icons.add_photo_alternate_outlined : Icons.check_circle_rounded, size: 19),
                  label: Text(
                    pickedImage == null ? 'Attach Photo (optional)' : 'Photo attached: ${pickedImage!.name}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(height: 6),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Mark as Important'),
                  value: important,
                  onChanged: (v) => setS(() => important = v),
                ),
                const SizedBox(height: 12),
                ForestPillButton(
                  label: busy ? 'Publishing...' : 'Publish Announcement',
                  onTap: busy
                      ? null
                      : () async {
                          if (bodyCtrl.text.trim().isEmpty && pickedImage == null) return;
                          setS(() => busy = true);
                          try {
                            final form = FormData();
                            form.fields.addAll([
                              MapEntry('title', titleCtrl.text.trim()),
                              MapEntry('body', bodyCtrl.text.trim()),
                              MapEntry('is_important', important ? 'true' : 'false'),
                            ]);
                            if (pickedImage != null) {
                              form.files.add(
                                MapEntry(
                                  'image',
                                  await MultipartFile.fromFile(pickedImage!.path, filename: pickedImage!.name),
                                ),
                              );
                            }
                            await ref.read(apiClientProvider).dio.post(
                                  '/communities/${widget.slug}/posts/',
                                  data: form,
                                );
                            if (ctx.mounted) Navigator.of(ctx).pop();
                            _load();
                          } catch (e) {
                            setS(() => busy = false);
                            if (mounted) {
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

  void _openEditCommunity() {
    final comm = _comm;
    if (comm == null) return;
    final descCtrl = TextEditingController(text: (comm['description'] ?? '').toString());
    final rulesCtrl = TextEditingController(text: (comm['rules'] ?? '').toString());
    XFile? avatarFile;
    XFile? coverFile;
    bool busy = false;

    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) => StatefulBuilder(
        builder: (ctx, setS) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
          child: CurvedGreenFormSheet(
            title: 'Manage Community',
            subtitle: 'Update profile picture, cover photo, bio & rules',
            headerHeight: 118,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                        onPressed: busy
                            ? null
                            : () async {
                                final f = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85, maxWidth: 600);
                                if (f != null) setS(() => avatarFile = f);
                              },
                        icon: Icon(avatarFile == null ? Icons.account_circle_outlined : Icons.check_circle_rounded, size: 18),
                        label: Text(avatarFile == null ? 'Avatar Photo' : 'Avatar Ready', maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                        onPressed: busy
                            ? null
                            : () async {
                                final f = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85, maxWidth: 1600);
                                if (f != null) setS(() => coverFile = f);
                              },
                        icon: Icon(coverFile == null ? Icons.panorama_outlined : Icons.check_circle_rounded, size: 18),
                        label: Text(coverFile == null ? 'Cover Photo' : 'Cover Ready', maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SageInputField(controller: descCtrl, hint: 'Community Bio / Description', icon: Icons.info_outline_rounded, maxLines: 3),
                const SizedBox(height: 11),
                SageInputField(controller: rulesCtrl, hint: 'Community Rules (optional)', icon: Icons.gavel_rounded, maxLines: 3),
                const SizedBox(height: 16),
                ForestPillButton(
                  label: busy ? 'Saving Changes...' : 'Save Community',
                  onTap: busy
                      ? null
                      : () async {
                          setS(() => busy = true);
                          try {
                            final oldAvatar = normalizeMediaUrl(comm['avatar_url']?.toString());
                            final oldCover = normalizeMediaUrl(comm['cover_url']?.toString());
                            final form = FormData();
                            form.fields.addAll([
                              MapEntry('description', descCtrl.text.trim()),
                              MapEntry('rules', rulesCtrl.text.trim()),
                            ]);
                            if (avatarFile != null) {
                              form.files.add(MapEntry('avatar', await MultipartFile.fromFile(avatarFile!.path, filename: avatarFile!.name)));
                            }
                            if (coverFile != null) {
                              form.files.add(MapEntry('cover_image', await MultipartFile.fromFile(coverFile!.path, filename: coverFile!.name)));
                            }
                            await ref.read(apiClientProvider).dio.patch('/communities/${widget.slug}/', data: form);
                            if (oldAvatar != null) await CachedNetworkImage.evictFromCache(oldAvatar);
                            if (oldCover != null) await CachedNetworkImage.evictFromCache(oldCover);
                            if (ctx.mounted) Navigator.of(ctx).pop();
                            await _load();
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Community updated!')));
                            }
                          } catch (e) {
                            setS(() => busy = false);
                            if (mounted) {
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

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final comm = _comm;
    final currentUserId = ref.watch(authProvider.select((s) => s.user?.id));
    final myRole = (comm?['my_role'] ?? '').toString();
    final canPublish = comm?['can_publish'] == true || myRole == 'owner' || myRole == 'admin' || myRole == 'moderator';
    final canManage = comm?['can_manage'] == true || myRole == 'owner' || myRole == 'admin';
    final accentColor = hexToColor((comm?['accent_color'] ?? '#2563EB').toString());
    final coverUrl = normalizeMediaUrl(comm?['cover_url']?.toString() ?? comm?['cover_image']?.toString());

    return Scaffold(
      backgroundColor: cn.bg,
      appBar: AppBar(
        title: Text((comm?['name'] ?? 'Community').toString(), style: TextStyle(fontWeight: FontWeight.w900, color: cn.textPrimary)),
        actions: [
          if (canManage)
            IconButton(
              icon: Icon(Icons.tune_rounded, color: cn.textPrimary),
              tooltip: 'Edit Community',
              onPressed: _openEditCommunity,
            ),
          if (canPublish)
            IconButton(
              icon: Icon(Icons.edit_note_rounded, color: cn.accentLight),
              tooltip: 'Publish Post',
              onPressed: _openPublishPost,
            ),
        ],
      ),
      body: _loading
          ? const Padding(padding: EdgeInsets.all(16), child: FeedSkeletonList(count: 3))
          : _error != null || comm == null
              ? Center(child: Text(_error ?? 'Community not found', style: TextStyle(color: cn.danger)))
              : RefreshIndicator(
                  color: cn.accent,
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.only(bottom: 48),
                    children: [
                      if (coverUrl != null && coverUrl.isNotEmpty)
                        SizedBox(
                          height: 136,
                          width: double.infinity,
                          child: CachedNetworkImage(
                            imageUrl: coverUrl,
                            fit: BoxFit.cover,
                            errorWidget: (_, __, ___) => const SizedBox.shrink(),
                          ),
                        ),
                      // Header banner
                      Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              accentColor.withValues(alpha: 0.25),
                              cn.surface,
                            ],
                          ),
                          border: Border(bottom: BorderSide(color: cn.divider, width: 0.6)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                UserAvatar(
                                  url: normalizeMediaUrl(comm['avatar_url']?.toString()),
                                  initials: (comm['name'] ?? 'C').toString(),
                                  bgHex: (comm['accent_color'] ?? '#2563EB').toString(),
                                  size: 56,
                                ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        (comm['name'] ?? '').toString(),
                                        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: cn.textPrimary),
                                      ),
                                      Text(
                                        '${comm['category']} · ${comm['followers_count'] ?? 0} members',
                                        style: TextStyle(color: cn.textMuted, fontSize: 13),
                                      ),
                                    ],
                                  ),
                                ),
                                LiquidTap(
                                  onTap: _toggleFollow,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                                    decoration: BoxDecoration(
                                      color: comm['is_following'] == true ? cn.surfaceHigh : cn.accent,
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: Text(
                                      comm['is_following'] == true ? 'Joined' : 'Join',
                                      style: TextStyle(
                                        color: comm['is_following'] == true ? cn.textPrimary : Colors.white,
                                        fontWeight: FontWeight.w800,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            if ((comm['description'] ?? '').toString().isNotEmpty) ...[
                              const SizedBox(height: 12),
                              Text(
                                comm['description'].toString(),
                                style: TextStyle(color: cn.textPrimary, fontSize: 14, height: 1.45),
                              ),
                            ],
                            if ((comm['rules'] ?? '').toString().isNotEmpty) ...[
                              const SizedBox(height: 10),
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: cn.surfaceRecessed,
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('Rules', style: TextStyle(color: cn.accentLight, fontWeight: FontWeight.w800, fontSize: 12)),
                                    const SizedBox(height: 4),
                                    Text(comm['rules'].toString(), style: TextStyle(color: cn.textMuted, fontSize: 12.5, height: 1.4)),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                      if (_posts.isEmpty)
                        Padding(
                          padding: const EdgeInsets.all(28),
                          child: Center(
                            child: Text('No posts in this community yet.', style: TextStyle(color: cn.textMuted)),
                          ),
                        )
                      else
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          child: Column(
                            children: [
                              for (final p in _posts)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 16),
                                  child: _ClayCommunityPostCard(
                                    post: p,
                                    accentColor: accentColor,
                                    currentUserId: currentUserId,
                                    onLike: () => _togglePostLike(p),
                                    onComment: () => _openPostComments(p),
                                  ),
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

/// Sculpted Claymorphism Card for Community Admin Announcements:
/// pillowy 26dp corners, soft 3D matte-clay gradient, outer depth shadow +
/// luminous top-left inner rim, plus Feed-style Like & Comment actions.
class _ClayCommunityPostCard extends StatelessWidget {
  const _ClayCommunityPostCard({
    required this.post,
    required this.accentColor,
    required this.currentUserId,
    required this.onLike,
    required this.onComment,
  });

  final Map<String, dynamic> post;
  final Color accentColor;
  final int? currentUserId;
  final VoidCallback onLike;
  final VoidCallback onComment;

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final isDark = context.isDark;
    final u = post['user'] is Map ? Map<String, dynamic>.from(post['user'] as Map) : const <String, dynamic>{};
    final authorId = (u['id'] as num?)?.toInt();
    final authorName = (u['name'] ?? post['author_name'] ?? 'Community Admin').toString();
    final authorUsername = (u['username'] ?? '').toString();
    final timeStr = (post['time'] ?? post['created_at_human'] ?? '').toString();
    final imageUrl = normalizeMediaUrl(post['image_url']?.toString());
    final liked = post['liked'] == true;
    final likes = (post['likes'] as num?)?.toInt() ?? 0;
    final commentsCount = (post['comments_count'] as num?)?.toInt() ?? 0;

    final baseTop = isDark
        ? Color.alphaBlend(accentColor.withValues(alpha: 0.14), const Color(0xFF1F242B))
        : Color.alphaBlend(accentColor.withValues(alpha: 0.09), const Color(0xFFFFFFFF));
    final baseBottom = isDark
        ? Color.alphaBlend(accentColor.withValues(alpha: 0.05), const Color(0xFF14171C))
        : Color.alphaBlend(accentColor.withValues(alpha: 0.04), const Color(0xFFF0F4F8));

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [baseTop, baseBottom],
        ),
        border: Border.all(
          color: isDark ? Colors.white.withValues(alpha: 0.10) : Colors.white.withValues(alpha: 0.90),
          width: 1.5,
        ),
        boxShadow: [
          // Soft clay drop shadow (bottom-right depth)
          BoxShadow(
            color: isDark
                ? Colors.black.withValues(alpha: 0.55)
                : accentColor.withValues(alpha: 0.14),
            blurRadius: 22,
            spreadRadius: -2,
            offset: const Offset(0, 12),
          ),
          // Soft ambient cushion shadow
          BoxShadow(
            color: isDark
                ? accentColor.withValues(alpha: 0.08)
                : Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Container(
        // Subtle inner clay specular rim
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24.5),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            stops: const [0.0, 0.25, 1.0],
            colors: [
              Colors.white.withValues(alpha: isDark ? 0.09 : 0.72),
              Colors.transparent,
              Colors.black.withValues(alpha: isDark ? 0.22 : 0.04),
            ],
          ),
        ),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: UserIdentity(
                    userId: authorId,
                    name: authorName,
                    username: authorUsername,
                    initials: (u['av'] ?? authorName).toString(),
                    bgHex: (u['bg'] ?? '#2563EB').toString(),
                    avatarUrl: normalizeMediaUrl(u['avatar_url']?.toString()),
                    verified: u['is_verified_student'] == true,
                    staff: u['staff'] == true,
                    subtitle: timeStr,
                    avatarSize: 38,
                    currentUserId: currentUserId,
                  ),
                ),
                if (post['is_important'] == true)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: cn.goldSoft,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      'Important',
                      style: TextStyle(color: cn.gold, fontWeight: FontWeight.w800, fontSize: 11),
                    ),
                  ),
              ],
            ),
            if ((post['title'] ?? '').toString().isNotEmpty) ...[
              const SizedBox(height: 12),
              RichMentionText(
                post['title'].toString(),
                style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w900, color: cn.textPrimary, height: 1.25),
              ),
            ],
            const SizedBox(height: 6),
            RichMentionText(
              (post['body'] ?? '').toString(),
              style: TextStyle(fontSize: 14.5, height: 1.5, color: cn.textPrimary),
            ),
            if (imageUrl != null) ...[
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(18),
                child: CachedNetworkImage(
                  imageUrl: imageUrl,
                  width: double.infinity,
                  height: 200,
                  fit: BoxFit.cover,
                  errorWidget: (_, __, ___) => const SizedBox.shrink(),
                ),
              ),
            ],
            const SizedBox(height: 14),
            // Tactile Claymorphism Like & Comment action pills (matching Feed interactions)
            Row(
              children: [
                LiquidTap(
                  onTap: onLike,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: liked
                          ? cn.dangerSoft
                          : (isDark ? Colors.white.withValues(alpha: 0.06) : Colors.white.withValues(alpha: 0.85)),
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: isDark ? 0.25 : 0.06),
                          blurRadius: 8,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                          size: 17,
                          color: liked ? cn.danger : cn.textMuted,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          '$likes',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: liked ? cn.danger : cn.textPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                LiquidTap(
                  onTap: onComment,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: isDark ? Colors.white.withValues(alpha: 0.06) : Colors.white.withValues(alpha: 0.85),
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: isDark ? 0.25 : 0.06),
                          blurRadius: 8,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.chat_bubble_outline_rounded, size: 16, color: cn.textMuted),
                        const SizedBox(width: 6),
                        Text(
                          '$commentsCount ${commentsCount == 1 ? 'Comment' : 'Comments'}',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: cn.textPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Interactive Threaded Comments Bottom Sheet for Community Posts
/// hitting GET/POST /api/community-posts/{id}/comments/.
class _CommunityPostCommentsSheet extends ConsumerStatefulWidget {
  const _CommunityPostCommentsSheet({
    required this.postId,
    required this.postTitle,
    required this.onCommentAdded,
  });

  final int postId;
  final String postTitle;
  final VoidCallback onCommentAdded;

  @override
  ConsumerState<_CommunityPostCommentsSheet> createState() => _CommunityPostCommentsSheetState();
}

class _CommunityPostCommentsSheetState extends ConsumerState<_CommunityPostCommentsSheet> {
  List<Map<String, dynamic>> _comments = [];
  bool _loading = true;
  bool _sending = false;
  Map<String, dynamic>? _replyTo;
  final _ctrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadComments();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _loadComments() async {
    setState(() => _loading = true);
    try {
      final res = await ref.read(apiClientProvider).dio.get('/community-posts/${widget.postId}/comments/');
      final raw = res.data is List ? res.data as List : (res.data is Map ? (res.data['results'] as List? ?? []) : const []);
      if (mounted) {
        setState(() => _comments = raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList());
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _send() async {
    if (ref.read(authProvider).user == null) {
      showAuthSheet(context);
      return;
    }
    final text = _ctrl.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await ref.read(apiClientProvider).dio.post(
        '/community-posts/${widget.postId}/comments/',
        data: {
          'body': text,
          if (_replyTo != null) 'parent': _replyTo!['id'],
        },
      );
      _ctrl.clear();
      setState(() => _replyTo = null);
      widget.onCommentAdded();
      await _loadComments();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final currentUserId = ref.watch(authProvider.select((s) => s.user?.id));

    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.78,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 12, 12, 10),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Comments', style: TextStyle(fontSize: 17.5, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                      Text(
                        widget.postTitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: cn.textMuted),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: Icon(Icons.close_rounded, color: cn.textMuted),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: cn.divider),
          Expanded(
            child: _loading
                ? const Padding(padding: EdgeInsets.all(16), child: CommentsSkeletonList())
                : _comments.isEmpty
                    ? Center(child: Text('No comments yet. Be the first to comment!', style: TextStyle(color: cn.textMuted)))
                    : ListView.builder(
                        padding: const EdgeInsets.all(14),
                        itemCount: _comments.length,
                        itemBuilder: (_, i) => _buildThread(cn, _comments[i], currentUserId),
                      ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 14),
            decoration: BoxDecoration(
              color: cn.surface,
              border: Border(top: BorderSide(color: cn.divider, width: 0.6)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_replyTo != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Replying to ${(_replyTo!['user'] is Map ? _replyTo!['user']['name'] : 'member') ?? 'member'}',
                            style: TextStyle(color: cn.accent, fontSize: 12, fontWeight: FontWeight.w700),
                          ),
                        ),
                        GestureDetector(
                          onTap: () => setState(() => _replyTo = null),
                          child: Icon(Icons.close_rounded, size: 17, color: cn.textMuted),
                        ),
                      ],
                    ),
                  ),
                Row(
                  children: [
                    Expanded(
                      child: ClayTextField(
                        controller: _ctrl,
                        hint: _replyTo != null ? 'Write a reply...' : 'Add a comment...',
                        prefixIcon: Icons.chat_bubble_outline_rounded,
                        radius: 22,
                      ),
                    ),
                    const SizedBox(width: 8),
                    LiquidTap(
                      onTap: _sending ? null : _send,
                      child: Container(
                        width: 48,
                        height: 48,
                        decoration: ClayDecorations.button(context, color: cn.accent, radius: 18, disabled: _sending),
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

  Widget _buildThread(CampusColors cn, Map<String, dynamic> node, int? currentUserId) {
    final replies = (node['replies'] as List? ?? [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildCommentItem(cn, node, avatarSize: 34, connectAbove: false, connectBelow: false, currentUserId: currentUserId),
          if (replies.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 34, top: 6),
              child: Column(
                children: [
                  for (int i = 0; i < replies.length; i++)
                    _buildCommentItem(
                      cn,
                      replies[i],
                      avatarSize: 30,
                      connectAbove: i > 0,
                      connectBelow: i < replies.length - 1,
                      currentUserId: currentUserId,
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildCommentItem(
    CampusColors cn,
    Map<String, dynamic> raw, {
    required double avatarSize,
    required bool connectAbove,
    required bool connectBelow,
    required int? currentUserId,
  }) {
    final u = raw['user'] is Map ? Map<String, dynamic>.from(raw['user'] as Map) : const <String, dynamic>{};
    final uid = (u['id'] as num?)?.toInt();

    void openUser() {
      if (uid == null) return;
      Navigator.of(context).pop();
      if (currentUserId != null && uid == currentUserId) {
        context.go('/me');
      } else {
        context.push('/user/$uid');
      }
    }

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: avatarSize,
            child: Column(
              children: [
                if (connectAbove) Container(width: 2, height: 6, color: cn.divider),
                GestureDetector(
                  onTap: openUser,
                  child: UserAvatar(
                    url: normalizeMediaUrl(u['avatar_url']?.toString()),
                    initials: (u['av'] ?? '?').toString(),
                    bgHex: (u['bg'] ?? '#2563EB').toString(),
                    size: avatarSize,
                  ),
                ),
                if (connectBelow)
                  Expanded(
                    child: Container(width: 2, margin: const EdgeInsets.only(top: 4), color: cn.divider),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(top: connectAbove ? 4 : 0, bottom: 10),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: cn.surfaceRecessed,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: cn.divider, width: 0.6),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: GestureDetector(
                            onTap: openUser,
                            child: Text(
                              (u['name'] ?? 'Member').toString(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: cn.textPrimary),
                            ),
                          ),
                        ),
                        BadgeRow(verified: u['is_verified_student'] == true, staff: u['staff'] == true, size: 13),
                        const SizedBox(width: 6),
                        Text((raw['time'] ?? '').toString(), style: TextStyle(color: cn.textFaint, fontSize: 11)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text((raw['body'] ?? '').toString(), style: TextStyle(fontSize: 13.5, height: 1.4, color: cn.textPrimary)),
                    const SizedBox(height: 6),
                    GestureDetector(
                      onTap: () => setState(() => _replyTo = raw),
                      child: Text('Reply', style: TextStyle(color: cn.accent, fontSize: 11.5, fontWeight: FontWeight.w800)),
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
