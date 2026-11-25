import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/form_templates.dart';
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
    final cn = context.cn;
    return Scaffold(
      backgroundColor: cn.bg,
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
                        text: TextSpan(
                          style: const TextStyle(fontSize: 27, fontWeight: FontWeight.w900, letterSpacing: -0.4),
                          children: [
                            const TextSpan(text: 'Campus', style: TextStyle(color: Colors.white)),
                            TextSpan(text: 'Network', style: TextStyle(color: cn.success)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Curved Theme-Aware Sheet
          Expanded(
            flex: 6,
            child: Transform.translate(
              offset: const Offset(0, -28),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(26, 30, 26, 18),
                decoration: BoxDecoration(
                  color: cn.surface,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(34)),
                  border: Border(top: BorderSide(color: cn.borderBright)),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      children: [
                        Text(
                          'Your Campus.\nYour Community.\nYour Connection.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, height: 1.18, color: cn.textPrimary),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Discover campus conversations, explore academic PDF resources, and stay connected with ATBU.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: cn.textMuted, fontSize: 14.5, height: 1.5),
                        ),
                      ],
                    ),
                    Column(
                      children: [
                        ForestPillButton(
                          label: 'Log In',
                          onTap: () => showAuthSheet(context, initialRegister: false),
                        ),
                        const SizedBox(height: 12),
                        LiquidTap(
                          onTap: () => showAuthSheet(context, initialRegister: true),
                          child: Container(
                            width: double.infinity,
                            height: 50,
                            decoration: BoxDecoration(
                              color: cn.surfaceHigh,
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(color: cn.borderBright),
                            ),
                            alignment: Alignment.center,
                            child: Text('Sign Up', style: TextStyle(color: cn.textPrimary, fontWeight: FontWeight.w800, fontSize: 15)),
                          ),
                        ),
                        const SizedBox(height: 10),
                        LiquidTap(
                          onTap: () {
                            ref.read(authProvider.notifier).enterAsGuest();
                            context.go('/feed');
                          },
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text('Continue as Guest', style: TextStyle(color: cn.success, fontWeight: FontWeight.w700)),
                                const SizedBox(width: 4),
                                Icon(Icons.chevron_right_rounded, size: 18, color: cn.success),
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

/// Curved Organic Green Login, Sign Up & 3-Step Forgot Password Sheet
/// matching the user's "Welcome Back" botanical green reference.
Future<void> showAuthSheet(BuildContext context, {bool initialRegister = false}) {
  return showModalBottomSheet(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _AuthModalSheet(initialRegister: initialRegister),
  );
}

enum _AuthMode { login, register, forgotEmail, forgotCode, forgotReset }

class _AuthModalSheet extends ConsumerStatefulWidget {
  const _AuthModalSheet({required this.initialRegister});
  final bool initialRegister;

  @override
  ConsumerState<_AuthModalSheet> createState() => _AuthModalSheetState();
}

class _AuthModalSheetState extends ConsumerState<_AuthModalSheet> {
  late _AuthMode _mode;
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _user = TextEditingController();
  final _email = TextEditingController();
  final _pass = TextEditingController();
  final _confirmPass = TextEditingController();
  final _code = TextEditingController();
  String _resetToken = '';

  bool _rememberMe = true;
  bool _obscure = true;
  bool _busy = false;
  String? _error;
  String? _info;

  @override
  void initState() {
    super.initState();
    _mode = widget.initialRegister ? _AuthMode.register : _AuthMode.login;
  }

  @override
  void dispose() {
    for (final c in [_first, _last, _user, _email, _pass, _confirmPass, _code]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _info = null;
      _busy = true;
    });
    try {
      final auth = ref.read(authProvider.notifier);
      final api = ref.read(apiClientProvider);

      if (_mode == _AuthMode.register) {
        if (_first.text.trim().isEmpty ||
            _last.text.trim().isEmpty ||
            _user.text.trim().isEmpty ||
            _email.text.trim().isEmpty ||
            _pass.text.length < 8) {
          throw Exception('Fill in all fields (password min 8 characters).');
        }
        if (_pass.text != _confirmPass.text) {
          throw Exception('Passwords do not match.');
        }
        await auth.register(
          firstName: _first.text.trim(),
          lastName: _last.text.trim(),
          username: _user.text.trim().replaceFirst('@', ''),
          email: _email.text.trim(),
          password: _pass.text,
          confirmPassword: _confirmPass.text,
        );
        if (mounted) {
          Navigator.of(context).pop();
          context.go('/feed');
        }
      } else if (_mode == _AuthMode.login) {
        if (_user.text.trim().isEmpty || _pass.text.isEmpty) {
          throw Exception('Enter your username, email, or phone and password.');
        }
        await auth.login(_user.text.trim(), _pass.text);
        if (mounted) {
          Navigator.of(context).pop();
          context.go('/feed');
        }
      } else if (_mode == _AuthMode.forgotEmail) {
        if (_email.text.trim().isEmpty) throw Exception('Enter your registered email address.');
        final res = await api.dio.post('/auth/forgot-password/', data: {'email': _email.text.trim()});
        setState(() {
          _info = (res.data['detail'] ?? 'Check your email for the 6-digit reset code.').toString();
          _mode = _AuthMode.forgotCode;
        });
      } else if (_mode == _AuthMode.forgotCode) {
        if (_code.text.trim().length < 4) throw Exception('Enter the 6-digit code sent to your email.');
        final res = await api.dio.post('/auth/verify-reset-code/', data: {
          'email': _email.text.trim(),
          'code': _code.text.trim(),
        });
        _resetToken = (res.data['token'] ?? '').toString();
        setState(() {
          _pass.clear();
          _confirmPass.clear();
          _info = 'Code verified! Choose your new password.';
          _mode = _AuthMode.forgotReset;
        });
      } else if (_mode == _AuthMode.forgotReset) {
        if (_pass.text.length < 8) throw Exception('Password must be at least 8 characters.');
        if (_pass.text != _confirmPass.text) throw Exception('Passwords do not match.');
        await api.dio.post('/auth/reset-password/', data: {
          'token': _resetToken,
          'new_password': _pass.text,
          'confirm_password': _confirmPass.text,
        });
        setState(() {
          _pass.clear();
          _confirmPass.clear();
          _info = 'Password reset! Sign in with your new password.';
          _mode = _AuthMode.login;
        });
      }
    } catch (e) {
      setState(() => _error = parseApiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    final title = switch (_mode) {
      _AuthMode.login => 'Welcome Back',
      _AuthMode.register => 'Create Account',
      _AuthMode.forgotEmail => 'Forgot Password',
      _AuthMode.forgotCode => 'Verify Code',
      _AuthMode.forgotReset => 'New Password',
    };
    final subtitle = switch (_mode) {
      _AuthMode.login => 'Login to your account',
      _AuthMode.register => 'Join ATBU students on CampusNetwork',
      _AuthMode.forgotEmail => 'Enter your email for a 6-digit reset code',
      _AuthMode.forgotCode => 'Enter the code sent to ${_email.text.trim()}',
      _AuthMode.forgotReset => 'Choose and confirm your new password',
    };
    final ctaLabel = switch (_mode) {
      _AuthMode.login => 'Login',
      _AuthMode.register => 'Sign Up',
      _AuthMode.forgotEmail => 'Send Reset Code',
      _AuthMode.forgotCode => 'Verify Code',
      _AuthMode.forgotReset => 'Reset Password',
    };

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: CurvedGreenFormSheet(
        title: title,
        subtitle: subtitle,
        headerHeight: _mode == _AuthMode.register ? 116 : 144,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_error != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: cn.dangerSoft, borderRadius: BorderRadius.circular(12)),
                child: Text(_error!, style: TextStyle(color: cn.danger, fontWeight: FontWeight.w700, fontSize: 13)),
              ),
            if (_info != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: cn.successSoft, borderRadius: BorderRadius.circular(12)),
                child: Text(_info!, style: TextStyle(color: cn.success, fontWeight: FontWeight.w700, fontSize: 13)),
              ),

            if (_mode == _AuthMode.register) ...[
              Row(
                children: [
                  Expanded(child: SageInputField(controller: _first, hint: 'First Name', icon: Icons.person_outline_rounded)),
                  const SizedBox(width: 10),
                  Expanded(child: SageInputField(controller: _last, hint: 'Last Name', icon: Icons.person_outline_rounded)),
                ],
              ),
              const SizedBox(height: 11),
              SageInputField(controller: _user, hint: 'Username', icon: Icons.alternate_email_rounded),
              const SizedBox(height: 11),
              SageInputField(
                controller: _email,
                hint: 'Email Address',
                icon: Icons.mail_outline_rounded,
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: 11),
              SageInputField(
                controller: _pass,
                hint: 'Password (min 8 chars)',
                icon: Icons.lock_outline_rounded,
                obscureText: _obscure,
                suffix: IconButton(
                  icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 19),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
              ),
              const SizedBox(height: 11),
              SageInputField(
                controller: _confirmPass,
                hint: 'Confirm Password',
                icon: Icons.lock_outline_rounded,
                obscureText: _obscure,
              ),
            ] else if (_mode == _AuthMode.login) ...[
              SageInputField(
                controller: _user,
                hint: 'Username, Email or Phone',
                icon: Icons.person_rounded,
              ),
              const SizedBox(height: 12),
              SageInputField(
                controller: _pass,
                hint: 'Password',
                icon: Icons.lock_rounded,
                obscureText: _obscure,
                suffix: IconButton(
                  icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 19),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  GestureDetector(
                    onTap: () => setState(() => _rememberMe = !_rememberMe),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _rememberMe ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                          size: 18,
                          color: const Color(0xFF2E6B47),
                        ),
                        const SizedBox(width: 6),
                        Text('Remember Me', style: TextStyle(color: cn.textMuted, fontSize: 12.5, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                  const Spacer(),
                  GestureDetector(
                    onTap: () => setState(() {
                      _error = null;
                      _info = null;
                      _mode = _AuthMode.forgotEmail;
                    }),
                    child: const Text(
                      'Forgot Password ?',
                      style: TextStyle(color: Color(0xFF2E6B47), fontWeight: FontWeight.w800, fontSize: 12.5),
                    ),
                  ),
                ],
              ),
            ] else if (_mode == _AuthMode.forgotEmail) ...[
              SageInputField(
                controller: _email,
                hint: 'Registered Email',
                icon: Icons.mail_outline_rounded,
                keyboardType: TextInputType.emailAddress,
              ),
            ] else if (_mode == _AuthMode.forgotCode) ...[
              SageInputField(
                controller: _code,
                hint: '6-digit verification code',
                icon: Icons.pin_outlined,
                keyboardType: TextInputType.number,
              ),
            ] else if (_mode == _AuthMode.forgotReset) ...[
              SageInputField(controller: _pass, hint: 'New Password (min 8 chars)', icon: Icons.lock_outline_rounded, obscureText: _obscure),
              const SizedBox(height: 11),
              SageInputField(controller: _confirmPass, hint: 'Confirm New Password', icon: Icons.lock_outline_rounded, obscureText: _obscure),
            ],

            const SizedBox(height: 20),
            ForestPillButton(
              label: _busy ? 'Please wait...' : ctaLabel,
              onTap: _busy ? null : _submit,
            ),

            if (_mode == _AuthMode.register) ...[
              const SizedBox(height: 12),
              RichText(
                textAlign: TextAlign.center,
                text: TextSpan(
                  style: TextStyle(color: cn.textMuted, fontSize: 11.5, height: 1.5),
                  children: [
                    const TextSpan(text: 'By signing up, you agree to our '),
                    TextSpan(
                      text: 'Privacy Policy',
                      style: const TextStyle(color: Color(0xFF2E6B47), decoration: TextDecoration.underline, fontWeight: FontWeight.w700),
                      recognizer: TapGestureRecognizer()
                        ..onTap = () {
                          Navigator.of(context).pop();
                          context.push('/about');
                        },
                    ),
                    const TextSpan(text: ' & '),
                    TextSpan(
                      text: 'Terms',
                      style: const TextStyle(color: Color(0xFF2E6B47), decoration: TextDecoration.underline, fontWeight: FontWeight.w700),
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
                _info = null;
                _mode = _mode == _AuthMode.login ? _AuthMode.register : _AuthMode.login;
              }),
              child: Text.rich(
                TextSpan(
                  style: TextStyle(color: cn.textMuted, fontSize: 13.5),
                  children: [
                    TextSpan(
                      text: _mode == _AuthMode.login
                          ? "Don't have account? "
                          : (_mode == _AuthMode.register ? 'Already have an account? ' : 'Remembered password? '),
                    ),
                    TextSpan(
                      text: _mode == _AuthMode.login ? 'Sign up' : 'Login',
                      style: const TextStyle(color: Color(0xFF2E6B47), fontWeight: FontWeight.w900, decoration: TextDecoration.underline),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
