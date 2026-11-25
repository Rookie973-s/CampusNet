import 'dart:convert';
import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/form_templates.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../../core/widgets/skeleton_widgets.dart';
import '../auth/auth_provider.dart';
import '../auth/landing_screen.dart';

const _kPlacements = [
  ('feed', 'Main Feed'),
  ('library', 'PDF Library'),
  ('communities', 'Communities'),
  ('comments', 'Comments'),
];

/// Advertising Dashboard & Analytics (ADS TRACKER ref) + Summary Screen (Image 3)
/// + 5-Step Styled Ad Wizard (Steps Form ref) with server-authoritative ₦5,000 cap.
class AdsDashboardScreen extends ConsumerStatefulWidget {
  const AdsDashboardScreen({super.key});

  @override
  ConsumerState<AdsDashboardScreen> createState() => _AdsDashboardScreenState();
}

class _AdsDashboardScreenState extends ConsumerState<AdsDashboardScreen> {
  String _range = '30d';
  Map<String, dynamic> _analytics = {};
  List<Map<String, dynamic>> _campaigns = [];
  bool _loading = true;
  int _selectedDayIdx = -1;

  @override
  void initState() {
    super.initState();
    ref.read(departmentsProvider.notifier).ensureLoaded();
    _load();
  }

  Future<void> _load() async {
    if (ref.read(authProvider).user == null) {
      setState(() => _loading = false);
      return;
    }
    setState(() => _loading = true);
    try {
      final api = ref.read(apiClientProvider);
      final res = await Future.wait([
        api.dio.get('/ads/analytics/', queryParameters: {'range': _range}).catchError((_) => Response(requestOptions: RequestOptions(path: ''), data: {})),
        api.dio.get('/ads/').catchError((_) => Response(requestOptions: RequestOptions(path: ''), data: [])),
      ]);
      final ana = res[0].data is Map ? Map<String, dynamic>.from(res[0].data as Map) : <String, dynamic>{};
      final rawCamps = res[1].data is List ? res[1].data as List : (res[1].data is Map ? (res[1].data['results'] as List? ?? []) : []);
      final camps = rawCamps.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
      final daily = (ana['daily'] as List? ?? []);
      setState(() {
        _analytics = ana;
        _campaigns = camps;
        _selectedDayIdx = daily.isNotEmpty ? daily.length - 1 : -1;
      });
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _togglePause(Map<String, dynamic> camp) async {
    final id = camp['id'];
    final isPaused = (camp['status'] ?? '').toString() == 'paused';
    try {
      await ref.read(apiClientProvider).dio.post('/ads/$id/${isPaused ? 'resume' : 'pause'}/');
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    }
  }

  Future<void> _payExisting(Map<String, dynamic> camp) async {
    try {
      final res = await ref.read(apiClientProvider).dio.post('/ads/${camp['id']}/initiate-payment/');
      final url = res.data['authorization_url']?.toString();
      if (url != null && url.isNotEmpty) {
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      } else {
        _load();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    }
  }

  void _openCreateWizard() {
    Navigator.of(context)
        .push<bool>(MaterialPageRoute(builder: (_) => const _AdWizardScreen()))
        .then((created) {
      if (created == true) _load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final user = ref.watch(authProvider.select((s) => s.user));

    return Scaffold(
      backgroundColor: cn.bg,
      appBar: AppBar(
        title: Text('Campus Ads', style: TextStyle(fontWeight: FontWeight.w900, color: cn.textPrimary)),
        actions: [
          if (user != null)
            Padding(
              padding: const EdgeInsets.only(right: 10),
              child: LiquidTap(
                onTap: _openCreateWizard,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
                  decoration: BoxDecoration(color: const Color(0xFF0E4D45), borderRadius: BorderRadius.circular(999)),
                  child: const Row(
                    children: [
                      Icon(Icons.add_rounded, size: 17, color: Colors.white),
                      SizedBox(width: 4),
                      Text('Place Ad', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12.5)),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
      body: user == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: MorphismCard(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.campaign_rounded, size: 48, color: cn.success),
                      const SizedBox(height: 10),
                      Text('Advertise on CampusNetwork', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                      const SizedBox(height: 6),
                      Text(
                        'Reach students across Feeds, Library, Communities & Comments. Plans capped at ₦5,000.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: cn.textMuted),
                      ),
                      const SizedBox(height: 16),
                      ForestPillButton(label: 'Sign In to Advertise', onTap: () => showAuthSheet(context)),
                    ],
                  ),
                ),
              ),
            )
          : RefreshIndicator(
              color: cn.accent,
              onRefresh: _load,
              child: _loading ? const AdsDashboardSkeleton() : _buildDashboardBody(cn),
            ),
    );
  }

  Widget _buildDashboardBody(CampusColors cn) {
    final totalImpressions = (_analytics['impressions'] ?? _analytics['total_impressions'] ?? 0);
    final totalClicks = (_analytics['clicks'] ?? _analytics['total_clicks'] ?? 0);
    final ctr = (_analytics['ctr'] ?? 0);
    final daily = (_analytics['daily'] as List? ?? [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final maxImp = daily.fold<int>(1, (m, d) => math.max(m, (d['impressions'] as num?)?.toInt() ?? 0));
    final selDay = (_selectedDayIdx >= 0 && _selectedDayIdx < daily.length) ? daily[_selectedDayIdx] : null;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 48),
      children: [
        Row(
          children: [
            for (final r in [('7d', '7 Days'), ('30d', '30 Days'), ('90d', '90 Days')])
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: LiquidTap(
                  onTap: () {
                    setState(() => _range = r.$1);
                    _load();
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                    decoration: BoxDecoration(
                      color: _range == r.$1 ? cn.accent : cn.surface,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: _range == r.$1 ? cn.accent : cn.borderSubtle),
                    ),
                    child: Text(
                      r.$2,
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 12.5,
                        color: _range == r.$1 ? Colors.white : cn.textMuted,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(child: _KpiTile(label: 'Impressions', value: '$totalImpressions', color: cn.accentLight)),
            const SizedBox(width: 8),
            Expanded(child: _KpiTile(label: 'Clicks', value: '$totalClicks', color: cn.success)),
            const SizedBox(width: 8),
            Expanded(child: _KpiTile(label: 'CTR', value: '$ctr%', color: cn.gold)),
          ],
        ),
        const SizedBox(height: 14),
        MorphismCard(
          padding: const EdgeInsets.all(16),
          radius: 22,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text('Performance Trend', style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                  const Spacer(),
                  if (selDay != null)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                      decoration: BoxDecoration(color: cn.accentSoft, borderRadius: BorderRadius.circular(8)),
                      child: Text(
                        '${selDay['date']}: ${selDay['impressions'] ?? 0} imp · ${selDay['clicks'] ?? 0} clk',
                        style: TextStyle(color: cn.accentLight, fontWeight: FontWeight.w800, fontSize: 11),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              if (daily.isEmpty)
                SizedBox(
                  height: 100,
                  child: Center(
                    child: Text('Launch a campaign to see live impressions & clicks.', style: TextStyle(color: cn.textMuted, fontSize: 13)),
                  ),
                )
              else
                SizedBox(
                  height: 118,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (int i = math.max(0, daily.length - 14); i < daily.length; i++)
                        Expanded(
                          child: GestureDetector(
                            onTap: () => setState(() => _selectedDayIdx = i),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 2),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  AnimatedContainer(
                                    duration: const Duration(milliseconds: 220),
                                    height: 10 + (86 * (((daily[i]['impressions'] as num?)?.toInt() ?? 0) / maxImp)),
                                    decoration: BoxDecoration(
                                      color: i == _selectedDayIdx ? cn.accent : cn.accent.withValues(alpha: 0.42),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            Text('Your Campaigns (${_campaigns.length})', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: cn.textPrimary)),
            const Spacer(),
            Text('Max ₦5,000 / campaign', style: TextStyle(color: cn.textFaint, fontSize: 12, fontWeight: FontWeight.w700)),
          ],
        ),
        const SizedBox(height: 10),
        if (_campaigns.isEmpty)
          MorphismCard(
            padding: const EdgeInsets.all(22),
            child: Column(
              children: [
                Icon(Icons.rocket_launch_outlined, size: 40, color: cn.success),
                const SizedBox(height: 10),
                Text('No campaigns yet', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: cn.textPrimary)),
                const SizedBox(height: 4),
                Text(
                  'Promote your campus business, event, or tutorial directly inside student feeds.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: cn.textMuted, fontSize: 13),
                ),
                const SizedBox(height: 16),
                StepPrimaryButton(label: 'Create Your First Ad', onTap: _openCreateWizard),
              ],
            ),
          )
        else
          for (final c in _campaigns) _buildCampaignCard(cn, c),
      ],
    );
  }

  Widget _buildCampaignCard(CampusColors cn, Map<String, dynamic> c) {
    final status = (c['status'] ?? 'pending').toString();
    final isActive = status == 'active' || status == 'approved';
    final isPaused = status == 'paused';
    final needsPay = c['payment_status'] != 'paid' && status == 'pending';
    final badgeColor = isActive ? cn.success : (isPaused ? cn.warning : cn.accentLight);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: MorphismCard(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    (c['title'] ?? 'Untitled Ad').toString(),
                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15.5, color: cn.textPrimary),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                  decoration: BoxDecoration(color: badgeColor.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(999)),
                  child: Text(status.toUpperCase(), style: TextStyle(color: badgeColor, fontWeight: FontWeight.w800, fontSize: 10.5)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Budget: ₦${c['total_budget'] ?? 0} · ${c['impressions_count'] ?? 0} imp · ${c['clicks_count'] ?? 0} clicks',
              style: TextStyle(color: cn.textMuted, fontSize: 12.5),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                if (isActive || isPaused)
                  OutlinedButton.icon(
                    onPressed: () => _togglePause(c),
                    icon: Icon(isPaused ? Icons.play_arrow_rounded : Icons.pause_rounded, size: 17),
                    label: Text(isPaused ? 'Resume' : 'Pause'),
                  ),
                if (needsPay)
                  ElevatedButton.icon(
                    onPressed: () => _payExisting(c),
                    icon: const Icon(Icons.payment_rounded, size: 17),
                    label: const Text('Complete Payment'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({required this.label, required this.value, required this.color});
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    return MorphismCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      radius: 18,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: color)),
          const SizedBox(height: 2),
          Text(label, style: TextStyle(color: cn.textMuted, fontSize: 11.5, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

/// Ad Placement Flow:
/// 1. Summary Screen (Image 3 style)
/// 2. 5-Step Styled Wizard (Image 2 style — server quote capped at ₦5,000 + Paystack)
class _AdWizardScreen extends ConsumerStatefulWidget {
  const _AdWizardScreen();

  @override
  ConsumerState<_AdWizardScreen> createState() => _AdWizardScreenState();
}

class _AdWizardScreenState extends ConsumerState<_AdWizardScreen> {
  bool _passedSummary = false;
  int _step = 0; // 0..4 (5 steps)
  final _title = TextEditingController();
  final _desc = TextEditingController();
  final _ctaText = TextEditingController(text: 'Learn More');
  final _ctaUrl = TextEditingController();

  XFile? _image;
  String _targetFaculty = '';
  int _durationDays = 7;
  final Set<String> _placements = {'feed'};
  double _computedPriceNgn = 900;
  Map<String, dynamic>? _quote;
  bool _quoting = false;
  bool _submitting = false;

  String _isoDate(DateTime dt) =>
      '${dt.year.toString().padLeft(4, '0')}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';

  Map<String, dynamic> _buildTargetingPayload() {
    if (_targetFaculty.isEmpty) {
      return {'audience': 'all', 'faculties': <String>[]};
    }
    return {
      'audience': 'faculty',
      'faculties': [_targetFaculty],
    };
  }

  @override
  void initState() {
    super.initState();
    ref.read(departmentsProvider.notifier).ensureLoaded();
    _refreshQuote();
  }

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    _ctaText.dispose();
    _ctaUrl.dispose();
    super.dispose();
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _pickImage() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85, maxWidth: 1200);
    if (picked != null) setState(() => _image = picked);
  }

  Future<void> _refreshQuote() async {
    setState(() => _quoting = true);
    try {
      final now = DateTime.now();
      final end = now.add(Duration(days: math.max(0, _durationDays - 1)));
      final res = await ref.read(apiClientProvider).dio.post('/ads/quote/', data: {
        'start_date': _isoDate(now),
        'end_date': _isoDate(end),
        'duration_days': _durationDays,
        'placements': _placements.toList(),
        'targeting': _buildTargetingPayload(),
        if (_targetFaculty.isNotEmpty) 'target_faculty': _targetFaculty,
      });
      if (mounted) {
        final q = Map<String, dynamic>.from(res.data as Map);
        setState(() {
          _quote = q;
          final serverAmount = (q['amount_num'] as num?)?.toDouble() ??
              double.tryParse((q['amount_ngn'] ?? '').toString());
          if (serverAmount != null) {
            _computedPriceNgn = serverAmount.clamp(900, 5000);
          }
        });
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _quoting = false);
    }
  }

  Future<void> _launchCampaign() async {
    final headline = _title.text.trim();
    final desc = _desc.text.trim();
    if (headline.isEmpty || desc.isEmpty) {
      _toast('Enter your ad headline and description.');
      return;
    }
    var destUrl = _ctaUrl.text.trim();
    if (destUrl.isNotEmpty && !destUrl.startsWith('http://') && !destUrl.startsWith('https://')) {
      destUrl = 'https://$destUrl';
    }

    setState(() => _submitting = true);
    try {
      final api = ref.read(apiClientProvider);
      final now = DateTime.now();
      final end = now.add(Duration(days: math.max(0, _durationDays - 1)));
      final form = FormData();
      form.fields.addAll([
        MapEntry('name', headline),
        MapEntry('headline', headline),
        MapEntry('description', desc),
        MapEntry('cta_text', _ctaText.text.trim().isEmpty ? 'Learn More' : _ctaText.text.trim()),
        if (destUrl.isNotEmpty) MapEntry('destination_url', destUrl),
        MapEntry('start_date', _isoDate(now)),
        MapEntry('end_date', _isoDate(end)),
        MapEntry('placements', jsonEncode(_placements.toList())),
        MapEntry('targeting', jsonEncode(_buildTargetingPayload())),
        MapEntry('total_budget', _computedPriceNgn.clamp(900, 5000).toStringAsFixed(2)),
      ]);
      if (_image != null) {
        form.files.add(MapEntry('image', await MultipartFile.fromFile(_image!.path, filename: _image!.name)));
      }
      final createRes = await api.dio.post('/ads/', data: form);
      final adId = createRes.data['id'];
      try {
        final payRes = await api.dio.post('/ads/$adId/initiate-payment/');
        final url = (payRes.data['checkout_url'] ?? payRes.data['authorization_url'])?.toString();
        if (url != null && url.isNotEmpty) {
          await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
        }
      } catch (_) {}
      if (mounted) {
        _toast('Campaign created! Complete payment if prompted.');
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      _toast(parseApiError(e));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final depts = ref.watch(departmentsProvider).valueOrNull ?? const <DepartmentItem>[];

    // 1. Summary Screen (Image 3 style)
    if (!_passedSummary) {
      return FlowSummaryScreen(
        badgeText: 'MAX ₦5,000 / CAMPAIGN',
        headline: 'Place\nCampus Ads',
        summary:
            'Promote your student brand, tutorial, event, or campus service natively across Feeds, Library, Communities & Comments.',
        highlights: const [
          (Icons.groups_rounded, 'Target all ATBU students or narrow down to a specific faculty'),
          (Icons.visibility_outlined, 'Fair multi-campaign rotation with real impressions & clicks tracking'),
          (Icons.account_balance_wallet_outlined, 'Student-friendly budgets strictly capped at ₦5,000'),
          (Icons.insights_rounded, 'Live analytics dashboard with pause & resume anytime'),
        ],
        ctaLabel: 'Build Your Ad',
        ctaIcon: Icons.campaign_rounded,
        onContinue: () => setState(() => _passedSummary = true),
      );
    }

    // 2. 5-Step Styled Wizard (Image 2 style)
    final stepTitles = [
      'Ad Creative',
      'Target Audience',
      'Placements & Days',
      'Campaign Budget',
      'Review & Launch',
    ];
    final stepSubtitles = [
      'Write a clear headline, description, and optional banner image.',
      'Reach all students or filter by a specific academic faculty.',
      'Pick where your sponsored card appears and for how long.',
      'Set your placements & duration — pricing is auto-calculated (₦900–₦5,000).',
      'Preview your live sponsored card and launch with Paystack.',
    ];

    final previewAd = ServedAd(
      id: 0,
      headline: _title.text.trim().isEmpty ? 'Your Campaign Headline' : _title.text.trim(),
      description: _desc.text.trim().isEmpty
          ? 'This is how your sponsored card will appear natively inside student feeds.'
          : _desc.text.trim(),
      ctaText: _ctaText.text.trim().isEmpty ? 'Learn More' : _ctaText.text.trim(),
      destinationUrl: _ctaUrl.text.trim(),
    );

    return StepsFormScaffold(
      stepTitle: stepTitles[_step],
      subtitle: stepSubtitles[_step],
      currentStep: _step,
      totalSteps: 5,
      primaryLabel: _step < 4 ? 'Continue' : 'Launch & Pay ₦${_computedPriceNgn.round()}',
      primaryBusy: _submitting,
      onBack: () => setState(() {
        if (_step == 0) {
          _passedSummary = false;
        } else {
          _step--;
        }
      }),
      onPrimary: () {
        if (_step == 0 && (_title.text.trim().isEmpty || _desc.text.trim().isEmpty)) {
          _toast('Enter a headline and description first.');
          return;
        }
        if (_step < 4) {
          setState(() => _step++);
          if (_step == 3) _refreshQuote();
        } else {
          _launchCampaign();
        }
      },
      body: _buildStepBody(cn, depts, previewAd),
    );
  }

  Widget _buildStepBody(CampusColors cn, List<DepartmentItem> depts, ServedAd previewAd) {
    final isDark = context.isDark;
    final cardBg = isDark ? const Color(0xFF18221F) : Colors.white;

    if (_step == 0) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          StepCardInput(
            controller: _title,
            hint: 'Headline (e.g. Fast Laptop Repairs @ Yelwa) *',
            icon: Icons.title_rounded,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
          StepCardInput(
            controller: _desc,
            hint: 'Tell students what you offer... *',
            icon: Icons.description_outlined,
            maxLines: 3,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: StepCardInput(
                  controller: _ctaText,
                  hint: 'Button Text',
                  icon: Icons.touch_app_outlined,
                  onChanged: (_) => setState(() {}),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: StepCardInput(
                  controller: _ctaUrl,
                  hint: 'Link / WhatsApp',
                  icon: Icons.link_rounded,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          LiquidTap(
            onTap: _pickImage,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: cardBg,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))],
              ),
              child: Row(
                children: [
                  Icon(_image != null ? Icons.check_circle_rounded : Icons.add_photo_alternate_outlined,
                      color: _image != null ? cn.success : const Color(0xFF0E4D45)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _image != null ? 'Image selected (${_image!.name})' : 'Add Ad Banner Image (optional)',
                      style: TextStyle(fontWeight: FontWeight.w700, color: cn.textPrimary, fontSize: 13.5),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text('Live Feed Preview', style: TextStyle(color: cn.textMuted, fontWeight: FontWeight.w800, fontSize: 12)),
          const SizedBox(height: 6),
          IgnorePointer(child: NativeAdCard(ad: previewAd, placement: 'preview')),
        ],
      );
    }

    if (_step == 1) {
      return Column(
        children: [
          FacultyDropdown(
            options: [
              const DropdownOption(label: 'All Campus Students', value: ''),
              ...depts.map((d) => DropdownOption(label: d.name, value: d.name, colorHex: d.color)),
            ],
            value: _targetFaculty,
            onChanged: (v) {
              setState(() => _targetFaculty = v);
              _refreshQuote();
            },
          ),
          if (_quote?['estimated_reach'] != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: cardBg,
                borderRadius: BorderRadius.circular(14),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))],
              ),
              child: Row(
                children: [
                  Icon(Icons.groups_rounded, color: cn.success, size: 26),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Estimated Reach: ${_quote!['estimated_reach']} active students',
                      style: TextStyle(fontWeight: FontWeight.w800, color: cn.textPrimary),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      );
    }

    if (_step == 2) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: cardBg,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Ad Placements', style: TextStyle(fontWeight: FontWeight.w800, color: cn.textPrimary)),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final p in _kPlacements)
                  FilterChip(
                    label: Text(p.$2),
                    selected: _placements.contains(p.$1),
                    onSelected: (sel) {
                      setState(() {
                        if (sel) {
                          _placements.add(p.$1);
                        } else if (_placements.length > 1) {
                          _placements.remove(p.$1);
                        }
                      });
                      _refreshQuote();
                    },
                  ),
              ],
            ),
            const SizedBox(height: 18),
            Text('Duration: $_durationDays days', style: TextStyle(fontWeight: FontWeight.w800, color: cn.textPrimary)),
            Slider(
              value: _durationDays.toDouble(),
              min: 1,
              max: 30,
              divisions: 29,
              activeColor: const Color(0xFF0E4D45),
              label: '$_durationDays days',
              onChanged: (v) => setState(() => _durationDays = v.round()),
              onChangeEnd: (_) => _refreshQuote(),
            ),
          ],
        ),
      );
    }

    if (_step == 3) {
      final breakdown = _quote?['breakdown'] is Map ? Map<String, dynamic>.from(_quote!['breakdown'] as Map) : const <String, dynamic>{};
      return Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: cardBg,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 14, offset: const Offset(0, 5))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Calculated Campaign Price (Non-Negotiable · ₦900 – ₦5,000)',
              style: TextStyle(fontWeight: FontWeight.w800, color: cn.textMuted, fontSize: 12.5),
            ),
            const SizedBox(height: 8),
            if (_quoting)
              const Padding(padding: EdgeInsets.symmetric(vertical: 14), child: SkeletonBox(height: 36, width: 160, radius: 10))
            else
              Text(
                '₦${_computedPriceNgn.round()}',
                style: TextStyle(fontSize: 36, fontWeight: FontWeight.w900, color: cn.success),
              ),
            const SizedBox(height: 12),
            Text(
              'Determined automatically by your Estimated Reach (${_quote?['estimated_reach'] ?? '—'} students), Placements (${_placements.length}), and Duration ($_durationDays day${_durationDays == 1 ? '' : 's'}).',
              style: TextStyle(color: cn.textMuted, fontSize: 12.5, height: 1.45),
            ),
            if (breakdown.isNotEmpty) ...[
              const SizedBox(height: 14),
              Divider(height: 1, color: cn.divider),
              const SizedBox(height: 10),
              _PriceLine(label: 'Base Campaign Fee', amount: breakdown['base']),
              _PriceLine(label: 'Duration ($_durationDays day${_durationDays == 1 ? '' : 's'})', amount: breakdown['duration']),
              _PriceLine(label: 'Placements (${_placements.length})', amount: breakdown['placements']),
              _PriceLine(label: 'Audience Reach (${_quote?['estimated_reach'] ?? 0})', amount: breakdown['audience']),
            ],
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: cardBg,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Headline: ${_title.text.trim()}', style: TextStyle(color: cn.textPrimary, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text('Audience: ${_targetFaculty.isEmpty ? 'All Campus' : _targetFaculty} (${_quote?['estimated_reach'] ?? 0} students)', style: TextStyle(color: cn.textMuted)),
              Text('Placements: ${_placements.join(', ')}', style: TextStyle(color: cn.textMuted)),
              const SizedBox(height: 4),
              Text(
                'Duration: $_durationDays days · Total: ₦${_computedPriceNgn.round()}',
                style: TextStyle(color: cn.success, fontWeight: FontWeight.w900),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        IgnorePointer(child: NativeAdCard(ad: previewAd, placement: 'preview')),
      ],
    );
  }
}

class _PriceLine extends StatelessWidget {
  const _PriceLine({required this.label, required this.amount});
  final String label;
  final dynamic amount;

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final val = (amount as num?)?.round() ?? 0;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(child: Text(label, style: TextStyle(color: cn.textMuted, fontSize: 13))),
          Text('₦$val', style: TextStyle(color: cn.textPrimary, fontWeight: FontWeight.w800, fontSize: 13)),
        ],
      ),
    );
  }
}
