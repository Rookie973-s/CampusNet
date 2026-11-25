import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../auth/auth_provider.dart';
import '../me/liveness_camera.dart';

/// SUG Access Application Flow matching SUG ACCESS FORM & WELCOME BACK references:
/// - Intro card + "Already Applied?" email status checker
/// - 4-step structured wizard: Personal -> Academic & Credentials -> Statement (20+ chars) -> Review
/// - Live "Thank you, `first_name`" confirmation screen
class ApplySugScreen extends ConsumerStatefulWidget {
  const ApplySugScreen({super.key});

  @override
  ConsumerState<ApplySugScreen> createState() => _ApplySugScreenState();
}

class _ApplySugScreenState extends ConsumerState<ApplySugScreen> {
  // Stage: 'intro' | 'form' | 'thanks'
  String _stage = 'intro';
  int _step = 0; // 0..3

  final _first = TextEditingController();
  final _last = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _subDept = TextEditingController();
  final _role = TextEditingController();
  final _refs = TextEditingController();
  final _bio = TextEditingController();
  final _why = TextEditingController();
  final _statusEmail = TextEditingController();

  String _facultyId = '';
  String? _docPath;
  String? _docName;
  String? _livenessPath;
  bool _agree = false;
  bool _busy = false;
  Map<String, dynamic>? _checkedStatus;

  @override
  void initState() {
    super.initState();
    final u = ref.read(authProvider).user;
    if (u != null) {
      _first.text = u.firstName;
      _last.text = u.lastName;
      _email.text = u.email;
      _statusEmail.text = u.email;
    }
  }

  @override
  void dispose() {
    for (final c in [_first, _last, _email, _phone, _subDept, _role, _refs, _bio, _why, _statusEmail]) {
      c.dispose();
    }
    super.dispose();
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _pickSupportingDoc() async {
    final res = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
    );
    if (res != null && res.files.single.path != null) {
      setState(() {
        _docPath = res.files.single.path;
        _docName = res.files.single.name;
      });
    }
  }

