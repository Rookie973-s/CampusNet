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

urlpatterns = [
    path("admin/", admin.site.urls),

    # Auth, users, profiles, verification, SUG directory
    path("api/", include("accounts.urls")),

    # Departments / faculties
    path("api/", include("departments.urls")),

    # Questions, comments/answers, votes, likes, bookmarks, mentions
    path("api/", include("questions.urls")),

    # SUG applications (ApplyPage.jsx)
    path("api/", include("staffapp.urls")),

    # Media posts
    path("api/", include("media_app.urls")),

    # Notifications
    path("api/", include("notifications.urls")),

    # Academic PDF library
    path("api/library/", include("library.urls")),

    # Communities (Module 1)
    path("api/", include("communities.urls")),

    # SUG Chat system (Module 4)
    path("api/", include("chat.urls")),

    # Advertising & Ad Tracking (Module 3)
    path("api/", include("advertising.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
elif not getattr(settings, "USE_S3_MEDIA", False):
    # Serve uploaded avatars, post images, and ad creatives when DEBUG=False on single-node hosts
    urlpatterns += [
        re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
    ]
