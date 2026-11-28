import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/motion/liquid_motion.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/clay_system.dart';
import '../auth/auth_provider.dart';

/// Real-Time Notifications Screen with narrow-screen-safe AppBar (no badge/button overlap!).
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cn = context.cn;
    final notifs = ref.watch(notificationsProvider);
    final unread = ref.watch(unreadNotificationsCountProvider);

    return Scaffold(
      backgroundColor: cn.bg,
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                'Notifications',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 19, color: cn.textPrimary),
              ),
            ),
            if (unread > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(color: cn.danger, borderRadius: BorderRadius.circular(999)),
                child: Text(
                  '$unread',
                  style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ],
        ),
        actions: [
          if (unread > 0)
            TextButton(
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                minimumSize: const Size(0, 36),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              onPressed: () => ref.read(notificationsProvider.notifier).markAllRead(),
              child: const Text('Mark read', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            ),
          if (notifs.isNotEmpty)
            TextButton(
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                minimumSize: const Size(0, 36),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              onPressed: () => ref.read(notificationsProvider.notifier).clearAll(),
              child: Text('Clear', style: TextStyle(color: cn.danger, fontSize: 13, fontWeight: FontWeight.w700)),
            ),
        ],
      ),
      body: RefreshIndicator(
        color: cn.accent,
        onRefresh: () => ref.read(notificationsProvider.notifier).refresh(),
        child: notifs.isEmpty
            ? ListView(
                children: [
                  const SizedBox(height: 120),
                  Center(child: Text("You're all caught up!", style: TextStyle(color: cn.textMuted))),
                ],
              )
            : ListView.separated(
                padding: const EdgeInsets.all(14),
                itemCount: notifs.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (_, i) {
                  final n = notifs[i];
                  return LiquidTap(
                    onTap: () {
                      ref.read(notificationsProvider.notifier).markRead(n.id);
                      if (n.link.startsWith('/q/')) {
                        final qid = n.link.replaceFirst('/q/', '').split('?').first.trim();
                        if (qid.isNotEmpty) {
                          context.push('/question/$qid');
                          return;
                        }
                      }
                      if (n.link.startsWith('/chats')) {
                        context.push('/chats');
                      } else if (n.link.startsWith('/communities/')) {
                        final slug = n.link.replaceFirst('/communities/', '');
                        context.push('/community/$slug');
                      } else if (n.link.startsWith('/communities')) {
                        context.push('/communities');
                      } else if (n.link.startsWith('/verification') || n.link.contains('tab=verification')) {
                        context.push('/verification');
                      } else if (n.link.startsWith('/ads')) {
                        context.push('/ads');
                      } else if (n.link.startsWith('/sug')) {
                        context.go('/sug');
                      } else if (n.link.startsWith('/profile')) {
                        context.go('/me');
                      } else {
                        context.go('/feed');
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: ClayDecorations.card(
                        context,
                        radius: 22,
                        tint: n.read ? null : cn.accent,
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 42,
                            height: 42,
                            decoration: BoxDecoration(color: cn.surfaceRecessed, borderRadius: BorderRadius.circular(14)),
                            child: Icon(
                              n.type == 'like'
                                  ? Icons.favorite_rounded
                                  : n.type == 'chat'
                                      ? Icons.mail_rounded
                                      : Icons.notifications_rounded,
                              color: n.type == 'like' ? cn.danger : cn.accentLight,
                              size: 20,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  n.text,
                                  style: TextStyle(
                                    fontWeight: n.read ? FontWeight.w500 : FontWeight.w700,
                                    fontSize: 13.5,
                                    height: 1.35,
                                    color: cn.textPrimary,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(n.time, style: TextStyle(color: cn.textFaint, fontSize: 11.5)),
                              ],
                            ),
                          ),
                          if (!n.read)
                            Container(width: 9, height: 9, decoration: BoxDecoration(color: cn.danger, shape: BoxShape.circle)),
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
