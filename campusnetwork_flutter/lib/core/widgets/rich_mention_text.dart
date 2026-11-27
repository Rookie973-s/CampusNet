import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/auth_provider.dart';
import '../network/api_client.dart';
import '../theme/app_theme.dart';

final _mentionRe = RegExp(r'@([A-Za-z0-9_.-]{2,30})');

/// Renders plain text with clickable `@username` mentions that resolve via
/// `GET /users/by-username/<username>/` and navigate directly to that user's profile!
class RichMentionText extends ConsumerStatefulWidget {
  const RichMentionText(
    this.text, {
    super.key,
    this.style,
    this.maxLines,
    this.overflow,
  });

  final String text;
  final TextStyle? style;
  final int? maxLines;
  final TextOverflow? overflow;

  @override
  ConsumerState<RichMentionText> createState() => _RichMentionTextState();
}

class _RichMentionTextState extends ConsumerState<RichMentionText> {
  final List<TapGestureRecognizer> _recognizers = [];

  @override
  void dispose() {
    for (final r in _recognizers) {
      r.dispose();
    }
    super.dispose();
  }

  Future<void> _openUsername(String handle) async {
    final clean = handle.trim();
    if (clean.isEmpty) return;
    final me = ref.read(authProvider).user;
    if (me != null && me.username.toLowerCase() == clean.toLowerCase()) {
      if (mounted) context.go('/me');
      return;
    }
    try {
      final res = await ref.read(apiClientProvider).dio.get('/users/by-username/$clean/');
      final data = res.data is Map ? Map<String, dynamic>.from(res.data as Map) : null;
      final uid = (data?['id'] as num?)?.toInt();
      if (!mounted) return;
      if (uid != null) {
        if (me != null && uid == me.id) {
          context.go('/me');
        } else {
          context.push('/user/$uid');
        }
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('User @$clean was not found.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();

    final c = context.cn;
    final baseStyle = widget.style ?? TextStyle(fontSize: 14, height: 1.45, color: c.textPrimary);
    final matches = _mentionRe.allMatches(widget.text).toList();
    if (matches.isEmpty) {
      return Text(
        widget.text,
        style: baseStyle,
        maxLines: widget.maxLines,
        overflow: widget.overflow,
      );
    }

    final spans = <InlineSpan>[];
    int cursor = 0;
    for (final m in matches) {
      if (m.start > cursor) {
        spans.add(TextSpan(text: widget.text.substring(cursor, m.start)));
      }
      final handle = m.group(1)!;
      final rec = TapGestureRecognizer()..onTap = () => _openUsername(handle);
      _recognizers.add(rec);
      spans.add(
        TextSpan(
          text: m.group(0),
          recognizer: rec,
          style: baseStyle.copyWith(
            color: c.accent,
            fontWeight: FontWeight.w800,
          ),
        ),
      );
      cursor = m.end;
    }
    if (cursor < widget.text.length) {
      spans.add(TextSpan(text: widget.text.substring(cursor)));
    }

    return Text.rich(
      TextSpan(style: baseStyle, children: spans),
      maxLines: widget.maxLines,
      overflow: widget.overflow,
    );
  }
}
