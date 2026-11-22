"""Google sign-in (ID-token flow, as used by Google Identity Services / One Tap).

Nothing here is active until GOOGLE_CLIENT_ID is set in the environment and the
`google-auth` package is installed. The token is verified server-side (signature,
audience, expiry) - the frontend's claim about who the user is is never trusted.
"""
from django.conf import settings


class GoogleAuthNotConfigured(Exception):
    pass


def verify_google_credential(credential: str) -> dict:
    client_id = getattr(settings, "GOOGLE_CLIENT_ID", "")
    if not client_id:
        raise GoogleAuthNotConfigured("Google sign-in is not configured on this server.")
    try:
        from google.auth.transport import requests as g_requests
        from google.oauth2 import id_token
    except ImportError as exc:  # pragma: no cover - depends on deployment
        raise GoogleAuthNotConfigured("The google-auth package is not installed.") from exc
    # Raises ValueError on a bad signature, wrong audience or expired token.
    return id_token.verify_oauth2_token(credential, g_requests.Request(), client_id)
