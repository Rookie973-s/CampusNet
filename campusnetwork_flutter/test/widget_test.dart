import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:campusnetwork_flutter/main.dart';

void main() {
  testWidgets('CampusNetworkApp renders cleanly', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: CampusNetworkApp()));
    expect(find.byType(CampusNetworkApp), findsOneWidget);
  });
}
