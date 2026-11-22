from datetime import timedelta
from unittest import mock

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AVATAR_COLORS, Follow, User
from departments.models import Department
from questions.models import Answer, Question


def mk(username, **kw):
    kw.setdefault("email", f"{username}@x.edu")
    return User.objects.create(username=username, **kw)


class PublicProfileAndFollow(TestCase):
    def setUp(self):
        self.dept = Department.objects.create(name="Sciences")
        self.ada = mk("ada", first_name="Ada", last_name="Lovelace", phone="08011112222",
                      matric_number="U22SC0001", department=self.dept, bio="Hi", staff_id="S1")
        self.bob = mk("bob", first_name="Bob")
        self.c = APIClient()

    def test_guest_can_read_public_profile_without_private_fields(self):
        r = self.c.get(f"/api/users/{self.ada.pk}/")
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d["name"], "Ada Lovelace")
        self.assertEqual(d["dept"], "Sciences")
        self.assertEqual(d["username"], "ada")
        for private in ("email", "phone", "matric_number", "staff_id", "level", "saved"):
            self.assertNotIn(private, d)
        self.assertFalse(d["is_following"])
        self.assertFalse(d["is_me"])

    def test_inactive_user_profile_hidden(self):
        self.ada.is_active = False
        self.ada.save()
        self.assertEqual(self.c.get(f"/api/users/{self.ada.pk}/").status_code, 404)

    def test_follow_requires_login(self):
        self.assertEqual(self.c.post(f"/api/users/{self.ada.pk}/follow/").status_code, 401)
        self.assertEqual(Follow.objects.count(), 0)

    def test_follow_persists_and_is_idempotent(self):
        self.c.force_authenticate(self.bob)
        r1 = self.c.post(f"/api/users/{self.ada.pk}/follow/")
        r2 = self.c.post(f"/api/users/{self.ada.pk}/follow/")
        self.assertEqual((r1.status_code, r2.status_code), (201, 200))
        self.assertEqual(Follow.objects.filter(follower=self.bob, following=self.ada).count(), 1)
        self.assertEqual(r2.json(), {"is_following": True, "followers": 1})
        prof = self.c.get(f"/api/users/{self.ada.pk}/").json()
        self.assertTrue(prof["is_following"])
        self.assertEqual(prof["followers"], 1)

    def test_follow_notifies_once(self):
        from notifications.models import Notification
        self.c.force_authenticate(self.bob)
        self.c.post(f"/api/users/{self.ada.pk}/follow/")
        self.c.post(f"/api/users/{self.ada.pk}/follow/")
        self.assertEqual(Notification.objects.filter(user=self.ada).count(), 1)

    def test_unfollow(self):
        self.c.force_authenticate(self.bob)
        self.c.post(f"/api/users/{self.ada.pk}/follow/")
        r = self.c.delete(f"/api/users/{self.ada.pk}/follow/")
        self.assertEqual(r.json(), {"is_following": False, "followers": 0})
        self.assertEqual(Follow.objects.count(), 0)
        self.assertEqual(self.c.delete(f"/api/users/{self.ada.pk}/follow/").status_code, 200)  # idempotent

    def test_cannot_follow_self_api_and_database(self):
        self.c.force_authenticate(self.bob)
        self.assertEqual(self.c.post(f"/api/users/{self.bob.pk}/follow/").status_code, 400)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Follow.objects.create(follower=self.bob, following=self.bob)

    def test_follow_unknown_user_404(self):
        self.c.force_authenticate(self.bob)
        self.assertEqual(self.c.post("/api/users/9999/follow/").status_code, 404)

    def test_is_me_flag(self):
        self.c.force_authenticate(self.ada)
        self.assertTrue(self.c.get(f"/api/users/{self.ada.pk}/").json()["is_me"])


