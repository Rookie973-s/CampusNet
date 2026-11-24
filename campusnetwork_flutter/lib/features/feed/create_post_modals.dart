import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../auth/auth_provider.dart';
import 'feed_screen.dart';

Future<void> showAskNetworkModal(BuildContext context) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _AskNetworkSheet(),
  );
}

Future<void> showCreatePollModal(BuildContext context) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _CreatePollSheet(),
  );
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
    final cleanTitle = _title.text.trim().isNotEmpty ? _title.text.trim() : (cleanBody.length > 70 ? cleanBody.substring(0, 70) : cleanBody);
    if (cleanTitle.isEmpty) return;
    if (_words > wordLimit) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Exceeds your $wordLimit-word limit.')));
      return;
    }

    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      final chosenDept = _deptId.isNotEmpty ? _deptId : (depts.isNotEmpty ? depts.first.id.toString() : '');
      final form = FormData();
      form.fields.add(MapEntry('title', cleanTitle));
      form.fields.add(MapEntry('body', cleanBody.isNotEmpty ? cleanBody : cleanTitle));
      if (chosenDept.isNotEmpty) form.fields.add(MapEntry('department', chosenDept));
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
    final user = ref.watch(authProvider.select((s) => s.user));
    final depts = ref.watch(departmentsProvider).valueOrNull ?? const <DepartmentItem>[];
    final isVerified = (user?.isVerifiedStudent ?? false) || (user?.isVerifiedStaff ?? false);
    final wordLimit = isVerified ? 1200 : 300;
    final maxImages = isVerified ? 6 : 1;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.9),
        decoration: const BoxDecoration(
          color: CNColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          border: Border(top: BorderSide(color: CNColors.borderBright)),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(color: const Color(0xFF14223B), borderRadius: BorderRadius.circular(14)),
                    child: const Icon(Icons.menu_book_rounded, color: CNColors.accentLight, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Ask the Network', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                        Text(
                          'Write your question. Add photos or a short video if it helps. (Limit: $wordLimit words)',
                          style: const TextStyle(color: CNColors.textMuted, fontSize: 12.5, height: 1.4),
                        ),
                      ],
                    ),
                  ),
                  IconButton(icon: const Icon(Icons.close_rounded), onPressed: () => Navigator.of(context).pop()),
                ],
              ),
              const SizedBox(height: 16),
              const Text('Headline (optional)', style: TextStyle(color: CNColors.textMuted, fontWeight: FontWeight.w700, fontSize: 12.5)),
              const SizedBox(height: 6),
              _InputBox(controller: _title, hint: 'Short summary of your question or post...'),
              const SizedBox(height: 12),
              const Text('Your question', style: TextStyle(color: CNColors.textMuted, fontWeight: FontWeight.w700, fontSize: 12.5)),
              const SizedBox(height: 6),
              _InputBox(
                controller: _body,
                hint: 'Write your post... Use Bold, Italic, Underline, or @mention classmates',
                maxLines: 5,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(color: CNColors.surfaceRecessed, borderRadius: BorderRadius.circular(12)),
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
                        color: _words > wordLimit ? CNColors.danger : CNColors.textFaint,
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
                        padding: const EdgeInsets.symmetric(vertical: 11),
                        decoration: BoxDecoration(
                          color: CNColors.surfaceHigh,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: CNColors.borderSubtle),
                        ),
                        alignment: Alignment.center,
                        child: Text('Add photos ${_images.length}/$maxImages', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: LiquidTap(
                      onTap: () => _pickVideo(isVerified),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 11),
                        decoration: BoxDecoration(
                          color: CNColors.surfaceHigh,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: CNColors.borderSubtle),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          _video != null ? 'Video Ready ✓' : (isVerified ? 'Add video' : 'Video (Verified)'),
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              FacultyDropdown(
                options: depts.map((d) => DropdownOption(label: d.name, value: d.id.toString(), colorHex: d.color)).toList(),
                value: _deptId.isNotEmpty ? _deptId : (depts.isNotEmpty ? depts.first.id.toString() : ''),
                onChanged: (v) => setState(() => _deptId = v),
                placeholder: 'Select Faculty',
              ),
              const SizedBox(height: 10),
              _InputBox(controller: _tags, hint: 'Tags (e.g. MTH201, exams)'),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: LiquidTap(
                      onTap: () => Navigator.of(context).pop(),
                      child: Container(
                        height: 48,
                        decoration: BoxDecoration(
                          color: CNColors.surfaceHigh,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        alignment: Alignment.center,
                        child: const Text('Cancel', style: TextStyle(fontWeight: FontWeight.w700)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: LiquidTap(
                      onTap: _busy ? null : () => _submit(depts, wordLimit),
                      child: Container(
                        height: 48,
                        decoration: BoxDecoration(
                          color: CNColors.accent,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        alignment: Alignment.center,
                        child: Text(_busy ? 'Posting...' : 'Post', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
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
      final chosenDept = _deptId.isNotEmpty ? int.tryParse(_deptId) : (depts.isNotEmpty ? depts.first.id : null);
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
    final depts = ref.watch(departmentsProvider).valueOrNull ?? const <DepartmentItem>[];
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.88),
        decoration: const BoxDecoration(
          color: CNColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          border: Border(top: BorderSide(color: CNColors.borderBright)),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.bar_chart_rounded, color: CNColors.accentLight, size: 24),
                  const SizedBox(width: 10),
                  const Expanded(child: Text('Create a Poll', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900))),
                  IconButton(icon: const Icon(Icons.close_rounded), onPressed: () => Navigator.of(context).pop()),
                ],
              ),
              const SizedBox(height: 12),
              _InputBox(controller: _question, hint: 'e.g. Should we write tests today?'),
              const SizedBox(height: 12),
              const Text('Poll Options (2–6)', style: TextStyle(color: CNColors.textMuted, fontWeight: FontWeight.w700, fontSize: 12.5)),
              const SizedBox(height: 6),
              for (int i = 0; i < _opts.length; i++)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Expanded(child: _InputBox(controller: _opts[i], hint: 'Option ${i + 1}')),
                      if (_opts.length > 2)
                        IconButton(
                          icon: const Icon(Icons.delete_outline_rounded, color: CNColors.danger, size: 20),
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
                options: depts.map((d) => DropdownOption(label: d.name, value: d.id.toString(), colorHex: d.color)).toList(),
                value: _deptId.isNotEmpty ? _deptId : (depts.isNotEmpty ? depts.first.id.toString() : ''),
                onChanged: (v) => setState(() => _deptId = v),
                placeholder: 'Select Faculty',
              ),
              const SizedBox(height: 16),
              LiquidTap(
                onTap: _busy ? null : () => _submit(depts),
                child: Container(
                  width: double.infinity,
                  height: 48,
                  decoration: BoxDecoration(color: CNColors.accent, borderRadius: BorderRadius.circular(14)),
                  alignment: Alignment.center,
                  child: Text(_busy ? 'Publishing...' : 'Publish Poll', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InputBox extends StatelessWidget {
  const _InputBox({required this.controller, required this.hint, this.maxLines = 1, this.onChanged});
  final TextEditingController controller;
  final String hint;
  final int maxLines;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: CNColors.surfaceRecessed,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: CNColors.borderSubtle),
      ),
      child: TextField(
        controller: controller,
        maxLines: maxLines,
        onChanged: onChanged,
        style: const TextStyle(fontSize: 14.5, color: CNColors.textPrimary),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: CNColors.textFaint, fontSize: 13.5),
          border: InputBorder.none,
        ),
      ),
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
    return Padding(
      padding: const EdgeInsets.only(right: 14),
      child: LiquidTap(
        onTap: onTap,
        child: Text(
          label,
          style: TextStyle(
            fontSize: 15,
            fontWeight: bold ? FontWeight.w900 : FontWeight.w700,
            fontStyle: italic ? FontStyle.italic : FontStyle.normal,
            decoration: underline ? TextDecoration.underline : TextDecoration.none,
          ),
        ),
      ),
    );
  }
}
