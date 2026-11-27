import 'package:flutter/material.dart';
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

CustomTransitionPage<T> _smoothPage<T>(GoRouterState state, Widget child) {
  return CustomTransitionPage<T>(
    key: state.pageKey,
    child: child,
    transitionDuration: const Duration(milliseconds: 300),
    reverseTransitionDuration: const Duration(milliseconds: 240),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic, reverseCurve: Curves.easeInCubic);
      return FadeTransition(
        opacity: curved,
        child: SlideTransition(
          position: Tween<Offset>(begin: const Offset(0.08, 0.0), end: Offset.zero).animate(curved),
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.97, end: 1.0).animate(curved),
            child: child,
          ),
        ),
      );
    },
  );
}

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
        pageBuilder: (_, state) => _smoothPage(
          state,
          QuestionDetailScreen(
            questionId: state.pathParameters['id']!,
            initialQuestion: state.extra is QuestionItem ? state.extra as QuestionItem : null,
          ),
        ),
      ),
      GoRoute(
        path: '/user/:id',
        pageBuilder: (_, state) => _smoothPage(
          state,
          PublicProfileScreen(userId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0),
        ),
      ),
      GoRoute(path: '/search', pageBuilder: (_, state) => _smoothPage(state, const SearchScreen())),
      GoRoute(path: '/communities', pageBuilder: (_, state) => _smoothPage(state, const CommunitiesScreen())),
      GoRoute(path: '/my-communities', pageBuilder: (_, state) => _smoothPage(state, const CommunitiesScreen(mineOnly: true))),
      GoRoute(
        path: '/community/:slug',
        pageBuilder: (_, state) => _smoothPage(state, CommunityDetailScreen(slug: state.pathParameters['slug']!)),
      ),
      GoRoute(path: '/chats', pageBuilder: (_, state) => _smoothPage(state, ChatsScreen(initialConvoId: state.extra as int?))),
      GoRoute(path: '/apply-sug', pageBuilder: (_, state) => _smoothPage(state, const ApplySugScreen())),
      GoRoute(path: '/notifications', pageBuilder: (_, state) => _smoothPage(state, const NotificationsScreen())),
      GoRoute(path: '/settings', pageBuilder: (_, state) => _smoothPage(state, const AccountSettingsScreen())),
      GoRoute(path: '/verification', pageBuilder: (_, state) => _smoothPage(state, const StudentVerificationScreen())),
      GoRoute(path: '/ads', pageBuilder: (_, state) => _smoothPage(state, const AdsDashboardScreen())),
      GoRoute(path: '/about', pageBuilder: (_, state) => _smoothPage(state, const AboutScreen())),
    ],
  );
});
