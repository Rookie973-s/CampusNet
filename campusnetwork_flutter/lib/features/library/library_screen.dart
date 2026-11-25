import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../auth/auth_provider.dart';
import '../auth/landing_screen.dart';

const _kDefaultLevels = ['', '100', '200', '300', '400', '500'];

/// Academic PDF Library — redesigned per LIBRARY reference with layered
/// translucent stacked preview cards and authenticated local PDF viewing.
class LibraryScreen extends ConsumerStatefulWidget {
  const LibraryScreen({super.key});

  @override
  ConsumerState<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends ConsumerState<LibraryScreen> {
  List<Map<String, dynamic>> _faculties = [];
  List<Map<String, dynamic>> _departments = [];
  List<String> _levels = _kDefaultLevels;
  List<Map<String, dynamic>> _folders = [];
  List<Map<String, dynamic>> _docs = [];
  List<ServedAd> _ads = [];

  String _faculty = '';
  String _department = '';
  String _level = '';
  Map<String, dynamic>? _activeCourse;
  bool _loading = true;
  String? _error;

  // Per-document download progress (docId -> 0..1)
  final Map<int, double> _downloadProgress = {};

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
        api.dio
            .get('/ads/serve/', queryParameters: {'placement': 'library'})
            .catchError((_) => Response(requestOptions: RequestOptions(path: ''), data: [])),
      ]);
      final cat = Map<String, dynamic>.from(res[0].data as Map);
      final rawFacs = (cat['faculties'] as List? ?? [])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      final extractedDepts = <Map<String, dynamic>>[];
      for (final f in rawFacs) {
        final fId = f['id'];
        final nested = (f['departments'] as List? ?? [])
            .whereType<Map>()
            .map((e) => {...Map<String, dynamic>.from(e), 'faculty_id': fId});
        extractedDepts.addAll(nested);
      }
      final topDepts = (cat['departments'] as List? ?? [])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      final rawLevels = (cat['levels'] as List? ?? []).map((e) => e.toString()).toList();

      _faculties = rawFacs;
      _departments = extractedDepts.isNotEmpty ? extractedDepts : topDepts;
      if (rawLevels.isNotEmpty) {
        _levels = ['', ...rawLevels];
      }
      final adRaw = res[1].data is List ? res[1].data as List : [];
      _ads = adRaw.whereType<Map>().map((e) => ServedAd.fromJson(Map<String, dynamic>.from(e))).toList();
    } catch (_) {}
    await _loadFolders();
  }

  Future<void> _loadFolders() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      final params = <String, dynamic>{};
      if (_faculty.isNotEmpty) params['faculty'] = _faculty;
      if (_department.isNotEmpty) params['department'] = _department;
      if (_level.isNotEmpty) params['level'] = _level;
      final res = await api.dio.get('/library/folders/', queryParameters: params);
      final raw = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
      setState(() => _folders = raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList());
    } catch (e) {
      setState(() => _error = parseApiError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openCourse(Map<String, dynamic> folder) async {
    setState(() {
      _activeCourse = folder;
      _loading = true;
      _error = null;
    });
    try {
      final res = await ref.read(apiClientProvider).dio.get(
            '/library/documents/',
            queryParameters: {'course': folder['id']},
          );
      final raw = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
      setState(() => _docs = raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList());
    } catch (e) {
      setState(() => _error = parseApiError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openPdf(Map<String, dynamic> doc) async {
    final docId = (doc['id'] as num?)?.toInt();
    if (docId == null) return;
    if (_downloadProgress.containsKey(docId)) return;

    setState(() => _downloadProgress[docId] = 0.05);
    try {
      final api = ref.read(apiClientProvider);
      final dir = await getTemporaryDirectory();
      final rawTitle = (doc['original_name'] ?? doc['title'] ?? 'document_$docId')
          .toString()
          .replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_');
      final fileName = rawTitle.toLowerCase().endsWith('.pdf') ? rawTitle : '$rawTitle.pdf';
      final savePath = '${dir.path}${Platform.pathSeparator}cenet_pdf_${docId}_$fileName';

      // Stream via authenticated endpoint (never fails 401 like external browser)
      await api.dio.download(
        '/library/documents/$docId/file/',
        savePath,
        options: Options(responseType: ResponseType.bytes, followRedirects: true),
        onReceiveProgress: (received, total) {
          if (!mounted) return;
          if (total > 0) {
            setState(() => _downloadProgress[docId] = (received / total).clamp(0.05, 1.0));
          }
        },
      );

      final file = File(savePath);
      if (!await file.exists() || await file.length() == 0) {
        throw Exception('Downloaded PDF is empty.');
      }

      final result = await OpenFilex.open(savePath, type: 'application/pdf');
      if (result.type != ResultType.done && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result.message.isNotEmpty ? result.message : 'Install a PDF viewer app to open this file.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not open PDF: ${parseApiError(e)}')),
        );
      }
    } finally {
      if (mounted) setState(() => _downloadProgress.remove(docId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final user = ref.watch(authProvider.select((s) => s.user));

    if (user == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: MorphismCard(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.menu_book_rounded, size: 46, color: cn.accentLight),
                const SizedBox(height: 10),
                Text('Academic PDF Library', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                const SizedBox(height: 6),
                Text(
                  'Sign in to browse course folders and open lecture notes and past questions.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: cn.textMuted),
                ),
                const SizedBox(height: 16),
                ElevatedButton(onPressed: () => showAuthSheet(context), child: const Text('Sign In')),
              ],
            ),
          ),
        ),
      );
    }

    if (_activeCourse != null) {
      return _buildCourseDetail(context, cn);
    }

    final visibleDepts = _faculty.isEmpty
        ? _departments
        : _departments
            .where((d) => d['faculty']?.toString() == _faculty || d['faculty_id']?.toString() == _faculty)
            .toList();

    return RefreshIndicator(
      color: cn.accent,
      onRefresh: _loadFolders,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 130),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('PDF Library', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                    Text(
                      'Course lecture notes, handouts & past questions',
                      style: TextStyle(color: cn.textMuted, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(color: cn.accentSoft, borderRadius: BorderRadius.circular(999)),
                child: Text(
                  '${_folders.length} folders',
                  style: TextStyle(color: cn.accentLight, fontWeight: FontWeight.w800, fontSize: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FacultyDropdown(
                  options: [
                    const DropdownOption(label: 'All Faculties', value: ''),
                    ..._faculties.map((f) => DropdownOption(label: f['name'].toString(), value: f['id'].toString())),
                  ],
                  value: _faculty,
                  placeholder: 'All Faculties',
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
              itemCount: _levels.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final lv = _levels[i];
                final active = _level == lv;
                return LiquidTap(
                  onTap: () {
                    setState(() => _level = lv);
                    _loadFolders();
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                    decoration: BoxDecoration(
                      color: active ? cn.accentSoft : cn.surface,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: active ? cn.accent : cn.borderSubtle),
                    ),
                    child: Text(
                      lv.isEmpty ? 'All Levels' : '$lv Level',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 12.5,
                        color: active ? cn.accentLight : cn.textPrimary,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          if (_ads.isNotEmpty) ...[
            const SizedBox(height: 14),
            NativeAdCard(ad: _ads.first, placement: 'library'),
          ],
          const SizedBox(height: 16),
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(36), child: CircularProgressIndicator()))
          else if (_error != null)
            MorphismCard(
              child: Column(
                children: [
                  Text(_error!, style: TextStyle(color: cn.danger), textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  ElevatedButton(onPressed: _loadFolders, child: const Text('Retry')),
                ],
              ),
            )
          else if (_folders.isEmpty)
            MorphismCard(
              child: Column(
                children: [
                  Icon(Icons.folder_off_outlined, size: 36, color: cn.textFaint),
                  const SizedBox(height: 8),
                  Text('No course folders match these filters.', style: TextStyle(color: cn.textMuted)),
                ],
              ),
            )
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 16,
                crossAxisSpacing: 14,
                childAspectRatio: 0.88,
              ),
              itemCount: _folders.length,
              itemBuilder: (_, i) => _LayeredFolderCard(
                folder: _folders[i],
                index: i,
                onTap: () => _openCourse(_folders[i]),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildCourseDetail(BuildContext context, CampusColors cn) {
    final folder = _activeCourse!;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 130),
      children: [
        LiquidTap(
          onTap: () => setState(() {
            _activeCourse = null;
            _docs = [];
          }),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.arrow_back_ios_new_rounded, size: 16, color: cn.accentLight),
                const SizedBox(width: 6),
                Text('All Folders', style: TextStyle(color: cn.accentLight, fontWeight: FontWeight.w800, fontSize: 14)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        MorphismCard(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(color: cn.accentSoft, borderRadius: BorderRadius.circular(14)),
                child: Icon(Icons.folder_open_rounded, color: cn.accentLight, size: 26),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${folder['code'] ?? ''} · ${folder['level'] ?? ''}L',
                      style: TextStyle(color: cn.accentLight, fontWeight: FontWeight.w800, fontSize: 12),
                    ),
                    Text(
                      (folder['title'] ?? '').toString(),
                      style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: cn.textPrimary),
                    ),
                    Text(
                      (folder['department_name'] ?? 'Campus Library').toString(),
                      style: TextStyle(color: cn.textMuted, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        if (_loading)
          const Center(child: Padding(padding: EdgeInsets.all(28), child: CircularProgressIndicator()))
        else if (_error != null)
          MorphismCard(child: Text(_error!, style: TextStyle(color: cn.danger)))
        else if (_docs.isEmpty)
          MorphismCard(
            child: Center(
              child: Text('No PDFs in this course yet.', style: TextStyle(color: cn.textMuted)),
            ),
          )
        else
          for (final doc in _docs) _buildDocTile(cn, doc),
      ],
    );
  }

  Widget _buildDocTile(CampusColors cn, Map<String, dynamic> doc) {
    final docId = (doc['id'] as num?)?.toInt() ?? 0;
    final progress = _downloadProgress[docId];
    final sizeBytes = (doc['file_size'] as num?)?.toInt() ?? 0;
    final sizeLabel = sizeBytes > 0
        ? (sizeBytes > 1024 * 1024
            ? '${(sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB'
            : '${(sizeBytes / 1024).round()} KB')
        : 'PDF';

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: MorphismCard(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(color: cn.dangerSoft, borderRadius: BorderRadius.circular(12)),
                  child: Icon(Icons.picture_as_pdf_rounded, color: cn.danger),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        (doc['title'] ?? 'Document').toString(),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontWeight: FontWeight.w800, color: cn.textPrimary, fontSize: 14.5),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${doc['doc_type'] ?? 'Lecture Note'} · $sizeLabel',
                        style: TextStyle(color: cn.textMuted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                LiquidTap(
                  onTap: progress != null ? null : () => _openPdf(doc),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: progress != null ? cn.surfaceHigh : cn.accent,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      progress != null ? '${(progress * 100).round()}%' : 'Open PDF',
                      style: TextStyle(
                        color: progress != null ? cn.textPrimary : Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            if (progress != null) ...[
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 4,
                  backgroundColor: cn.surfaceRecessed,
                  valueColor: AlwaysStoppedAnimation(cn.accent),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Layered translucent stacked preview folder card matching the LIBRARY reference.
class _LayeredFolderCard extends StatelessWidget {
  const _LayeredFolderCard({
    required this.folder,
    required this.index,
    required this.onTap,
  });
  final Map<String, dynamic> folder;
  final int index;
  final VoidCallback onTap;

  static const _accents = [
    Color(0xFF1D9BF0),
    Color(0xFF22C55E),
    Color(0xFFF59E0B),
    Color(0xFFA855F7),
    Color(0xFFEC4899),
    Color(0xFF06B6D4),
  ];

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final isDark = context.isDark;
    final tint = _accents[index % _accents.length];
    final code = (folder['code'] ?? 'COURSE').toString();
    final title = (folder['title'] ?? '').toString();
    final level = (folder['level'] ?? '').toString();
    final count = (folder['document_count'] ?? folder['documents_count'] ?? 0);
    final previews = (folder['previews'] as List? ?? []).whereType<Map>().toList();

    return LiquidTap(
      onTap: onTap,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Back folder tab
          Positioned(
            top: 0,
            left: 10,
            child: Container(
              width: 72,
              height: 20,
              decoration: BoxDecoration(
                color: tint.withValues(alpha: isDark ? 0.32 : 0.20),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(10)),
              ),
            ),
          ),
          // Stacked preview paper sheet peeking out
          Positioned(
            top: 12,
            left: 12,
            right: 12,
            height: 46,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF242830) : Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: cn.borderSubtle),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: isDark ? 0.25 : 0.06),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Text(
                previews.isNotEmpty
                    ? (previews.first['title'] ?? 'Lecture PDF').toString()
                    : 'Course PDFs & Handouts',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: cn.textMuted),
              ),
            ),
          ),
          // Front translucent frosted folder pocket
          Positioned.fill(
            top: 34,
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    isDark
                        ? Color.alphaBlend(tint.withValues(alpha: 0.16), cn.surface)
                        : Color.alphaBlend(tint.withValues(alpha: 0.08), cn.surface),
                    cn.surface,
                  ],
                ),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: tint.withValues(alpha: isDark ? 0.35 : 0.28), width: 1.0),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: isDark ? 0.28 : 0.06),
                    blurRadius: 14,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: tint.withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          code,
                          style: TextStyle(color: tint, fontWeight: FontWeight.w900, fontSize: 11.5),
                        ),
                      ),
                      const Spacer(),
                      Text(
                        '${level}L',
                        style: TextStyle(color: cn.textFaint, fontWeight: FontWeight.w800, fontSize: 11),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Expanded(
                    child: Text(
                      title,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w800,
                        height: 1.25,
                        color: cn.textPrimary,
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(Icons.picture_as_pdf_rounded, size: 14, color: tint),
                      const SizedBox(width: 4),
                      Text(
                        '$count PDFs',
                        style: TextStyle(color: cn.textMuted, fontWeight: FontWeight.w700, fontSize: 12),
                      ),
                      const Spacer(),
                      Icon(Icons.arrow_forward_rounded, size: 15, color: cn.textFaint),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
