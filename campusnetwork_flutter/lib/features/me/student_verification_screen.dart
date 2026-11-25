import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../auth/auth_provider.dart';
import 'liveness_camera.dart';

const _kLevels = ['100', '200', '300', '400', '500'];

/// Student Verification — Intro -> 8-Step Wizard -> ₦1,500 Paystack Payment -> Status Screen.
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
      final res = await ref.read(apiClientProvider).dio.post('/verification/initiate-payment/');
      final d = Map<String, dynamic>.from(res.data as Map);
      final url = d['authorization_url']?.toString();
      _paymentRef = d['reference']?.toString();
      if (d['already_paid'] == true || d['status'] == 'paid') {
        setState(() => _paid = true);
        _toast('Payment confirmed!');
      } else if (url != null && url.isNotEmpty) {
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
        _toast('Complete payment in your browser, then tap "Verify Payment".');
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

    return Scaffold(
      backgroundColor: cn.bg,
      appBar: AppBar(
        title: Text('Student Verification', style: TextStyle(fontWeight: FontWeight.w900, color: cn.textPrimary)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _buildBody(cn, deptsFallback),
    );
  }

  Widget _buildBody(CampusColors cn, List<DepartmentItem> deptsFallback) {
    final st = _status ?? {};
    final statusStr = (st['status'] ?? 'not_applied').toString();
    final isVerified = st['is_verified_student'] == true;
    final isPending = statusStr == 'pending';

    if (!_started && (isVerified || isPending || statusStr == 'rejected' || statusStr == 'info_required')) {
      return _buildStatusView(cn, st, statusStr, isVerified, isPending);
    }

    if (!_started) {
      return _buildIntroView(cn);
    }

    // 8-Step Structured Verification Wizard
    final stepTitles = [
      'Select Faculty',
      'Select Department',
      'Academic Level',
      'Upload Student ID / Admission',
      'Live Face Verification',
      'Additional Note (Optional)',
      'Privacy & Consent',
      '₦1,500 Verification Payment & Submit',
    ];

    final facOptions = _faculties.isNotEmpty
        ? _faculties.map((f) => DropdownOption(label: f['name'].toString(), value: f['id'].toString())).toList()
        : deptsFallback.map((d) => DropdownOption(label: d.name, value: d.id.toString(), colorHex: d.color)).toList();

    final selectedFac = _faculties.where((f) => f['id'].toString() == _facultyId).firstOrNull;
    final nestedDepts = ((selectedFac?['departments'] as List?) ?? [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
      children: [
        // Step progress header
        Row(
          children: [
            Text(
              'Step ${_step + 1} of ${stepTitles.length}',
              style: TextStyle(color: cn.accentLight, fontWeight: FontWeight.w800, fontSize: 12.5),
            ),
            const Spacer(),
            Text('${((_step + 1) / stepTitles.length * 100).round()}%', style: TextStyle(color: cn.textMuted, fontSize: 12)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: (_step + 1) / stepTitles.length,
            minHeight: 5,
            backgroundColor: cn.surfaceHigh,
            valueColor: AlwaysStoppedAnimation(cn.accent),
          ),
        ),
        const SizedBox(height: 18),
        MorphismCard(
          padding: const EdgeInsets.all(18),
          radius: 22,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(stepTitles[_step], style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: cn.textPrimary)),
              const SizedBox(height: 14),
              if (_step == 0) ...[
                Text('Choose your official academic faculty.', style: TextStyle(color: cn.textMuted, fontSize: 13.5)),
                const SizedBox(height: 12),
                FacultyDropdown(
                  options: facOptions,
                  value: _facultyId,
                  placeholder: 'Select Faculty *',
                  onChanged: (v) => setState(() {
                    _facultyId = v;
                    _deptId = '';
                  }),
                ),
              ] else if (_step == 1) ...[
                Text('Select or enter your academic department.', style: TextStyle(color: cn.textMuted, fontSize: 13.5)),
                const SizedBox(height: 12),
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
                  const SizedBox(height: 10),
                ],
                TextField(
                  controller: _deptNameCtrl,
                  decoration: const InputDecoration(labelText: 'Department Name', hintText: 'e.g. Computer Science'),
                ),
              ] else if (_step == 2) ...[
                Text('What is your current study level?', style: TextStyle(color: cn.textMuted, fontSize: 13.5)),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final lv in _kLevels)
                      LiquidTap(
                        onTap: () => setState(() => _level = lv),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
                          decoration: BoxDecoration(
                            color: _level == lv ? cn.accent : cn.surfaceRecessed,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: _level == lv ? cn.accent : cn.borderSubtle),
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
                ),
              ] else if (_step == 3) ...[
                Text(
                  'Upload your Student ID card or Admission Letter (JPG, PNG, WebP, or PDF). Stored privately for admin review only.',
                  style: TextStyle(color: cn.textMuted, fontSize: 13.5, height: 1.45),
                ),
                const SizedBox(height: 14),
                LiquidTap(
                  onTap: _pickDocument,
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 16),
                    decoration: BoxDecoration(
                      color: cn.surfaceRecessed,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: _docPath != null ? cn.success : cn.borderBright),
                    ),
                    child: Column(
                      children: [
                        Icon(
                          _docPath != null ? Icons.check_circle_rounded : Icons.upload_file_rounded,
                          size: 36,
                          color: _docPath != null ? cn.success : cn.accentLight,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _docName ?? 'Tap to choose Student ID or Admission PDF/Photo',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontWeight: FontWeight.w800, color: cn.textPrimary),
                        ),
                      ],
                    ),
                  ),
                ),
              ] else if (_step == 4) ...[
                Text(
                  'Complete a short live camera check to confirm you are a real student.',
                  style: TextStyle(color: cn.textMuted, fontSize: 13.5),
                ),
                const SizedBox(height: 12),
                FlutterLivenessCamera(
                  capturedPath: _livenessPath,
                  onCaptured: (p) => setState(() => _livenessPath = p),
                ),
              ] else if (_step == 5) ...[
                Text('Optional note for the verification reviewer.', style: TextStyle(color: cn.textMuted, fontSize: 13.5)),
                const SizedBox(height: 12),
                TextField(
                  controller: _noteCtrl,
                  maxLines: 4,
                  decoration: const InputDecoration(hintText: 'Anything helpful for the admin reviewing your ID...'),
                ),
              ] else if (_step == 6) ...[
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _consent,
                  onChanged: (v) => setState(() => _consent = v ?? false),
                  title: Text(
                    'I confirm all submitted documents belong to me and consent to CampusNetwork verifying my student status in accordance with NDPA privacy standards.',
                    style: TextStyle(color: cn.textPrimary, fontSize: 13.5, height: 1.4),
                  ),
                ),
              ] else if (_step == 7) ...[
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: cn.accentSoft, borderRadius: BorderRadius.circular(14)),
                  child: Row(
                    children: [
                      Icon(Icons.verified_rounded, color: cn.accentLight, size: 28),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('₦1,500 / 3 Months', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: cn.textPrimary)),
                            Text(
                              _paid ? 'Payment Confirmed ✓' : 'Pay securely via Paystack before submitting',
                              style: TextStyle(color: _paid ? cn.success : cn.textMuted, fontSize: 12.5, fontWeight: FontWeight.w700),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                if (_paymentRequired && !_paid) ...[
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _busy ? null : _initiatePayment,
                      icon: const Icon(Icons.lock_outline_rounded, size: 18),
                      label: Text(_busy ? 'Opening Paystack...' : 'Pay ₦1,500 with Paystack'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: _busy ? null : _verifyPayment,
                      child: const Text('I Have Paid — Verify Payment'),
                    ),
                  ),
                ] else
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _busy ? null : _submitApplication,
                      child: Text(_busy ? 'Submitting...' : 'Submit Verification Application'),
                    ),
                  ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            if (_step > 0)
              Expanded(
                child: OutlinedButton(
                  onPressed: () => setState(() => _step--),
                  child: const Text('Back'),
                ),
              ),
            if (_step > 0 && _step < 7) const SizedBox(width: 10),
            if (_step < 7)
              Expanded(
                child: ElevatedButton(
                  onPressed: () {
                    if (_step == 0 && _facultyId.isEmpty) {
                      _toast('Please select your faculty.');
                      return;
                    }
                    if (_step == 6 && !_consent) {
                      _toast('Please check the consent box to continue.');
                      return;
                    }
                    setState(() => _step++);
                  },
                  child: const Text('Continue'),
                ),
              ),
          ],
        ),
      ],
    );
  }

  Widget _buildIntroView(CampusColors cn) {
    final perks = [
      (Icons.verified_rounded, 'Verified Student Badge', 'Stand out across feeds, comments, and communities.'),
      (Icons.photo_library_outlined, 'Up to 6 Photos & Video Uploads', 'Rich media posts and up to 1,200 words per question.'),
      (Icons.shield_outlined, 'Private & Secure Review', 'Documents are encrypted and used solely for verification.'),
    ];
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 40),
      children: [
        MorphismCard(
          padding: const EdgeInsets.all(22),
          radius: 26,
          child: Column(
            children: [
              Container(
                width: 66,
                height: 66,
                decoration: BoxDecoration(color: cn.accentSoft, shape: BoxShape.circle),
                child: Icon(Icons.verified_rounded, color: cn.accent, size: 36),
              ),
              const SizedBox(height: 14),
              Text(
                'Verify Your Student Status',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: cn.textPrimary),
              ),
              const SizedBox(height: 6),
              Text(
                '₦1,500 for 3 months · Validated by CampusNetwork Admins',
                textAlign: TextAlign.center,
                style: TextStyle(color: cn.accentLight, fontWeight: FontWeight.w800, fontSize: 13.5),
              ),
              const SizedBox(height: 20),
              for (final p in perks)
                Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(p.$1, color: cn.accentLight, size: 22),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(p.$2, style: TextStyle(fontWeight: FontWeight.w800, color: cn.textPrimary, fontSize: 14.5)),
                            Text(p.$3, style: TextStyle(color: cn.textMuted, fontSize: 12.5, height: 1.4)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => setState(() => _started = true),
                  child: const Text('Start Verification'),
                ),
              ),
            ],
          ),
        ),
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

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        MorphismCard(
          padding: const EdgeInsets.all(22),
          radius: 26,
          child: Column(
            children: [
              Icon(icon, size: 54, color: color),
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
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () => setState(() => _started = true),
                    child: const Text('Apply / Resubmit'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
