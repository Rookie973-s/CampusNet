import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const String kApiBase = 'https://campusnetwork-api.onrender.com/api';
const String kWebOrigin = 'https://campusnetwork-sooty.vercel.app';

const _kAccessKey = 'cn_access';
const _kRefreshKey = 'cn_refresh';

const String kApiOrigin = 'https://campusnetwork-api.onrender.com';

/// Ensures any Render media URL (absolute http:// or relative /media/...) always
/// resolves to a valid HTTPS URL so Android & Web display synced media identically.
String? normalizeMediaUrl(String? url) {
  if (url == null || url.trim().isEmpty) return null;
  final u = url.trim();
  if (u.startsWith('/')) {
    return '$kApiOrigin$u';
  }
  if (u.startsWith('http://') && u.contains('onrender.com')) {
    return 'https://${u.substring(7)}';
  }
  return u;
}

/// Clean human-readable error extraction (never leaks raw HTML <!doctype html> pages).
String parseApiError(Object err, [String fallback = 'Something went wrong.']) {
  if (err is DioException) {
    final data = err.response?.data;
    if (data is Map) {
      if (data['detail'] is String) return data['detail'] as String;
      if (data.isNotEmpty) {
        final key = data.keys.first;
        final val = data[key];
        final msg = val is List && val.isNotEmpty ? val.first.toString() : val.toString();
        return key == 'non_field_errors' ? msg : '$key: $msg';
      }
    } else if (data is String && !data.trimLeft().startsWith('<')) {
      return data.length > 160 ? data.substring(0, 160) : data;
    }
    return err.message ?? fallback;
  }
  return err.toString();
}

class TokenStorage {
  const TokenStorage(this._storage);
  final FlutterSecureStorage _storage;

  Future<String?> getAccess() => _storage.read(key: _kAccessKey);
  Future<String?> getRefresh() => _storage.read(key: _kRefreshKey);

  Future<void> saveTokens({required String access, String? refresh}) async {
    await _storage.write(key: _kAccessKey, value: access);
    if (refresh != null && refresh.isNotEmpty) {
      await _storage.write(key: _kRefreshKey, value: refresh);
    }
  }

  Future<void> clear() async {
    await _storage.delete(key: _kAccessKey);
    await _storage.delete(key: _kRefreshKey);
  }
}

class ApiClient {
  ApiClient(this.tokens) {
    dio = Dio(
      BaseOptions(
        baseUrl: kApiBase,
        connectTimeout: const Duration(seconds: 35),
        receiveTimeout: const Duration(seconds: 45),
        headers: {'Accept': 'application/json'},
      ),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final access = await tokens.getAccess();
          if (access != null && access.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $access';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401 && error.requestOptions.extra['_retried'] != true) {
            final refreshed = await _tryRefresh();
            if (refreshed) {
              final opts = error.requestOptions;
              opts.extra['_retried'] = true;
              final newAccess = await tokens.getAccess();
              opts.headers['Authorization'] = 'Bearer $newAccess';
              try {
                final retryRes = await dio.fetch(opts);
                return handler.resolve(retryRes);
              } catch (_) {}
            }
          }
          handler.next(error);
        },
      ),
    );
  }

  late final Dio dio;
  final TokenStorage tokens;
  Future<bool>? _refreshInFlight;

  Future<bool> _tryRefresh() {
    _refreshInFlight ??= () async {
      try {
        final refresh = await tokens.getRefresh();
        if (refresh == null || refresh.isEmpty) return false;
        final res = await Dio(BaseOptions(baseUrl: kApiBase)).post(
          '/auth/refresh/',
          data: {'refresh': refresh},
        );
        final access = res.data['access']?.toString();
        final nextRefresh = res.data['refresh']?.toString() ?? refresh;
        if (access != null && access.isNotEmpty) {
          await tokens.saveTokens(access: access, refresh: nextRefresh);
          return true;
        }
        await tokens.clear();
        return false;
      } catch (_) {
        await tokens.clear();
        return false;
      } finally {
        _refreshInFlight = null;
      }
    }();
    return _refreshInFlight!;
  }
}

final tokenStorageProvider = Provider<TokenStorage>(
  (_) => const TokenStorage(FlutterSecureStorage()),
);

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(ref.watch(tokenStorageProvider)),
);
