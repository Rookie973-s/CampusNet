from rest_framework.routers import DefaultRouter

from .views import MediaPostViewSet

router = DefaultRouter()
router.register("media", MediaPostViewSet, basename="mediapost")

urlpatterns = router.urls
