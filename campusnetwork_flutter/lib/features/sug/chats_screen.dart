import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/clay_system.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../../core/widgets/skeleton_widgets.dart';
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
  bool _loadingMsgs = false;
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

  /// Safely extracts the counterpart user Map from Django's ConversationSerializer.
  /// (`counterpart` is the canonical Map; `sug_info` / `student_info` are fallbacks;
  /// `student` / `sug_rep` are integer PKs and must NEVER be cast to Map!)
  Map<String, dynamic> _extractPeer(Map<String, dynamic> c, int? myId) {
    final cp = c['counterpart'];
    if (cp is Map) return Map<String, dynamic>.from(cp);
    final sugInfo = c['sug_info'];
    final stuInfo = c['student_info'];
    if (myId != null && c['sug_rep'] == myId && stuInfo is Map) {
      return Map<String, dynamic>.from(stuInfo);
    }
    if (sugInfo is Map) return Map<String, dynamic>.from(sugInfo);
    if (stuInfo is Map) return Map<String, dynamic>.from(stuInfo);
    return const {};
  }

  Future<void> _loadConvos() async {
    try {
      final res = await ref.read(apiClientProvider).dio.get('/chats/');
      final raw = res.data is List
          ? res.data as List
          : (res.data is Map ? (res.data['results'] as List? ?? []) : const []);
      if (mounted) {
        setState(() {
          _convos = raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        });
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openConvo(int id) async {
    _poll?.cancel();
    setState(() {
      _activeId = id;
      _loadingMsgs = true;
    });
    await _loadMessages(id);
    if (mounted) setState(() => _loadingMsgs = false);
    _poll = Timer.periodic(const Duration(seconds: 6), (_) => _loadMessages(id));
  }

  Future<void> _loadMessages(int id) async {
    try {
      final api = ref.read(apiClientProvider);
      final res = await api.dio.get('/chats/$id/messages/');
      final raw = res.data is List
          ? res.data as List
          : (res.data is Map ? (res.data['results'] as List? ?? []) : const []);
      if (mounted) {
        setState(() {
          _messages = raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        });
      }
      api.dio.post('/chats/$id/read/').then((_) {}, onError: (_) {});
    } catch (_) {}
  }

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty || _activeId == null) return;
    _ctrl.clear();
    try {
      final res = await ref.read(apiClientProvider).dio.post(
            '/chats/$_activeId/messages/',
            data: {'body': text},
          );
      if (mounted && res.data is Map) {
        setState(() => _messages = [..._messages, Map<String, dynamic>.from(res.data as Map)]);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final me = ref.watch(authProvider.select((s) => s.user));

    if (_activeId != null) {
      final activeConvo = _convos.where((c) => (c['id'] as num?)?.toInt() == _activeId).firstOrNull;
      final peer = activeConvo != null ? _extractPeer(activeConvo, me?.id) : const <String, dynamic>{};
      final peerName = (peer['name'] ?? peer['username'] ?? 'SUG Chat').toString();

      return Scaffold(
        backgroundColor: cn.bg,
        appBar: AppBar(
          leading: IconButton(
            icon: Icon(Icons.arrow_back, color: cn.textPrimary),
            onPressed: () {
              _poll?.cancel();
              setState(() => _activeId = null);
              _loadConvos();
            },
          ),
          title: Row(
            children: [
              UserAvatar(
                url: normalizeMediaUrl(peer['avatar_url']?.toString()),
                initials: (peer['av'] ?? peerName).toString(),
                bgHex: (peer['bg'] ?? '#1D9BF0').toString(),
                size: 32,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      peerName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5, color: cn.textPrimary),
                    ),
                    if ((peer['title'] ?? '').toString().isNotEmpty)
                      Text(
                        peer['title'].toString(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 11.5, color: cn.textMuted),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        body: Column(
          children: [
            Expanded(
              child: _loadingMsgs && _messages.isEmpty
                  ? const ChatsSkeletonList()
                  : _messages.isEmpty
                      ? Center(
                          child: Text('Start the conversation below.', style: TextStyle(color: cn.textMuted)),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.all(14),
                          itemCount: _messages.length,
                          itemBuilder: (_, i) {
                            final m = _messages[i];
                            final mine = m['is_mine'] == true || m['sender'] == me?.id || m['sender_id'] == me?.id;
                            final timeStr = (m['time'] ?? '').toString();
                            return Align(
                              alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                              child: Container(
                                constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
                                margin: const EdgeInsets.only(bottom: 8),
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                decoration: mine
                                    ? ClayDecorations.button(context, color: cn.accent, radius: 20)
                                    : ClayDecorations.card(context, radius: 20, elevation: ClayElevation.low),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      (m['body'] ?? m['text'] ?? '').toString(),
                                      style: TextStyle(color: mine ? Colors.white : cn.textPrimary, fontSize: 14.5, height: 1.4),
                                    ),
                                    if (timeStr.isNotEmpty) ...[
                                      const SizedBox(height: 3),
                                      Text(
                                        timeStr,
                                        style: TextStyle(
                                          color: mine ? Colors.white70 : cn.textFaint,
                                          fontSize: 10.5,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
            ),
            Container(
              color: cn.surface,
              padding: EdgeInsets.fromLTRB(12, 8, 12, MediaQuery.of(context).padding.bottom + 10),
              child: Row(
                children: [
                  Expanded(
                    child: ClayTextField(
                      controller: _ctrl,
                      hint: 'Write a message...',
                      prefixIcon: Icons.chat_bubble_outline_rounded,
                      radius: 22,
                    ),
                  ),
                  const SizedBox(width: 8),
                  LiquidTap(
                    onTap: _send,
                    child: Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(color: cn.accent, borderRadius: BorderRadius.circular(14)),
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
      backgroundColor: cn.bg,
      appBar: AppBar(title: Text('SUG Chats', style: TextStyle(fontWeight: FontWeight.w900, color: cn.textPrimary))),
      body: RefreshIndicator(
        color: cn.accent,
        onRefresh: _loadConvos,
        child: _loading
            ? const ChatsSkeletonList()
            : _convos.isEmpty
                ? ListView(
                    children: [
                      const SizedBox(height: 120),
                      Center(child: Text('No SUG conversations yet.', style: TextStyle(color: cn.textMuted))),
                    ],
                  )
                : ListView.separated(
                    padding: const EdgeInsets.all(14),
                    itemCount: _convos.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) {
                      final c = _convos[i];
                      final peer = _extractPeer(c, me?.id);
                      final name = (peer['name'] ?? peer['username'] ?? 'SUG Official').toString();
                      final lastMsgRaw = c['last_message'];
                      final lastText = lastMsgRaw is Map
                          ? (lastMsgRaw['body'] ?? 'Tap to chat').toString()
                          : (lastMsgRaw?.toString() ?? 'Tap to chat');
                      final lastTime = lastMsgRaw is Map
                          ? (lastMsgRaw['time'] ?? '').toString()
                          : (c['updated_time'] ?? '').toString();
                      final unread = (c['unread_count'] as num?)?.toInt() ?? 0;
                      final convoId = (c['id'] as num?)?.toInt();

                      return LiquidTap(
                        onTap: convoId == null ? null : () => _openConvo(convoId),
                        child: MorphismCard(
                          padding: const EdgeInsets.all(14),
                          child: Row(
                            children: [
                              UserAvatar(
                                url: normalizeMediaUrl(peer['avatar_url']?.toString()),
                                initials: (peer['av'] ?? name).toString(),
                                bgHex: (peer['bg'] ?? '#1D9BF0').toString(),
                                size: 46,
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Flexible(
                                          child: Text(
                                            name,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(fontWeight: FontWeight.w800, color: cn.textPrimary, fontSize: 15),
                                          ),
                                        ),
                                        const SizedBox(width: 4),
                                        BadgeRow(
                                          verified: peer['is_verified_student'] == true,
                                          staff: peer['staff'] == true,
                                          size: 14,
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      lastText.isEmpty ? 'Tap to chat' : lastText,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(color: cn.textMuted, fontSize: 13),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  if (lastTime.isNotEmpty)
                                    Text(lastTime, style: TextStyle(color: cn.textFaint, fontSize: 11)),
                                  if (unread > 0) ...[
                                    const SizedBox(height: 4),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                      decoration: BoxDecoration(color: cn.accent, borderRadius: BorderRadius.circular(999)),
                                      child: Text(
                                        '$unread',
                                        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}
