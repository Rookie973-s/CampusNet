import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/form_templates.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../auth/auth_provider.dart';
import '../me/liveness_camera.dart';

/// SUG Access Application Flow:
/// 1. Atmospheric Summary Screen (SUMMARY SCREEN ref)
/// 2. 4-Step Styled Wizard (Steps Form ref — preserving all real SUG fields!)
/// 3. Live "Already Applied?" status checker & "Thank you" confirmation
class ApplySugScreen extends ConsumerStatefulWidget {
  const ApplySugScreen({super.key});

  @override
  ConsumerState<ApplySugScreen> createState() => _ApplySugScreenState();
}

class _ApplySugScreenState extends ConsumerState<ApplySugScreen> {
  String _stage = 'summary'; // 'summary' | 'form' | 'thanks'
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
    ref.read(departmentsProvider.notifier).ensureLoaded();
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
                const SizedBox(height: 12),
                StepCardInput(
                  controller: _statusEmail,
                  hint: 'Application Email',
                  icon: Icons.mail_outline_rounded,
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 14),
                StepPrimaryButton(
                  label: _busy ? 'Checking...' : 'Check Status',
                  onTap: _busy
                      ? null
                      : () async {
                          await _checkExistingStatus();
                          setS(() {});
                        },
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
                                style: TextStyle(fontWeight: FontWeight.w900, color: cn.success),
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

    if (_stage == 'summary') {
      return FlowSummaryScreen(
        badgeText: 'OFFICIAL SUG PORTAL',
        headline: 'SUG\nAccess',
        summary:
            'Apply as an elected or appointed Student Union Government representative to serve students directly across CampusNetwork.',
        highlights: const [
          (Icons.verified_user_rounded, 'Official gold SUG shield badge on your profile & answers'),
          (Icons.chat_bubble_outline_rounded, 'Direct private student messaging & directory listing'),
          (Icons.star_outline_rounded, 'Transparent student feedback & performance ratings'),
          (Icons.admin_panel_settings_outlined, 'Reviewed securely by CampusNetwork administrators'),
        ],
        ctaLabel: 'Continue to Application',
        ctaIcon: Icons.shield_outlined,
        onContinue: () => setState(() => _stage = 'form'),
        secondaryLabel: 'Already Applied? Check Status',
        onSecondary: _openStatusCheckerSheet,
        onInfo: _openStatusCheckerSheet,
        infoTooltip: 'Check existing application status',
      );
    }

    if (_stage == 'thanks') {
      final name = _first.text.trim().isNotEmpty ? _first.text.trim() : 'Applicant';
      return Scaffold(
        backgroundColor: cn.bg,
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: MorphismCard(
              padding: const EdgeInsets.all(26),
              radius: 28,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.check_circle_rounded, size: 64, color: cn.success),
                  const SizedBox(height: 14),
                  Text('Thank you, $name!', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                  const SizedBox(height: 8),
                  Text(
                    'Your SUG Access application has been submitted for administrator review. You can check your status anytime using your email.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: cn.textMuted, fontSize: 14, height: 1.5),
                  ),
                  const SizedBox(height: 22),
                  StepPrimaryButton(
                    label: 'Done',
                    onTap: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    final titles = [
      'Personal Details',
      'Academic & Proof',
      'Leadership Statement',
      'Review & Submit',
    ];
    final subtitles = [
      'Tell us who you are and how admins can reach you.',
      'Select your faculty, office held, and optional verification proof.',
      'Share your campus leadership bio and how you will help students.',
      'Double-check your details before sending to reviewers.',
    ];

    return StepsFormScaffold(
      stepTitle: titles[_step],
      subtitle: subtitles[_step],
      currentStep: _step,
      totalSteps: 4,
      primaryLabel: _step < 3 ? 'Continue' : 'Submit Application',
      primaryBusy: _busy,
      headerAction: LiquidTap(
        onTap: _openStatusCheckerSheet,
        child: const Text(
          'Status',
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5),
        ),
      ),
      onBack: () => setState(() {
        if (_step == 0) {
          _stage = 'summary';
        } else {
          _step--;
        }
      }),
      onPrimary: () {
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
          if (_docPath == null) {
            _toast('Please upload your Student ID / Appointment proof (required).');
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
      body: _buildStepBody(cn, depts),
    );
  }

  Widget _buildStepBody(CampusColors cn, List<DepartmentItem> depts) {
    if (_step == 0) {
      return Column(
        children: [
          StepCardInput(controller: _first, hint: 'First Name *', icon: Icons.person_outline_rounded),
          const SizedBox(height: 14),
          StepCardInput(controller: _last, hint: 'Last Name *', icon: Icons.person_outline_rounded),
          const SizedBox(height: 14),
          StepCardInput(
            controller: _email,
            hint: 'Email Address *',
            icon: Icons.mail_outline_rounded,
            keyboardType: TextInputType.emailAddress,
          ),
          const SizedBox(height: 14),
          StepCardInput(
            controller: _phone,
            hint: 'Phone Number *',
            icon: Icons.phone_outlined,
            keyboardType: TextInputType.phone,
          ),
        ],
      );
    }

    if (_step == 1) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FacultyDropdown(
            options: depts.map((d) => DropdownOption(label: d.name, value: d.id.toString(), colorHex: d.color)).toList(),
            value: _facultyId,
            onChanged: (v) => setState(() => _facultyId = v),
            placeholder: 'Select Academic Faculty *',
          ),
          const SizedBox(height: 14),
          StepCardInput(controller: _subDept, hint: 'Academic Department *', icon: Icons.apartment_rounded),
          const SizedBox(height: 14),
          StepCardInput(controller: _role, hint: 'SUG Role / Office (e.g. Welfare Director) *', icon: Icons.badge_outlined),
          const SizedBox(height: 14),
          StepCardInput(controller: _refs, hint: 'References (optional)', icon: Icons.people_outline_rounded),
          const SizedBox(height: 16),
          LiquidTap(
            onTap: _pickSupportingDoc,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(15),
              decoration: BoxDecoration(
                color: context.isDark ? const Color(0xFF18221F) : Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _docPath != null ? cn.success : Colors.transparent),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))],
              ),
              child: Row(
                children: [
                  Icon(_docPath != null ? Icons.check_circle_rounded : Icons.upload_file_rounded,
                      color: _docPath != null ? cn.success : const Color(0xFF0E4D45)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _docName ?? 'Upload Student ID / Appointment Proof * (Required)',
                      style: TextStyle(fontWeight: FontWeight.w700, color: cn.textPrimary, fontSize: 13.5),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text('Live Face Check (optional)', style: TextStyle(color: cn.textMuted, fontWeight: FontWeight.w700, fontSize: 12.5)),
          const SizedBox(height: 8),
          FlutterLivenessCamera(
            capturedPath: _livenessPath,
            onCaptured: (p) => setState(() => _livenessPath = p),
          ),
        ],
      );
    }

    if (_step == 2) {
      return Column(
        children: [
          StepCardInput(
            controller: _bio,
            label: 'Short Leadership Bio *',
            hint: 'Write at least 20 characters about your role & background...',
            icon: Icons.edit_note_rounded,
            maxLines: 4,
            onChanged: (_) => setState(() {}),
            helperText: '${_bio.text.trim().length} / 20 characters minimum',
            helperColor: _bio.text.trim().length >= 20 ? cn.success : cn.textMuted,
          ),
          const SizedBox(height: 16),
          StepCardInput(
            controller: _why,
            label: 'How will you serve students on CampusNetwork? *',
            hint: 'Share your goals for helping classmates...',
            icon: Icons.forum_outlined,
            maxLines: 4,
            onChanged: (_) => setState(() {}),
            helperText: '${_why.text.trim().length} / 20 characters minimum',
            helperColor: _why.text.trim().length >= 20 ? cn.success : cn.textMuted,
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: context.isDark ? const Color(0xFF18221F) : Colors.white,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))],
          ),
          child: Column(
            children: [
              _ReviewRow(label: 'Applicant', value: '${_first.text.trim()} ${_last.text.trim()}'),
              _ReviewRow(label: 'Email', value: _email.text.trim()),
              _ReviewRow(label: 'Office', value: _role.text.trim()),
              _ReviewRow(label: 'Department', value: _subDept.text.trim()),
              if (_docName != null) _ReviewRow(label: 'Document', value: _docName!),
            ],
          ),
        ),
        const SizedBox(height: 14),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          activeColor: const Color(0xFF0E4D45),
          value: _agree,
          onChanged: (v) => setState(() => _agree = v ?? false),
          title: Text(
            'I confirm that I am an authorized SUG representative and that all information provided is accurate.',
            style: TextStyle(color: cn.textPrimary, fontSize: 13.5, height: 1.4),
          ),
        ),
      ],
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
