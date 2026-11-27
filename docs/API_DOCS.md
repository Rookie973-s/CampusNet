# CampusNetwork (Cenet) — REST API Documentation

Base URL (Production): `https://campusnetwork-api.onrender.com/api/v1/` (legacy `/api/` alias also supported)

Authentication: `Authorization: Bearer <access_token>` (JWT via `rest_framework_simplejwt`).

---

## 1. Authentication & Accounts

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register/` | Public | Register user (`username`, `email`, `password`, `confirm_password`, `first_name`, `last_name`) |
| `POST` | `/auth/login/` | Public | Login by username/email/phone/matric. Brute-force lockout (`429`) after 5 failed attempts. |
| `POST` | `/auth/refresh/` | Public | Rotate JWT refresh token |
| `GET/PATCH/DELETE` | `/auth/me/` | JWT | Read/update profile or NDPA account deletion (requires password) |
| `POST/DELETE` | `/auth/me/avatar/` | JWT | Upload/remove profile picture (EXIF stripped, HTTPS URL) |
| `POST` | `/auth/forgot-password/` | Public | Sends 6-digit code (requires `email_verified=True`) |
| `POST` | `/auth/verify-reset-code/` | Public | Verify 6-digit code and obtain single-use reset token |
| `POST` | `/auth/reset-password/` | Public | Set new password using single-use reset token |
| `GET` | `/users/{id}/` | Optional | Public user profile |
| `GET` | `/users/by-username/{username}/` | Optional | Resolve `@username` mention to user profile |

## 2. Feed, Questions, Polls & Comments

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET/POST` | `/questions/` | Read Public / Write JWT | List/create posts & polls (`?department=`, `?discovery=`, `?search=`) |
| `GET/PATCH/DELETE` | `/questions/{public_id}/` | Optional / Owner | Read by unguessable `public_id`, edit (Verified Student/SUG), delete |
| `POST` | `/questions/{id}/like/` | JWT | Toggle post like |
| `POST` | `/questions/{id}/vote/` | JWT | Upvote/downvote post (`{"direction": "up" \| "down"}`) |
| `POST` | `/questions/{id}/bookmark/` | JWT | Toggle bookmark |
| `POST` | `/questions/{id}/vote-poll/` | JWT | Vote on poll option (`{"option_id": <int>}`) |
| `GET` | `/questions/{id}/comments/` | Public | Threaded comments (`?sort=recommended\|recent\|liked\|disliked\|oldest`) |
| `POST` | `/questions/{id}/answer/` | JWT | Post top-level comment or reply (`body`, optional `parent`, `image`) |
| `POST` | `/answers/{id}/like/` | JWT | Toggle comment like |
| `POST` | `/answers/{id}/vote/` | JWT | Upvote/downvote comment |

## 3. Payments & Student Verification (Paystack)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/verification/status/` | JWT | Student verification application & payment status |
| `POST` | `/verification/initiate-payment/` | JWT | Initiate `₦1,500` Paystack checkout + DVA. Supports `Idempotency-Key` header. Returns `checkout_url`, `authorization_url`, `reference`, DVA details. |
| `POST` | `/verification/apply/` | JWT | Submit verification application (ID proof + optional liveness video) |
| `POST` | `/payments/verify/` | JWT | Verify Paystack transaction `{"reference": "CN-..."}` (IDOR-checked) |
| `POST` | `/payments/paystack/webhook/` | HMAC-SHA512 | Server-to-server Paystack webhook (`X-Paystack-Signature`). Atomic + idempotent + AuditLog. |

## 4. Campus Advertising

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/ads/quote/` | Public | Server-authoritative price calculation (`₦900–₦5,000`) + real `estimated_reach` |
| `GET/POST` | `/ads/` | JWT | List own campaigns (or `?all=1` for admins) / create campaign |
| `POST` | `/ads/{id}/initiate-payment/` | JWT | Start Paystack payment for campaign (supports `Idempotency-Key`) |
| `POST` | `/ads/{id}/pause/` / `resume/` | JWT | Pause or resume approved campaign |
| `GET` | `/ads/analytics/?range=30d` | JWT | Real deduplicated impressions, clicks, CTR & daily timeline |
| `GET` | `/ads/serve/?placement=feed` | Optional | Fairly rotated eligible ads (empty for verified users with `hide_ads=True`) |
| `POST` | `/ads/{id}/impression/` / `click/` | Optional | Bot-filtered, deduplicated ad tracking |

## 5. Academic PDF Library

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/library/catalog/` | JWT | Levels (`100–500`), faculties, and academic departments |
| `GET` | `/library/folders/` | JWT | Paginated course folders with document counts & previews |
| `GET/POST` | `/library/documents/` | JWT / Class Rep | Browse documents or upload sanitized PDF (Class Rep scope enforced) |
| `GET` | `/library/documents/{id}/signed-url/` | JWT | Issue 5-minute expiring signed download URL |
| `GET` | `/library/documents/{id}/file/` | JWT or `?sig=` | Stream private PDF with sandbox CSP & `X-Content-Type-Options: nosniff` |

## 6. Communities, SUG & Notifications

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET/POST` | `/communities/` | Optional / JWT | Discover or create communities |
| `GET/PATCH/DELETE` | `/communities/{slug}/` | Optional / Owner | View or update avatar, cover image, bio & rules |
| `GET/POST` | `/communities/{slug}/posts/` | Optional / Admin | Read or publish community announcements (supports multipart `image`) |
| `POST` | `/community-posts/{id}/like/` | JWT | Toggle community post like |
| `GET/POST` | `/community-posts/{id}/comments/` | Optional / JWT | Read or post threaded comments on community posts |
| `GET` | `/staff/` | Public | Verified SUG officials directory |
| `GET/POST` | `/chats/` | JWT | Direct messaging with SUG officials |
| `GET` | `/notifications/` | JWT | List user notifications (`POST /notifications/mark-all-read/`, `DELETE /notifications/clear-all/`) |
