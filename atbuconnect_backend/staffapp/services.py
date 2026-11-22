"""One place that decides a SUG access application.

Used by both the REST endpoints and the Django-admin actions so the rules can't drift.
Submitting the form never grants anything; only an authorised reviewer can, and only
for an application that is still pending.
"""
import re

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from config.security import send_platform_email
from notifications.models import Notification
from notifications.services import notify

from .models import StaffApplication

User = get_user_model()


class AlreadyReviewed(Exception):
    pass


def can_review(user):
    return bool(
        user and user.is_authenticated
        and (user.is_superuser or user.is_staff or getattr(user, "role", None) == User.Role.ADMIN)
    )


def _unique_username(base: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9_.-]", "", base)[:24] or "sugrep"
    candidate, n = clean, 1
    while User.objects.filter(username__iexact=candidate).exists():
        n += 1
        candidate = f"{clean}{n}"
    return candidate


def _target_user(application):
    """Find the applicant's user account by linked_user, email, or phone."""
    if application.linked_user_id:
        return application.linked_user
    user = User.objects.filter(email__iexact=application.email).first()
    if user:
        return user
    if application.phone:
        digits = re.sub(r"\D+", "", application.phone)
        if digits:
            user = (
                User.objects.filter(phone_number=application.phone).first()
                or User.objects.filter(phone=application.phone).first()
            )
    return user


def _notify(application, user, approved, reviewer=None):
    verdict = "approved" if approved else "not approved"
    text = (
        f"Congratulations! Your SUG representative application ({application.role_title}) has been approved."
        if approved
        else f"Your SUG access application ({application.role_title}) was not approved."
    )
    if user:
        notify(
            user,
            notif_type=Notification.Type.STAFF,
            text=text,
            actor=reviewer,
            link="/sug" if approved else "/profile",
            dedupe_seconds=0,
        )
    body = (
        f"Hello {application.first_name},\n\n{text}\n"
        + (f"\nNote from the reviewer: {application.review_note}\n" if application.review_note else "")
        + (
            "\nYou now appear in the CampusNetwork (Cenet) SUG directory and can respond to students directly.\n"
            if approved and user
            else ""
        )
        + "\n— CampusNetwork (Cenet)"
    )
    send_platform_email(
        recipient_email=application.email,
        subject=f"CampusNetwork (Cenet): Your SUG application was {verdict}",
        message=body,
        allow_formsubmit=True,
    )


@transaction.atomic
def review_application(application_id, reviewer, approve, note=""):
    if not can_review(reviewer):
        raise PermissionError("Only administrators can review applications.")
    application = StaffApplication.objects.select_for_update().get(pk=application_id)
    if application.status != StaffApplication.Status.PENDING:
        raise AlreadyReviewed(f"This application was already {application.status}.")

    application.status = StaffApplication.Status.APPROVED if approve else StaffApplication.Status.REJECTED
    application.reviewed_by = reviewer
    application.reviewed_at = timezone.now()
    application.review_note = (note or "").strip()

    user = _target_user(application)
    account_existed = bool(user)

    if approve:
        if user is None:
            # Create a verified SUG user profile cleanly so approved reps ALWAYS appear in the SUG tab
            # without creating duplicate records if approved later.
            base = f"{application.first_name}{application.last_name}".lower() or application.email.split("@")[0]
            user = User(
                username=_unique_username(base),
                email=application.email,
                first_name=application.first_name[:150],
                last_name=application.last_name[:150],
                role=User.Role.STAFF,
                is_verified_staff=True,
                phone=application.phone or "",
                bio=application.bio or "",
            )
            user.set_unusable_password()
            user.save()

        # Never downgrade an administrator.
        if user.role != User.Role.ADMIN:
            user.role = User.Role.STAFF
        user.is_verified_staff = True
        if application.department_id:
            user.department = application.department
        if application.first_name and not user.first_name:
            user.first_name = application.first_name[:150]
        if application.last_name and not user.last_name:
            user.last_name = application.last_name[:150]
        user.title = application.role_title
        user.staff_id = application.staff_id
        if application.bio and not user.bio:
            user.bio = application.bio
        if application.phone and not user.phone:
            user.phone = application.phone
        # Copy uploaded SUG profile picture onto the User profile if present
        if application.profile_picture and not user.profile_picture:
            try:
                application.profile_picture.open("rb")
                content = application.profile_picture.read()
                application.profile_picture.close()
                fname = application.profile_picture.name.rsplit("/", 1)[-1]
                user.profile_picture.save(fname, ContentFile(content), save=False)
            except Exception:
                pass
        user.save()
        application.linked_user = user

    application.save()
    _notify(application, user, approve, reviewer=reviewer)
    return application, account_existed
