import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Shared Hide-on-Scroll Controller for coordinated Top & Bottom Navigation Bar visibility.
/// - Driven via ValueNotifier (ZERO setState per scroll tick!)
/// - Ignores horizontal scrollables & nested scrollables (depth != 0)
/// - Hides after 24dp cumulative downward scroll; restores after 12dp upward scroll
/// - Always restores at top/bottom edge, short content, tab switch, or keyboard open
class ChromeVisibilityController extends ValueNotifier<bool> {
  ChromeVisibilityController() : super(true);

  double _lastPixels = 0;
  double _deltaAccum = 0;

  void show() {
    _deltaAccum = 0;
    if (!value) value = true;
  }

  void hide() {
    _deltaAccum = 0;
    if (value) value = false;
  }

  bool handleScroll(ScrollNotification notification, {required bool keyboardOpen}) {
    if (keyboardOpen) {
      show();
      return false;
    }
    if (notification.depth != 0 || notification.metrics.axis != Axis.vertical) {
      return false;
    }
    final m = notification.metrics;
    if (m.maxScrollExtent <= 40 || m.pixels <= 8) {
      _lastPixels = m.pixels;
      show();
      return false;
    }
    if (m.pixels >= m.maxScrollExtent - 8) {
      _lastPixels = m.pixels;
      show();
      return false;
    }

    if (notification is ScrollUpdateNotification) {
      final dy = m.pixels - _lastPixels;
      _lastPixels = m.pixels;
      if ((dy > 0 && _deltaAccum < 0) || (dy < 0 && _deltaAccum > 0)) {
        _deltaAccum = 0;
      }
      _deltaAccum += dy;
      if (_deltaAccum > 24 && value) {
        hide();
      } else if (_deltaAccum < -12 && !value) {
        show();
      }
    }
    return false;
  }
}

final chromeVisibilityProvider = Provider<ChromeVisibilityController>((ref) {
  final c = ChromeVisibilityController();
  ref.onDispose(c.dispose);
  return c;
});
