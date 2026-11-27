import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/clay_system.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../auth/auth_provider.dart';
import 'feed_screen.dart';

Future<void> showAskNetworkModal(BuildContext context) {
  return showModalBottomSheet(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _AskNetworkSheet(),
  );
}

Future<void> showCreatePollModal(BuildContext context) {
  return showModalBottomSheet(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _CreatePollSheet(),
  );
}

/// Subtle jotter-notebook ruled lines background for the post composer (POST ref).
class _JotterLinesPainter extends CustomPainter {
  _JotterLinesPainter({required this.lineColor});
  final Color lineColor;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = lineColor
      ..strokeWidth = 0.8;
    const step = 26.0;
    for (double y = step; y < size.height; y += step) {
      canvas.drawLine(Offset(10, y), Offset(size.width - 10, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _JotterLinesPainter old) => old.lineColor != lineColor;
}

class _AskNetworkSheet extends ConsumerStatefulWidget {
  const _AskNetworkSheet();

  @override
  ConsumerState<_AskNetworkSheet> createState() => _AskNetworkSheetState();
}

class _AskNetworkSheetState extends ConsumerState<_AskNetworkSheet> {
  final _title = TextEditingController();
  final _body = TextEditingController();
  final _tags = TextEditingController();
  String _deptId = '';
  final List<XFile> _images = [];
  XFile? _video;
  bool _busy = false;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    _tags.dispose();
    super.dispose();
  }

  int get _words {
    final t = _body.text.trim();
    return t.isEmpty ? 0 : t.split(RegExp(r'\s+')).length;
  }

  void _insert(String token) {
    setState(() {
      _body.text = '${_body.text}$token';
      _body.selection = TextSelection.fromPosition(TextPosition(offset: _body.text.length));
    });
  }

  Future<void> _pickImages(int maxCount) async {
    final picker = ImagePicker();
    if (maxCount == 1) {
      final f = await picker.pickImage(source: ImageSource.gallery, imageQuality: 82);
      if (f != null) setState(() => _images..clear()..add(f));
    } else {
      final list = await picker.pickMultiImage(imageQuality: 82, limit: maxCount);
      if (list.isNotEmpty) {
        setState(() {
          _video = null;
          _images.addAll(list);
          if (_images.length > maxCount) _images.removeRange(maxCount, _images.length);
        });
      }
    }
  }

  Future<void> _pickVideo(bool isVerified) async {
    if (!isVerified) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Only Verified Students & SUG officials can upload videos.')),
      );
      return;
    }
    final f = await ImagePicker().pickVideo(source: ImageSource.gallery);
    if (f != null) {
      setState(() {
        _images.clear();
        _video = f;
      });
    }
  }

  Future<void> _submit(List<DepartmentItem> depts, int wordLimit) async {
    final cleanBody = _body.text.trim();
    final cleanTitle = _title.text.trim().isNotEmpty
        ? _title.text.trim()
        : (cleanBody.length > 70 ? cleanBody.substring(0, 70) : cleanBody);
    if (cleanTitle.isEmpty) return;
    if (_words > wordLimit) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Exceeds your $wordLimit-word limit.')));
      return;
    }

    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      final form = FormData();
      form.fields.add(MapEntry('title', cleanTitle));
      form.fields.add(MapEntry('body', cleanBody.isNotEmpty ? cleanBody : cleanTitle));
      if (_deptId.isNotEmpty) form.fields.add(MapEntry('department', _deptId));
      for (final t in _tags.text.split(',').map((e) => e.trim().replaceFirst('#', '')).where((e) => e.isNotEmpty).take(5)) {
        form.fields.add(MapEntry('tags', t));
      }
      for (final img in _images) {
        form.files.add(MapEntry('images', await MultipartFile.fromFile(img.path, filename: img.name)));
      }
      if (_video != null) {
        form.files.add(MapEntry('video', await MultipartFile.fromFile(_video!.path, filename: _video!.name)));
      }

      final res = await api.dio.post('/questions/', data: form);
      final created = QuestionItem.fromJson(Map<String, dynamic>.from(res.data as Map));
      ref.read(feedProvider.notifier).prependQuestion(created);
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Posted to CampusNetwork!')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final user = ref.watch(authProvider.select((s) => s.user));
    final depts = ref.watch(departmentsProvider).valueOrNull ?? const <DepartmentItem>[];
    final isVerified = (user?.isVerifiedStudent ?? false) || (user?.isVerifiedStaff ?? false);
    final wordLimit = isVerified ? 1200 : 300;
    final maxImages = isVerified ? 6 : 1;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.92),
        decoration: ClayDecorations.modal(context),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 26),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(color: cn.divider, borderRadius: BorderRadius.circular(99)),
                ),
              ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ClayIconPill(icon: Icons.menu_book_rounded, color: cn.accent, size: 44),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Ask the Network', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                        Text(
                          'Write your question. Add photos or a short video if it helps. (Limit: $wordLimit words)',
                          style: TextStyle(color: cn.textMuted, fontSize: 12.5, height: 1.4),
                        ),
                      ],
                    ),
                  ),
                  IconButton(icon: Icon(Icons.close_rounded, color: cn.textMuted), onPressed: () => Navigator.of(context).pop()),
                ],
              ),
              const SizedBox(height: 16),
              Text('Headline (optional)', style: TextStyle(color: cn.textMuted, fontWeight: FontWeight.w700, fontSize: 12.5)),
              const SizedBox(height: 6),
              _InputBox(controller: _title, hint: 'Short summary of your question or post...', icon: Icons.title_rounded),
              const SizedBox(height: 12),
              Text('Your question', style: TextStyle(color: cn.textMuted, fontWeight: FontWeight.w700, fontSize: 12.5)),
              const SizedBox(height: 6),
              // Subtle jotter-lined claymorphism writing area
              Container(
                decoration: ClayDecorations.input(context, radius: 20),
                clipBehavior: Clip.antiAlias,
                child: CustomPaint(
                  painter: _JotterLinesPainter(
                    lineColor: cn.borderSubtle.withValues(alpha: context.isDark ? 0.40 : 0.55),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    child: TextField(
                      controller: _body,
                      maxLines: 6,
                      onChanged: (_) => setState(() {}),
                      style: TextStyle(fontSize: 15, height: 1.72, color: cn.textPrimary),
                      decoration: InputDecoration(
                        hintText: 'Write your post... Use Bold, Italic, Underline, or @mention classmates',
                        hintStyle: TextStyle(color: cn.textFaint, fontSize: 13.5),
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        filled: false,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: ClayDecorations.recessed(context, radius: 14),
                child: Row(
                  children: [
                    _FmtBtn(label: 'B', bold: true, onTap: () => _insert(' **bold** ')),
                    _FmtBtn(label: 'I', italic: true, onTap: () => _insert(' _italic_ ')),
                    _FmtBtn(label: 'U', underline: true, onTap: () => _insert(' __underline__ ')),
                    _FmtBtn(label: '😊', onTap: () => _insert(' 😊 ')),
                    _FmtBtn(label: '@', onTap: () => _insert(' @')),
                    const Spacer(),
                    Text(
                      '$_words/$wordLimit words',
                      style: TextStyle(
                        color: _words > wordLimit ? cn.danger : cn.textFaint,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: LiquidTap(
                      onTap: () => _pickImages(maxImages),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: ClayDecorations.pill(context),
                        alignment: Alignment.center,
                        child: Text(
                          'Add photos ${_images.length}/$maxImages',
                          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: cn.textPrimary),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: LiquidTap(
                      onTap: () => _pickVideo(isVerified),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: ClayDecorations.pill(context),
                        alignment: Alignment.center,
                        child: Text(
                          _video != null ? 'Video Ready ✓' : (isVerified ? 'Add video' : 'Video (Verified)'),
                          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: cn.textPrimary),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              FacultyDropdown(
                options: [
                  const DropdownOption(label: 'All Faculties', value: ''),
                  ...depts.map((d) => DropdownOption(label: d.name, value: d.id.toString(), colorHex: d.color)),
                ],
                value: _deptId,
                onChanged: (v) => setState(() => _deptId = v),
                placeholder: 'All Faculties',
              ),
              const SizedBox(height: 10),
              _InputBox(controller: _tags, hint: 'Tags (e.g. MTH201, exams)', icon: Icons.tag_rounded),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: LiquidTap(
                      onTap: () => Navigator.of(context).pop(),
                      child: Container(
                        height: 50,
                        decoration: ClayDecorations.pill(context),
                        alignment: Alignment.center,
                        child: Text('Cancel', style: TextStyle(fontWeight: FontWeight.w800, color: cn.textPrimary)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ClayButton(
                      label: _busy ? 'Posting...' : 'Post',
                      busy: _busy,
                      onTap: _busy ? null : () => _submit(depts, wordLimit),
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

class _CreatePollSheet extends ConsumerStatefulWidget {
  const _CreatePollSheet();

  @override
  ConsumerState<_CreatePollSheet> createState() => _CreatePollSheetState();
}

class _CreatePollSheetState extends ConsumerState<_CreatePollSheet> {
  final _question = TextEditingController();
  final List<TextEditingController> _opts = [
    TextEditingController(text: 'Yes'),
    TextEditingController(text: 'No'),
    TextEditingController(),
  ];
  String _deptId = '';
  bool _busy = false;

  @override
  void dispose() {
    _question.dispose();
    for (final c in _opts) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit(List<DepartmentItem> depts) async {
    final q = _question.text.trim();
    final choices = _opts.map((c) => c.text.trim()).where((s) => s.isNotEmpty).toList();
    if (q.isEmpty || choices.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a poll question and at least 2 options.')),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      final chosenDept = _deptId.isNotEmpty ? int.tryParse(_deptId) : null;
      final res = await api.dio.post('/questions/', data: {
        'title': q,
        'body': q,
        if (chosenDept != null) 'department': chosenDept,
        'poll_options': choices,
      });
      final created = QuestionItem.fromJson(Map<String, dynamic>.from(res.data as Map));
      ref.read(feedProvider.notifier).prependQuestion(created);
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Poll published!')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final depts = ref.watch(departmentsProvider).valueOrNull ?? const <DepartmentItem>[];
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.88),
        decoration: ClayDecorations.modal(context),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 26),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(color: cn.divider, borderRadius: BorderRadius.circular(99)),
                ),
              ),
              Row(
                children: [
                  ClayIconPill(icon: Icons.bar_chart_rounded, color: cn.success, size: 42),
                  const SizedBox(width: 12),
                  Expanded(child: Text('Create a Poll', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: cn.textPrimary))),
                  IconButton(icon: Icon(Icons.close_rounded, color: cn.textMuted), onPressed: () => Navigator.of(context).pop()),
                ],
              ),
              const SizedBox(height: 14),
              _InputBox(controller: _question, hint: 'e.g. Should we write tests today?', icon: Icons.help_outline_rounded),
              const SizedBox(height: 12),
              Text('Poll Options (2–6)', style: TextStyle(color: cn.textMuted, fontWeight: FontWeight.w700, fontSize: 12.5)),
              const SizedBox(height: 6),
              for (int i = 0; i < _opts.length; i++)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Expanded(child: _InputBox(controller: _opts[i], hint: 'Option ${i + 1}')),
                      if (_opts.length > 2)
                        IconButton(
                          icon: Icon(Icons.delete_outline_rounded, color: cn.danger, size: 20),
                          onPressed: () => setState(() => _opts.removeAt(i).dispose()),
                        ),
                    ],
                  ),
                ),
              if (_opts.length < 6)
                TextButton.icon(
                  onPressed: () => setState(() => _opts.add(TextEditingController())),
                  icon: const Icon(Icons.add_circle_outline, size: 18),
                  label: const Text('Add option'),
                ),
              const SizedBox(height: 8),
              FacultyDropdown(
                options: [
                  const DropdownOption(label: 'All Faculties', value: ''),
                  ...depts.map((d) => DropdownOption(label: d.name, value: d.id.toString(), colorHex: d.color)),
                ],
                value: _deptId,
                onChanged: (v) => setState(() => _deptId = v),
                placeholder: 'All Faculties',
              ),
              const SizedBox(height: 16),
              ClayButton(
                label: _busy ? 'Publishing...' : 'Publish Poll',
                busy: _busy,
                color: cn.success,
                onTap: _busy ? null : () => _submit(depts),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InputBox extends StatelessWidget {
  const _InputBox({required this.controller, required this.hint, this.icon});
  final TextEditingController controller;
  final String hint;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return ClayTextField(
      controller: controller,
      hint: hint,
      prefixIcon: icon,
    );
  }
}

class _FmtBtn extends StatelessWidget {
  const _FmtBtn({required this.label, required this.onTap, this.bold = false, this.italic = false, this.underline = false});
  final String label;
  final VoidCallback onTap;
  final bool bold;
  final bool italic;
  final bool underline;

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    return Padding(
      padding: const EdgeInsets.only(right: 14),
      child: LiquidTap(
        onTap: onTap,
        child: Text(
          label,
          style: TextStyle(
            fontSize: 15,
            color: cn.textPrimary,
            fontWeight: bold ? FontWeight.w900 : FontWeight.w700,
            fontStyle: italic ? FontStyle.italic : FontStyle.normal,
            decoration: underline ? TextDecoration.underline : TextDecoration.none,
          ),
        ),
      ),
    );
  }
}
