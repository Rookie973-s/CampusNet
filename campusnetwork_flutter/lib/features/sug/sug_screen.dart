import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../auth/auth_provider.dart';
import '../auth/landing_screen.dart';

/// Meet the SUG Screen with Telegram-style Physics Stacked Card Deck (SUG CARD video)
class SugScreen extends ConsumerStatefulWidget {
  const SugScreen({super.key});

  @override
  ConsumerState<SugScreen> createState() => _SugScreenState();
}

class _SugScreenState extends ConsumerState<SugScreen> with SingleTickerProviderStateMixin {
  List<Map<String, dynamic>> _all = [];
  String _search = '';
  String _dept = 'All';
  int _idx = 0;
  bool _loading = true;
  late final AnimationController _cardCtrl;

  @override
  void initState() {
    super.initState();
    _cardCtrl = AnimationController.unbounded(vsync: this, value: 1.0);
    _load();
  }

  @override
  void dispose() {
    _cardCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (ref.read(authProvider).user == null) {
      setState(() => _loading = false);
      return;
    }
    setState(() => _loading = true);
    try {
      final res = await ref.read(apiClientProvider).dio.get('/staff/');
      final raw = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
      setState(() => _all = raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList());
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _stepTo(int next, int total) {
    if (total <= 1) return;
    HapticFeedback.selectionClick();
    setState(() => _idx = (next + total) % total);
    _cardCtrl.value = 0.88;
    _cardCtrl.animateWith(SpringSimulation(LiquidSprings.bouncy, 0.88, 1.0, 0));
  }

  Future<void> _messageRep(Map<String, dynamic> rep) async {
    try {
      final res = await ref.read(apiClientProvider).dio.post('/chats/start/', data: {'sug_id': rep['id'], 'message': ''});
      final convoId = (res.data['id'] as num?)?.toInt();
      if (mounted) context.push('/chats', extra: convoId);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    }
  }

  void _openRateModal(Map<String, dynamic> rep) {
    int stars = 5;
    final note = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: CNColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Rate ${rep['name']}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (int n = 1; n <= 5; n++)
                    IconButton(
                      icon: Icon(n <= stars ? Icons.star_rounded : Icons.star_border_rounded, color: CNColors.gold, size: 34),
                      onPressed: () => setS(() => stars = n),
                    ),
                ],
              ),
              TextField(
                controller: note,
                decoration: const InputDecoration(hintText: 'Share constructive feedback...'),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () async {
                    try {
                      await ref.read(apiClientProvider).dio.post('/users/${rep['id']}/rate-sug/', data: {'score': stars, 'comment': note.text.trim()});
                      if (ctx.mounted) Navigator.of(ctx).pop();
                      _load();
                    } catch (_) {}
                  },
                  child: const Text('Submit Rating'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider.select((s) => s.user));
    final depts = ref.watch(departmentsProvider).valueOrNull ?? const <DepartmentItem>[];

    if (user == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: MorphismCard(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.verified_user_outlined, size: 46, color: CNColors.gold),
                const SizedBox(height: 10),
                const Text('Meet the SUG', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                const SizedBox(height: 6),
                const Text('Sign in to rate verified SUG officials and message them directly.', textAlign: TextAlign.center, style: TextStyle(color: CNColors.textMuted)),
                const SizedBox(height: 14),
                ElevatedButton(onPressed: () => showAuthSheet(context), child: const Text('Sign In')),
              ],
            ),
          ),
        ),
      );
    }

    final filtered = _all.where((s) {
      if (_dept != 'All' && s['dept_name'] != _dept && s['dept'] != _dept) return false;
      if (_search.trim().isEmpty) return true;
      final q = _search.toLowerCase();
      return (s['name'] ?? '').toString().toLowerCase().contains(q) ||
          (s['username'] ?? '').toString().toLowerCase().contains(q) ||
          (s['title'] ?? '').toString().toLowerCase().contains(q);
    }).toList();

    final safeIdx = filtered.isEmpty ? 0 : _idx % filtered.length;
    final active = filtered.isEmpty ? null : filtered[safeIdx];
    final prev = filtered.length > 1 ? filtered[(safeIdx - 1 + filtered.length) % filtered.length] : null;
    final next = filtered.length > 1 ? filtered[(safeIdx + 1) % filtered.length] : null;

    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 120),
      children: [
        Row(
          children: [
            const Expanded(child: Text('Meet the SUG', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900))),
            LiquidTap(
              onTap: () => context.push('/apply-sug'),
              child: const Text('Apply for SUG', style: TextStyle(color: CNColors.accentLight, fontWeight: FontWeight.w800)),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: FacultyDropdown(
                options: [
                  const DropdownOption(label: 'All Faculties', value: 'All'),
                  ...depts.map((d) => DropdownOption(label: d.name, value: d.name, colorHex: d.color)),
                ],
                value: _dept,
                onChanged: (v) => setState(() {
                  _dept = v;
                  _idx = 0;
                }),
              ),
            ),
            const SizedBox(width: 10),
            MorphismSearchInput(
              value: _search,
              placeholder: 'Search SUG...',
              onChanged: (v) => setState(() => _search = v),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (_loading)
          const Center(child: Padding(padding: EdgeInsets.all(36), child: CircularProgressIndicator()))
        else if (active == null)
          const MorphismCard(child: Center(child: Text('No SUG officials found.', style: TextStyle(color: CNColors.textMuted))))
        else
          GestureDetector(
            onVerticalDragEnd: (d) {
              if ((d.primaryVelocity ?? 0) < -180) _stepTo(safeIdx + 1, filtered.length);
              if ((d.primaryVelocity ?? 0) > 180) _stepTo(safeIdx - 1, filtered.length);
            },
            child: Column(
              children: [
                if (prev != null) _PeekPill(rep: prev, icon: Icons.keyboard_arrow_up_rounded, onTap: () => _stepTo(safeIdx - 1, filtered.length)),
                const SizedBox(height: 10),
                AnimatedBuilder(
                  animation: _cardCtrl,
                  builder: (_, child) => Transform.scale(scale: _cardCtrl.value.clamp(0.85, 1.04), child: child),
                  child: MorphismCard(
                    padding: EdgeInsets.zero,
                    radius: 24,
                    child: Column(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          decoration: const BoxDecoration(
                            color: Color(0xFF0B1220),
                            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.verified_user_rounded, size: 15, color: CNColors.accentLight),
                              const SizedBox(width: 6),
                              const Text('Verified SUG', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                              const Spacer(),
                              if (active['dept_name'] != null || active['dept'] != null)
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                                  decoration: BoxDecoration(color: Colors.white12, borderRadius: BorderRadius.circular(99)),
                                  child: Text((active['dept_name'] ?? active['dept']).toString(), style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700)),
                                ),
                            ],
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(18),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  UserAvatar(
                                    url: normalizeMediaUrl(active['avatar_url']?.toString()),
                                    initials: (active['av'] ?? 'SG').toString(),
                                    bgHex: (active['bg'] ?? '#EF4444').toString(),
                                    size: 62,
                                  ),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text((active['name'] ?? '').toString(), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                                        if (active['username'] != null)
                                          Text('@${active['username']}', style: const TextStyle(color: CNColors.accentLight, fontWeight: FontWeight.w700, fontSize: 13)),
                                        Text((active['title'] ?? 'SUG Official').toString(), style: const TextStyle(color: CNColors.textMuted, fontSize: 13)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              if ((active['bio'] ?? '').toString().isNotEmpty) ...[
                                const SizedBox(height: 12),
                                Text(active['bio'].toString(), style: const TextStyle(fontSize: 13.5, height: 1.45)),
                              ],
                              const SizedBox(height: 14),
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(color: CNColors.surfaceRecessed, borderRadius: BorderRadius.circular(16)),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                                  children: [
                                    Column(
                                      children: [
                                        Row(
                                          children: [
                                            for (int n = 1; n <= 5; n++)
                                              Icon(
                                                n <= ((active['sug_rating'] as num?)?.round() ?? 0) ? Icons.star_rounded : Icons.star_border_rounded,
                                                size: 16,
                                                color: CNColors.gold,
                                              ),
                                          ],
                                        ),
                                        const SizedBox(height: 3),
                                        Text(
                                          (active['sug_ratings_count'] ?? 0) > 0 ? '${active['sug_rating']} (${active['sug_ratings_count']})' : 'Not rated yet',
                                          style: const TextStyle(color: CNColors.textMuted, fontSize: 11.5),
                                        ),
                                      ],
                                    ),
                                    Column(
                                      children: [
                                        Text('${active['answers'] ?? 0}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                                        const Text('Answers on Cenet', style: TextStyle(color: CNColors.textMuted, fontSize: 11.5)),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 14),
                              Row(
                                children: [
                                  Expanded(
                                    child: LiquidTap(
                                      onTap: () => _openRateModal(active),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(vertical: 12),
                                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(99)),
                                        alignment: Alignment.center,
                                        child: const Text('Rate Official', style: TextStyle(color: Colors.black, fontWeight: FontWeight.w800)),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: LiquidTap(
                                      onTap: () => _messageRep(active),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(vertical: 12),
                                        decoration: BoxDecoration(color: CNColors.accent, borderRadius: BorderRadius.circular(99)),
                                        alignment: Alignment.center,
                                        child: const Text('Message', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                if (next != null) _PeekPill(rep: next, icon: Icons.keyboard_arrow_down_rounded, onTap: () => _stepTo(safeIdx + 1, filtered.length)),
                const SizedBox(height: 8),
                Text('${safeIdx + 1} / ${filtered.length} · Swipe card or tap pills to cycle', style: const TextStyle(color: CNColors.textFaint, fontSize: 12)),
              ],
            ),
          ),
      ],
    );
  }
}

class _PeekPill extends StatelessWidget {
  const _PeekPill({required this.rep, required this.icon, required this.onTap});
  final Map<String, dynamic> rep;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      child: Opacity(
        opacity: 0.78,
        child: LiquidTap(
          onTap: onTap,
          child: MorphismCard(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            radius: 20,
            child: Row(
              children: [
                UserAvatar(
                  url: normalizeMediaUrl(rep['avatar_url']?.toString()),
                  initials: (rep['av'] ?? 'SG').toString(),
                  bgHex: (rep['bg'] ?? '#3B82F6').toString(),
                  size: 32,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text((rep['name'] ?? '').toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                      Text((rep['title'] ?? 'Tap or swipe to view').toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: CNColors.textMuted, fontSize: 11.5)),
                    ],
                  ),
                ),
                Icon(icon, color: CNColors.textFaint),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
