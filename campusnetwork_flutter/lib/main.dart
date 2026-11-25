import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/navigation/app_router.dart';
import 'core/theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Global crash resilience — never show raw red screen of death in release
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
  };
  ErrorWidget.builder = (details) => Material(
        color: CNColors.bg,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline_rounded, size: 42, color: CNColors.accent),
                const SizedBox(height: 10),
                const Text(
                  'Something went wrong rendering this view.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15),
                ),
                if (kDebugMode) ...[
                  const SizedBox(height: 6),
                  Text(
                    details.exceptionAsString(),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white60, fontSize: 11),
                  ),
                ],
              ],
            ),
          ),
        ),
      );

  final savedMode = await loadSavedThemeMode();
  runApp(
    ProviderScope(
      overrides: [
        initialThemeModeProvider.overrideWithValue(savedMode),
      ],
      child: const CampusNetworkApp(),
    ),
  );
}

class CampusNetworkApp extends ConsumerWidget {
  const CampusNetworkApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    final mode = ref.watch(themeModeProvider);
    final platformDark = MediaQuery.platformBrightnessOf(context) == Brightness.dark;
    final isDark = mode == ThemeMode.dark || (mode == ThemeMode.system && platformDark);

    SystemChrome.setSystemUIOverlayStyle(
      SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
        systemNavigationBarColor: isDark ? CNColors.bg : Colors.white,
        systemNavigationBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
      ),
    );

    return MaterialApp.router(
      title: 'CampusNetwork',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: mode,
      routerConfig: router,
    );
  }
}
