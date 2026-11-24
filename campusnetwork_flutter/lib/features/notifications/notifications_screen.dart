import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/motion/liquid_motion.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_provider.dart';

/// Real-Time Notifications Screen (matches Notifications reference layout with red unread dots)
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifs = ref.watch(notificationsProvider);
    final unread = ref.watch(unreadNotificationsCountProvider);

    return Scaffold(
      backgroundColor: CNColors.bg,
      appBar: AppBar(
        title: Row(
          children: [
            const Text('Notifications', style: TextStyle(fontWeight: FontWeight.w900)),
            if (unread > 0) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: CNColors.danger, borderRadius: BorderRadius.circular(99)),
                child: Text('$unread', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800)),
              ),
            ],
          ],
        ),
        actions: [
          if (unread > 0)
            TextButton(
              onPressed: () => ref.read(notificationsProvider.notifier).markAllRead(),
              child: const Text('Mark read'),
            ),
          if (notifs.isNotEmpty)
            TextButton(
              onPressed: () => ref.read(notificationsProvider.notifier).clearAll(),
              child: const Text('Clear', style: TextStyle(color: CNColors.danger)),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(notificationsProvider.notifier).refresh(),
        child: notifs.isEmpty
            ? ListView(
                children: const [
                  SizedBox(height: 120),
                  Center(child: Text("You're all caught up!", style: TextStyle(color: CNColors.textMuted))),
                ],
              )
            : ListView.separated(
                padding: const EdgeInsets.all(14),
                itemCount: notifs.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) {
                  final n = notifs[i];
                  return LiquidTap(
                    onTap: () {
                      ref.read(notificationsProvider.notifier).markRead(n.id);
                      if (n.link.startsWith('/chats')) {
                        context.push('/chats');
                      } else if (n.link.startsWith('/communities')) {
                        context.push('/communities');
                      } else if (n.link.startsWith('/sug')) {
                        context.go('/sug');
                      } else {
                        context.go('/feed');
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.all(13),
                      decoration: BoxDecoration(
                        color: n.read ? CNColors.surface : CNColors.accentSoft,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: CNColors.borderSubtle),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 42,
                            height: 42,
                            decoration: BoxDecoration(color: const Color(0xFF0F172A), borderRadius: BorderRadius.circular(12)),
                            child: Icon(
                              n.type == 'like'
                                  ? Icons.favorite_rounded
                                  : n.type == 'chat'
                                      ? Icons.mail_rounded
                                      : Icons.notifications_rounded,
                              color: n.type == 'like' ? CNColors.danger : CNColors.accentLight,
                              size: 20,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(n.text, style: TextStyle(fontWeight: n.read ? FontWeight.w500 : FontWeight.w700, fontSize: 13.5, height: 1.35)),
                                const SizedBox(height: 3),
                                Text(n.time, style: const TextStyle(color: CNColors.textFaint, fontSize: 11.5)),
                              ],
                            ),
                          ),
                          if (!n.read)
                            Container(width: 9, height: 9, decoration: const BoxDecoration(color: CNColors.danger, shape: BoxShape.circle)),
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
