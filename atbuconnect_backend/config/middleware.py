"""Security headers middleware enforcing defense-in-depth HTTP headers."""


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault("X-Content-Type-Options", "nosniff")
        response.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.setdefault("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
        response.setdefault("Cross-Origin-Resource-Policy", "cross-origin")
        # Never overwrite strict sandbox CSP already set by library PDF streaming
        if "Content-Security-Policy" not in response:
            response["Content-Security-Policy"] = "frame-ancestors 'none'"
        return response
