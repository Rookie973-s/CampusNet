import 'dart:io';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../../core/widgets/skeleton_widgets.dart';
import '../auth/auth_provider.dart';
import '../auth/landing_screen.dart';

const _kDefaultLevels = ['', '100', '200', '300', '400', '500'];

/// Academic PDF Library:
/// - Layered translucent stacked preview folder cards (LIBRARY ref)
/// - Class-Rep-Only "Upload PDF" button + full Upload a PDF modal (matching website ref)
///   supporting multiple PDFs per course & inline "+ Add a course"
/// - Detailed Document Card view (matching AI ML Certificate DRAFT ref) with metadata chips,
///   PDF security warnings banner, View/Download, and Class-Rep-Only Delete button.
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

  bool _canUpload = false;
  Map<String, dynamic>? _repScope;

  String _faculty = '';
  String _department = '';
  String _level = '';
  Map<String, dynamic>? _activeCourse;
  bool _loading = true;
  String? _error;

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
        api.dio
            .get('/library/permissions/')
            .catchError((_) => Response(requestOptions: RequestOptions(path: ''), data: {})),
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
      // Only 5 levels (100..500) — never show 600 level
      final rawLevels = (cat['levels'] as List? ?? [])
          .map((e) => e.toString())
          .where((lv) => lv != '600')
          .toList();

      _faculties = rawFacs;
      _departments = extractedDepts.isNotEmpty ? extractedDepts : topDepts;
      if (rawLevels.isNotEmpty) {
        _levels = ['', ...rawLevels];
      }
      final adRaw = res[1].data is List ? res[1].data as List : [];
      _ads = adRaw.whereType<Map>().map((e) => ServedAd.fromJson(Map<String, dynamic>.from(e))).toList();

      final perm = res[2].data is Map ? Map<String, dynamic>.from(res[2].data as Map) : {};
      _canUpload = perm['can_upload'] == true;
      _repScope = perm['scope'] is Map ? Map<String, dynamic>.from(perm['scope'] as Map) : null;
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

  Future<void> _fetchPdf(Map<String, dynamic> doc, {required bool openAfter}) async {
    final docId = (doc['id'] as num?)?.toInt();
    if (docId == null || _downloadProgress.containsKey(docId)) return;

    setState(() => _downloadProgress[docId] = 0.05);
    try {
      final api = ref.read(apiClientProvider);
      final dir = openAfter ? await getTemporaryDirectory() : await getApplicationDocumentsDirectory();
      final rawTitle = (doc['original_name'] ?? doc['title'] ?? 'document_$docId')
          .toString()
          .replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_');
      final fileName = rawTitle.toLowerCase().endsWith('.pdf') ? rawTitle : '$rawTitle.pdf';
      final savePath = '${dir.path}${Platform.pathSeparator}cenet_${docId}_$fileName';

      await api.dio.download(
        '/library/documents/$docId/file/',
        savePath,
        queryParameters: openAfter ? null : {'download': '1'},
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

      if (openAfter) {
        final result = await OpenFilex.open(savePath, type: 'application/pdf');
        if (result.type != ResultType.done && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(result.message.isNotEmpty ? result.message : 'Install a PDF viewer app to open this file.')),
          );
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Saved "$fileName" to your device.'),
            action: SnackBarAction(
              label: 'Open',
              onPressed: () => OpenFilex.open(savePath, type: 'application/pdf'),
            ),
          ),
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

  Future<void> _deleteDoc(Map<String, dynamic> doc) async {
    final docId = (doc['id'] as num?)?.toInt();
    if (docId == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete PDF?'),
        content: Text('Permanently delete "${doc['title']}" from the course folder?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text('Delete', style: TextStyle(color: ctx.cn.danger, fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(apiClientProvider).dio.delete('/library/documents/$docId/');
      if (mounted) {
        setState(() => _docs.removeWhere((d) => d['id'] == docId));
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Document deleted.')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    }
  }

  void _openUploadModal({int? preselectedCourseId}) {
    if (!_canUpload || _repScope == null) return;
    showModalBottomSheet<bool>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _UploadPdfSheet(
        scope: _repScope!,
        preselectedCourseId: preselectedCourseId,
      ),
    ).then((uploaded) {
      if (uploaded == true) {
        if (_activeCourse != null) {
          _openCourse(_activeCourse!);
        } else {
          _loadFolders();
        }
      }
    });
  }

  String _formatDate(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    final dt = DateTime.tryParse(iso);
    if (dt == null) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${dt.day} ${months[dt.month - 1]} ${dt.year}';
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
      onRefresh: _init,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 130),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('PDF Library', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                    Text(
                      'Course lecture notes, handouts & past questions',
                      style: TextStyle(color: cn.textMuted, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              if (_canUpload)
                LiquidTap(
                  onTap: () => _openUploadModal(),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0F172A),
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 10, offset: const Offset(0, 4))],
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.upload_rounded, size: 16, color: Colors.white),
                        SizedBox(width: 5),
                        Text('Upload PDF', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12.5)),
                      ],
                    ),
                  ),
                )
              else
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
          const SizedBox(height: 14),
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
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: context.isDark ? 0.25 : 0.05),
                          blurRadius: 8,
                          offset: const Offset(0, 3),
                        ),
                      ],
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
            const LibrarySkeletonGrid()
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
    final courseId = (folder['id'] as num?)?.toInt();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 130),
      children: [
        // Breadcrumb header matching Screenshot 3 ("< All folders / CS311 — Ai/ML")
        Row(
          children: [
            LiquidTap(
              onTap: () => setState(() {
                _activeCourse = null;
                _docs = [];
              }),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.chevron_left_rounded, size: 22, color: cn.accent),
                  Text('All folders', style: TextStyle(color: cn.accent, fontWeight: FontWeight.w800, fontSize: 15)),
                ],
              ),
            ),
            Text('  /  ', style: TextStyle(color: cn.textFaint, fontWeight: FontWeight.w600)),
            Expanded(
              child: Text(
                '${folder['code'] ?? ''} — ${folder['title'] ?? ''}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w900, color: cn.textPrimary),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Text(
              '${_docs.length} document${_docs.length == 1 ? '' : 's'}',
              style: TextStyle(color: cn.textMuted, fontSize: 13.5, fontWeight: FontWeight.w600),
            ),
            const Spacer(),
            if (_canUpload)
              LiquidTap(
                onTap: () => _openUploadModal(preselectedCourseId: courseId),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(color: const Color(0xFF0F172A), borderRadius: BorderRadius.circular(999)),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.add_rounded, size: 15, color: Colors.white),
                      SizedBox(width: 4),
                      Text('Add PDFs', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
                    ],
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 14),
        if (_loading)
          const FeedSkeletonList(count: 3)
        else if (_error != null)
          MorphismCard(child: Text(_error!, style: TextStyle(color: cn.danger)))
        else if (_docs.isEmpty)
          MorphismCard(
            child: Center(
              child: Text('No PDFs in this course yet.', style: TextStyle(color: cn.textMuted)),
            ),
          )
        else
          for (final doc in _docs) _buildRichDocCard(cn, doc),
      ],
    );
  }

  /// Detailed PDF Document Card matching Screenshot 3 ("AI ML Certificate DRAFT"):
  /// coral PDF badge, uploader/date/size, metadata pills, description, amber
  /// security warnings box, View/Download buttons, and Class-Rep-only Delete button!
  Widget _buildRichDocCard(CampusColors cn, Map<String, dynamic> doc) {
    final isDark = context.isDark;
    final docId = (doc['id'] as num?)?.toInt() ?? 0;
    final progress = _downloadProgress[docId];
    final sizeBytes = (doc['size_bytes'] ?? doc['file_size'] as num?)?.toInt() ?? 0;
    final sizeLabel = sizeBytes > 0
        ? (sizeBytes >= 1024 * 1024
            ? '${(sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB'
            : '${(sizeBytes / 1024).round()} KB')
        : 'PDF';
    final uploader = (doc['uploader'] ?? 'Class Rep').toString();
    final dateStr = _formatDate(doc['created_at']?.toString());
    final desc = (doc['description'] ?? '').toString().trim();
    final warnings = (doc['security_warnings'] as List? ?? []).map((e) => e.toString()).where((s) => s.isNotEmpty).toList();
    final flagged = doc['is_flagged'] == true || warnings.isNotEmpty;
    // Delete button ONLY shows for authorized class reps/admins (can_manage == true)
    final canDelete = doc['can_manage'] == true && _canUpload;

    final chips = [
      if ((doc['course_code'] ?? '').toString().isNotEmpty) doc['course_code'].toString(),
      if (doc['level'] != null) '${doc['level']} Level',
      if ((doc['faculty_name'] ?? '').toString().isNotEmpty) doc['faculty_name'].toString(),
      if ((doc['department_name'] ?? '').toString().isNotEmpty) doc['department_name'].toString(),
    ];

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: MorphismCard(
        padding: const EdgeInsets.all(18),
        radius: 24,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Coral-pink PDF badge box (Screenshot 3 style)
                Container(
                  width: 48,
                  height: 52,
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF3A1D24) : const Color(0xFFFDE2E4),
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFFDC2626).withValues(alpha: 0.14),
                        blurRadius: 8,
                        offset: const Offset(0, 3),
                      ),
                    ],
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    'PDF',
                    style: TextStyle(
                      color: isDark ? const Color(0xFFFCA5A5) : const Color(0xFFB91C1C),
                      fontWeight: FontWeight.w900,
                      fontSize: 13.5,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        (doc['title'] ?? 'Document').toString(),
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: cn.textPrimary, height: 1.25),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        [uploader, if (dateStr.isNotEmpty) dateStr, 'PDF', sizeLabel].join(' · '),
                        style: TextStyle(color: cn.textMuted, fontSize: 12.5),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (chips.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 7,
                runSpacing: 7,
                children: [
                  for (final label in chips)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
                      decoration: BoxDecoration(
                        color: cn.surfaceRecessed,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(label, style: TextStyle(color: cn.textPrimary, fontWeight: FontWeight.w600, fontSize: 12)),
                    ),
                ],
              ),
            ],
            if (desc.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(desc, style: TextStyle(color: cn.textPrimary, fontSize: 14, height: 1.4)),
            ],
            if (flagged) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(13),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF2B2110) : const Color(0xFFFEF7E6),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isDark ? const Color(0xFF92400E) : const Color(0xFFFCD34D),
                    width: 0.9,
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.warning_amber_rounded, size: 17, color: isDark ? const Color(0xFFFBBF24) : const Color(0xFFB45309)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        warnings.isNotEmpty
                            ? 'This PDF contains active or embedded elements (${warnings.join(', ')}). Scripts and launch actions are sandboxed and disabled on CampusNetwork, but exercise caution if opening externally.'
                            : 'This PDF has been flagged for embedded or active elements. Exercise caution when opening externally.',
                        style: TextStyle(
                          color: isDark ? const Color(0xFFFDE68A) : const Color(0xFF92400E),
                          fontSize: 12.5,
                          height: 1.45,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            if (progress != null) ...[
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 5,
                  backgroundColor: cn.surfaceRecessed,
                  valueColor: AlwaysStoppedAnimation(cn.accent),
                ),
              ),
            ],
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: LiquidTap(
                    onTap: progress != null ? null : () => _fetchPdf(doc, openAfter: true),
                    child: Container(
                      height: 44,
                      decoration: BoxDecoration(
                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.visibility_outlined, size: 17, color: isDark ? Colors.black : Colors.white),
                          const SizedBox(width: 6),
                          Text(
                            progress != null ? '${(progress * 100).round()}%' : 'View',
                            style: TextStyle(
                              color: isDark ? Colors.black : Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 13.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: LiquidTap(
                    onTap: progress != null ? null : () => _fetchPdf(doc, openAfter: false),
                    child: Container(
                      height: 44,
                      decoration: BoxDecoration(
                        color: cn.surfaceRecessed,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.download_rounded, size: 17, color: cn.textPrimary),
                          const SizedBox(width: 6),
                          Text(
                            'Download',
                            style: TextStyle(color: cn.textPrimary, fontWeight: FontWeight.w800, fontSize: 13.5),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                if (canDelete) ...[
                  const SizedBox(width: 10),
                  LiquidTap(
                    onTap: () => _deleteDoc(doc),
                    child: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: cn.dangerSoft,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(Icons.delete_outline_rounded, size: 20, color: cn.danger),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Class-Rep "Upload a PDF" Modal matching Screenshot 2 exactly:
/// - Locked scope badges (e.g. 500 Level · Sciences · Mathematics)
/// - Dashed dropzone supporting single or multiple PDF selection (up to 15 MB)
/// - Course dropdown + inline "+ Add a course"
/// - Title + Optional Description + Cancel / Upload PDF buttons
class _UploadPdfSheet extends ConsumerStatefulWidget {
  const _UploadPdfSheet({required this.scope, this.preselectedCourseId});
  final Map<String, dynamic> scope;
  final int? preselectedCourseId;

  @override
  ConsumerState<_UploadPdfSheet> createState() => _UploadPdfSheetState();
}

class _UploadPdfSheetState extends ConsumerState<_UploadPdfSheet> {
  List<Map<String, dynamic>> _courses = [];
  String _selectedCourseId = '';
  final List<PlatformFile> _pickedFiles = [];

  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  bool _showAddCourse = false;
  final _courseCodeCtrl = TextEditingController();
  final _courseTitleCtrl = TextEditingController();

  bool _loadingCourses = true;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.preselectedCourseId != null) {
      _selectedCourseId = widget.preselectedCourseId.toString();
    }
    _loadCourses();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    _courseCodeCtrl.dispose();
    _courseTitleCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadCourses() async {
    setState(() => _loadingCourses = true);
    try {
      final res = await ref.read(apiClientProvider).dio.get(
        '/library/courses/',
        queryParameters: {
          'level': widget.scope['level'],
          'department': widget.scope['department'],
        },
      );
      final raw = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
      if (mounted) {
        setState(() {
          _courses = raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
          if (_selectedCourseId.isEmpty && _courses.isNotEmpty) {
            _selectedCourseId = _courses.first['id'].toString();
          }
        });
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingCourses = false);
    }
  }

  Future<void> _pickPdfs() async {
    final res = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf'],
      allowMultiple: true,
    );
    if (res != null && res.files.isNotEmpty) {
      final valid = res.files.where((f) => f.path != null).toList();
      if (valid.isEmpty) return;
      setState(() {
        _pickedFiles.addAll(valid);
        if (_titleCtrl.text.trim().isEmpty && _pickedFiles.length == 1) {
          _titleCtrl.text = _pickedFiles.first.name.replaceAll(RegExp(r'\.pdf$', caseSensitive: false), '');
        }
      });
    }
  }

  Future<void> _createCourse() async {
    final code = _courseCodeCtrl.text.trim().toUpperCase();
    final title = _courseTitleCtrl.text.trim();
    if (code.isEmpty || title.isEmpty) {
      setState(() => _error = 'Enter both Course Code (e.g. CS311) and Course Title.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await ref.read(apiClientProvider).dio.post('/library/courses/', data: {
        'code': code,
        'title': title,
        'level': widget.scope['level'],
        'department': widget.scope['department'],
      });
      final created = Map<String, dynamic>.from(res.data as Map);
      setState(() {
        _courses = [..._courses, created];
        _selectedCourseId = created['id'].toString();
        _showAddCourse = false;
        _courseCodeCtrl.clear();
        _courseTitleCtrl.clear();
      });
    } catch (e) {
      setState(() => _error = parseApiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _uploadAll() async {
    if (_pickedFiles.isEmpty) {
      setState(() => _error = 'Tap the box above to select at least one PDF file.');
      return;
    }
    if (_selectedCourseId.isEmpty) {
      setState(() => _error = 'Select a course or tap "+ Add a course".');
      return;
    }
    if (_pickedFiles.length == 1 && _titleCtrl.text.trim().length < 3) {
      setState(() => _error = 'Enter a title (at least 3 characters).');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final api = ref.read(apiClientProvider);
      for (int i = 0; i < _pickedFiles.length; i++) {
        final f = _pickedFiles[i];
        final baseTitle = _pickedFiles.length == 1
            ? _titleCtrl.text.trim()
            : (_titleCtrl.text.trim().isNotEmpty
                ? '${_titleCtrl.text.trim()} (${i + 1})'
                : f.name.replaceAll(RegExp(r'\.pdf$', caseSensitive: false), ''));
        final safeTitle = baseTitle.length >= 3 ? baseTitle : '${baseTitle}_PDF';

        final form = FormData.fromMap({
          'course': _selectedCourseId,
          'title': safeTitle,
          'description': _descCtrl.text.trim(),
          'file': await MultipartFile.fromFile(f.path!, filename: f.name),
        });
        await api.dio.post('/library/documents/', data: form);
      }
      if (mounted) {
        Navigator.of(context).pop(true);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Uploaded ${_pickedFiles.length} PDF${_pickedFiles.length == 1 ? '' : 's'} to course folder!')),
        );
      }
    } catch (e) {
      setState(() => _error = parseApiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final isDark = context.isDark;
    final level = widget.scope['level'];
    final fac = (widget.scope['faculty_name'] ?? '').toString();
    final dept = (widget.scope['department_name'] ?? '').toString();

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.92),
        decoration: BoxDecoration(
          color: cn.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 26),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text('Upload a PDF', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                  ),
                  LiquidTap(
                    onTap: () => Navigator.of(context).pop(false),
                    child: Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(color: cn.surfaceRecessed, shape: BoxShape.circle),
                      child: Icon(Icons.close_rounded, size: 19, color: cn.textPrimary),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'PDF only, up to 15 MB. It appears in the folder of the course you choose.',
                style: TextStyle(color: cn.textMuted, fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 12),

              // Locked Class Rep scope pills (500 Level · Sciences · Mathematics)
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final pill in [
                    if (level != null) '$level Level',
                    if (fac.isNotEmpty) fac,
                    if (dept.isNotEmpty) dept,
                  ])
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: isDark ? cn.surfaceHigh : Colors.white,
                        borderRadius: BorderRadius.circular(999),
                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
                      ),
                      child: Text(pill, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: cn.textPrimary)),
                    ),
                ],
              ),
              const SizedBox(height: 16),

              if (_error != null)
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: cn.dangerSoft, borderRadius: BorderRadius.circular(12)),
                  child: Text(_error!, style: TextStyle(color: cn.danger, fontWeight: FontWeight.w700, fontSize: 13)),
                ),

              // Dashed drop/tap zone matching Screenshot 2
              LiquidTap(
                onTap: _pickPdfs,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
                  decoration: BoxDecoration(
                    color: cn.surfaceRecessed,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                      color: _pickedFiles.isNotEmpty ? cn.success : cn.borderBright,
                      width: 1.2,
                    ),
                  ),
                  child: Column(
                    children: [
                      Container(
                        width: 54,
                        height: 54,
                        decoration: BoxDecoration(
                          color: isDark ? cn.surfaceHigh : Colors.white,
                          shape: BoxShape.circle,
                          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 12, offset: const Offset(0, 4))],
                        ),
                        child: Icon(
                          _pickedFiles.isNotEmpty ? Icons.check_circle_rounded : Icons.upload_rounded,
                          color: _pickedFiles.isNotEmpty ? cn.success : cn.accent,
                          size: 26,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        _pickedFiles.isEmpty
                            ? 'Drop your PDF here'
                            : '${_pickedFiles.length} PDF${_pickedFiles.length == 1 ? '' : 's'} selected',
                        style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15.5, color: cn.textPrimary),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _pickedFiles.isEmpty
                            ? 'or tap to choose · PDF only · up to 15 MB (multiple allowed)'
                            : _pickedFiles.map((f) => f.name).join(', '),
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: cn.textMuted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              Text('Course *', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: cn.textPrimary)),
              const SizedBox(height: 6),
              if (_loadingCourses)
                const SkeletonBox(height: 46, radius: 14)
              else
                FacultyDropdown(
                  options: _courses
                      .map((c) => DropdownOption(label: '${c['code']} — ${c['title']}', value: c['id'].toString()))
                      .toList(),
                  value: _selectedCourseId,
                  placeholder: _courses.isEmpty ? 'No courses yet — add one below' : 'Select a course',
                  icon: Icons.folder_outlined,
                  onChanged: (v) => setState(() => _selectedCourseId = v),
                ),
              const SizedBox(height: 6),
              TextButton(
                style: TextButton.styleFrom(padding: EdgeInsets.zero),
                onPressed: () => setState(() => _showAddCourse = !_showAddCourse),
                child: Text(
                  _showAddCourse ? '− Hide add course' : '+ Add a course',
                  style: TextStyle(color: cn.accent, fontWeight: FontWeight.w800, fontSize: 13),
                ),
              ),
              if (_showAddCourse) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(color: cn.surfaceRecessed, borderRadius: BorderRadius.circular(14)),
                  child: Column(
                    children: [
                      TextField(controller: _courseCodeCtrl, decoration: const InputDecoration(hintText: 'Course Code (e.g. CS311)')),
                      const SizedBox(height: 8),
                      TextField(controller: _courseTitleCtrl, decoration: const InputDecoration(hintText: 'Course Title (e.g. Ai/ML)')),
                      const SizedBox(height: 10),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _busy ? null : _createCourse,
                          child: const Text('Save Course Folder'),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 6),
              Text('Title *', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: cn.textPrimary)),
              const SizedBox(height: 6),
              TextField(
                controller: _titleCtrl,
                decoration: const InputDecoration(hintText: 'e.g. BIO 111 Past Questions 2024'),
              ),
              const SizedBox(height: 12),
              Text('Description (optional)', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: cn.textPrimary)),
              const SizedBox(height: 6),
              TextField(
                controller: _descCtrl,
                maxLines: 3,
                decoration: const InputDecoration(hintText: "Session, lecturer, what's inside..."),
              ),
              const SizedBox(height: 20),

              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(false),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: LiquidTap(
                      onTap: _busy ? null : _uploadAll,
                      child: Container(
                        height: 48,
                        decoration: BoxDecoration(
                          color: isDark ? Colors.white : const Color(0xFF0F172A),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.upload_rounded, size: 18, color: isDark ? Colors.black : Colors.white),
                            const SizedBox(width: 6),
                            Text(
                              _busy ? 'Uploading...' : 'Upload PDF',
                              style: TextStyle(
                                color: isDark ? Colors.black : Colors.white,
                                fontWeight: FontWeight.w800,
                                fontSize: 14.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
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
                borderRadius: BorderRadius.circular(22),
                boxShadow: [
                  BoxShadow(
                    color: isDark ? Colors.black.withValues(alpha: 0.36) : tint.withValues(alpha: 0.14),
                    blurRadius: 16,
                    offset: const Offset(0, 7),
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
