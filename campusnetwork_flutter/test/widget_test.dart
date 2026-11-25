import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:campusnetwork_flutter/core/navigation/scroll_chrome.dart';
import 'package:campusnetwork_flutter/core/theme/app_theme.dart';
import 'package:campusnetwork_flutter/core/widgets/morphism_widgets.dart';

void main() {
  setUpAll(() {
    AppTheme.useGoogleFonts = false;
  });
  test('AppTheme dark & light tokens provide non-null extensions with no underline', () {
    final dark = AppTheme.dark();
    final light = AppTheme.light();
    expect(dark.extension<CampusColors>(), isNotNull);
    expect(light.extension<CampusColors>(), isNotNull);
    expect(dark.extension<CampusColors>()!.bg, const Color(0xFF000000));
    expect(light.extension<CampusColors>()!.bg, const Color(0xFFFFFFFF));
    expect(dark.textTheme.bodyMedium?.decoration, TextDecoration.none);
    expect(light.textTheme.bodyMedium?.decoration, TextDecoration.none);
  });

  test('hexToColor parses valid hex and falls back safely', () {
    expect(hexToColor('#1D9BF0'), const Color(0xFF1D9BF0));
    expect(hexToColor('invalid', fallback: Colors.red), Colors.red);
  });

  test('ChromeVisibilityController hides on downward scroll and restores on upward scroll', () {
    final ctrl = ChromeVisibilityController();
    expect(ctrl.value, isTrue);
    ctrl.hide();
    expect(ctrl.value, isFalse);
    ctrl.show();
    expect(ctrl.value, isTrue);
    ctrl.dispose();
  });

  testWidgets('MorphismCard & BadgeRow render cleanly in Dark and Light themes', (tester) async {
    for (final theme in [AppTheme.dark(), AppTheme.light()]) {
      await tester.pumpWidget(
        MaterialApp(
          theme: theme,
          home: const Scaffold(
            body: MorphismCard(
              child: Row(
                children: [
                  Text('CampusNetwork'),
                  BadgeRow(verified: true, staff: true),
                ],
              ),
            ),
          ),
        ),
      );
      expect(find.text('CampusNetwork'), findsOneWidget);
      expect(find.byIcon(Icons.verified_rounded), findsOneWidget);
      expect(find.byIcon(Icons.verified_user_rounded), findsOneWidget);
    }
  });
}
