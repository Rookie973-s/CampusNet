from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AnswerViewSet, QuestionViewSet, UniversalSearchView

router = DefaultRouter()
router.register("questions", QuestionViewSet, basename="question")
router.register("answers", AnswerViewSet, basename="answer")

urlpatterns = [
    path("search/", UniversalSearchView.as_view(), name="universal-search"),
] + router.urls
