"""
Root URL configuration for the CampusNetwork (Cenet) backend.

All API routes are namespaced under /api/. Each app owns its own
urls.py which is included here.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve


def cached_media_serve(request, path, document_root=None, show_indexes=False):
    """Serve persistent-disk media with immutable cache headers (UUID filenames)."""
    response = serve(request, path, document_root=document_root, show_indexes=show_indexes)
    if response.status_code == 200:
        response.setdefault("Cache-Control", "public, max-age=31536000, immutable")
    return response


api_urlpatterns = [
    # Auth, users, profiles, verification, SUG directory
    path("", include("accounts.urls")),
    # Departments / faculties
    path("", include("departments.urls")),
    # Questions, comments/answers, votes, likes, bookmarks, mentions
    path("", include("questions.urls")),
    # SUG applications (ApplyPage.jsx)
    path("", include("staffapp.urls")),
    # Media posts
    path("", include("media_app.urls")),
    # Notifications
    path("", include("notifications.urls")),
    # Academic PDF library
    path("library/", include("library.urls")),
    # Communities (Module 1)
    path("", include("communities.urls")),
    # SUG Chat system (Module 4)
    path("", include("chat.urls")),
    # Advertising & Ad Tracking (Module 3)
    path("", include("advertising.urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    # Versioned API (/api/v1/...) + backward-compatible unversioned alias (/api/...)
    path("api/v1/", include(api_urlpatterns)),
    path("api/", include(api_urlpatterns)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
elif not getattr(settings, "USE_S3_MEDIA", False):
    # Serve uploaded avatars, post images, and ad creatives from Render Persistent Disk
    urlpatterns += [
        re_path(r"^media/(?P<path>.*)$", cached_media_serve, {"document_root": settings.MEDIA_ROOT}),
    ]
