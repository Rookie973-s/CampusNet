from django.conf import settings
from django.core.checks import Warning, register


@register()
def production_safety(app_configs, **kwargs):
    """Warnings for settings that are fine on a laptop but unsafe in production."""
    if settings.DEBUG:
        return []
    out = []
    if "insecure" in settings.SECRET_KEY:
        out.append(Warning("SECRET_KEY is the insecure default.", hint="Set SECRET_KEY in the environment.", id="config.W001"))
    if settings.ALLOWED_HOSTS == ["*"]:
        out.append(Warning("ALLOWED_HOSTS is '*'.", hint="Set ALLOWED_HOSTS to your domain(s).", id="config.W002"))
    return out
