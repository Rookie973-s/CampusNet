import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';
import 'auth_provider.dart';

const _heroSlides = [
  'assets/images/bg.webp',
  'assets/images/bgg.webp',
  'assets/images/bggg.webp',
  'assets/images/bgggg.webp',
];

/// Website-Faithful Mobile Landing Screen (shown ONLY to unauthenticated users).
class LandingScreen extends ConsumerStatefulWidget {
  const LandingScreen({super.key});

  @override
  ConsumerState<LandingScreen> createState() => _LandingScreenState();
}

class _LandingScreenState extends ConsumerState<LandingScreen> {
  int _idx = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (mounted) setState(() => _idx = (_idx + 1) % _heroSlides.length);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CNColors.bg,
      body: Column(
        children: [
          // Top cross-fading campus hero
          Expanded(
            flex: 5,
            child: Stack(
              fit: StackFit.expand,
              children: [
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 650),
                  child: Image.asset(
                    _heroSlides[_idx],
                    key: ValueKey(_idx),
                    fit: BoxFit.cover,
                    width: double.infinity,
                    height: double.infinity,
                  ),
                ),
                Container(
                  color: const Color(0x990A0D16),
                  alignment: Alignment.center,
                  padding: const EdgeInsets.only(bottom: 24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const BrandMark(size: 66),
                      const SizedBox(height: 12),
                      RichText(
                        text: const TextSpan(
                          style: TextStyle(fontSize: 27, fontWeight: FontWeight.w900, letterSpacing: -0.4),
                          children: [
                            TextSpan(text: 'Campus', style: TextStyle(color: Colors.white)),
                            TextSpan(text: 'Network', style: TextStyle(color: CNColors.accentLight)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Curved Dark Morphism Sheet
          Expanded(
            flex: 6,
            child: Transform.translate(
              offset: const Offset(0, -28),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(26, 32, 26, 20),
                decoration: const BoxDecoration(
                  color: CNColors.surface,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(34)),
                  border: Border(top: BorderSide(color: CNColors.borderBright)),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Column(
                      children: [
                        Text(
                          'Your Campus.\nYour Community.\nYour Connection.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 29, fontWeight: FontWeight.w900, height: 1.18),
                        ),
                        SizedBox(height: 12),
                        Text(
                          'Discover campus conversations, explore academic PDF resources, and stay connected with ATBU.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: CNColors.textMuted, fontSize: 14.5, height: 1.5),
                        ),
                      ],
                    ),
                    Column(
                      children: [
                        _PrimaryBtn(
                          label: 'Log In',
                          onTap: () => showAuthSheet(context, initialRegister: false),
                        ),
                        const SizedBox(height: 12),
                        _OutlineBtn(
                          label: 'Sign Up',
                          onTap: () => showAuthSheet(context, initialRegister: true),
                        ),
                        const SizedBox(height: 10),
                        LiquidTap(
                          onTap: () {
                            ref.read(authProvider.notifier).enterAsGuest();
                            context.go('/feed');
                          },
                          child: const Padding(
                            padding: EdgeInsets.symmetric(vertical: 10),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text('Continue as Guest', style: TextStyle(color: CNColors.accentLight, fontWeight: FontWeight.w700)),
                                SizedBox(width: 4),
                                Icon(Icons.chevron_right_rounded, size: 18, color: CNColors.accentLight),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Dark-Morphism Login & Create Account Sheet matching reference visual system.
Future<void> showAuthSheet(BuildContext context, {bool initialRegister = false}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _AuthModalSheet(initialRegister: initialRegister),
  );
}

class _AuthModalSheet extends ConsumerStatefulWidget {
  const _AuthModalSheet({required this.initialRegister});
  final bool initialRegister;

  @override
  ConsumerState<_AuthModalSheet> createState() => _AuthModalSheetState();
}

class _AuthModalSheetState extends ConsumerState<_AuthModalSheet> {
  late bool _isRegister;
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _user = TextEditingController();
  final _email = TextEditingController();
  final _pass = TextEditingController();
  bool _obscure = true;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _isRegister = widget.initialRegister;
  }

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _user.dispose();
    _email.dispose();
    _pass.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      final auth = ref.read(authProvider.notifier);
      if (_isRegister) {
        if (_first.text.trim().isEmpty || _last.text.trim().isEmpty || _user.text.trim().isEmpty || _email.text.trim().isEmpty || _pass.text.length < 6) {
          throw Exception('Fill in all fields (password min 6 chars).');
        }
        await auth.register(
          firstName: _first.text.trim(),
          lastName: _last.text.trim(),
          username: _user.text.trim().replaceFirst('@', ''),
          email: _email.text.trim(),
          password: _pass.text,
        );
      } else {
        if (_user.text.trim().isEmpty || _pass.text.isEmpty) {
          throw Exception('Enter your username/email and password.');
        }
        await auth.login(_user.text.trim(), _pass.text);
      }
      if (mounted) {
        Navigator.of(context).pop();
        context.go('/feed');
      }
    } catch (e) {
      setState(() => _error = parseApiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Container(
        decoration: const BoxDecoration(
          color: CNColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          border: Border(top: BorderSide(color: CNColors.borderBright)),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 26),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(99))),
              const SizedBox(height: 16),
              const BrandMark(size: 44),
              const SizedBox(height: 10),
              Text(
                _isRegister ? 'Create an account' : 'Welcome back',
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 4),
              Text(
                _isRegister ? 'Join ATBU students on CampusNetwork' : 'Sign in to continue to Feed',
                style: const TextStyle(color: CNColors.textMuted, fontSize: 13),
              ),
              const SizedBox(height: 18),
              if (_error != null)
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: CNColors.dangerSoft, borderRadius: BorderRadius.circular(12)),
                  child: Text(_error!, style: const TextStyle(color: CNColors.danger, fontWeight: FontWeight.w700, fontSize: 13)),
                ),
              if (_isRegister) ...[
                Row(
                  children: [
                    Expanded(child: _MorphismField(controller: _first, hint: 'First Name')),
                    const SizedBox(width: 10),
                    Expanded(child: _MorphismField(controller: _last, hint: 'Last Name')),
                  ],
                ),
                const SizedBox(height: 10),
              ],
              _MorphismField(controller: _user, hint: _isRegister ? 'Username' : 'Username or Email'),
              const SizedBox(height: 10),
              if (_isRegister) ...[
                _MorphismField(controller: _email, hint: 'Email', keyboardType: TextInputType.emailAddress),
                const SizedBox(height: 10),
              ],
              _MorphismField(
                controller: _pass,
                hint: 'Password',
                obscureText: _obscure,
                suffix: IconButton(
                  icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 19, color: CNColors.textMuted),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
              ),
              const SizedBox(height: 16),
              _PrimaryBtn(
                label: _busy ? 'Please wait...' : (_isRegister ? 'Create account' : 'Log In'),
                onTap: _busy ? null : _submit,
              ),
              if (_isRegister) ...[
                const SizedBox(height: 14),
                RichText(
                  textAlign: TextAlign.center,
                  text: TextSpan(
                    style: const TextStyle(color: CNColors.textMuted, fontSize: 12, height: 1.5),
                    children: [
                      const TextSpan(text: 'By signing up, you agree to our '),
                      TextSpan(
                        text: 'Privacy Policy',
                        style: const TextStyle(color: CNColors.accentLight, decoration: TextDecoration.underline, fontWeight: FontWeight.w700),
                        recognizer: TapGestureRecognizer()
                          ..onTap = () {
                            Navigator.of(context).pop();
                            context.push('/about');
                          },
                      ),
                      const TextSpan(text: ' and '),
                      TextSpan(
                        text: 'Terms of Service',
                        style: const TextStyle(color: CNColors.accentLight, decoration: TextDecoration.underline, fontWeight: FontWeight.w700),
                        recognizer: TapGestureRecognizer()
                          ..onTap = () {
                            Navigator.of(context).pop();
                            context.push('/about');
                          },
                      ),
                      const TextSpan(text: '.'),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 16),
              LiquidTap(
                onTap: () => setState(() {
                  _error = null;
                  _isRegister = !_isRegister;
                }),
                child: Text.rich(
                  TextSpan(
                    style: const TextStyle(color: CNColors.textMuted, fontSize: 13.5),
                    children: [
                      TextSpan(text: _isRegister ? 'Have an account? ' : "Don't have an account? "),
                      TextSpan(
                        text: _isRegister ? 'Log in here' : 'Sign up here',
                        style: const TextStyle(color: CNColors.accentLight, fontWeight: FontWeight.w800, decoration: TextDecoration.underline),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MorphismField extends StatelessWidget {
  const _MorphismField({
    required this.controller,
    required this.hint,
    this.obscureText = false,
    this.keyboardType,
    this.suffix,
  });

  final TextEditingController controller;
  final String hint;
  final bool obscureText;
  final TextInputType? keyboardType;
  final Widget? suffix;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: CNColors.surfaceRecessed,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: CNColors.borderSubtle),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: TextField(
        controller: controller,
        obscureText: obscureText,
        keyboardType: keyboardType,
        style: const TextStyle(fontSize: 14.5, color: CNColors.textPrimary),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: CNColors.textFaint),
          border: InputBorder.none,
          suffixIcon: suffix,
        ),
      ),
    );
  }
}

class _PrimaryBtn extends StatelessWidget {
  const _PrimaryBtn({required this.label, this.onTap});
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return LiquidTap(
      onTap: onTap,
      enabled: onTap != null,
      child: Container(
        width: double.infinity,
        height: 50,
        decoration: BoxDecoration(
          color: CNColors.accent,
          borderRadius: BorderRadius.circular(16),
          boxShadow: const [BoxShadow(color: Color(0x554A90FF), blurRadius: 16, offset: Offset(0, 6))],
        ),
        alignment: Alignment.center,
        child: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
      ),
    );
  }
}

class _OutlineBtn extends StatelessWidget {
  const _OutlineBtn({required this.label, this.onTap});
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return LiquidTap(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        height: 50,
        decoration: BoxDecoration(
          color: CNColors.surfaceHigh,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: CNColors.borderBright),
        ),
        alignment: Alignment.center,
        child: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
      ),
    );
  }
}