  Future<void> _checkExistingStatus() async {
    final email = _statusEmail.text.trim();
    if (email.isEmpty) {
      _toast('Enter the email you applied with.');
      return;
    }
    setState(() => _busy = true);
    try {
      final res = await ref.read(apiClientProvider).dio.get('/applications/status/', queryParameters: {'email': email});
      setState(() => _checkedStatus = Map<String, dynamic>.from(res.data as Map));
    } catch (e) {
      _toast(parseApiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    if (!_agree) {
      _toast('Please confirm the accuracy of your SUG credentials.');
      return;
    }
    setState(() => _busy = true);
    try {
      final form = FormData();
      form.fields.addAll([
        MapEntry('first_name', _first.text.trim()),
        MapEntry('last_name', _last.text.trim()),
        MapEntry('email', _email.text.trim()),
        MapEntry('phone', _phone.text.trim()),
        if (_facultyId.isNotEmpty) MapEntry('department', _facultyId),
        MapEntry('academic_department_name', _subDept.text.trim()),
        MapEntry('role_title', _role.text.trim()),
        if (_refs.text.trim().isNotEmpty) MapEntry('academic_references', _refs.text.trim()),
        MapEntry('bio', _bio.text.trim()),
        MapEntry('why', _why.text.trim()),
      ]);
      if (_docPath != null) {
        form.files.add(MapEntry('supporting_document', await MultipartFile.fromFile(_docPath!, filename: _docName ?? 'sug_doc')));
      }
      if (_livenessPath != null) {
        form.files.add(MapEntry('liveness_video', await MultipartFile.fromFile(_livenessPath!, filename: 'sug_liveness.mp4')));
      }

      await ref.read(apiClientProvider).dio.post('/applications/', data: form);
      if (mounted) setState(() => _stage = 'thanks');
    } catch (e) {
      _toast(parseApiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _openStatusCheckerSheet() {
    AppBottomSheet.show(
      context,
      builder: (sheetCtx) => StatefulBuilder(
        builder: (ctx, setS) {
          final cn = ctx.cn;
          return Padding(
            padding: EdgeInsets.fromLTRB(20, 8, 20, MediaQuery.of(ctx).viewInsets.bottom + 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Check SUG Application Status', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                const SizedBox(height: 10),
                TextField(
                  controller: _statusEmail,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Application Email'),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _busy
                        ? null
                        : () async {
                            await _checkExistingStatus();
                            setS(() {});
                          },
                    child: Text(_busy ? 'Checking...' : 'Check Status'),
                  ),
                ),
                if (_checkedStatus != null) ...[
                  const SizedBox(height: 14),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(color: cn.surfaceRecessed, borderRadius: BorderRadius.circular(14)),
                    child: _checkedStatus!['found'] == true
                        ? Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Status: ${(_checkedStatus!['status'] ?? '').toString().toUpperCase()}',
                                style: TextStyle(fontWeight: FontWeight.w900, color: cn.accentLight),
                              ),
                              if (_checkedStatus!['role_title'] != null)
                                Text('Office: ${_checkedStatus!['role_title']}', style: TextStyle(color: cn.textPrimary, fontSize: 13)),
                              if ((_checkedStatus!['review_note'] ?? '').toString().isNotEmpty)
                                Text('Note: ${_checkedStatus!['review_note']}', style: TextStyle(color: cn.textMuted, fontSize: 12.5)),
                            ],
                          )
                        : Text('No SUG application found for this email.', style: TextStyle(color: cn.textMuted)),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final depts = ref.watch(departmentsProvider).valueOrNull ?? const <DepartmentItem>[];

    return Scaffold(
      backgroundColor: cn.bg,
      appBar: AppBar(
        title: Text('Apply for SUG Access', style: TextStyle(fontWeight: FontWeight.w900, color: cn.textPrimary)),
        actions: [
          if (_stage != 'thanks')
            TextButton(
              onPressed: _openStatusCheckerSheet,
              child: Text('Already Applied?', style: TextStyle(color: cn.accentLight, fontWeight: FontWeight.w800, fontSize: 12.5)),
            ),
        ],
      ),
      body: _stage == 'thanks'
          ? _buildThanks(cn)
          : _stage == 'intro'
              ? _buildIntro(cn)
              : _buildForm(cn, depts),
    );
  }

  Widget _buildIntro(CampusColors cn) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 40),
      children: [
        MorphismCard(
          padding: const EdgeInsets.all(22),
          radius: 26,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 58,
                height: 58,
                decoration: BoxDecoration(color: cn.goldSoft, borderRadius: BorderRadius.circular(18)),
                child: Icon(Icons.shield_rounded, color: cn.gold, size: 32),
              ),
              const SizedBox(height: 14),
              Text('Official SUG Representative Access', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: cn.textPrimary)),
              const SizedBox(height: 8),
              Text(
                'Elected and appointed Student Union Government officials receive the official SUG Shield Badge, direct student messaging, and verified directory listing.',
                style: TextStyle(color: cn.textMuted, fontSize: 14, height: 1.5),
              ),
              const SizedBox(height: 18),
              for (final stepText in [
                '1. Personal contact details',
                '2. Academic office, ID proof & live face scan',
                '3. Short leadership bio & mission statement',
                '4. Admin review & instant badge activation',
              ])
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Icon(Icons.check_circle_outline_rounded, size: 17, color: cn.accentLight),
                      const SizedBox(width: 8),
                      Expanded(child: Text(stepText, style: TextStyle(color: cn.textPrimary, fontWeight: FontWeight.w600, fontSize: 13.5))),
                    ],
                  ),
                ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => setState(() => _stage = 'form'),
                  child: const Text('Start SUG Application'),
                ),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: _openStatusCheckerSheet,
                  child: const Text('Already Applied? Check Status'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildForm(CampusColors cn, List<DepartmentItem> depts) {
    final labels = ['Personal Info', 'Academic & Proof', 'Statement', 'Review & Submit'];
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
      children: [
        // 4-step segmented progress bar (WELCOME BACK ref)
        Row(
          children: [
            for (int i = 0; i < 4; i++)
              Expanded(
                child: Container(
                  height: 4.5,
                  margin: EdgeInsets.only(right: i < 3 ? 6 : 0),
                  decoration: BoxDecoration(
                    color: i <= _step ? cn.accent : cn.surfaceHigh,
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        Text('Step ${_step + 1} of 4 · ${labels[_step]}', style: TextStyle(color: cn.accentLight, fontWeight: FontWeight.w800, fontSize: 13)),
        const SizedBox(height: 14),
        MorphismCard(
          padding: const EdgeInsets.all(18),
          radius: 22,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_step == 0) ...[
                TextField(controller: _first, decoration: const InputDecoration(labelText: 'First Name *')),
                const SizedBox(height: 10),
                TextField(controller: _last, decoration: const InputDecoration(labelText: 'Last Name *')),
                const SizedBox(height: 10),
                TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email Address *')),
                const SizedBox(height: 10),
                TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone Number *')),
              ] else if (_step == 1) ...[
                FacultyDropdown(
                  options: depts.map((d) => DropdownOption(label: d.name, value: d.id.toString(), colorHex: d.color)).toList(),
                  value: _facultyId,
                  onChanged: (v) => setState(() => _facultyId = v),
                  placeholder: 'Select Academic Faculty *',
                ),
                const SizedBox(height: 10),
                TextField(controller: _subDept, decoration: const InputDecoration(labelText: 'Academic Department *')),
                const SizedBox(height: 10),
                TextField(controller: _role, decoration: const InputDecoration(labelText: 'SUG Role / Office Held *', hintText: 'e.g. SUG Welfare Director')),
                const SizedBox(height: 10),
                TextField(controller: _refs, decoration: const InputDecoration(labelText: 'References (optional)')),
                const SizedBox(height: 14),
                LiquidTap(
                  onTap: _pickSupportingDoc,
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: cn.surfaceRecessed,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: _docPath != null ? cn.success : cn.borderSubtle),
                    ),
                    child: Row(
                      children: [
                        Icon(_docPath != null ? Icons.check_circle_rounded : Icons.upload_file_rounded, color: _docPath != null ? cn.success : cn.accentLight),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _docName ?? 'Upload Appointment / ID Proof (optional)',
                            style: TextStyle(fontWeight: FontWeight.w700, color: cn.textPrimary, fontSize: 13),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text('Live Face Check (optional)', style: TextStyle(color: cn.textMuted, fontWeight: FontWeight.w700, fontSize: 12.5)),
                const SizedBox(height: 8),
                FlutterLivenessCamera(
                  capturedPath: _livenessPath,
                  onCaptured: (p) => setState(() => _livenessPath = p),
                ),
              ] else if (_step == 2) ...[
                TextField(
                  controller: _bio,
                  maxLines: 4,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    labelText: 'Short Leadership Bio (min 20 chars) *',
                    helperText: '${_bio.text.trim().length}/20 chars minimum',
                    helperStyle: TextStyle(color: _bio.text.trim().length >= 20 ? cn.success : cn.textMuted),
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _why,
                  maxLines: 4,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    labelText: 'How will you serve students on CampusNetwork? (min 20 chars) *',
                    helperText: '${_why.text.trim().length}/20 chars minimum',
                    helperStyle: TextStyle(color: _why.text.trim().length >= 20 ? cn.success : cn.textMuted),
                  ),
                ),
              ] else ...[
                _ReviewRow(label: 'Applicant', value: '${_first.text.trim()} ${_last.text.trim()}'),
                _ReviewRow(label: 'Email', value: _email.text.trim()),
                _ReviewRow(label: 'Office', value: _role.text.trim()),
                _ReviewRow(label: 'Department', value: _subDept.text.trim()),
                if (_docName != null) _ReviewRow(label: 'Document', value: _docName!),
                const SizedBox(height: 10),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _agree,
                  onChanged: (v) => setState(() => _agree = v ?? false),
                  title: Text(
                    'I confirm that I am an authorized SUG representative and that all information provided is accurate.',
                    style: TextStyle(color: cn.textPrimary, fontSize: 13, height: 1.4),
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => setState(() {
                  if (_step == 0) {
                    _stage = 'intro';
                  } else {
                    _step--;
                  }
                }),
                child: const Text('Back'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: ElevatedButton(
                onPressed: _busy
                    ? null
                    : () {
                        if (_step == 0) {
                          if (_first.text.trim().isEmpty || _last.text.trim().isEmpty || _email.text.trim().isEmpty) {
                            _toast('Fill in your first name, last name, and email.');
                            return;
                          }
                          setState(() => _step = 1);
                        } else if (_step == 1) {
                          if (_role.text.trim().isEmpty) {
                            _toast('Enter your SUG role or office title.');
                            return;
                          }
                          setState(() => _step = 2);
                        } else if (_step == 2) {
                          if (_bio.text.trim().length < 20 || _why.text.trim().length < 20) {
                            _toast('Both Bio and Statement must be at least 20 characters.');
                            return;
                          }
                          setState(() => _step = 3);
                        } else {
                          _submit();
                        }
                      },
                child: Text(_step < 3 ? 'Continue' : (_busy ? 'Submitting...' : 'Submit Application')),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildThanks(CampusColors cn) {
    final name = _first.text.trim().isNotEmpty ? _first.text.trim() : 'Applicant';
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: MorphismCard(
          padding: const EdgeInsets.all(24),
          radius: 26,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.check_circle_rounded, size: 60, color: cn.success),
              const SizedBox(height: 14),
              Text('Thank you, $name!', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: cn.textPrimary)),
              const SizedBox(height: 8),
              Text(
                'Your SUG Access application has been submitted for administrator review. You can check your status anytime using your email.',
                textAlign: TextAlign.center,
                style: TextStyle(color: cn.textMuted, fontSize: 14, height: 1.5),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Done'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReviewRow extends StatelessWidget {
  const _ReviewRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 96, child: Text(label, style: TextStyle(color: cn.textMuted, fontWeight: FontWeight.w700, fontSize: 13))),
          Expanded(child: Text(value.isEmpty ? '—' : value, style: TextStyle(color: cn.textPrimary, fontWeight: FontWeight.w700, fontSize: 13.5))),
        ],
      ),
    );
  }
}
