from django.core import mail
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from departments.models import Department
from notifications.models import Notification
from staffapp.models import StaffApplication

URL = "/api/applications/"


def mk(username, **kw):
    return User.objects.create(username=username, email=kw.pop("email", f"{username}@x.edu"), **kw)


def payload(**over):
    d = {"first_name": "Sam", "last_name": "Officer", "email": "sam@x.edu", "phone": "08031234567",
         "staff_id": "SUG-001", "role_title": "Public Relations Officer", "academic_references": "",
         "bio": "I have served the student body for two years.", "why": "I want to help students find answers."}
    d.update(over)
    return d


class Base(TestCase):
    def setUp(self):
        cache.clear()
        mail.outbox = []
        self.dept = Department.objects.create(name="Sciences")
        self.admin = mk("admin1", role="admin")
        self.student = mk("stu")
        self.c = APIClient()

    def apply(self, **over):
        return APIClient().post(URL, payload(department=self.dept.pk, **over), format="json")


class Submitting(Base):
    def test_anyone_can_submit_and_nothing_is_granted(self):
        applicant = mk("sam", email="sam@x.edu")
        r = self.apply()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["status"], "pending")
        applicant.refresh_from_db()
        self.assertEqual((applicant.role, applicant.is_verified_staff), ("student", False))

    def test_cannot_submit_a_pre_approved_application(self):
        r = self.apply(status="approved", review_note="trust me")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(StaffApplication.objects.get().status, "pending")

    def test_email_is_not_restricted_to_university_addresses(self):
        self.assertEqual(self.apply(email="someone@gmail.com").status_code, 201)

    def test_validation(self):
        self.assertEqual(self.apply(phone="abc").status_code, 400)
        self.assertEqual(self.apply(bio="short").status_code, 400)
        self.assertEqual(self.apply(email="not-an-email").status_code, 400)

    def test_duplicate_pending_email_rejected(self):
        self.apply()
        self.assertEqual(self.apply(email="SAM@x.edu").status_code, 400)

    def test_public_form_is_rate_limited(self):
        codes = [self.apply(email=f"p{i}@x.edu").status_code for i in range(12)]
        self.assertEqual(codes[:10], [201] * 10)
        self.assertIn(429, codes[10:])


class ReviewAccess(Base):
    def setUp(self):
        super().setUp()
        self.app_id = self.apply().json()["id"]

    def test_queue_is_hidden_from_guests_and_students(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)
        self.c.force_authenticate(self.student)
        self.assertEqual(self.c.get(URL).status_code, 403)

    def test_students_cannot_approve_or_reject(self):
        self.c.force_authenticate(self.student)
        self.assertEqual(self.c.post(f"{URL}{self.app_id}/approve/").status_code, 403)
        self.assertEqual(self.c.post(f"{URL}{self.app_id}/reject/").status_code, 403)
        self.assertEqual(APIClient().post(f"{URL}{self.app_id}/approve/").status_code, 401)
        self.assertEqual(StaffApplication.objects.get().status, "pending")

    def test_admin_sees_queue_and_can_filter(self):
        self.c.force_authenticate(self.admin)
        rows = self.c.get(URL + "?status=pending").json()
        rows = rows["results"] if isinstance(rows, dict) else rows
        self.assertEqual(len(rows), 1)
        self.assertEqual(self.c.get(URL + "?status=approved").json()["results"], [])

    def test_decisions_cannot_be_made_by_editing_or_deleting(self):
        self.c.force_authenticate(self.admin)
        self.assertEqual(self.c.patch(f"{URL}{self.app_id}/", {"status": "approved"}, format="json").status_code, 405)
        self.assertEqual(self.c.delete(f"{URL}{self.app_id}/").status_code, 405)


