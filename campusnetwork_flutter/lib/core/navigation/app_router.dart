import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/auth_provider.dart';
import '../../features/auth/landing_screen.dart';
import '../../features/communities/communities_screen.dart';
import '../../features/feed/feed_screen.dart';
import '../../features/feed/question_detail_screen.dart';
import '../../features/library/library_screen.dart';
import '../../features/me/about_screen.dart';
import '../../features/me/me_screen.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/sug/apply_sug_screen.dart';
import '../../features/sug/chats_screen.dart';
import '../../features/sug/sug_screen.dart';
import '../models/models.dart';
import 'app_shell.dart';

/// GoRouter Configuration (ZERO Home route on mobile!)
/// - Unauthenticated launch -> /landing
/// - Authenticated launch -> /feed directly
final appRouterProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/feed',
    redirect: (context, state) {
      if (auth.booting) return null;
      final onLanding = state.matchedLocation == '/landing';
      if (!auth.isAuthenticated && !auth.guestEntered && !onLanding) {
        return '/landing';
      }
      if (auth.isAuthenticated && onLanding) {
        return '/feed';
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/landing',
        builder: (_, __) => const LandingScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (_, __, shell) => AppShell(navigationShell: shell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/feed', builder: (_, __) => const FeedScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/library', builder: (_, __) => const LibraryScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/sug', builder: (_, __) => const SugScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/me', builder: (_, __) => const MeScreen()),
          ]),
        ],
      ),
      GoRoute(
        path: '/question/:id',
        builder: (_, state) => QuestionDetailScreen(
          questionId: state.pathParameters['id']!,
          initialQuestion: state.extra is QuestionItem ? state.extra as QuestionItem : null,
        ),
      ),
      GoRoute(path: '/communities', builder: (_, __) => const CommunitiesScreen()),
      GoRoute(path: '/chats', builder: (_, state) => ChatsScreen(initialConvoId: state.extra as int?)),
      GoRoute(path: '/apply-sug', builder: (_, __) => const ApplySugScreen()),
      GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
      GoRoute(path: '/about', builder: (_, __) => const AboutScreen()),
      GoRoute(path: '/ads', builder: (_, __) => const AboutScreen(isAdsShortcut: true)),
      GoRoute(path: '/search', builder: (_, __) => const FeedScreen(autoFocusSearch: true)),
    ],
  );
});
