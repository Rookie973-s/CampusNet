"""
Django settings for the ATBUConnect backend.
"""

import os
from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(DEBUG=(bool, True))
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY", default="django-insecure-change-me-in-production")
DEBUG = env.bool("DEBUG", default=True)
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["*"])


# ── Applications ─────────────────────────────────────────────
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # 3rd party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "django_filters",

    # local apps
    "accounts",
    "departments",
    "questions",
    "staffapp",
    "media_app",
    "notifications",
    "library",
    "communities",
    "chat",
    "advertising",
]

AUTH_USER_MODEL = "accounts.User"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.gzip.GZipMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "config.middleware.SecurityHeadersMiddleware",
]

# Enable WhiteNoise automatically when installed (production Django Admin & DRF static files)
import importlib.util as _importlib_util
if _importlib_util.find_spec("whitenoise"):
    MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# ── Database ─────────────────────────────────────────────────
# Defaults to SQLite if DATABASE_URL is unset. For local MySQL, set in .env:
#   DATABASE_URL=mysql://root:yourpassword@127.0.0.1:3306/atbuconnect
DATABASES = {
    "default": env.db("DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}")
}
# Connection pooling for high concurrency (100s of simultaneous users)
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DB_CONN_MAX_AGE", default=60)
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

if DATABASES["default"]["ENGINE"] == "django.db.backends.mysql":
    DATABASES["default"]["OPTIONS"] = {
        "charset": "utf8mb4",
        "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
    }


# ── Password validation ─────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# ── I18N ──────────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# ── Static & media ───────────────────────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
WHITENOISE_USE_FINDERS = True

MEDIA_URL = "/media/"
# Supports Render Persistent Disk: set MEDIA_ROOT=/var/data/media in Render Environment Variables
MEDIA_ROOT = Path(env("MEDIA_ROOT", default=str(BASE_DIR / "media")))

# ── Caching (Redis when REDIS_URL is configured, safe in-memory fallback otherwise) ──
REDIS_URL = env("REDIS_URL", default="").strip()
if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
            "TIMEOUT": 300,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "campusnetwork-cache",
            "TIMEOUT": 300,
        }
    }

# Brute-force login lockout policy (per identifier + IP)
LOGIN_MAX_ATTEMPTS = env.int("LOGIN_MAX_ATTEMPTS", default=5)
LOGIN_LOCKOUT_SECONDS = env.int("LOGIN_LOCKOUT_SECONDS", default=900)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# ── DRF ───────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
}


# ── CORS ──────────────────────────────────────────────────────
# During development allow the Vite dev server(s); tighten for production.
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
)
CORS_ALLOW_CREDENTIALS = True


# ── Email (staff application notifications, password resets, verification) ──
EMAIL_BACKEND = env(
    "EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = env("EMAIL_HOST", default="localhost")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
EMAIL_USE_SSL = env.bool("EMAIL_USE_SSL", default=False)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_TIMEOUT = env.int("EMAIL_TIMEOUT", default=15)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="CampusNetwork <no-reply@campusnetwork.edu.ng>")
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:5173")

# HTTPS Email APIs (recommended on Render Free Tier where outbound SMTP ports are blocked)
BREVO_API_KEY = env("BREVO_API_KEY", default="")
RESEND_API_KEY = env("RESEND_API_KEY", default="")

# Optional FormSubmit integration for administrative / SUG approval notifications only.
# Password reset codes and email verification links NEVER use FormSubmit.
FORMSUBMIT_ENABLED = env.bool("FORMSUBMIT_ENABLED", default=False)
FORMSUBMIT_ENDPOINT = env("FORMSUBMIT_ENDPOINT", default="https://formsubmit.co/ajax")

# ── Verified Student Entitlements ─────────────────────────────────────────────
ORDINARY_MAX_POST_WORDS = env.int("ORDINARY_MAX_POST_WORDS", default=300)
VERIFIED_MAX_POST_WORDS = env.int("VERIFIED_MAX_POST_WORDS", default=1200)
USERNAME_COOLDOWN_DAYS = env.int("USERNAME_COOLDOWN_DAYS", default=14)
VERIFIED_COMMENT_BOOST = env.float("VERIFIED_COMMENT_BOOST", default=1.5)

