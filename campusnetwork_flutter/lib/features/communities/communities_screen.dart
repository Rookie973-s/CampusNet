import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';

const _kCategories = ['All', 'Campus Life', 'Tech & Innovation', 'Academics', 'Sports & Clubs', 'Faith & Culture', 'General'];

class CommunitiesScreen extends ConsumerStatefulWidget {
  const CommunitiesScreen({super.key});

  @override
  ConsumerState<CommunitiesScreen> createState() => _CommunitiesScreenState();
}

class _CommunitiesScreenState extends ConsumerState<CommunitiesScreen> {
  List<Map<String, dynamic>> _list = [];
  String _category = 'All';
  String _search = '';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final params = <String, dynamic>{'sort': 'popular'};
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
    final slug = comm['slug'].toString();
    final api = ref.read(apiClientProvider);
    try {
      if (comm['is_following'] == true) {
        await api.dio.delete('/communities/$slug/follow/');
      } else {
        await api.dio.post('/communities/$slug/follow/');
      }
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CNColors.bg,
      appBar: AppBar(title: const Text('Communities', style: TextStyle(fontWeight: FontWeight.w800))),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(14),
          children: [
            Row(
              children: [
                Expanded(
                  child: FacultyDropdown(
                    options: _kCategories.map((c) => DropdownOption(label: c, value: c)).toList(),
                    value: _category,
                    placeholder: 'All Categories',
                    icon: Icons.explore_outlined,
                    onChanged: (v) {
                      setState(() => _category = v);
                      _load();
                    },
                  ),
                ),
                const SizedBox(width: 10),
                MorphismSearchInput(
                  value: _search,
                  placeholder: 'Search...',
                  onChanged: (v) {
                    _search = v;
                    _load();
                  },
                ),
              ],
            ),
            const SizedBox(height: 14),
            if (_loading)
              const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))
            else
              for (final c in _list)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: MorphismCard(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        UserAvatar(
                          url: normalizeMediaUrl(c['avatar_url']?.toString()),
                          initials: (c['name'] ?? 'C').toString(),
                          size: 46,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text((c['name'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                              Text('${c['category']} · ${c['followers_count'] ?? 0} followers', style: const TextStyle(color: CNColors.textMuted, fontSize: 12)),
                            ],
                          ),
                        ),
                        LiquidTap(
                          onTap: () => _toggleFollow(c),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: c['is_following'] == true ? CNColors.surfaceHigh : CNColors.accent,
                              borderRadius: BorderRadius.circular(99),
                            ),
                            child: Text(
                              c['is_following'] == true ? 'Joined' : 'Follow',
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12.5),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}