class ProfileProtection(TestCase):
    def setUp(self):
        self.u = mk("stu", matric_number="", role="student")
        self.c = APIClient()
        self.c.force_authenticate(self.u)

    def test_protected_fields_cannot_be_self_assigned(self):
        r = self.c.patch("/api/auth/me/", {"role": "admin", "is_verified_staff": True, "staff_id": "X9",
                                           "title": "Professor", "email": "new@x.edu"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.u.refresh_from_db()
        self.assertEqual(self.u.role, "student")
        self.assertFalse(self.u.is_verified_staff)
        self.assertEqual(self.u.staff_id, "")
        self.assertEqual(self.u.title, "")
        self.assertEqual(self.u.email, "stu@x.edu")

    def test_matric_can_be_set_once_then_is_locked(self):
        self.assertEqual(self.c.patch("/api/auth/me/", {"matric_number": "U22CS0001"}, format="json").status_code, 200)
        r = self.c.patch("/api/auth/me/", {"matric_number": "U22CS9999"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("matric_number", r.json())
        # re-sending the same value (the profile form does) is fine
        self.assertEqual(self.c.patch("/api/auth/me/", {"matric_number": "U22CS0001", "bio": "x"}, format="json").status_code, 200)

    def test_language_preference_saved_and_validated(self):
        self.assertEqual(self.c.patch("/api/auth/me/", {"language": "ha"}, format="json").status_code, 200)
        self.u.refresh_from_db()
        self.assertEqual(self.u.language, "ha")
        self.assertEqual(self.c.patch("/api/auth/me/", {"language": "fr"}, format="json").status_code, 400)

    def test_avatar_colour_default_is_per_user_not_per_process(self):
        colours = {mk(f"u{i}").avatar_bg for i in range(40)}
        self.assertGreater(len(colours), 1)
        self.assertTrue(colours <= set(AVATAR_COLORS))

    def test_register_rejects_duplicate_email_case_insensitively(self):
        r = APIClient().post("/api/auth/register/", {
            "username": "newbie", "email": "STU@x.edu", "first_name": "N", "last_name": "B",
            "password": "Str0ng!pass_word", "confirm_password": "Str0ng!pass_word"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("email", r.json())

    def test_register_rejects_duplicate_username_case_insensitively(self):
        r = APIClient().post("/api/auth/register/", {
            "username": "STU", "email": "unique@x.edu", "first_name": "N", "last_name": "B",
            "password": "Str0ng!pass_word", "confirm_password": "Str0ng!pass_word"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("username", r.json())


class StaffDirectoryPrivacy(TestCase):
    def setUp(self):
        self.s = mk("lect", role="staff", is_verified_staff=True, phone="0803", first_name="Lee", title="Dr")

    def test_guest_cannot_access_sug_directory(self):
        self.assertEqual(APIClient().get(f"/api/staff/{self.s.pk}/").status_code, 401)
        self.assertEqual(APIClient().get("/api/staff/").status_code, 401)

    def test_signed_in_user_does_get_them(self):
        c = APIClient()
        c.force_authenticate(mk("stu"))
        d = c.get(f"/api/staff/{self.s.pk}/").json()
        self.assertEqual(d["email"], "lect@x.edu")
        self.assertEqual(d["phone"], "0803")


class Activity(TestCase):
    def setUp(self):
        self.u = mk("act")
        self.c = APIClient()
        self.c.force_authenticate(self.u)

    def test_requires_login(self):
        self.assertEqual(APIClient().get("/api/auth/me/activity/").status_code, 401)

    def test_counts_come_from_real_timestamps(self):
        q1 = Question.objects.create(author=self.u, title="a", body="b")
        q2 = Question.objects.create(author=self.u, title="c", body="d")
        Question.objects.filter(pk=q2.pk).update(created_at=timezone.now() - timedelta(days=3))
        other = Question.objects.create(author=mk("other"), title="o", body="o")
        a = Answer.objects.create(question=other, author=self.u, body="ans")
        Answer.objects.filter(pk=a.pk).update(created_at=timezone.now() - timedelta(days=3))
        d = self.c.get("/api/auth/me/activity/?days=14").json()
        self.assertEqual(len(d["series"]), 14)
        by = {r["date"]: r for r in d["series"]}
        today = timezone.localdate().isoformat()
        three = (timezone.localdate() - timedelta(days=3)).isoformat()
        self.assertEqual(by[today]["questions"], 1)
        self.assertEqual((by[three]["questions"], by[three]["answers"], by[three]["total"]), (1, 1, 2))
        self.assertEqual(d["totals"], {"questions": 2, "answers": 1})

    def test_new_user_gets_zeroes_not_invented_data(self):
        d = self.c.get("/api/auth/me/activity/").json()
        self.assertEqual(sum(r["total"] for r in d["series"]), 0)

    def test_days_is_clamped_and_garbage_tolerated(self):
        self.assertEqual(len(self.c.get("/api/auth/me/activity/?days=99999").json()["series"]), 365)
        self.assertEqual(len(self.c.get("/api/auth/me/activity/?days=abc").json()["series"]), 84)

    def test_me_counts_match(self):
        Question.objects.create(author=self.u, title="a", body="b")
        d = self.c.get("/api/auth/me/").json()
        self.assertEqual((d["questions"], d["answers"]), (1, 0))


GOOD = {"sub": "g-123", "email": "new@gmail.com", "email_verified": True, "given_name": "New", "family_name": "Kid"}


class GoogleSignIn(TestCase):
    URL = "/api/auth/google/"

    def post(self, claims=None, side_effect=None, cred="tok"):
        with mock.patch("accounts.views.verify_google_credential", return_value=claims, side_effect=side_effect):
            return APIClient().post(self.URL, {"credential": cred}, format="json")

    def test_not_configured_is_a_clear_501(self):
        r = APIClient().post(self.URL, {"credential": "tok"}, format="json")
        self.assertEqual(r.status_code, 501)

    def test_missing_credential(self):
        self.assertEqual(APIClient().post(self.URL, {}, format="json").status_code, 400)

    def test_bad_token_rejected(self):
        self.assertEqual(self.post(side_effect=ValueError("bad")).status_code, 401)
        self.assertEqual(User.objects.count(), 0)

    def test_unverified_google_email_rejected(self):
        self.assertEqual(self.post({**GOOD, "email_verified": False}).status_code, 401)

    def test_creates_student_without_password_and_issues_tokens(self):
        r = self.post(GOOD)
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertIn("access", d)
        u = User.objects.get(email="new@gmail.com")
        self.assertEqual((u.role, u.google_sub, u.has_usable_password()), ("student", "g-123", False))
        self.assertFalse(u.is_verified_staff)

    def test_second_sign_in_reuses_account(self):
        self.post(GOOD)
        self.post(GOOD)
        self.assertEqual(User.objects.count(), 1)

    def test_existing_email_is_never_auto_linked(self):
        victim_pre_registered = mk("squatter", email="new@gmail.com")
        r = self.post(GOOD)
        self.assertEqual(r.status_code, 409)
        victim_pre_registered.refresh_from_db()
        self.assertIsNone(victim_pre_registered.google_sub)

    def test_username_collisions_resolved(self):
        mk("new", email="other@x.edu")
        self.post(GOOD)
        self.assertEqual(User.objects.get(email="new@gmail.com").username, "new2")
