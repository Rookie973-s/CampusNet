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
import '../../core/widgets/paystack_sheet.dart';
import '../../core/widgets/skeleton_widgets.dart';
import '../auth/auth_provider.dart';
import 'liveness_camera.dart';

const _kLevels = ['100', '200', '300', '400', '500'];

/// Student Verification:
/// 1. Summary Screen (SUMMARY SCREEN ref)
/// 2. 8-Step Styled Wizard (Steps Form ref — preserving all real fields + ₦1,500 Paystack payment)
/// 3. Status Screen with GREEN verified student badge
class StudentVerificationScreen extends ConsumerStatefulWidget {
  const StudentVerificationScreen({super.key});

  @override
  ConsumerState<StudentVerificationScreen> createState() => _StudentVerificationScreenState();
}

class _StudentVerificationScreenState extends ConsumerState<StudentVerificationScreen> {
  Map<String, dynamic>? _status;
  List<Map<String, dynamic>> _faculties = [];
  bool _loading = true;
  bool _started = false;
  int _step = 0; // 0..7 (8 structured steps)

  String _facultyId = '';
  String _deptId = '';
  final _deptNameCtrl = TextEditingController();
  String _level = '200';
  String? _docPath;
  String? _docName;
  String? _livenessPath;
  final _noteCtrl = TextEditingController();
  bool _consent = false;