class Decisions(Base):
    def setUp(self):
        super().setUp()
        self.applicant = mk("sam", email="sam@x.edu")
        self.app_id = self.apply().json()["id"]
        self.c.force_authenticate(self.admin)

    def test_approve_grants_records_reviewer_notifies_and_emails(self):
        r = self.c.post(f"{URL}{self.app_id}/approve/", {"note": "Welcome aboard"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        d = r.json()
        self.assertEqual((d["status"], d["account_found"], d["review_note"]), ("approved", True, "Welcome aboard"))
        a = StaffApplication.objects.get()
        self.assertEqual((a.reviewed_by, a.linked_user), (self.admin, self.applicant))
        self.assertIsNotNone(a.reviewed_at)
        self.applicant.refresh_from_db()
        self.assertEqual((self.applicant.role, self.applicant.is_verified_staff, self.applicant.department),
                         ("staff", True, self.dept))
        self.assertEqual((self.applicant.title, self.applicant.staff_id), ("Public Relations Officer", "SUG-001"))
        n = Notification.objects.get(user=self.applicant)
        self.assertIn("approved", n.text)
        self.assertEqual(n.type, Notification.Type.STAFF)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["sam@x.edu"])
        self.assertIn("Welcome aboard", mail.outbox[0].body)

    def test_reject_changes_nothing_about_the_account_but_notifies(self):
        r = self.c.post(f"{URL}{self.app_id}/reject/", {"note": "Missing details"}, format="json")
        self.assertEqual(r.json()["status"], "rejected")
        self.applicant.refresh_from_db()
        self.assertEqual((self.applicant.role, self.applicant.is_verified_staff), ("student", False))
        self.assertIn("not approved", Notification.objects.get(user=self.applicant).text)
        self.assertEqual(len(mail.outbox), 1)

    def test_an_application_can_only_be_decided_once(self):
        self.c.post(f"{URL}{self.app_id}/approve/")
        self.assertEqual(self.c.post(f"{URL}{self.app_id}/reject/").status_code, 409)
        self.assertEqual(self.c.post(f"{URL}{self.app_id}/approve/").status_code, 409)
        self.assertEqual(StaffApplication.objects.get().status, "approved")
        self.assertEqual(len(mail.outbox), 1)

    def test_approving_never_demotes_an_administrator(self):
        self.applicant.role = "admin"
        self.applicant.save()
        self.c.post(f"{URL}{self.app_id}/approve/")
        self.applicant.refresh_from_db()
        self.assertEqual(self.applicant.role, "admin")
        self.assertTrue(self.applicant.is_verified_staff)

    def test_approval_without_an_account_creates_verified_sug_profile(self):
        self.applicant.delete()
        r = self.c.post(f"{URL}{self.app_id}/approve/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["account_found"])
        self.assertTrue(User.objects.filter(email__iexact="sam@x.edu", is_verified_staff=True).exists())
        self.assertIn("approved", mail.outbox[0].body.lower())

    def test_admin_can_link_an_account_with_a_different_email(self):
        other = mk("sam2", email="samuel@gmail.com")
        StaffApplication.objects.filter(pk=self.app_id).update(linked_user=other)
        self.c.post(f"{URL}{self.app_id}/approve/")
        other.refresh_from_db()
        self.assertTrue(other.is_verified_staff)

    def test_unknown_application_404(self):
        self.assertEqual(self.c.post(f"{URL}9999/approve/").status_code, 404)

    def test_staff_flag_alone_also_counts_as_reviewer(self):
        s = mk("helper", is_staff=True)
        self.c.force_authenticate(s)
        self.assertEqual(self.c.post(f"{URL}{self.app_id}/approve/").status_code, 200)


class DjangoAdminActions(Base):
    def setUp(self):
        super().setUp()
        self.su = User.objects.create_superuser("su", "su@x.edu", "pw-123456")
        self.applicant = mk("sam", email="sam@x.edu")
        self.ids = [self.apply(email=f"a{i}@x.edu").json()["id"] for i in range(2)]
        StaffApplication.objects.filter(pk=self.ids[0]).update(email="sam@x.edu")
        self.client.force_login(self.su)

    def run_action(self, action, ids):
        return self.client.post("/admin/staffapp/staffapplication/", {
            "action": action, "_selected_action": [str(i) for i in ids]}, follow=True)

    def test_approve_action_works_and_is_audited(self):
        r = self.run_action("approve_selected", self.ids)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(set(StaffApplication.objects.values_list("status", flat=True)), {"approved"})
        self.assertEqual(StaffApplication.objects.first().reviewed_by, self.su)
        self.applicant.refresh_from_db()
        self.assertTrue(self.applicant.is_verified_staff)

    def test_reject_action_and_no_double_review(self):
        self.run_action("reject_selected", self.ids)
        self.assertEqual(set(StaffApplication.objects.values_list("status", flat=True)), {"rejected"})
        self.run_action("approve_selected", self.ids)  # already decided → untouched
        self.assertEqual(set(StaffApplication.objects.values_list("status", flat=True)), {"rejected"})

    def test_status_cannot_be_hand_edited_in_admin_form(self):
        r = self.client.get(f"/admin/staffapp/staffapplication/{self.ids[0]}/change/")
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('name="status"', r.content.decode())

    def test_non_superuser_staff_without_permission_cannot_open_admin_list(self):
        self.client.logout()
        self.client.force_login(mk("plainstaff", is_staff=True))
        self.assertIn(self.client.get("/admin/staffapp/staffapplication/").status_code, (302, 403))
