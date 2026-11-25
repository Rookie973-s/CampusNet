import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
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

    AppBottomSheet.show(
      context,
      builder: (sheetCtx) {
        final cn = sheetCtx.cn;
        return StatefulBuilder(
          builder: (ctx, setS) => Padding(
            padding: EdgeInsets.fromLTRB(20, 8, 20, MediaQuery.of(ctx).viewInsets.bottom + 24),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Create Community', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                  const SizedBox(height: 12),
                  TextField(
                    controller: nameCtrl,
                    decoration: const InputDecoration(labelText: 'Community Name', hintText: 'e.g. ATBU Robotics Club'),
                  ),
                  const SizedBox(height: 10),
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
                  const SizedBox(height: 10),
                  TextField(
                    controller: descCtrl,
                    maxLines: 3,
                    decoration: const InputDecoration(labelText: 'Description', hintText: 'What is this community about?'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: rulesCtrl,
                    maxLines: 2,
                    decoration: const InputDecoration(labelText: 'Community Rules (optional)'),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: busy
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
                      child: Text(busy ? 'Creating...' : 'Create Community'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
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
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
              decoration: BoxDecoration(
                color: cn.surface,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: cn.borderSubtle),
              ),
              child: Row(
                children: [
                  Icon(Icons.search_rounded, size: 19, color: cn.textMuted),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _searchCtrl,
                      onChanged: (v) {
                        _search = v;
                        _debounce?.cancel();
                        _debounce = Timer(const Duration(milliseconds: 280), _load);
                      },
                      style: TextStyle(color: cn.textPrimary, fontSize: 14.5),
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
            // Category pills
            SizedBox(
              height: 36,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
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
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                      decoration: BoxDecoration(
                        color: active ? cn.accent : cn.surface,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: active ? cn.accent : cn.borderSubtle),
                      ),
                      child: Text(
                        cat,
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
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
              const Center(child: Padding(padding: EdgeInsets.all(36), child: CircularProgressIndicator()))
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

  void _openPublishPost() {
    final titleCtrl = TextEditingController();
    final bodyCtrl = TextEditingController();
    bool important = false;
    bool busy = false;

    AppBottomSheet.show(
      context,
      builder: (sheetCtx) => StatefulBuilder(
        builder: (ctx, setS) => Padding(
          padding: EdgeInsets.fromLTRB(20, 8, 20, MediaQuery.of(ctx).viewInsets.bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Publish Announcement', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: ctx.cn.textPrimary)),
              const SizedBox(height: 12),
              TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: 'Title')),
              const SizedBox(height: 10),
              TextField(controller: bodyCtrl, maxLines: 4, decoration: const InputDecoration(labelText: 'Message')),
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Mark as Important'),
                value: important,
                onChanged: (v) => setS(() => important = v),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: busy
                      ? null
                      : () async {
                          if (bodyCtrl.text.trim().isEmpty) return;
                          setS(() => busy = true);
                          try {
                            await ref.read(apiClientProvider).dio.post(
                                  '/communities/${widget.slug}/posts/',
                                  data: {
                                    'title': titleCtrl.text.trim(),
                                    'body': bodyCtrl.text.trim(),
                                    'is_important': important,
                                  },
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
                  child: Text(busy ? 'Publishing...' : 'Publish'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final comm = _comm;
    final myRole = (comm?['my_role'] ?? '').toString();
    final canPublish = myRole == 'owner' || myRole == 'admin' || myRole == 'moderator';

    return Scaffold(
      backgroundColor: cn.bg,
      appBar: AppBar(
        title: Text((comm?['name'] ?? 'Community').toString(), style: TextStyle(fontWeight: FontWeight.w900, color: cn.textPrimary)),
        actions: [
          if (canPublish)
            IconButton(
              icon: Icon(Icons.edit_note_rounded, color: cn.accentLight),
              tooltip: 'Publish Post',
              onPressed: _openPublishPost,
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null || comm == null
              ? Center(child: Text(_error ?? 'Community not found', style: TextStyle(color: cn.danger)))
              : RefreshIndicator(
                  color: cn.accent,
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.only(bottom: 40),
                    children: [
                      // Header banner
                      Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              hexToColor((comm['accent_color'] ?? '#2563EB').toString()).withValues(alpha: 0.25),
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
                      const SizedBox(height: 8),
                      if (_posts.isEmpty)
                        Padding(
                          padding: const EdgeInsets.all(28),
                          child: Center(
                            child: Text('No posts in this community yet.', style: TextStyle(color: cn.textMuted)),
                          ),
                        )
                      else
                        for (final p in _posts)
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              border: Border(bottom: BorderSide(color: cn.divider, width: 0.6)),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(
                                      (p['author_name'] ?? 'Admin').toString(),
                                      style: TextStyle(fontWeight: FontWeight.w800, color: cn.textPrimary, fontSize: 14),
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      (p['created_at_human'] ?? '').toString(),
                                      style: TextStyle(color: cn.textFaint, fontSize: 12),
                                    ),
                                    const Spacer(),
                                    if (p['is_important'] == true)
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                        decoration: BoxDecoration(color: cn.goldSoft, borderRadius: BorderRadius.circular(999)),
                                        child: Text('Important', style: TextStyle(color: cn.gold, fontWeight: FontWeight.w800, fontSize: 11)),
                                      ),
                                  ],
                                ),
                                if ((p['title'] ?? '').toString().isNotEmpty) ...[
                                  const SizedBox(height: 6),
                                  Text(
                                    p['title'].toString(),
                                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: cn.textPrimary),
                                  ),
                                ],
                                const SizedBox(height: 4),
                                Text(
                                  (p['body'] ?? '').toString(),
                                  style: TextStyle(fontSize: 14.5, height: 1.45, color: cn.textPrimary),
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
