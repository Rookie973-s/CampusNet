from rest_framework.routers import DefaultRouter

from .views import CampaignViewSet

router = DefaultRouter()
router.register("ads", CampaignViewSet, basename="ad-campaign")

urlpatterns = router.urls
