from rest_framework.routers import DefaultRouter

from .views import CommunityPostViewSet, CommunityViewSet

router = DefaultRouter()
router.register("communities", CommunityViewSet, basename="community")
router.register("community-posts", CommunityPostViewSet, basename="community-post")

urlpatterns = router.urls
