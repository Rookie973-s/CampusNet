import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../auth/auth_provider.dart';
import '../auth/landing_screen.dart';

const _kLevels = ['', '100', '200', '300', '400', '500'];

class LibraryScreen extends ConsumerStatefulWidget {
  const LibraryScreen({super.key});

  @override
  ConsumerState<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends ConsumerState<LibraryScreen> {
  List<Map<String, dynamic>> _faculties = [];
  List<Map<String, dynamic>> _departments = [];
  List<Map<String, dynamic>> _folders = [];
  List<Map<String, dynamic>> _docs = [];
  List<ServedAd> _ads = [];

  String _faculty = '';
  String _department = '';
  String _level = '';
  String _search = '';
  Map<String, dynamic>? _activeCourse;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final user = ref.read(authProvider).user;
    if (user == null) {
      setState(() => _loading = false);
      return;
    }
    final api = ref.read(apiClientProvider);
    try {
      final res = await Future.wait([
        api.dio.get('/library/catalog/'),
        api.dio.get('/ads/serve/', queryParameters: {'placement': 'library'}).catchError((_) => Response(requestOptions: RequestOptions(path: ''), data: [])),
      ]);
      final cat = Map<String, dynamic>.from(res[0].data as Map);
      _faculties = (cat['faculties'] as List? ?? []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
      _departments = (cat['departments'] as List? ?? []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
      final adRaw = res[1].data is List ? res[1].data as List : [];
      _ads = adRaw.whereType<Map>().map((e) => ServedAd.fromJson(Map<String, dynamic>.from(e))).toList();
    } catch (_) {}
    await _loadFolders();
  }

  Future<void> _loadFolders() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(apiClientProvider);
      final params = <String, dynamic>{};
      if (_faculty.isNotEmpty) params['faculty'] = _faculty;
      if (_department.isNotEmpty) params['department'] = _department;
      if (_level.isNotEmpty) params['level'] = _level;
      if (_search.trim().isNotEmpty) params['q'] = _search.trim();
      final res = await api.dio.get('/library/folders/', queryParameters: params);
      final raw = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
      setState(() => _folders = raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList());
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openCourse(Map<String, dynamic> folder) async {
    setState(() {
      _activeCourse = folder;
      _loading = true;
    });
    try {
      final res = await ref.read(apiClientProvider).dio.get('/library/documents/', queryParameters: {'course': folder['id']});
      final raw = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
      setState(() => _docs = raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList());
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider.select((s) => s.user));
    if (user == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: MorphismCard(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.menu_book_rounded, size: 46, color: CNColors.accentLight),
                const SizedBox(height: 10),
                const Text('Academic PDF Library', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                const SizedBox(height: 6),
                const Text('Sign in to access course PDFs, lecture notes, and past questions.', textAlign: TextAlign.center, style: TextStyle(color: CNColors.textMuted)),
                const SizedBox(height: 16),
                ElevatedButton(onPressed: () => showAuthSheet(context), child: const Text('Sign In')),
              ],
            ),
          ),
        ),
      );
    }

    if (_activeCourse != null) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 120),
        children: [
          LiquidTap(
            onTap: () => setState(() {
              _activeCourse = null;
              _docs = [];
            }),
            child: const Row(
              children: [
                Icon(Icons.arrow_back_rounded, size: 18, color: CNColors.accentLight),
                SizedBox(width: 6),
                Text('All Folders', style: TextStyle(color: CNColors.accentLight, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
          const SizedBox(height: 10),
          MorphismCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text((_activeCourse!['code'] ?? '').toString(), style: const TextStyle(color: CNColors.accentLight, fontWeight: FontWeight.w800, fontSize: 12)),
                Text((_activeCourse!['title'] ?? '').toString(), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
          else if (_docs.isEmpty)
            const MorphismCard(child: Center(child: Text('No PDFs in this course yet.', style: TextStyle(color: CNColors.textMuted))))
          else
            for (final doc in _docs)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: MorphismCard(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(color: CNColors.dangerSoft, borderRadius: BorderRadius.circular(12)),
                        child: const Icon(Icons.picture_as_pdf_rounded, color: CNColors.danger),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text((doc['title'] ?? 'Document').toString(), style: const TextStyle(fontWeight: FontWeight.w800)),
                            Text((doc['doc_type'] ?? 'Lecture Note').toString(), style: const TextStyle(color: CNColors.textMuted, fontSize: 12)),
                          ],
                        ),
                      ),
                      LiquidTap(
                        onTap: () {
                          final url = normalizeMediaUrl((doc['file_url'] ?? doc['file'])?.toString());
                          if (url != null) launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(color: CNColors.accent, borderRadius: BorderRadius.circular(99)),
                          child: const Text('Open PDF', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
        ],
      );
    }

    final visibleDepts = _faculty.isEmpty
        ? _departments
        : _departments.where((d) => d['faculty']?.toString() == _faculty || d['faculty_id']?.toString() == _faculty).toList();

    return RefreshIndicator(
      onRefresh: _loadFolders,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 120),
        children: [
          Row(
            children: [
              const Expanded(child: Text('PDF Library', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900))),
              MorphismSearchInput(
                value: _search,
                placeholder: 'Search MTH 111...',
                onChanged: (v) {
                  _search = v;
                  _loadFolders();
                },
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: FacultyDropdown(
                  options: [
                    const DropdownOption(label: 'All Faculties', value: ''),
                    ..._faculties.map((f) => DropdownOption(label: f['name'].toString(), value: f['id'].toString(), colorHex: f['color']?.toString())),
                  ],
                  value: _faculty,
                  onChanged: (v) {
                    setState(() {
                      _faculty = v;
                      _department = '';
                    });
                    _loadFolders();
                  },
                ),
              ),
              if (visibleDepts.isNotEmpty) ...[
                const SizedBox(width: 8),
                Expanded(
                  child: FacultyDropdown(
                    options: [
                      const DropdownOption(label: 'All Depts', value: ''),
                      ...visibleDepts.map((d) => DropdownOption(label: d['name'].toString(), value: d['id'].toString())),
                    ],
                    value: _department,
                    placeholder: 'All Depts',
                    icon: Icons.apartment_rounded,
                    onChanged: (v) {
                      setState(() => _department = v);
                      _loadFolders();
                    },
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 36,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _kLevels.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final lv = _kLevels[i];
                final active = _level == lv;
                return LiquidTap(
                  onTap: () {
                    setState(() => _level = lv);
                    _loadFolders();
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                    decoration: BoxDecoration(
                      color: active ? CNColors.accentSoft : CNColors.surface,
                      borderRadius: BorderRadius.circular(99),
                      border: Border.all(color: active ? CNColors.accent : CNColors.borderSubtle),
                    ),
                    child: Text(lv.isEmpty ? 'All Levels' : '$lv Level', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: active ? CNColors.accentLight : CNColors.textPrimary)),
                  ),
                );
              },
            ),
          ),
          if (_ads.isNotEmpty) ...[
            const SizedBox(height: 12),
            NativeAdCard(ad: _ads.first),
          ],
          const SizedBox(height: 12),
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(28), child: CircularProgressIndicator()))
          else if (_folders.isEmpty)
            const MorphismCard(child: Center(child: Text('No matching course folders', style: TextStyle(color: CNColors.textMuted))))
          else
            for (final f in _folders)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: LiquidTap(
                  onTap: () => _openCourse(f),
                  child: MorphismCard(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        Container(
                          width: 46,
                          height: 46,
                          decoration: BoxDecoration(color: CNColors.accentSoft, borderRadius: BorderRadius.circular(14)),
                          child: const Icon(Icons.folder_rounded, color: CNColors.accentLight),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text((f['code'] ?? '').toString(), style: const TextStyle(color: CNColors.accentLight, fontWeight: FontWeight.w800, fontSize: 12)),
                              Text((f['title'] ?? '').toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                              Text('${f['department_name'] ?? 'ATBU'} · ${f['level']}L · ${f['documents_count'] ?? 0} PDFs', style: const TextStyle(color: CNColors.textMuted, fontSize: 12)),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right_rounded, color: CNColors.textFaint),
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
