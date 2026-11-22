from django.db import migrations


def bootstrap_official_community(apps, schema_editor):
    Community = apps.get_model("communities", "Community")
    CommunityMembership = apps.get_model("communities", "CommunityMembership")
    User = apps.get_model("accounts", "User")

    admin = (
        User.objects.filter(is_superuser=True).order_by("id").first()
        or User.objects.filter(role="admin").order_by("id").first()
        or User.objects.filter(is_staff=True).order_by("id").first()
    )

    comm, _ = Community.objects.get_or_create(
        slug="campusnetwork",
        defaults={
            "name": "CampusNetwork",
            "description": (
                "The official CampusNetwork (Cenet) community for announcements, platform updates, "
                "campus-wide notices, and ATBU student news."
            ),
            "category": "Campus Life",
            "accent_color": "#2563EB",
            "visibility": "public",
            "rules": (
                "1. Stay respectful and constructive.\n"
                "2. Official updates are published by CampusNetwork administrators.\n"
                "3. Keep discussions relevant to ATBU students and campus life."
            ),
            "is_official": True,
            "creator": admin,
        },
    )

    for user in User.objects.all():
        role = "owner" if (user.is_superuser or user.role == "admin") else "follower"
        CommunityMembership.objects.get_or_create(
            community=comm,
            user=user,
            defaults={"role": role, "notif_level": "all"},
        )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("communities", "0001_initial"),
        ("accounts", "0004_user_email_verified_user_hide_ads_and_more"),
    ]

    operations = [
        migrations.RunPython(bootstrap_official_community, noop),
    ]
