import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';

/// Telegram-Grade Liquid Physics Engine (Impeller 60-120fps)
/// - Uses real SpringDescription / SpringSimulation rather than linear timers
/// - Automatically honors MediaQuery.disableAnimations (reduced-motion accessibility)
class LiquidSprings {
  /// Snappy tactile tap bounce (visibly responsive squish & pop)
  static const snappy = SpringDescription(mass: 1.0, stiffness: 420, damping: 20);

  /// Bouncy FAB & ShareFan radial pop
  static const bouncy = SpringDescription(mass: 1.0, stiffness: 320, damping: 18);

  /// Smooth Telegram-like sheet / card wheel glide
  static const smooth = SpringDescription(mass: 1.0, stiffness: 260, damping: 24);

  static bool reducedMotion(BuildContext context) =>
      MediaQuery.maybeOf(context)?.disableAnimations ?? false;
}

/// Reusable tactile spring-scale press wrapper with visible press feedback & haptic click.
/// Wraps buttons, cards, pills, and icons so every touch feels unmistakably alive.
class LiquidTap extends StatefulWidget {
  const LiquidTap({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.scaleDown = 0.92,
    this.haptic = true,
    this.enabled = true,
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final double scaleDown;
  final bool haptic;
  final bool enabled;

  @override
  State<LiquidTap> createState() => _LiquidTapState();
}

class _LiquidTapState extends State<LiquidTap> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  bool _pressed = false;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController.unbounded(vsync: this, value: 1.0);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _animateTo(double target, {bool pressed = false}) {
    if (_pressed != pressed && mounted) {
      setState(() => _pressed = pressed);
    }
    if (LiquidSprings.reducedMotion(context)) {
      _ctrl.value = target;
      return;
    }
    final sim = SpringSimulation(LiquidSprings.snappy, _ctrl.value, target, 0);
    _ctrl.animateWith(sim);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: widget.enabled ? (_) => _animateTo(widget.scaleDown, pressed: true) : null,
      onTapUp: widget.enabled
          ? (_) {
              _animateTo(1.0, pressed: false);
              if (widget.haptic) HapticFeedback.lightImpact();
              widget.onTap?.call();
            }
          : null,
      onTapCancel: widget.enabled ? () => _animateTo(1.0, pressed: false) : null,
      onLongPress: widget.enabled && widget.onLongPress != null
          ? () {
              _animateTo(1.0, pressed: false);
              if (widget.haptic) HapticFeedback.mediumImpact();
              widget.onLongPress?.call();
            }
          : null,
      child: AnimatedBuilder(
        animation: _ctrl,
        builder: (_, child) => Transform.scale(
          scale: _ctrl.value,
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 90),
            opacity: _pressed ? 0.84 : 1.0,
            child: child,
          ),
        ),
        child: widget.child,
      ),
    );
  }
}
