# Campus Network v2 — Audit Pack & Decision Log

## A1. Architecture Inventory
- **Backend**: Django + DRF + SimpleJWT + django-filters (`atbuconnect_backend/`).
  - Apps: `accounts`, `departments`, `questions`, `staffapp`, `media_app`, `notifications`, `library`, `communities`, `chat`, `advertising`.
  - Database: `env.db("DATABASE_URL")` — PostgreSQL in production (Render), SQLite fallback locally.
  - Hosting: Render WSGI (`gunicorn`, `WhiteNoise`). **No Redis / Django Channels ASGI worker configured** → per Appendix B #2, real-time uses **Option B (adaptive lightweight sync polling + foreground/resume refresh + FCM/local push hook)**.
  - Payments: Paystack (`advertising/payments.py`, HMAC-SHA512 webhook `/api/payments/paystack/webhook/`, on-demand `/api/payments/verify/`).
- **Website**: React 19 + Vite 8 (`atbuConnect/`, deployed on Vercel at `https://campusnetwork-sooty.vercel.app`).
- **Mobile App**: Flutter 3.47.9 / Dart 3.13.7 (`campusnetwork_flutter/`), `flutter_riverpod`, `go_router`, `dio`, `flutter_secure_storage`, `cached_network_image`, `camera`, `image_picker`, `share_plus`, `url_launcher`, `permission_handler`, `google_fonts`.

## A2. Key Confirmed Root Causes (Bug Register)
| ID | Symptom | Confirmed Root-Cause Layer | Fix Plan |
|---|---|---|---|
| B-01 | Faculty dropdown blank/black screen on Feed & SUG | `FacultyDropdown._openSheet` called `showGeneralDialog` without `useRootNavigator: true`; `Navigator.of(context).pop()` popped the nested GoRouter branch | Build shared `AppBottomSheet`/`AppDialog`/`AppMenu` always using `useRootNavigator: true` & `dialogCtx` pop |
| B-02 | Yellow double underlines on text | Overlays/custom dialogs rendered `Text` without a `Material` ancestor or `TextDecoration.none` | Wrap all overlays in `Material(type: MaterialType.transparency)` + enforce `decoration: TextDecoration.none` in theme |
| B-03 | Bottom nav overlaps menus & sheets | `showModalBottomSheet` used nested navigator (`useRootNavigator: false`) | Route all sheets/menus through `AppOverlay` on root navigator with `useSafeArea` & `viewInsets` |
| B-04 | Library Open PDF fails in release | `library_screen.dart` opened authenticated `/api/library/documents/{id}/file/` via `launchUrl` (external browser lacks `Bearer` JWT → 401) | Authenticated `Dio` download to cache dir with progress + `open_filex` / native viewer |
| B-05 | Community card tap does nothing | `CommunitiesScreen` cards lacked `LiquidTap`/`onTap` and used mismatched category strings (`Tech & Innovation` vs DB `Technology`) | Align categories 1:1 with `communities/models.py` + wire `CommunityDetailScreen` + `My Communities` (`?mine=1`) |
| B-06 | New ad replaces existing ad | `CampaignViewSet.serve()` sorted strictly by `-created_at` and clients rendered only `ads[0]` | Rotate active eligible campaigns by least-impressions + slot indexing across multiple advertisers |
| B-07 | Ad clicks/impressions missing in Flutter | Flutter `NativeAdCard` never called `POST /ads/{id}/impression/` or `/ads/{id}/click/` | Wire visibility impression + pre-launch click tracking on both Flutter & Web |
| B-08 | Profile identities not clickable globally | Ad-hoc `UserAvatar` + `Text` rows across Feed, Comments, SUG, Communities without tap targets | Create single `UserIdentity` + `BadgeRow` + `PublicProfileScreen` (`USER CLICK` ref) used everywhere |
| B-09 | Missing Forgot Password & Confirm Password | `landing_screen.dart` had only 1 password field on Sign Up and no Forgot Password flow | Add Confirm Password + full 3-step Forgot Password flow calling `/auth/forgot-password/`, `/auth/verify-reset-code/`, `/auth/reset-password/` |
| B-10 | Ad price cap ₦4,000 vs spec ₦5,000 | `MAX_AD_PRICE_NGN` was `4000.00` and no `/api/ads/quote/` endpoint existed | Update server cap to `5000.00` (500,000 kobo) + add `POST /api/ads/quote/` |

## A3. Reference Asset Manifest (from Reference.rar)
- **TOP NAVBAR**: PROVIDED (`photo_2026-11-25_01-18-14.jpg`) — Liquid-glass floating pill top bar
- **NAVIGATION BAR**: PROVIDED (`photo_2026-11-25_01-16-59.jpg`) — Curved notched bottom bar with central circular `+`
- **FEEDS**: PROVIDED (`photo_2026-11-25_01-17-51.jpg`) — X-style near-black divider-separated feed
- **POST**: PROVIDED (`photo_2026-11-25_01-18-00.jpg`) — Ask the Network modal with subtle jotter lines
- **SEARCH**: PROVIDED (earlier `f92bd5f4.mp4`) — Expanding search field & results
- **LIBRARY**: PROVIDED (`photo_2026-11-25_01-17-12.jpg`) — Layered preview folder cards
- **SUG**: PROVIDED (`video_2026-11-25_01-17-07.mp4`) — Horizontal snapping `PageView` cards with parallax
- **PROFILE**: PROVIDED (`photo_2026-11-25_01-17-17.jpg`) — Avatar + 3-stat pill + Account & Activity chips
- **ACTIVITY**: PROVIDED (`photo_2026-11-25_01-18-36.jpg`) — Rounded vertical bar activity chart with tap tooltip
- **USER CLICK**: PROVIDED (`photo_2026-11-25_01-18-44.jpg`) — Portrait hero public profile card + Follow button
- **COMMENTS**: PROVIDED (`photo_2026-11-25_01-17-55.jpg`) — Threaded bubbles with vertical lines & floating reaction pill
- **COMMUNITIES**: PROVIDED (`photo_2026-11-25_01-17-43.jpg`) — Discovery + horizontal visual cards + categories
- **SUG ACCESS FORM / WELCOME BACK**: PROVIDED (`photo_2026-11-25_01-17-29.jpg`) — Intro carousel + 4-step form
- **SIGN UP / LOGIN**: PROVIDED (`photo_2026-11-25_01-17-38.jpg`) — Header hero + rounded card + confirm password + forgot password
- **ADS TRACKER**: PROVIDED (`photo_2026-11-25_01-16-49.jpg`) — Dark analytics chart + metric pills + campaign cards
- **ADS PLACEMENT**: PROVIDED (`photo_2026-11-25_01-16-54.jpg`) — High-contrast 5-step ad placement wizard

## Decisions Log (Appendix B Defaults Applied)
1. **Real-time transport**: Option B (adaptive sync polling + immediate resume refresh + backend push tokens) because Render WSGI does not run Redis/Channels.
2. **Default theme**: System (with manual Light & Dark override persisted locally).
3. **Ad max cap**: ₦5,000 total per campaign (`500000` kobo), strictly enforced server-side.
4. **Ad activation**: Mirrors website (admin review / Paystack verified payment; admins can pause/reject).
5. **Activity graph**: Displayed on user's own Me profile backed by real `/api/auth/me/activity/`.
6. **Comment likes**: Enabled on backend (`/api/answers/{id}/like/`) and wired in Flutter Comments UI.
