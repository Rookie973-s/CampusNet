# CampusNetwork (Cenet)

University social networking, academic Q&A, PDF resource library, SUG directory & live chat, communities, student verification, and campus advertising platform.

## Architecture Overview

| Module | Directory | Stack | Production Host |
|---|---|---|---|
| **Backend API** | `atbuconnect_backend/` | Django 5, DRF, SimpleJWT, PostgreSQL | Render Web Service + Persistent Disk |
| **Web App** | `atbuConnect/` | React 19, Vite 8 (code-split lazy routes) | Vercel (`campusnetwork.com.ng`) |
| **Mobile App** | `campusnetwork_flutter/` | Flutter 3 (Riverpod, GoRouter, Dio) | Android APK (GitHub Actions) & iOS-ready |

## Security & Production Hardening

- **API Versioning**: All endpoints are mounted under `/api/v1/` with a backward-compatible `/api/` alias so installed mobile apps keep working across upgrades.
- **Payments (Paystack)**:
  - Server-authoritative pricing (Student Verification `₦1,500`, Campus Ads `₦900–₦5,000`).
  - `Idempotency-Key` support and 2-minute pending transaction reuse prevent double charges on network retries.
  - HMAC-SHA512 signed webhook verification (`POST /api/payments/paystack/webhook/`) with `transaction.atomic()` + `select_for_update()` reconciliation.
  - Append-only `AuditLog` and soft-delete flags (`is_deleted`, `deleted_at`) on `PaymentTransaction` and `StudentVerificationApplication`.
- **Auth & Brute-Force Protection**:
  - JWT access/refresh rotation, verified-email-only password reset, and cache-backed login lockout (`LOGIN_MAX_ATTEMPTS=5`, `LOGIN_LOCKOUT_SECONDS=900` -> `429 Too Many Requests`).
- **Uploads & Private Library**:
  - PIL re-encoding strips EXIF metadata; PDFs are scanned for active elements and stored outside `MEDIA_ROOT`.
  - Short-lived signed PDF download URLs via `GET /api/library/documents/{id}/signed-url/` (`TimestampSigner`, 5-min TTL).
- **Performance & Transport**:
  - `GZipMiddleware`, `SecurityHeadersMiddleware` (CSP, Referrer-Policy, Permissions-Policy, X-Content-Type-Options), `SECURE_PROXY_SSL_HEADER`, DB connection pooling (`CONN_MAX_AGE=60`), optional `REDIS_URL` cache, and immutable cache headers on UUID media.

## Render Persistent Disk Configuration

Attach a Render Persistent Disk mounted at `/var/data` and set these Render Environment Variables:

```env
DEBUG=False
SECRET_KEY=<strong-random-key>
ALLOWED_HOSTS=campusnetwork-api.onrender.com,api.campusnetwork.com.ng
DATABASE_URL=<render-postgres-internal-url>
MEDIA_ROOT=/var/data/media
LIBRARY_PRIVATE_ROOT=/var/data/private_media
FRONTEND_URL=https://campusnetwork.com.ng
CORS_ALLOWED_ORIGINS=https://campusnetwork.com.ng,https://www.campusnetwork.com.ng,https://campusnetwork-sooty.vercel.app
PAYSTACK_SECRET_KEY=<sk_live_or_sk_test_...>
BREVO_API_KEY=<xkeysib-...>
DEFAULT_FROM_EMAIL=CampusNetwork <no-reply@campusnetwork.com.ng>
```

## Local Development & Verification

```bash
# Backend
cd atbuconnect_backend
python manage.py migrate
python manage.py test advertising accounts library staffapp communities config.tests_cenet_modules

# Website
cd atbuConnect
npm ci && npm run build

# Flutter Mobile App
cd campusnetwork_flutter
flutter pub get && flutter analyze && flutter test
```

## Git Branching, Staging & Rollback Strategy

- `main`: Protected production branch (auto-deploys Render backend, Vercel web, and GitHub Actions release APK).
- `staging`: Pre-production branch tested against a staging Render service & preview Vercel URL before merging into `main`.
- **Rollback**: Revert the offending commit (`git revert <sha>`) or re-deploy the previous successful Render/Vercel build from the platform dashboard. Migrations are strictly additive so rolling back code never breaks the database schema.

See [docs/API_DOCS.md](docs/API_DOCS.md) for the full REST API reference.