  String? _paymentRef;
  bool _paid = false;
  bool _paymentRequired = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    ref.read(departmentsProvider.notifier).ensureLoaded();
    _load();
  }

  @override
  void dispose() {
    _deptNameCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(apiClientProvider);
      final res = await Future.wait([
        api.dio.get('/verification/status/'),
        api.dio.get('/library/catalog/').catchError((_) => Response(requestOptions: RequestOptions(path: ''), data: {})),
      ]);
      final st = Map<String, dynamic>.from(res[0].data as Map);
      final cat = res[1].data is Map ? Map<String, dynamic>.from(res[1].data as Map) : {};
      final facs = (cat['faculties'] as List? ?? [])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      setState(() {
        _status = st;
        _faculties = facs;
        _paid = st['has_paid_verification'] == true;
        _paymentRequired = st['payment_required'] != false;
      });
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _pickDocument() async {
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

  Future<void> _initiatePayment() async {
    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      final res = await api.dio.post('/verification/initiate-payment/');
      final d = Map<String, dynamic>.from(res.data as Map);
      _paymentRef = d['reference']?.toString();
      if (d['already_paid'] == true || d['status'] == 'paid') {
        setState(() => _paid = true);
        _toast('Payment confirmed!');
        return;
      }
      if (!mounted) return;
      setState(() => _busy = false);
      final verified = await showPaystackPaymentSheet(
        context,
        api: api,
        payload: d,
        title: 'Student Verification Fee',
      );
      if (verified) {
        await _verifyPayment();
      }
    } catch (e) {
      _toast(parseApiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verifyPayment() async {
    setState(() => _busy = true);
    try {
      if (_paymentRef != null && _paymentRef!.isNotEmpty) {
        await ref.read(apiClientProvider).dio.post('/payments/verify/', data: {'reference': _paymentRef});
      }
      final stRes = await ref.read(apiClientProvider).dio.get('/verification/status/');
      final st = Map<String, dynamic>.from(stRes.data as Map);
      setState(() {
        _status = st;
        _paid = st['has_paid_verification'] == true;
      });
      _toast(_paid ? 'Payment verified! You can now submit.' : 'Payment not confirmed yet. Please finish Paystack checkout.');
    } catch (e) {
      _toast(parseApiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitApplication() async {
    if (!_consent) {
      _toast('Please agree to the privacy & verification consent first.');
      return;
    }
    if (_paymentRequired && !_paid) {
      _toast('Please complete the ₦1,500 verification payment before submitting.');
      return;
    }
    setState(() => _busy = true);
    try {
      final form = FormData();
      if (_facultyId.isNotEmpty) form.fields.add(MapEntry('faculty', _facultyId));
      if (_deptId.isNotEmpty) form.fields.add(MapEntry('department', _deptId));
      if (_deptNameCtrl.text.trim().isNotEmpty) form.fields.add(MapEntry('department_name', _deptNameCtrl.text.trim()));
      form.fields.add(MapEntry('level', _level));
      if (_noteCtrl.text.trim().isNotEmpty) form.fields.add(MapEntry('reason', _noteCtrl.text.trim()));
      form.fields.add(const MapEntry('consent', 'true'));
      if (_docPath != null) {
        form.files.add(MapEntry('supporting_document', await MultipartFile.fromFile(_docPath!, filename: _docName ?? 'id_doc')));
      }
      if (_livenessPath != null) {
        form.files.add(MapEntry('liveness_video', await MultipartFile.fromFile(_livenessPath!, filename: 'liveness.mp4')));
      }
      await ref.read(apiClientProvider).dio.post('/verification/apply/', data: form);
      await ref.read(authProvider.notifier).refreshMe();
      await _load();
      setState(() => _started = false);
      _toast('Student Verification application submitted!');
    } catch (e) {
      _toast(parseApiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final deptsFallback = ref.watch(departmentsProvider).valueOrNull ?? const <DepartmentItem>[];

    if (_loading) {
      return Scaffold(
        backgroundColor: cn.bg,
        appBar: AppBar(title: Text('Student Verification', style: TextStyle(fontWeight: FontWeight.w900, color: cn.textPrimary))),
        body: const ProfileHeroSkeleton(),
      );
    }

    final st = _status ?? {};
    final statusStr = (st['status'] ?? 'not_applied').toString();
    final isVerified = st['is_verified_student'] == true;
    final isPending = statusStr == 'pending';

    if (!_started && (isVerified || isPending || statusStr == 'rejected' || statusStr == 'info_required')) {
      return _buildStatusView(cn, st, statusStr, isVerified, isPending);
    }

    // 1. Summary Screen (Image 3 style)
    if (!_started) {
      return FlowSummaryScreen(
        badgeText: '₦1,500 · 3 MONTHS',
        headline: 'Student\nVerification',
        summary:
            'Unlock the green Verified Student badge on CampusNetwork and prove your authentic ATBU student identity.',
        highlights: const [
          (Icons.verified_rounded, 'Official green Verified Student badge across Feeds & Comments'),
          (Icons.photo_library_outlined, 'Upload up to 6 photos, short videos & 1,200-word posts'),
          (Icons.lock_outline_rounded, 'Private ID & face liveness review compliant with NDPA'),
          (Icons.payment_rounded, 'Secure ₦1,500 Paystack verification valid for 3 months'),
        ],
        ctaLabel: 'Start Verification',
        ctaIcon: Icons.verified_rounded,
        onContinue: () => setState(() => _started = true),
      );
    }

    // 2. 8-Step Structured Wizard (Image 2 style)
    final stepTitles = [
      'Your Faculty',
      'Your Department',
      'Academic Level',
      'Student ID Proof',
      'Live Face Scan',
      'Reviewer Note',
      'Privacy Consent',
      'Payment & Submit',
    ];
    final stepSubtitles = [
      'Choose your official academic faculty.',
      'Select or type your department name.',
      'Pick your current level of study.',
      'Upload your Student ID card or Admission Letter (JPG, PNG, WebP or PDF).',
      'Complete a quick live camera blink/nod verification.',
      'Add an optional note for the admin reviewer.',
      'Review and accept our NDPA privacy consent.',
      'Complete ₦1,500 Paystack verification and submit.',
    ];

    final facOptions = _faculties.isNotEmpty
        ? _faculties.map((f) => DropdownOption(label: f['name'].toString(), value: f['id'].toString())).toList()
        : deptsFallback.map((d) => DropdownOption(label: d.name, value: d.id.toString(), colorHex: d.color)).toList();

    final selectedFac = _faculties.where((f) => f['id'].toString() == _facultyId).firstOrNull;
    final nestedDepts = ((selectedFac?['departments'] as List?) ?? [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();

    final primaryLabel = _step < 7
        ? 'Continue'
        : (_paymentRequired && !_paid ? 'Pay ₦1,500 with Paystack' : 'Submit Verification');

    return StepsFormScaffold(
      stepTitle: stepTitles[_step],
      subtitle: stepSubtitles[_step],
      currentStep: _step,
      totalSteps: 8,
      primaryLabel: primaryLabel,
      primaryBusy: _busy,
      onBack: () => setState(() {
        if (_step == 0) {
          _started = false;
        } else {
          _step--;
        }
      }),
      onPrimary: () {
        if (_step == 0 && _facultyId.isEmpty) {
          _toast('Please select your faculty.');
          return;
        }
        if (_step == 3 && _docPath == null && _status?['has_existing_document'] != true) {
          _toast('Please upload your Student ID card or Admission Letter (required).');
          return;
        }
        if (_step == 6 && !_consent) {
          _toast('Please check the consent box to continue.');
          return;
        }
        if (_step < 7) {
          setState(() => _step++);
        } else if (_paymentRequired && !_paid) {
          _initiatePayment();
        } else {
          _submitApplication();
        }
      },
      body: _buildStepBody(cn, facOptions, nestedDepts),
    );
  }

  Widget _buildStepBody(
    CampusColors cn,
    List<DropdownOption> facOptions,
    List<Map<String, dynamic>> nestedDepts,
  ) {
    final isDark = context.isDark;
    final cardBg = isDark ? const Color(0xFF18221F) : Colors.white;

    if (_step == 0) {
      return FacultyDropdown(
        options: facOptions,
        value: _facultyId,
        placeholder: 'Select Faculty *',
        onChanged: (v) => setState(() {
          _facultyId = v;
          _deptId = '';
        }),
      );
    }

    if (_step == 1) {
      return Column(
        children: [
          if (nestedDepts.isNotEmpty) ...[
            FacultyDropdown(
              options: nestedDepts.map((d) => DropdownOption(label: d['name'].toString(), value: d['id'].toString())).toList(),
              value: _deptId,
              placeholder: 'Select Department',
              icon: Icons.apartment_rounded,
              onChanged: (v) {
                final match = nestedDepts.firstWhere((d) => d['id'].toString() == v, orElse: () => {});
                setState(() {
                  _deptId = v;
                  if (match['name'] != null) _deptNameCtrl.text = match['name'].toString();
                });
              },
            ),
            const SizedBox(height: 14),
          ],
          StepCardInput(
            controller: _deptNameCtrl,
            hint: 'Department Name (e.g. Computer Science)',
            icon: Icons.apartment_rounded,
          ),
        ],
      );
    }

    if (_step == 2) {
      return Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          for (final lv in _kLevels)
            LiquidTap(
              onTap: () => setState(() => _level = lv),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
                decoration: BoxDecoration(
                  color: _level == lv ? const Color(0xFF0E4D45) : cardBg,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 10, offset: const Offset(0, 3))],
                ),
                child: Text(
                  '$lv Level',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: _level == lv ? Colors.white : cn.textPrimary,
                  ),
                ),
              ),
            ),
        ],
      );
    }

    if (_step == 3) {
      return LiquidTap(
        onTap: _pickDocument,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 26, horizontal: 16),
          decoration: BoxDecoration(
            color: cardBg,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: _docPath != null ? cn.success : Colors.transparent, width: 1.5),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))],
          ),
          child: Column(
            children: [
              Icon(
                _docPath != null ? Icons.check_circle_rounded : Icons.upload_file_rounded,
                size: 40,
                color: _docPath != null ? cn.success : const Color(0xFF0E4D45),
              ),
              const SizedBox(height: 10),
              Text(
                _docName ?? 'Tap to upload Student ID or Admission PDF/Photo * (Required)',
                textAlign: TextAlign.center,
                style: TextStyle(fontWeight: FontWeight.w800, color: cn.textPrimary),
              ),
            ],
          ),
        ),
      );
    }

    if (_step == 4) {
      return FlutterLivenessCamera(
        capturedPath: _livenessPath,
        onCaptured: (p) => setState(() => _livenessPath = p),
      );
    }

    if (_step == 5) {
      return StepCardInput(
        controller: _noteCtrl,
        hint: 'Optional note for the admin reviewing your ID...',
        icon: Icons.edit_note_rounded,
        maxLines: 4,
      );
    }

    if (_step == 6) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: cardBg,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          activeColor: const Color(0xFF0E4D45),
          value: _consent,
          onChanged: (v) => setState(() => _consent = v ?? false),
          title: Text(
            'I confirm all submitted documents belong to me and consent to CampusNetwork verifying my student status in accordance with NDPA privacy standards.',
            style: TextStyle(color: cn.textPrimary, fontSize: 13.5, height: 1.45),
          ),
        ),
      );
    }

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: cardBg,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))],
          ),
          child: Row(
            children: [
              Icon(Icons.verified_rounded, color: cn.success, size: 32),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('₦1,500 / 3 Months', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16.5, color: cn.textPrimary)),
                    Text(
                      _paid ? 'Payment Confirmed ✓ Ready to submit' : 'Pay securely via Paystack before submitting',
                      style: TextStyle(color: _paid ? cn.success : cn.textMuted, fontSize: 12.5, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (_paymentRequired && !_paid) ...[
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: _busy ? null : _verifyPayment,
              child: const Text('I Have Paid — Verify Payment'),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildStatusView(CampusColors cn, Map<String, dynamic> st, String statusStr, bool isVerified, bool isPending) {
    final app = st['application'] is Map ? Map<String, dynamic>.from(st['application'] as Map) : null;
    final note = (app?['review_note'] ?? '').toString();
    final color = isVerified ? cn.success : (isPending ? cn.warning : cn.danger);
    final icon = isVerified ? Icons.verified_rounded : (isPending ? Icons.hourglass_top_rounded : Icons.info_outline_rounded);
    final title = isVerified
        ? 'You Are Verified!'
        : (isPending ? 'Application Under Review' : 'Action Required (${statusStr.toUpperCase()})');

    return Scaffold(
      backgroundColor: cn.bg,
      appBar: AppBar(
        title: Text('Student Verification', style: TextStyle(fontWeight: FontWeight.w900, color: cn.textPrimary)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          MorphismCard(
            padding: const EdgeInsets.all(22),
            radius: 26,
            child: Column(
              children: [
                Icon(icon, size: 58, color: color),
                const SizedBox(height: 12),
                Text(title, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                const SizedBox(height: 6),
                if (st['verification_expires_at'] != null && isVerified)
                  Text(
                    'Active until ${st['verification_expires_at'].toString().substring(0, 10)}',
                    style: TextStyle(color: cn.textMuted, fontSize: 13.5),
                  ),
                if (isPending)
                  Text(
                    'An administrator is reviewing your student ID and liveness scan. You will receive a notification once approved.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: cn.textMuted, fontSize: 13.5, height: 1.45),
                  ),
                if (note.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: cn.surfaceRecessed, borderRadius: BorderRadius.circular(14)),
                    child: Text('Reviewer Note: $note', style: TextStyle(color: cn.textPrimary, fontSize: 13)),
                  ),
                ],
                if (!isVerified && !isPending) ...[
                  const SizedBox(height: 16),
                  StepPrimaryButton(
                    label: 'Apply / Resubmit',
                    onTap: () => setState(() => _started = true),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
