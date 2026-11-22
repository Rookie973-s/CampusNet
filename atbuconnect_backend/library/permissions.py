from rest_framework.permissions import BasePermission, SAFE_METHODS

from . import conf
from .models import ClassRepresentative


def get_rep(user):
    if not (user and user.is_authenticated and user.is_active):
        return None
    return ClassRepresentative.objects.select_related("academic_department__faculty").filter(
        user=user, active=True
    ).first()


def can_upload(user) -> bool:
    return get_rep(user) is not None


def can_upload_to_course(user, course) -> bool:
    """A class rep may only add material to courses of their own class."""
    rep = get_rep(user)
    return bool(
        rep and course.level == rep.level and course.academic_department_id == rep.academic_department_id
    )


def is_admin(user):
    return bool(user and user.is_authenticated and (user.is_superuser or user.has_perm("library.delete_document")))


def can_manage(user, document) -> bool:
    if not (user and user.is_authenticated):
        return False
    if is_admin(user):
        return True
    return document.uploaded_by_id == user.id and can_upload_to_course(user, document.course)


class LibraryPermission(BasePermission):
    """Server-enforced rules for documents/courses."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return (not conf.REQUIRE_LOGIN_TO_BROWSE()) or bool(request.user and request.user.is_authenticated)
        if request.method == "POST":
            return can_upload(request.user)  # per-course scope is re-checked in the serializer
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return can_manage(request.user, obj)
