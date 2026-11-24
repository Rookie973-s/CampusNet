import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../auth/auth_provider.dart';

class ChatsScreen extends ConsumerStatefulWidget {
  const ChatsScreen({super.key, this.initialConvoId});
  final int? initialConvoId;

  @override
  ConsumerState<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends ConsumerState<ChatsScreen> {
  List<Map<String, dynamic>> _convos = [];
  List<Map<String, dynamic>> _messages = [];
  int? _activeId;
  bool _loading = true;
  final _ctrl = TextEditingController();
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _activeId = widget.initialConvoId;
    _loadConvos();
    if (_activeId != null) _openConvo(_activeId!);
  }

  @override
  void dispose() {
    _poll?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _loadConvos() async {
    try {
      final res = await ref.read(apiClientProvider).dio.get('/chats/');
      final raw = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
      setState(() => _convos = raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList());
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openConvo(int id) async {
    _poll?.cancel();
    setState(() => _activeId = id);
    await _loadMessages(id);
    _poll = Timer.periodic(const Duration(seconds: 6), (_) => _loadMessages(id));
  }

  Future<void> _loadMessages(int id) async {
    try {
      final api = ref.read(apiClientProvider);
      final res = await api.dio.get('/chats/$id/messages/');
      final raw = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
      if (mounted) setState(() => _messages = raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList());
      api.dio.post('/chats/$id/read/').then((_) {}, onError: (_) {});
    } catch (_) {}
  }

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty || _activeId == null) return;
    _ctrl.clear();
    try {
      final res = await ref.read(apiClientProvider).dio.post('/chats/$_activeId/messages/', data: {'body': text});
      if (mounted) setState(() => _messages = [..._messages, Map<String, dynamic>.from(res.data as Map)]);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(authProvider.select((s) => s.user));

    if (_activeId != null) {
      return Scaffold(
        backgroundColor: CNColors.bg,
        appBar: AppBar(
          leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => setState(() => _activeId = null)),
          title: const Text('SUG Chat', style: TextStyle(fontWeight: FontWeight.w800)),
        ),
        body: Column(
          children: [
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(14),
                itemCount: _messages.length,
                itemBuilder: (_, i) {
                  final m = _messages[i];
                  final mine = m['sender'] == me?.id || m['sender_id'] == me?.id || m['is_mine'] == true;
                  return Align(
                    alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: mine ? CNColors.accent : CNColors.surfaceHigh,
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Text((m['body'] ?? m['text'] ?? '').toString(), style: const TextStyle(color: Colors.white)),
                    ),
                  );
                },
              ),
            ),
            Container(
              color: CNColors.surface,
              padding: EdgeInsets.fromLTRB(12, 8, 12, MediaQuery.of(context).padding.bottom + 10),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _ctrl,
                      decoration: const InputDecoration(hintText: 'Write a message...', border: InputBorder.none),
                    ),
                  ),
                  LiquidTap(
                    onTap: _send,
                    child: Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(color: CNColors.accent, borderRadius: BorderRadius.circular(14)),
                      child: const Icon(Icons.send_rounded, color: Colors.white, size: 19),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      backgroundColor: CNColors.bg,
      appBar: AppBar(title: const Text('SUG Chats', style: TextStyle(fontWeight: FontWeight.w800))),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _convos.isEmpty
              ? const Center(child: Text('No conversations yet.', style: TextStyle(color: CNColors.textMuted)))
              : ListView.separated(
                  padding: const EdgeInsets.all(14),
                  itemCount: _convos.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final c = _convos[i];
                    final peer = (c['other_user'] ?? c['sug'] ?? c['student'] ?? {}) as Map;
                    return LiquidTap(
                      onTap: () => _openConvo((c['id'] as num).toInt()),
                      child: MorphismCard(
                        padding: const EdgeInsets.all(14),
                        child: Row(
                          children: [
                            UserAvatar(
                              url: normalizeMediaUrl(peer['avatar_url']?.toString()),
                              initials: (peer['av'] ?? 'SG').toString(),
                              size: 44,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text((peer['name'] ?? peer['username'] ?? 'SUG Official').toString(), style: const TextStyle(fontWeight: FontWeight.w800)),
                                  Text(
                                    (c['last_message'] is Map ? c['last_message']['body'] : c['last_message'] ?? 'Tap to chat').toString(),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(color: CNColors.textMuted, fontSize: 12.5),
                                  ),
                                ],
                              ),
                            ),
                            const Icon(Icons.chevron_right_rounded, color: CNColors.textFaint),
                          ],
                        ),
                      ),
                    );
                  },
                ),
    );
  }
}
