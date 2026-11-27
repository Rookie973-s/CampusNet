import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/clay_system.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../auth/auth_provider.dart';

/// Full Account Settings Screen matching website parity:
/// Personal Info, Avatar Upload/Remove, Email Verification OTP,
/// Change Password, Theme Switcher (System/Light/Dark), About, & Account Deletion.
class AccountSettingsScreen extends ConsumerStatefulWidget {
  const AccountSettingsScreen({super.key});

  @override
  ConsumerState<AccountSettingsScreen> createState() => _AccountSettingsScreenState();
}

class _AccountSettingsScreenState extends ConsumerState<AccountSettingsScreen> {
  final _firstCtrl = TextEditingController();
  final _lastCtrl = TextEditingController();
  final _userCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _bioCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  final _curPwdCtrl = TextEditingController();
  final _newPwdCtrl = TextEditingController();
  final _confPwdCtrl = TextEditingController();

  bool _savingProfile = false;
  bool _avatarBusy = false;
  bool _sendingOtp = false;
  bool _verifyingOtp = false;
  bool _pwdBusy = false;

  @override
  void initState() {
    super.initState();
    final u = ref.read(authProvider).user;
    if (u != null) {
      _firstCtrl.text = u.firstName;
      _lastCtrl.text = u.lastName;
      _userCtrl.text = u.username;
      _bioCtrl.text = u.bio;
    }
    _hydrateFreshMe();
  }

  Future<void> _hydrateFreshMe() async {
    try {
      final res = await ref.read(apiClientProvider).dio.get('/auth/me/');
      final d = Map<String, dynamic>.from(res.data as Map);
      if (!mounted) return;
      _firstCtrl.text = (d['first_name'] ?? '').toString();
      _lastCtrl.text = (d['last_name'] ?? '').toString();
      _userCtrl.text = (d['username'] ?? '').toString();
      _phoneCtrl.text = (d['phone_number'] ?? d['phone'] ?? '').toString();
      _bioCtrl.text = (d['bio'] ?? '').toString();
      ref.read(authProvider.notifier).updateUser(CNUser.fromJson(d));
    } catch (_) {}
  }

