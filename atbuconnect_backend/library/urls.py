from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("documents", views.DocumentViewSet, basename="library-document")
router.register("courses", views.CourseViewSet, basename="library-course")

urlpatterns = [
    path("catalog/", views.catalog),
    path("folders/", views.folders),
    path("permissions/", views.my_permissions),
    path("", include(router.urls)),
]
