import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../motion/liquid_motion.dart';
import '../network/api_client.dart';
import '../theme/app_theme.dart';
import 'morphism_widgets.dart';

/// Reusable Paystack Checkout & Dedicated Bank Transfer Sheet.
/// Works seamlessly for both Student Verification (₦1,500) and Campus Ads.
/// Returns `true` when payment is confirmed by the backend, `false`/null otherwise.
Future<bool> showPaystackPaymentSheet(
  BuildContext context, {
  required ApiClient api,
  required Map<String, dynamic> payload,
  required String title,
}) async {
  final result = await AppBottomSheet.show<bool>(
    context,
    builder: (sheetCtx) => _PaystackPaymentBody(
      api: api,
      payload: payload,
      title: title,
    ),
  );
  return result == true;
}

class _PaystackPaymentBody extends StatefulWidget {
  const _PaystackPaymentBody({
    required this.api,
    required this.payload,
    required this.title,
  });

  final ApiClient api;
  final Map<String, dynamic> payload;
  final String title;

  @override
  State<_PaystackPaymentBody> createState() => _PaystackPaymentBodyState();
}

class _PaystackPaymentBodyState extends State<_PaystackPaymentBody> {
  bool _verifying = false;
  bool _launching = false;
  String? _statusMsg;
  bool _isError = false;

  String get _checkoutUrl =>
      (widget.payload['checkout_url'] ?? widget.payload['authorization_url'] ?? '').toString().trim();
  String get _reference => (widget.payload['reference'] ?? '').toString().trim();
  String get _amount => (widget.payload['amount_ngn'] ?? '0').toString();
  String get _bankName => (widget.payload['bank_name'] ?? '').toString().trim();
  String get _accountNumber => (widget.payload['account_number'] ?? '').toString().trim();
  String get _accountName => (widget.payload['account_name'] ?? '').toString().trim();
  String get _message => (widget.payload['message'] ?? 'Complete your payment securely via Paystack.').toString();
  bool get _enabled => widget.payload['enabled'] != false;

  Future<void> _openCheckout() async {
    if (_checkoutUrl.isEmpty) {
      setState(() {
        _statusMsg = 'Paystack checkout link was not returned. Use the bank transfer details or try again.';
        _isError = true;
      });
      return;
    }
    setState(() {
      _launching = true;
      _statusMsg = null;
      _isError = false;
    });
    try {
      final uri = Uri.parse(_checkoutUrl);
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) {
        await launchUrl(uri, mode: LaunchMode.platformDefault);
      }
      if (mounted) {
        setState(() {
          _statusMsg = 'Finish payment in your browser, then return here and tap "I\'ve Paid — Verify Now".';
          _isError = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _statusMsg = 'Could not open browser automatically. Reference: $_reference';
          _isError = true;
        });
      }
    } finally {
      if (mounted) setState(() => _launching = false);
    }
  }

  Future<void> _verifyNow() async {
    if (_reference.isEmpty) return;
    setState(() {
      _verifying = true;
      _statusMsg = null;
      _isError = false;
    });
    try {
      final res = await widget.api.dio.post('/payments/verify/', data: {'reference': _reference});
      final d = res.data is Map ? Map<String, dynamic>.from(res.data as Map) : <String, dynamic>{};
      if (d['verified'] == true || d['status'] == 'paid') {
        HapticFeedback.mediumImpact();
        if (mounted) Navigator.of(context, rootNavigator: true).pop(true);
        return;
      }
      if (mounted) {
        setState(() {
          _statusMsg = (d['detail'] ?? 'Payment not confirmed yet. Wait a few seconds after paying and tap Verify again.').toString();
          _isError = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _statusMsg = parseApiError(e);
          _isError = true;
        });
      }
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cn = context.cn;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: cn.divider, borderRadius: BorderRadius.circular(99)),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              ClayIconPill(icon: Icons.payments_rounded, color: cn.success, size: 42),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(widget.title, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: cn.textPrimary)),
                    Text(
                      '₦$_amount · Powered by Paystack',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: cn.success),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: Icon(Icons.close_rounded, color: cn.textSecondary),
                onPressed: () => Navigator.of(context, rootNavigator: true).pop(false),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(_message, style: TextStyle(color: cn.textMuted, fontSize: 13.5, height: 1.45)),
          if (!_enabled) ...[
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: cn.warning.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                'Paystack secret key is not active on the server yet. Ask the admin to verify PAYSTACK_SECRET_KEY in Render Environment Variables.',
                style: TextStyle(color: cn.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ),
          ],
          if (_accountNumber.isNotEmpty) ...[
            const SizedBox(height: 14),
            MorphismCard(
              padding: const EdgeInsets.all(14),
              radius: 18,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('DEDICATED BANK TRANSFER ACCOUNT', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: cn.textFaint, letterSpacing: 0.6)),
                  const SizedBox(height: 8),
                  if (_bankName.isNotEmpty)
                    Text(_bankName, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: cn.textPrimary)),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          _accountNumber,
                          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: 1.1, color: cn.accent),
                        ),
                      ),
                      LiquidTap(
                        onTap: () {
                          Clipboard.setData(ClipboardData(text: _accountNumber));
                          HapticFeedback.selectionClick();
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Account number copied!')));
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(color: cn.accentSoft, borderRadius: BorderRadius.circular(10)),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.copy_rounded, size: 14, color: cn.accent),
                              const SizedBox(width: 4),
                              Text('Copy', style: TextStyle(color: cn.accent, fontWeight: FontWeight.w800, fontSize: 12)),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (_accountName.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(_accountName, style: TextStyle(fontSize: 12.5, color: cn.textMuted)),
                  ],
                ],
              ),
            ),
          ],
          if (_reference.isNotEmpty) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Text('Reference: ', style: TextStyle(color: cn.textFaint, fontSize: 12, fontWeight: FontWeight.w700)),
                Expanded(
                  child: Text(
                    _reference,
                    style: TextStyle(color: cn.textMuted, fontSize: 12, fontWeight: FontWeight.w700),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ],
          if (_statusMsg != null) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: (_isError ? cn.danger : cn.accent).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                _statusMsg!,
                style: TextStyle(
                  color: _isError ? cn.danger : cn.textPrimary,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
          const SizedBox(height: 18),
          if (_checkoutUrl.isNotEmpty)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0E4D45),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                onPressed: _launching ? null : _openCheckout,
                icon: _launching
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.open_in_new_rounded, size: 18),
                label: Text(
                  _launching ? 'Opening Paystack...' : 'Pay ₦$_amount with Paystack',
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14.5),
                ),
              ),
            ),
          if (_reference.isNotEmpty) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                onPressed: _verifying ? null : _verifyNow,
                icon: _verifying
                    ? SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: cn.accent))
                    : Icon(Icons.verified_rounded, size: 18, color: cn.success),
                label: Text(
                  _verifying ? 'Verifying with Paystack...' : "I've Paid — Verify Now",
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
