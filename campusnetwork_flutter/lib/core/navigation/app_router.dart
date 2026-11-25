import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/ads/ads_screen.dart';
import '../../features/auth/auth_provider.dart';
import '../../features/auth/landing_screen.dart';
import '../../features/communities/communities_screen.dart';
import '../../features/feed/feed_screen.dart';
import '../../features/feed/question_detail_screen.dart';
import '../../features/feed/search_screen.dart';
import '../../features/library/library_screen.dart';
import '../../features/me/about_screen.dart';
import '../../features/me/account_settings_screen.dart';
import '../../features/me/me_screen.dart';
import '../../features/me/public_profile_screen.dart';
import '../../features/me/student_verification_screen.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/sug/apply_sug_screen.dart';
import '../../features/sug/chats_screen.dart';
import '../../features/sug/sug_screen.dart';
import '../models/models.dart';
import 'app_shell.dart';

/// Notifies GoRouter ONLY when routing-relevant auth flags change
/// (booting / isAuthenticated / guestEntered) — NEVER when user profile data refreshes!
/// This prevents refreshMe() or profile edits from resetting the router back to /feed.
class _AuthRouterRefresh extends ChangeNotifier {
  _AuthRouterRefresh(Ref ref) {
    _sub = ref.listen<AuthState>(authProvider, (prev, next) {
      if (prev == null ||
          prev.booting != next.booting ||
          prev.isAuthenticated != next.isAuthenticated ||
          prev.guestEntered != next.guestEntered) {
        notifyListeners();
      }
    });
  }

  late final ProviderSubscription<AuthState> _sub;

  @override
  void dispose() {
    _sub.close();
    super.dispose();
  }
}

/// GoRouter Configuration (ZERO Home route on mobile!)
/// - Unauthenticated launch -> /landing
/// - Authenticated launch -> /feed directly
final appRouterProvider = Provider<GoRouter>((ref) {
  final refresh = _AuthRouterRefresh(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/feed',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authProvider);
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
      GoRoute(
        path: '/user/:id',
        builder: (_, state) => PublicProfileScreen(
          userId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
        ),
      ),
      GoRoute(path: '/search', builder: (_, __) => const SearchScreen()),
      GoRoute(path: '/communities', builder: (_, __) => const CommunitiesScreen()),
      GoRoute(path: '/my-communities', builder: (_, __) => const CommunitiesScreen(mineOnly: true)),
      GoRoute(
        path: '/community/:slug',
        builder: (_, state) => CommunityDetailScreen(slug: state.pathParameters['slug']!),
      ),
      GoRoute(path: '/chats', builder: (_, state) => ChatsScreen(initialConvoId: state.extra as int?)),
      GoRoute(path: '/apply-sug', builder: (_, __) => const ApplySugScreen()),
      GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
      GoRoute(path: '/settings', builder: (_, __) => const AccountSettingsScreen()),
      GoRoute(path: '/verification', builder: (_, __) => const StudentVerificationScreen()),
      GoRoute(path: '/ads', builder: (_, __) => const AdsDashboardScreen()),
      GoRoute(path: '/about', builder: (_, __) => const AboutScreen()),
    ],
  );
});
