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

    @override_settings(PAYSTACK_SECRET_KEY="sk_test_dummy_secret")
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
