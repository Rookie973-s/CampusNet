"""Service helpers for official CampusNetwork community bootstrapping and notifications."""

from django.contrib.auth import get_user_model
from django.db import IntegrityError

from .models import Community, CommunityMembership

User = get_user_model()

OFFICIAL_SLUG = "campusnetwork"


def ensure_official_community():
    """Ensure the official CampusNetwork community exists with the platform administrator as owner."""
    admin = (
        User.objects.filter(is_superuser=True).order_by("id").first()
        or User.objects.filter(role="admin").order_by("id").first()
        or User.objects.filter(is_staff=True).order_by("id").first()
    )
    comm, created = Community.objects.get_or_create(
        slug=OFFICIAL_SLUG,
        defaults={
            "name": "CampusNetwork",
            "description": (
                "The official CampusNetwork (Cenet) community for announcements, platform updates, "
                "campus-wide notices, and ATBU student news."
            ),
            "category": Community.Category.CAMPUS_LIFE,
            "accent_color": "#2563EB",
            "visibility": Community.Visibility.PUBLIC,
            "rules": (
                "1. Stay respectful and constructive.\n"
                "2. Official updates are published by CampusNetwork administrators.\n"
                "3. Keep discussions relevant to ATBU students and campus life."
            ),
            "is_official": True,
            "creator": admin,
        },
    )
    if admin:
        if comm.creator_id is None:
            comm.creator = admin
            comm.save(update_fields=["creator"])
        CommunityMembership.objects.update_or_create(
            community=comm,
            user=admin,
            defaults={"role": CommunityMembership.Role.OWNER},
        )
    return comm


def auto_follow_official_community(user):
    """Automatically make a user follow the official CampusNetwork community."""
    if not user or not user.pk:
        return None
    comm = ensure_official_community()
    role = (
        CommunityMembership.Role.OWNER
        if (user.is_superuser or getattr(user, "role", None) == "admin")
        else CommunityMembership.Role.FOLLOWER
    )
    try:
        membership, _ = CommunityMembership.objects.get_or_create(
            community=comm,
            user=user,
            defaults={"role": role, "notif_level": CommunityMembership.NotifLevel.ALL},
        )
        return membership
    except IntegrityError:
        return CommunityMembership.objects.filter(community=comm, user=user).first()