  @override
  void dispose() {
    _firstCtrl.dispose();
    _lastCtrl.dispose();
    _userCtrl.dispose();
    _phoneCtrl.dispose();
    _bioCtrl.dispose();
    _otpCtrl.dispose();
    _curPwdCtrl.dispose();
    _newPwdCtrl.dispose();
    _confPwdCtrl.dispose();
    super.dispose();
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _uploadAvatar() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85, maxWidth: 900);
    if (picked == null) return;
    setState(() => _avatarBusy = true);
    try {
      final form = FormData.fromMap({
        'avatar': await MultipartFile.fromFile(picked.path, filename: picked.name),
      });
      final res = await ref.read(apiClientProvider).dio.post('/auth/me/avatar/', data: form);
      final updated = CNUser.fromJson(Map<String, dynamic>.from(res.data as Map));
      ref.read(authProvider.notifier).updateUser(updated);
      _toast('Profile picture updated!');
    } catch (e) {
      _toast(parseApiError(e));
    } finally {
      if (mounted) setState(() => _avatarBusy = false);
    }
  }

  Future<void> _removeAvatar() async {
    setState(() => _avatarBusy = true);
    try {
      final res = await ref.read(apiClientProvider).dio.delete('/auth/me/avatar/');
      final updated = CNUser.fromJson(Map<String, dynamic>.from(res.data as Map));
      ref.read(authProvider.notifier).updateUser(updated);
      _toast('Profile picture removed.');
    } catch (e) {
      _toast(parseApiError(e));
    } finally {
      if (mounted) setState(() => _avatarBusy = false);
    }
  }

  Future<void> _saveProfile() async {
    setState(() => _savingProfile = true);
    try {
      final payload = <String, dynamic>{
        'first_name': _firstCtrl.text.trim(),
        'last_name': _lastCtrl.text.trim(),
        'username': _userCtrl.text.trim(),
        'bio': _bioCtrl.text.trim(),
      };
      if (_phoneCtrl.text.trim().isNotEmpty) {
        payload['phone_number'] = _phoneCtrl.text.trim();
      }
      final res = await ref.read(apiClientProvider).dio.patch('/auth/me/', data: payload);
      final updated = CNUser.fromJson(Map<String, dynamic>.from(res.data as Map));
      ref.read(authProvider.notifier).updateUser(updated);
      _toast('Profile saved!');
    } catch (e) {
      _toast(parseApiError(e));
    } finally {
      if (mounted) setState(() => _savingProfile = false);
    }
  }

  Future<void> _sendEmailOtp() async {
    setState(() => _sendingOtp = true);
    try {
      final res = await ref.read(apiClientProvider).dio.post('/auth/send-verification/');
      _toast((res.data['detail'] ?? 'Verification code sent!').toString());
    } catch (e) {
      _toast(parseApiError(e));
    } finally {
      if (mounted) setState(() => _sendingOtp = false);
    }
  }

  Future<void> _verifyEmailOtp() async {
    final code = _otpCtrl.text.trim();
    if (code.length < 4) {
      _toast('Enter the 6-digit code sent to your email.');
      return;
    }
    setState(() => _verifyingOtp = true);
    try {
      final res = await ref.read(apiClientProvider).dio.post('/auth/verify-email/', data: {'code': code});
      _toast((res.data['detail'] ?? 'Email verified!').toString());
      _otpCtrl.clear();
      await ref.read(authProvider.notifier).refreshMe();
    } catch (e) {
      _toast(parseApiError(e));
    } finally {
      if (mounted) setState(() => _verifyingOtp = false);
    }
  }

  Future<void> _changePassword() async {
    if (_newPwdCtrl.text != _confPwdCtrl.text) {
      _toast('New passwords do not match.');
      return;
    }
    if (_newPwdCtrl.text.length < 8) {
      _toast('New password must be at least 8 characters.');
      return;
    }
    setState(() => _pwdBusy = true);
    try {
      final res = await ref.read(apiClientProvider).dio.post('/auth/change-password/', data: {
        'current_password': _curPwdCtrl.text,
        'new_password': _newPwdCtrl.text,
        'confirm_password': _confPwdCtrl.text,
      });
      final d = Map<String, dynamic>.from(res.data as Map);
      if (d['access'] != null) {
        await ref.read(apiClientProvider).tokens.saveTokens(
              access: d['access'].toString(),
              refresh: d['refresh']?.toString(),
            );
      }
      _curPwdCtrl.clear();
      _newPwdCtrl.clear();
      _confPwdCtrl.clear();
      _toast('Password updated successfully!');
    } catch (e) {
      _toast(parseApiError(e));
    } finally {
      if (mounted) setState(() => _pwdBusy = false);
    }
  }

  void _confirmDeleteAccount() {
    final pwdCtrl = TextEditingController();
    bool busy = false;
    AppBottomSheet.show(
      context,
      builder: (sheetCtx) => StatefulBuilder(
        builder: (ctx, setS) {
          final cn = ctx.cn;
          return Padding(
            padding: EdgeInsets.fromLTRB(20, 8, 20, MediaQuery.of(ctx).viewInsets.bottom + 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Delete Account Permanently', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: cn.danger)),
                const SizedBox(height: 6),
                Text(
                  'This permanently erases your CampusNetwork profile and personal data. This cannot be undone.',
                  style: TextStyle(color: cn.textMuted, fontSize: 13.5, height: 1.4),
                ),
                const SizedBox(height: 14),
                ClayTextField(
                  controller: pwdCtrl,
                  label: 'Confirm your password',
                  hint: 'Enter current password',
                  prefixIcon: Icons.lock_outline_rounded,
                  iconColor: cn.danger,
                  obscureText: true,
                ),
                const SizedBox(height: 16),
                ClayButton(
                  label: busy ? 'Deleting...' : 'Delete My Account',
                  color: cn.danger,
                  busy: busy,
                  onTap: busy
                      ? null
                      : () async {
                          setS(() => busy = true);
                          try {
                            await ref.read(apiClientProvider).dio.delete(
                                  '/auth/me/',
                                  data: {'password': pwdCtrl.text},
                                );
                            await ref.read(authProvider.notifier).logout();
                            if (ctx.mounted) Navigator.of(ctx).pop();
                            if (mounted) context.go('/landing');
                          } catch (e) {
                            setS(() => busy = false);
                            _toast(parseApiError(e));
                          }
                        },
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    final user = ref.watch(authProvider.select((s) => s.user));
    final mode = ref.watch(themeModeProvider);

    return Scaffold(
      backgroundColor: cn.bg,
      appBar: AppBar(
        title: Text('Account Settings', style: TextStyle(fontWeight: FontWeight.w900, color: cn.textPrimary)),
      ),
      body: user == null
          ? const Center(child: Text('Sign in to manage account settings.'))
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 48),
              children: [
                // 1. Profile Picture
                MorphismCard(
                  child: Row(
                    children: [
                      UserAvatar(url: user.avatarUrl, initials: user.av, bgHex: user.bg, size: 62),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Profile Photo', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: cn.textPrimary)),
                            const SizedBox(height: 6),
                            Wrap(
                              spacing: 8,
                              children: [
                                LiquidTap(
                                  onTap: _avatarBusy ? null : _uploadAvatar,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                    decoration: BoxDecoration(color: cn.accent, borderRadius: BorderRadius.circular(999)),
                                    child: Text(
                                      _avatarBusy ? 'Uploading...' : 'Change Photo',
                                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12),
                                    ),
                                  ),
                                ),
                                if (user.avatarUrl != null && user.avatarUrl!.isNotEmpty)
                                  LiquidTap(
                                    onTap: _avatarBusy ? null : _removeAvatar,
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                      decoration: BoxDecoration(color: cn.dangerSoft, borderRadius: BorderRadius.circular(999)),
                                      child: Text(
                                        'Remove',
                                        style: TextStyle(color: cn.danger, fontWeight: FontWeight.w800, fontSize: 12),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // 2. Appearance (System / Light / Dark)
                MorphismCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Appearance', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                      const SizedBox(height: 4),
                      Text('Choose Light, Dark, or follow your phone system theme.', style: TextStyle(color: cn.textMuted, fontSize: 12.5)),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          for (final opt in [
                            (ThemeMode.system, 'System', Icons.brightness_auto_rounded),
                            (ThemeMode.light, 'Light', Icons.light_mode_rounded),
                            (ThemeMode.dark, 'Dark', Icons.dark_mode_rounded),
                          ])
                            Expanded(
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 3),
                                child: LiquidTap(
                                  onTap: () => ref.read(themeModeProvider.notifier).setMode(opt.$1),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(vertical: 11),
                                    decoration: ClayDecorations.pill(context, active: mode == opt.$1, radius: 16),
                                    child: Column(
                                      children: [
                                        Icon(opt.$3, size: 18, color: mode == opt.$1 ? Colors.white : cn.textMuted),
                                        const SizedBox(height: 4),
                                        Text(
                                          opt.$2,
                                          style: TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w800,
                                            color: mode == opt.$1 ? Colors.white : cn.textPrimary,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // 3. Personal Information
                MorphismCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Personal Information', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(child: ClayTextField(controller: _firstCtrl, label: 'First Name', hint: 'First Name')),
                          const SizedBox(width: 10),
                          Expanded(child: ClayTextField(controller: _lastCtrl, label: 'Last Name', hint: 'Last Name')),
                        ],
                      ),
                      const SizedBox(height: 12),
                      ClayTextField(controller: _userCtrl, label: 'Username', hint: 'username', prefixText: '@', prefixIcon: Icons.alternate_email_rounded),
                      const SizedBox(height: 12),
                      ClayTextField(
                        controller: _phoneCtrl,
                        label: 'Phone Number (optional)',
                        hint: '080...',
                        prefixIcon: Icons.phone_outlined,
                        keyboardType: TextInputType.phone,
                      ),
                      const SizedBox(height: 12),
                      ClayTextField(controller: _bioCtrl, label: 'Bio', hint: 'Tell classmates about yourself...', prefixIcon: Icons.edit_note_rounded, maxLines: 3),
                      const SizedBox(height: 16),
                      ClayButton(
                        label: _savingProfile ? 'Saving...' : 'Save Changes',
                        busy: _savingProfile,
                        onTap: _savingProfile ? null : _saveProfile,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // 4. Email Verification
                MorphismCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text('Email Verification', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: user.emailVerified ? cn.successSoft : cn.warningSoft,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              user.emailVerified ? 'Verified' : 'Unverified',
                              style: TextStyle(
                                color: user.emailVerified ? cn.success : cn.warning,
                                fontWeight: FontWeight.w800,
                                fontSize: 11.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(user.email, style: TextStyle(color: cn.textMuted, fontSize: 13)),
                      if (!user.emailVerified) ...[
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: ClayTextField(
                                controller: _otpCtrl,
                                hint: '6-digit code',
                                prefixIcon: Icons.mark_email_read_outlined,
                                keyboardType: TextInputType.number,
                              ),
                            ),
                            const SizedBox(width: 8),
                            SizedBox(
                              width: 102,
                              child: ClayButton(
                                label: _verifyingOtp ? '...' : 'Verify',
                                height: 48,
                                busy: _verifyingOtp,
                                onTap: _verifyingOtp ? null : _verifyEmailOtp,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        TextButton(
                          onPressed: _sendingOtp ? null : _sendEmailOtp,
                          child: Text(_sendingOtp ? 'Sending code...' : 'Resend 6-digit verification code'),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // 5. Change Password
                MorphismCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Security & Password', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                      const SizedBox(height: 12),
                      ClayTextField(controller: _curPwdCtrl, label: 'Current Password', hint: '••••••••', prefixIcon: Icons.lock_outline_rounded, obscureText: true),
                      const SizedBox(height: 12),
                      ClayTextField(controller: _newPwdCtrl, label: 'New Password', hint: '8+ characters', prefixIcon: Icons.vpn_key_outlined, obscureText: true),
                      const SizedBox(height: 12),
                      ClayTextField(controller: _confPwdCtrl, label: 'Confirm New Password', hint: 'Repeat new password', prefixIcon: Icons.check_circle_outline_rounded, obscureText: true),
                      const SizedBox(height: 16),
                      ClayButton(
                        label: _pwdBusy ? 'Updating...' : 'Update Password',
                        busy: _pwdBusy,
                        onTap: _pwdBusy ? null : _changePassword,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // 6. Info, Sign Out & Danger Zone
                MorphismCard(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(
                    children: [
                      ListTile(
                        leading: Icon(Icons.info_outline_rounded, color: cn.accentLight),
                        title: Text('About, Help & Privacy', style: TextStyle(fontWeight: FontWeight.w700, color: cn.textPrimary)),
                        trailing: Icon(Icons.chevron_right_rounded, color: cn.textFaint),
                        onTap: () => context.push('/about'),
                      ),
                      Divider(height: 1, color: cn.divider),
                      ListTile(
                        leading: Icon(Icons.logout_rounded, color: cn.warning),
                        title: Text('Sign Out', style: TextStyle(color: cn.warning, fontWeight: FontWeight.w800)),
                        onTap: () async {
                          await ref.read(authProvider.notifier).logout();
                          if (context.mounted) context.go('/landing');
                        },
                      ),
                      Divider(height: 1, color: cn.divider),
                      ListTile(
                        leading: Icon(Icons.delete_forever_outlined, color: cn.danger),
                        title: Text('Delete Account', style: TextStyle(color: cn.danger, fontWeight: FontWeight.w800)),
                        onTap: _confirmDeleteAccount,
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}
