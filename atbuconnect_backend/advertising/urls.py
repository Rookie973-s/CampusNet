from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CampaignViewSet, PaystackWebhookView, VerifyPaymentView, InitiateVerificationPaymentView

router = DefaultRouter()
router.register("ads", CampaignViewSet, basename="ad-campaign")

urlpatterns = [
    path("payments/paystack/webhook/", PaystackWebhookView.as_view(), name="paystack-webhook"),
    path("payments/verify/", VerifyPaymentView.as_view(), name="paystack-verify"),
    path("verification/initiate-payment/", InitiateVerificationPaymentView.as_view(), name="verification-payment"),
] + router.urls
