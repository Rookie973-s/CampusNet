import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/motion/liquid_motion.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/morphism_widgets.dart';
import '../auth/auth_provider.dart';

class ApplySugScreen extends ConsumerStatefulWidget {
  const ApplySugScreen({super.key});

  @override
  ConsumerState<ApplySugScreen> createState() => _ApplySugScreenState();
}

class _ApplySugScreenState extends ConsumerState<ApplySugScreen> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _subDept = TextEditingController();
  final _role = TextEditingController();
  final _bio = TextEditingController();
  final _why = TextEditingController();
  String _facultyId = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final u = ref.read(authProvider).user;
    if (u != null) {
      _first.text = u.firstName;
      _last.text = u.lastName;
      _email.text = u.email;
    }
  }

  @override
  void dispose() {
    for (final c in [_first, _last, _email, _phone, _subDept, _role, _bio, _why]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      await ref.read(apiClientProvider).dio.post('/applications/', data: {
        'first_name': _first.text.trim(),
        'last_name': _last.text.trim(),
        'email': _email.text.trim(),
        'phone': _phone.text.trim(),
        if (_facultyId.isNotEmpty) 'department': int.tryParse(_facultyId),
        'academic_department_name': _subDept.text.trim(),
        'role_title': _role.text.trim(),
        'bio': _bio.text.trim(),
        'why': _why.text.trim(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('SUG application submitted!')));
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(parseApiError(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final depts = ref.watch(departmentsProvider).valueOrNull ?? const <DepartmentItem>[];
    return Scaffold(
      backgroundColor: CNColors.bg,
      appBar: AppBar(title: const Text('Apply for SUG Access', style: TextStyle(fontWeight: FontWeight.w800))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          MorphismCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Official SUG Verification', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
                const SizedBox(height: 4),
                const Text('An administrator reviews every application.', style: TextStyle(color: CNColors.textMuted, fontSize: 13)),
                const SizedBox(height: 16),
                TextField(controller: _first, decoration: const InputDecoration(labelText: 'First name *')),
                TextField(controller: _last, decoration: const InputDecoration(labelText: 'Last name *')),
                TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email *')),
                TextField(controller: _phone, decoration: const InputDecoration(labelText: 'Phone number')),
                const SizedBox(height: 12),
                FacultyDropdown(
                  options: depts.map((d) => DropdownOption(label: d.name, value: d.id.toString(), colorHex: d.color)).toList(),
                  value: _facultyId,
                  onChanged: (v) => setState(() => _facultyId = v),
                  placeholder: 'Select Academic Faculty *',
                ),
                TextField(controller: _subDept, decoration: const InputDecoration(labelText: 'Department')),
                TextField(controller: _role, decoration: const InputDecoration(labelText: 'SUG Role / Office *')),
                TextField(controller: _bio, maxLines: 3, decoration: const InputDecoration(labelText: 'Short Bio (20+ chars) *')),
                TextField(controller: _why, maxLines: 3, decoration: const InputDecoration(labelText: 'Why SUG Access? (20+ chars) *')),
                const SizedBox(height: 18),
                LiquidTap(
                  onTap: _busy ? null : _submit,
                  child: Container(
                    width: double.infinity,
                    height: 48,
                    decoration: BoxDecoration(color: CNColors.accent, borderRadius: BorderRadius.circular(14)),
                    alignment: Alignment.center,
                    child: Text(_busy ? 'Submitting...' : 'Submit Application', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
