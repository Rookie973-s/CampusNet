from rest_framework.routers import DefaultRouter

from .views import StaffApplicationViewSet

router = DefaultRouter()
router.register("applications", StaffApplicationViewSet, basename="application")

urlpatterns = router.urls
