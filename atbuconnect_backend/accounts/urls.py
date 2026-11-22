from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    path("auth/register/", views.RegisterView.as_view(), name="auth-register"),
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
    path("auth/me/", views.MeView.as_view(), name="auth-me"),
    path("auth/me/avatar/", views.AvatarUploadView.as_view(), name="auth-avatar"),
    path("auth/me/activity/", views.ActivityView.as_view(), name="auth-activity"),
    path("auth/change-password/", views.ChangePasswordView.as_view(), name="auth-change-password"),
    path("auth/forgot-password/", views.ForgotPasswordView.as_view(), name="auth-forgot-password"),
    path("auth/verify-reset-code/", views.VerifyResetCodeView.as_view(), name="auth-verify-reset-code"),
    path("auth/reset-password/", views.ResetPasswordView.as_view(), name="auth-reset-password"),
    path("auth/send-verification/", views.SendEmailVerificationView.as_view(), name="auth-send-verification"),
    path("auth/verify-email/", views.VerifyEmailView.as_view(), name="auth-verify-email"),
    path("auth/google/", views.GoogleLoginView.as_view(), name="auth-google"),

    # User discovery, profiles, followers, SUG ratings
    path("users/search/", views.UserSearchView.as_view(), name="user-search"),
    path("users/by-username/<str:username>/", views.PublicProfileByUsernameView.as_view(), name="user-by-username"),
    path("users/<int:pk>/", views.PublicProfileView.as_view(), name="user-public"),
    path("users/<int:pk>/follow/", views.FollowView.as_view(), name="user-follow"),
    path("users/<int:pk>/followers/", views.FollowersListView.as_view(), name="user-followers"),
    path("users/<int:pk>/following/", views.FollowingListView.as_view(), name="user-following"),
    path("users/<int:pk>/rate-sug/", views.SUGRatingView.as_view(), name="user-rate-sug"),

    # Student verification system
    path("verification/apply/", views.StudentVerificationApplyView.as_view(), name="verification-apply"),
    path("verification/status/", views.StudentVerificationStatusView.as_view(), name="verification-status"),
    path("verification/applications/", views.StudentVerificationAdminListView.as_view(), name="verification-admin-list"),
    path(
        "verification/applications/<int:pk>/<str:decision>/",
        views.StudentVerificationDecisionView.as_view(),
        name="verification-decision",
    ),

    # SUG / Staff directory
    path("staff/", views.StaffDirectoryViewSet.as_view(), name="staff-list"),
    path("staff/<int:pk>/", views.StaffDetailView.as_view(), name="staff-detail"),
]
