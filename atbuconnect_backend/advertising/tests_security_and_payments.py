"""Automated production-hardening tests:
- Paystack idempotency (same Idempotency-Key / rapid retry never creates duplicate charges)
- Paystack HMAC-SHA512 webhook verification + atomic idempotent fulfillment + AuditLog creation
- IDOR prevention on campaigns and payment verification
- Login brute-force protection & temporary account lockout (429)
- API v1 versioned routing parity (/api/v1/... alongside /api/...)
- Signed expiring PDF download links (/api/library/documents/{id}/signed-url/)
"""

import hashlib
import hmac
import json
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from advertising.models import AuditLog, Campaign, PaymentTransaction
from departments.models import Department
from library.models import AcademicDepartment, Course, Document

User = get_user_model()


class SecurityAndPaymentsTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="student1",
            email="student1@example.com",
            password="StrongPassword123!",
            first_name="Amina",
            last_name="Bello",
            email_verified=True,
        )
        self.other = User.objects.create_user(
            username="student2",
            email="student2@example.com",
            password="StrongPassword123!",
            first_name="Musa",
            last_name="Adamu",
            email_verified=True,
        )
        today = timezone.localdate()
        self.camp = Campaign.objects.create(
            advertiser=self.user,
            name="Campus Fair",
            headline="Campus Tech Fair",
            description="Join us at the main hall.",
            start_date=today,
            end_date=today + timedelta(days=5),
            placements=["feed"],
            total_budget=Decimal("1500.00"),
            status=Campaign.Status.PENDING,
            payment_status=Campaign.PaymentStatus.UNPAID,
        )

    @override_settings(PAYSTACK_SECRET_KEY="sk_live_dummy_secret")
    @patch("advertising.payments.PaystackGateway._request")
    def test_payment_idempotency_and_both_checkout_keys(self, mock_req):
        mock_req.side_effect = [
            {"status": True, "data": {"customer_code": "CUS_123"}},
            {"status": True, "data": {"account_number": "0123456789", "account_name": "CENET/Amina", "bank": {"name": "Wema Bank"}}},
            {"status": True, "data": {"authorization_url": "https://checkout.paystack.com/test123"}},
        ]
        self.client.force_authenticate(self.user)
        r1 = self.client.post(
            f"/api/ads/{self.camp.pk}/initiate-payment/",
            HTTP_IDEMPOTENCY_KEY="idem-abc-1",
        )
        self.assertEqual(r1.status_code, 200)
        d1 = r1.json()
        self.assertEqual(d1["checkout_url"], "https://checkout.paystack.com/test123")
        self.assertEqual(d1["authorization_url"], "https://checkout.paystack.com/test123")
        self.assertEqual(d1["account_number"], "0123456789")

        # Retrying with same idempotency key reuses exact transaction without calling Paystack again
        r2 = self.client.post(
            f"/api/ads/{self.camp.pk}/initiate-payment/",
            HTTP_IDEMPOTENCY_KEY="idem-abc-1",
        )
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.json()["reference"], d1["reference"])
        self.assertEqual(PaymentTransaction.objects.filter(campaign=self.camp).count(), 1)
        self.assertEqual(AuditLog.objects.filter(action="payment.initiated").count(), 1)

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_dummy_secret")
    def test_webhook_hmac_verification_and_idempotent_fulfillment(self):
        tx = PaymentTransaction.objects.create(
            user=self.user,
            purpose=PaymentTransaction.Purpose.AD_CAMPAIGN,
            campaign=self.camp,
            amount_ngn=Decimal("1500.00"),
            reference="CN-AD-TEST999",
            status=PaymentTransaction.Status.PENDING,
        )
        payload = json.dumps({
            "event": "charge.success",
            "data": {
                "reference": tx.reference,
                "amount": 150000,
                "customer": {"email": self.user.email},
            },
        }).encode("utf-8")

        # Invalid signature MUST be rejected with 401
        bad = self.client.post(
            "/api/payments/paystack/webhook/",
            data=payload,
            content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE="invalid_sig",
        )
        self.assertEqual(bad.status_code, 401)
        tx.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.Status.PENDING)

        # Valid HMAC-SHA512 signature fulfills payment atomically and logs audit record
        sig = hmac.new(b"sk_test_dummy_secret", payload, hashlib.sha512).hexdigest()
        ok1 = self.client.post(
            "/api/payments/paystack/webhook/",
            data=payload,
            content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=sig,
        )
        self.assertEqual(ok1.status_code, 200)
        tx.refresh_from_db()
        self.camp.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.Status.PAID)
        self.assertEqual(self.camp.payment_status, Campaign.PaymentStatus.PAID)
        self.assertEqual(AuditLog.objects.filter(action="payment.fulfilled").count(), 1)

        # Duplicate webhook delivery is idempotent (no duplicate AuditLog)
        ok2 = self.client.post(
            "/api/payments/paystack/webhook/",
            data=payload,
            content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=sig,
        )
        self.assertEqual(ok2.status_code, 200)
        self.assertEqual(AuditLog.objects.filter(action="payment.fulfilled").count(), 1)

    def test_idor_blocked_on_other_users_campaign_and_payment_verify(self):
        tx = PaymentTransaction.objects.create(
            user=self.user,
            purpose=PaymentTransaction.Purpose.AD_CAMPAIGN,
            campaign=self.camp,
            amount_ngn=Decimal("1500.00"),
            reference="CN-AD-IDOR1",
        )
        self.client.force_authenticate(self.other)
        r_camp = self.client.post(f"/api/ads/{self.camp.pk}/initiate-payment/")
        self.assertIn(r_camp.status_code, (403, 404))
        r_ver = self.client.post("/api/payments/verify/", {"reference": tx.reference})
        self.assertEqual(r_ver.status_code, 404)

    @override_settings(LOGIN_MAX_ATTEMPTS=3, LOGIN_LOCKOUT_SECONDS=300)
    def test_login_brute_force_lockout_and_api_v1_parity(self):
        for _ in range(3):
            r = self.client.post("/api/v1/auth/login/", {"username": "student1", "password": "wrong"})
            self.assertEqual(r.status_code, 401)
        # 4th attempt is locked out with 429 even with correct password
        r_locked = self.client.post("/api/v1/auth/login/", {"username": "student1", "password": "StrongPassword123!"})
        self.assertEqual(r_locked.status_code, 429)

    def test_signed_pdf_download_url_and_tamper_rejection(self):
        fac = Department.objects.create(name="Sciences", color="#2563EB")
        ad = AcademicDepartment.objects.create(faculty=fac, name="Mathematics")
        course = Course.objects.create(academic_department=ad, level=200, code="MTH201", title="Linear Algebra")
        pdf_bytes = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
        doc = Document.objects.create(
            course=course,
            title="MTH201 Notes",
            uploaded_by=self.user,
            original_name="mth201.pdf",
            size_bytes=len(pdf_bytes),
            file=SimpleUploadedFile("mth201.pdf", pdf_bytes, content_type="application/pdf"),
        )
        self.client.force_authenticate(self.user)
        r = self.client.get(f"/api/library/documents/{doc.pk}/signed-url/")
        self.assertEqual(r.status_code, 200)
        signed_url = r.json()["url"]
        self.assertIn("sig=", signed_url)

        # Unauthenticated client can stream using valid signed URL
        anon = APIClient()
        from urllib.parse import urlparse
        parsed = urlparse(signed_url)
        dl = anon.get(f"{parsed.path}?{parsed.query}")
        self.assertEqual(dl.status_code, 200)
        self.assertEqual(dl["Content-Type"], "application/pdf")

        # Tampered signature is rejected with 403
        bad = anon.get(f"/api/library/documents/{doc.pk}/file/?sig=tampered")
        self.assertEqual(bad.status_code, 403)

    def test_community_avatar_and_cover_upload_syncs_via_db_storage(self):
        import io
        from PIL import Image
        from urllib.parse import urlparse
        from communities.models import Community, CommunityMembership
        from media_app.models import StoredMediaFile

        comm = Community.objects.create(name="ATBU MUFC", description="Red fans", creator=self.user)
        CommunityMembership.objects.create(community=comm, user=self.user, role=CommunityMembership.Role.OWNER)

        def _img(color):
            b = io.BytesIO()
            Image.new("RGB", (80, 80), color).save(b, format="JPEG")
            b.seek(0)
            return SimpleUploadedFile("pic.jpg", b.read(), content_type="image/jpeg")

        self.client.force_authenticate(self.user)
        res = self.client.patch(
            f"/api/communities/{comm.slug}/",
            {"description": "Updated bio", "avatar": _img("red"), "cover_image": _img("blue")},
            format="multipart",
        )
        self.assertEqual(res.status_code, 200)
        d = res.json()
        self.assertTrue(d["avatar_url"])
        self.assertTrue(d["cover_url"])
        # Stored in PostgreSQL StoredMediaFile and served across any client via /media/...
        self.assertGreaterEqual(StoredMediaFile.objects.filter(is_private=False).count(), 2)
        av_path = urlparse(d["avatar_url"]).path
        cv_path = urlparse(d["cover_url"]).path
        anon = APIClient()
        r_av = anon.get(av_path)
        r_cv = anon.get(cv_path)
        self.assertEqual(r_av.status_code, 200)
        self.assertEqual(r_cv.status_code, 200)
        self.assertTrue(r_av["Content-Type"].startswith("image/"))

    def test_unique_lifetime_views_for_registered_and_guest_users(self):
        from questions.models import Question

        q = Question.objects.create(author=self.user, title="Views check", body="Body text")
        # Registered user views 3 times -> still 1 view
        self.client.force_authenticate(self.user)
        for _ in range(3):
            r = self.client.get(f"/api/questions/{q.public_id}/", HTTP_USER_AGENT="FlutterApp/2.0")
            self.assertEqual(r.status_code, 200)
        q.refresh_from_db()
        self.assertEqual(q.views, 1)

        # Second registered user views twice -> 2 views total
        self.client.force_authenticate(self.other)
        self.client.get(f"/api/questions/{q.public_id}/", HTTP_USER_AGENT="FlutterApp/2.0")
        self.client.get(f"/api/questions/{q.public_id}/", HTTP_USER_AGENT="FlutterApp/2.0")
        q.refresh_from_db()
        self.assertEqual(q.views, 2)

        # Guest views twice with same browser -> 3 views total
        anon = APIClient()
        anon.get(f"/api/questions/{q.public_id}/", HTTP_USER_AGENT="Mozilla/5.0 Chrome/120")
        anon.get(f"/api/questions/{q.public_id}/", HTTP_USER_AGENT="Mozilla/5.0 Chrome/120")
        q.refresh_from_db()
        self.assertEqual(q.views, 3)

    def test_strict_faculty_filter_excludes_general_posts(self):
        from questions.models import Question

        comp = Department.objects.create(name="Computing", color="#2563EB")
        eng = Department.objects.create(name="Engineering", color="#059669")
        Question.objects.create(author=self.user, department=None, title="General post", body="All faculties")
        Question.objects.create(author=self.user, department=comp, title="Computing post", body="CS only")

        r_comp = self.client.get("/api/questions/?topic=Computing")
        self.assertEqual(r_comp.status_code, 200)
        titles = [item["title"] for item in r_comp.json()["results"]]
        self.assertEqual(titles, ["Computing post"])

        # Empty faculty returns [] (zero general posts leaked!)
        r_eng = self.client.get("/api/questions/?topic=Engineering")
        self.assertEqual(r_eng.status_code, 200)
        self.assertEqual(r_eng.json()["results"], [])

    def test_verified_student_and_sug_cannot_edit_other_users_post(self):
        from questions.models import Question

        self.user.is_verified_student = True
        self.user.save(update_fields=["is_verified_student"])
        self.other.is_verified_student = True
        self.other.is_verified_staff = True
        self.other.is_staff = True
        self.other.save(update_fields=["is_verified_student", "is_verified_staff", "is_staff"])

        q = Question.objects.create(author=self.user, title="Original Title", body="Original Body")

        # Another verified student / SUG / staff CANNOT edit this user's post
        self.client.force_authenticate(self.other)
        r_forbid = self.client.patch(f"/api/questions/{q.public_id}/", {"title": "Hacked Title"}, format="json")
        self.assertEqual(r_forbid.status_code, 403)
        r_get = self.client.get(f"/api/questions/{q.public_id}/")
        self.assertFalse(r_get.json()["can_edit"])

        # Original verified author CAN edit their own post
        self.client.force_authenticate(self.user)
        r_ok = self.client.patch(f"/api/questions/{q.public_id}/", {"title": "Updated Title"}, format="json")
        self.assertEqual(r_ok.status_code, 200)
        self.assertEqual(r_ok.json()["title"], "Updated Title")

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_fast_verify_key")
    def test_verification_approve_first_then_pay_auto_activates(self):
        from accounts.models import StudentVerificationApplication
        from notifications.models import Notification

        admin_u = User.objects.create_superuser("veradmin", "veradmin@atbu.edu.ng", "StrongPassword123!")
        # 1. Student submits documents WITHOUT paying upfront -> succeeds (201)
        self.client.force_authenticate(self.user)
        r_apply = self.client.post(
            "/api/verification/apply/",
            {"level": "300 Level", "department_name": "Computer Science", "consent": True},
            format="json",
        )
        self.assertEqual(r_apply.status_code, 201)
        app_id = r_apply.json()["id"]
        self.assertEqual(r_apply.json()["status"], "pending")

        # 2. Admin approves collected data -> status becomes awaiting_payment + user notified
        self.client.force_authenticate(admin_u)
        r_approve = self.client.post(f"/api/verification/applications/{app_id}/approve/", {}, format="json")
        self.assertEqual(r_approve.status_code, 200)
        self.assertEqual(r_approve.json()["status"], "awaiting_payment")
        self.assertTrue(Notification.objects.filter(user=self.user, link="/verification").exists())

        # 3. Paystack webhook confirms ₦1,500 verification payment -> badge activates automatically!
        tx = PaymentTransaction.objects.create(
            user=self.user,
            purpose=PaymentTransaction.Purpose.STUDENT_VERIFICATION,
            amount_ngn=Decimal("1500.00"),
            reference="CN-STU-APPROVE1",
        )
        payload = json.dumps({
            "event": "charge.success",
            "data": {"reference": tx.reference, "amount": 150000, "customer": {"email": self.user.email}},
        }).encode("utf-8")
        sig = hmac.new(b"sk_test_fast_verify_key", payload, hashlib.sha512).hexdigest()
        r_hook = self.client.post(
            "/api/payments/paystack/webhook/",
            data=payload,
            content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=sig,
        )
        self.assertEqual(r_hook.status_code, 200)
        self.user.refresh_from_db()
        app = StudentVerificationApplication.objects.get(pk=app_id)
        self.assertTrue(self.user.is_verified_student)
        self.assertEqual(app.status, StudentVerificationApplication.Status.APPROVED)

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_ad_live_key")
    def test_paid_ad_goes_live_immediately_and_admin_takedown_notifies(self):
        from notifications.models import Notification

        admin_u = User.objects.create_superuser("adadmin", "adadmin@atbu.edu.ng", "StrongPassword123!")
        tx = PaymentTransaction.objects.create(
            user=self.user,
            purpose=PaymentTransaction.Purpose.AD_CAMPAIGN,
            campaign=self.camp,
            amount_ngn=Decimal("1500.00"),
            reference="CN-AD-AUTOLIVE1",
        )
        payload = json.dumps({
            "event": "charge.success",
            "data": {"reference": tx.reference, "amount": 150000, "customer": {"email": self.user.email}},
        }).encode("utf-8")
        sig = hmac.new(b"sk_test_ad_live_key", payload, hashlib.sha512).hexdigest()
        r_hook = self.client.post(
            "/api/payments/paystack/webhook/",
            data=payload,
            content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=sig,
        )
        self.assertEqual(r_hook.status_code, 200)
        self.camp.refresh_from_db()
        # Live immediately on payment — no pre-approval wait!
        self.assertEqual(self.camp.status, Campaign.Status.ACTIVE)

        # Admin can still take down non-compliant ads with reason + notification
        self.client.force_authenticate(admin_u)
        r_td = self.client.post(
            f"/api/ads/{self.camp.pk}/takedown/",
            {"reason": "Misleading promotional claim"},
            format="json",
        )
        self.assertEqual(r_td.status_code, 200)
        self.camp.refresh_from_db()
        self.assertEqual(self.camp.status, Campaign.Status.REJECTED)
        self.assertTrue(Notification.objects.filter(user=self.user, text__icontains="Misleading").exists())

    def test_admin_post_takedown_and_account_suspension_notify_users(self):
        from notifications.models import Notification
        from questions.models import Question

        admin_u = User.objects.create_superuser("modadmin", "modadmin@atbu.edu.ng", "StrongPassword123!")
        q = Question.objects.create(author=self.user, title="Bad post", body="Spam content")
        self.client.force_authenticate(admin_u)

        r_td = self.client.post(f"/api/questions/{q.public_id}/takedown/", {"reason": "Spam advertising"}, format="json")
        self.assertEqual(r_td.status_code, 200)
        self.assertFalse(Question.objects.filter(pk=q.pk).exists())
        self.assertTrue(Notification.objects.filter(user=self.user, text__icontains="Spam advertising").exists())

        r_susp = self.client.post(f"/api/users/{self.user.pk}/suspend/", {"reason": "Repeated spam"}, format="json")
        self.assertEqual(r_susp.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)
        self.assertTrue(Notification.objects.filter(user=self.user, text__icontains="Repeated spam").exists())

    def test_optional_blank_headline_community_feed_merge_and_universal_search(self):
        from communities.models import Community, CommunityPost, CommunityPostComment
        from questions.models import Answer, Question

        # 1. Optional blank headline allowed without auto-copying body into title
        self.client.force_authenticate(self.user)
        r_post = self.client.post(
            "/api/questions/",
            {"title": "", "body": "Quick campus update about #resumption timetable!"},
            format="json",
        )
        self.assertEqual(r_post.status_code, 201)
        self.assertEqual(r_post.json()["title"], "")
        q_id = r_post.json()["id"]
        Answer.objects.create(question_id=q_id, author=self.other, body="Confirming examhall schedule for resumption")

        # 2. Public community post appears in All Faculties feed with clickable community metadata
        comm = Community.objects.create(name="ATBU Football Club", description="Matches", creator=self.user)
        cp = CommunityPost.objects.create(
            community=comm, author=self.user, title="", body="Big resumption match on Saturday!"
        )
        CommunityPostComment.objects.create(post=cp, author=self.other, body="See you at the stadium for examhall vibes")

        r_feed = self.client.get("/api/questions/")
        self.assertEqual(r_feed.status_code, 200)
        results = r_feed.json()["results"]
        self.assertTrue(any(item.get("is_community_post") and item.get("community_slug") == comm.slug for item in results))

        # Excluded when filtering by a specific faculty
        Department.objects.create(name="Computing", color="#2563EB")
        r_fac = self.client.get("/api/questions/?topic=Computing")
        self.assertEqual(r_fac.json()["results"], [])

        # 3. Keyword-engagement-driven Trending Now
        r_trend = self.client.get("/api/questions/trending-topics/")
        self.assertEqual(r_trend.status_code, 200)
        trends = r_trend.json()
        self.assertTrue(len(trends) >= 1)
        self.assertIn("keyword", trends[0])
        self.assertIn("engagements", trends[0])

        # 4. Universal deep keyword search matches comments & community comments
        r_search = self.client.get("/api/search/?q=examhall")
        self.assertEqual(r_search.status_code, 200)
        sd = r_search.json()
        self.assertTrue(len(sd["posts"]) >= 1)
        self.assertTrue(len(sd["comments"]) >= 1)
        self.assertTrue(len(sd["community_posts"]) >= 1)
        self.assertTrue(len(sd["community_comments"]) >= 1)
