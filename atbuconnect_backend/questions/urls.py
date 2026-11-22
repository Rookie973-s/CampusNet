from rest_framework.routers import DefaultRouter

from .views import AnswerViewSet, QuestionViewSet

router = DefaultRouter()
router.register("questions", QuestionViewSet, basename="question")
router.register("answers", AnswerViewSet, basename="answer")

urlpatterns = router.urls