# ── Advertising & Paystack Gateway (DVA Bank Transfer + Webhooks) ─────────────
AD_PAYMENTS_ENABLED = env.bool("AD_PAYMENTS_ENABLED", default=True)
PAYSTACK_SECRET_KEY = env("PAYSTACK_SECRET_KEY", default="")
PAYSTACK_PREFERRED_BANK = env("PAYSTACK_PREFERRED_BANK", default="wema-bank")

# ── Throttling (sensitive endpoints) ──────────────────────────────────────────
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "applications": env("APPLICATIONS_THROTTLE", default="10/hour"),
    "auth_login": env("AUTH_LOGIN_THROTTLE", default="20/minute"),
    "auth_register": env("AUTH_REGISTER_THROTTLE", default="10/hour"),
    "password_reset": env("PASSWORD_RESET_THROTTLE", default="10/hour"),
    "email_verify": env("EMAIL_VERIFY_THROTTLE", default="10/hour"),
    "ad_tracking": env("AD_TRACKING_THROTTLE", default="120/minute"),
}

# Always honor reverse-proxy HTTPS headers (Render/Nginx/Cloudflare) so media URLs always emit https://
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# ── Production Transport Security (automatically enforced when DEBUG=False) ───
if not DEBUG:
    SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=31536000)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

# ── Uploads ────────────────────────────────────────────────────
# Django buffers small uploads in memory and streams bigger ones to disk; these caps
# reject oversized request bodies early. Per-type limits live in questions.media_validation
# (images 10 MB, video 100 MB / 5 min) and library.conf (PDF 15 MB).
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024  # non-file form fields
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
POST_MAX_IMAGE_BYTES = env.int("POST_MAX_IMAGE_BYTES", default=10 * 1024 * 1024)
POST_MAX_VIDEO_BYTES = env.int("POST_MAX_VIDEO_BYTES", default=100 * 1024 * 1024)
POST_MAX_VIDEO_SECONDS = env.int("POST_MAX_VIDEO_SECONDS", default=5 * 60)

# ── PDF library ───────────────────────────────────────────────
LIBRARY_MAX_PDF_BYTES = env.int("LIBRARY_MAX_PDF_BYTES", default=15 * 1024 * 1024)
# Where PDFs are stored. On hosts with an ephemeral disk (Railway/Heroku/Render without a
# volume) point this at a mounted persistent volume, or set LIBRARY_STORAGE to a private
# object-storage class. It must NOT be under MEDIA_ROOT.
LIBRARY_PRIVATE_ROOT = env("LIBRARY_PRIVATE_ROOT", default=str(BASE_DIR / "private_media"))
LIBRARY_STORAGE = env("LIBRARY_STORAGE", default="") or None
LIBRARY_REQUIRE_LOGIN_TO_BROWSE = env.bool("LIBRARY_REQUIRE_LOGIN_TO_BROWSE", default=True)
LIBRARY_REQUIRE_LOGIN_TO_DOWNLOAD = env.bool("LIBRARY_REQUIRE_LOGIN_TO_DOWNLOAD", default=True)

# ── Google sign-in (inactive until a client id is set; needs `pip install google-auth`) ──
GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID", default="")

# ── Persistent S3 / Cloudflare R2 storage for images, avatars, ads & PDFs ─────
if env.bool("USE_S3_MEDIA", default=False):  # pragma: no cover
    INSTALLED_APPS += ["storages"]
    STORAGES = {
        "default": {"BACKEND": "storages.backends.s3.S3Storage"},
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }
    AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID", default="")
    AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY", default="")
    AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME", default="")
    AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME", default="auto")
    AWS_S3_ENDPOINT_URL = env("AWS_S3_ENDPOINT_URL", default=None)
    AWS_S3_CUSTOM_DOMAIN = env("AWS_S3_CUSTOM_DOMAIN", default=None)
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = env.bool("AWS_QUERYSTRING_AUTH", default=False)
    AWS_S3_SIGNATURE_VERSION = "s3v4"
    if not LIBRARY_STORAGE:
        LIBRARY_STORAGE = "storages.backends.s3.S3Storage"
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = False

CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])
