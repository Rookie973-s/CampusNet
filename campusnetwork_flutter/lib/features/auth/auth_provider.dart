import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/models.dart';
import '../../core/network/api_client.dart';

class AuthState {
  const AuthState({
    this.user,
    this.booting = true,
    this.guestEntered = false,
  });

  final CNUser? user;
  final bool booting;
  final bool guestEntered;

  bool get isAuthenticated => user != null;

  AuthState copyWith({
    CNUser? user,
    bool clearUser = false,
    bool? booting,
    bool? guestEntered,
  }) =>
      AuthState(
        user: clearUser ? null : (user ?? this.user),
        booting: booting ?? this.booting,
        guestEntered: guestEntered ?? this.guestEntered,
      );
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._api) : super(const AuthState()) {
    bootstrap();
  }

  final ApiClient _api;

  Future<void> bootstrap() async {
    try {
      final token = await _api.tokens.getAccess();
      if (token == null || token.isEmpty) {
        state = state.copyWith(booting: false, clearUser: true);
        return;
      }
      final res = await _api.dio.get('/auth/me/');
      final u = CNUser.fromJson(Map<String, dynamic>.from(res.data as Map));
      state = AuthState(user: u, booting: false, guestEntered: true);
    } catch (_) {
      state = state.copyWith(booting: false, clearUser: true);
    }
  }

  void enterAsGuest() {
    state = state.copyWith(guestEntered: true);
  }

  Future<void> login(String username, String password) async {
    final res = await _api.dio.post('/auth/login/', data: {'username': username, 'password': password});
    final data = Map<String, dynamic>.from(res.data as Map);
    await _api.tokens.saveTokens(
      access: data['access'].toString(),
      refresh: data['refresh']?.toString(),
    );
    final u = CNUser.fromJson(Map<String, dynamic>.from(data['user'] as Map));
    state = AuthState(user: u, booting: false, guestEntered: true);
  }

  Future<void> register({
    required String firstName,
    required String lastName,
    required String username,
    required String email,
    required String password,
    required String confirmPassword,
  }) async {
    final res = await _api.dio.post('/auth/register/', data: {
      'first_name': firstName,
      'last_name': lastName,
      'username': username,
      'email': email,
      'password': password,
      'confirm_password': confirmPassword,
    });
    final data = Map<String, dynamic>.from(res.data as Map);
    await _api.tokens.saveTokens(
      access: data['access'].toString(),
      refresh: data['refresh']?.toString(),
    );
    final u = CNUser.fromJson(Map<String, dynamic>.from(data['user'] as Map));
    state = AuthState(user: u, booting: false, guestEntered: true);
  }

  void updateUser(CNUser updated) {
    state = state.copyWith(user: updated);
  }

  Future<void> refreshMe() async {
    try {
      final res = await _api.dio.get('/auth/me/');
      final u = CNUser.fromJson(Map<String, dynamic>.from(res.data as Map));
      state = state.copyWith(user: u);
    } catch (_) {}
  }

  Future<void> logout() async {
    await _api.tokens.clear();
    state = const AuthState(booting: false, guestEntered: false);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>(
  (ref) => AuthNotifier(ref.watch(apiClientProvider)),
);

final departmentsProvider = FutureProvider<List<DepartmentItem>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.dio.get('/departments/');
  final list = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
  return list.whereType<Map>().map((e) => DepartmentItem.fromJson(Map<String, dynamic>.from(e))).toList();
});

/// Real-Time Notifications Controller (polls automatically every 10s without manual refresh!)
class NotificationsNotifier extends StateNotifier<List<NotificationItem>> {
  NotificationsNotifier(this._api, this._isAuth) : super(const []) {
    if (_isAuth) {
      refresh();
      _timer = Timer.periodic(const Duration(seconds: 10), (_) => refresh());
    }
  }

  final ApiClient _api;
  final bool _isAuth;
  Timer? _timer;

  int get unreadCount => state.where((n) => !n.read).length;

  Future<void> refresh() async {
    if (!_isAuth) return;
    try {
      final res = await _api.dio.get('/notifications/');
      final raw = res.data is List ? res.data as List : (res.data['results'] as List? ?? []);
      state = raw.whereType<Map>().map((e) => NotificationItem.fromJson(Map<String, dynamic>.from(e))).toList();
    } catch (_) {}
  }

  Future<void> markAllRead() async {
    state = state.map((n) => n.copyWith(read: true)).toList();
    try {
      await _api.dio.post('/notifications/mark_all_read/');
    } catch (_) {}
  }

  Future<void> clearAll() async {
    state = const [];
    try {
      await _api.dio.delete('/notifications/clear_all/');
    } catch (_) {}
  }

  Future<void> markRead(int id) async {
    state = state.map((n) => n.id == id ? n.copyWith(read: true) : n).toList();
    try {
      await _api.dio.post('/notifications/$id/read/');
    } catch (_) {}
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}

final notificationsProvider = StateNotifierProvider<NotificationsNotifier, List<NotificationItem>>((ref) {
  final api = ref.watch(apiClientProvider);
  final isAuth = ref.watch(authProvider.select((s) => s.isAuthenticated));
  return NotificationsNotifier(api, isAuth);
});

final unreadNotificationsCountProvider = Provider<int>(
  (ref) => ref.watch(notificationsProvider).where((n) => !n.read).length,
);
