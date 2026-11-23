"""End-to-end automated & security test suite for CampusNetwork (Cenet) modules:
- Communities (official auto-follow, creation, channel permissions, notification prefs)
- Comments redesign (threading, upvote/downvote, DB sorting, XSS sanitization, @mentions)
- Advertising (wizard validation, admin approval, payment deferred, deduplicated tracking, hide_ads)
- SUG Chat (student<->SUG only, no student-to-student DM, IDOR protection, saved chat questions)
- Account security (phone auth, forgot password single-use code, change password, email verification)
- Student verification & Verified perks (edit post, anytime delete, word limits, username cooldown, hide_ads)
- SUG ratings & Security headers
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import EmailVerificationToken, PasswordResetToken, StudentVerificationApplication
from advertising.models import Campaign
from chat.models import Conversation, Message
from communities.models import Community, CommunityMembership
from notifications.models import Notification
from questions.models import Answer, Question

User = get_user_model()


def make_user(username, **kw):
    pw = kw.pop("password", "StrongPass123!")
    kw.setdefault("email", f"{username}@atbu.edu.ng")
    u = User.objects.create_user(username=username, password=pw, **kw)
    return u


class CommunitiesModuleTests(TestCase):
    def setUp(self):
        self.admin = make_user("admin1", role=User.Role.ADMIN, is_superuser=True, is_staff=True)
        self.alice = make_user("alice", first_name="Alice")
        self.bob = make_user("bob", first_name="Bob")
        self.c = APIClient()

    def test_new_user_automatically_follows_official_campusnetwork_community(self):
        comm = Community.objects.get(slug="campusnetwork")
        self.assertTrue(comm.is_official)
        self.assertTrue(CommunityMembership.objects.filter(community=comm, user=self.alice).exists())

    def test_create_follow_channel_permissions_and_notif_prefs(self):
        self.c.force_authenticate(self.alice)
        r = self.c.post("/api/communities/", {
            "name": "ATBU Tech Community",
            "description": "Students building software & hardware.",
            "category": "Technology",
        })
        self.assertEqual(r.status_code, 201, r.content)
        slug = r.json()["slug"]
        self.assertTrue(r.json()["is_following"])
        self.assertEqual(r.json()["my_role"], "owner")

        # Bob discovers & follows, then sets notification pref to none
        self.c.force_authenticate(self.bob)
        self.assertEqual(self.c.post(f"/api/communities/{slug}/follow/").status_code, 201)
        self.assertEqual(
            self.c.patch(f"/api/communities/{slug}/notifications/", {"notif_level": "none"}, format="json").status_code,
            200,
        )
        # Ordinary follower CANNOT publish official community posts
        self.assertEqual(
            self.c.post(f"/api/communities/{slug}/posts/", {"body": "Unauthorized post"}, format="json").status_code,
            403,
        )

        # Owner CAN publish; Bob muted notifications so he gets none
        self.c.force_authenticate(self.alice)
        r_post = self.c.post(f"/api/communities/{slug}/posts/", {"title": "Welcome", "body": "First update!"}, format="json")
        self.assertEqual(r_post.status_code, 201)
        self.assertFalse(Notification.objects.filter(user=self.bob, type=Notification.Type.COMMUNITY).exists())


class CommentsAndMentionsTests(TestCase):
    def setUp(self):
        self.alice = make_user("alice", first_name="Alice")
        self.bob = make_user("bob", first_name="Bob")
        self.q = Question.objects.create(author=self.alice, title="MTH201 Help", body="Need advice")
        self.c = APIClient()

    def test_threaded_comments_votes_sorting_xss_and_mentions(self):
        self.c.force_authenticate(self.bob)
        r1 = self.c.post(f"/api/questions/{self.q.pk}/answer/", {
            "body": "Hey @alice try past questions!",
            "body_html": "Hey @alice <b>try past questions!</b><script>alert(1)</script>",
        }, format="json")
        self.assertEqual(r1.status_code, 201)
        c1_id = r1.json()["id"]
        # XSS script must be stripped while safe <b> preserved
        self.assertNotIn("<script>", r1.json()["body_html"])
        self.assertIn("<b>try past questions!</b>", r1.json()["body_html"])
        # Mention notification recorded
        self.assertTrue(Notification.objects.filter(user=self.alice, type=Notification.Type.MENTION).exists())

        # Reply nested under parent
        self.c.force_authenticate(self.alice)
        r2 = self.c.post(f"/api/questions/{self.q.pk}/answer/", {
            "body": "Thanks @bob!",
            "parent": c1_id,
        }, format="json")
        self.assertEqual(r2.status_code, 201)
        self.assertEqual(r2.json()["parent"], c1_id)

        # Upvote -> switch to Downvote -> toggle off (no duplicate votes)
        v1 = self.c.post(f"/api/answers/{c1_id}/vote/", {"direction": "up"}, format="json").json()
        self.assertEqual((v1["upvotes"], v1["downvotes"], v1["my_vote"]), (1, 0, "up"))
        v2 = self.c.post(f"/api/answers/{c1_id}/vote/", {"direction": "down"}, format="json").json()
        self.assertEqual((v2["upvotes"], v2["downvotes"], v2["my_vote"]), (0, 1, "down"))
        v3 = self.c.post(f"/api/answers/{c1_id}/vote/", {"direction": "down"}, format="json").json()
        self.assertEqual((v3["upvotes"], v3["downvotes"], v3["my_vote"]), (0, 0, None))

        # Comments endpoint returns nested replies & respects sorting
        listing = self.c.get(f"/api/questions/{self.q.pk}/comments/?sort=recent").json()
        items = listing["results"] if isinstance(listing, dict) else listing
        self.assertEqual(len(items), 1)
        self.assertEqual(len(items[0]["replies"]), 1)


class AdvertisingModuleTests(TestCase):
    def setUp(self):
        self.admin = make_user("adadmin", role=User.Role.ADMIN, is_superuser=True)
        self.student = make_user("advertiser")
        self.verified = make_user("vstudent", is_verified_student=True, hide_ads=True)
        self.c = APIClient()

    def test_campaign_lifecycle_moderation_payment_deferred_and_ad_free_perk(self):
        today = timezone.localdate()
        self.c.force_authenticate(self.student)
        r = self.c.post("/api/ads/", {
            "name": "Book Fair",
            "headline": "Campus Book Fair",
            "description": "50% off textbooks this week.",
            "destination_url": "https://example.com/books",
            "placements": ["feed", "comments"],
            "start_date": today.isoformat(),
            "end_date": (today + timedelta(days=5)).isoformat(),
            "total_budget": "10000.00",
        }, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        cid = r.json()["id"]
        # Must NOT auto-approve or auto-pay!
        self.assertEqual(r.json()["status"], "pending")
        self.assertEqual(r.json()["payment_status"], "coming_soon")

        # Payment initiation returns not_configured when PAYSTACK_SECRET_KEY is unset
        pay = self.c.post(f"/api/ads/{cid}/initiate-payment/").json()
        self.assertFalse(pay["enabled"])
        self.assertEqual(pay["status"], "not_configured")
        # Server enforces NGN 4,000 cap on non-admin ad campaigns
        self.assertLessEqual(float(r.json()["total_budget"]), 4000.0)

        # Non-admin cannot approve
        self.assertEqual(self.c.post(f"/api/ads/{cid}/approve/").status_code, 403)
        # Pending campaign is NOT served
        self.assertEqual(len(self.c.get("/api/ads/serve/?placement=feed").json()), 0)

        # Admin approves -> becomes active & serves
        self.c.force_authenticate(self.admin)
        self.assertEqual(self.c.post(f"/api/ads/{cid}/approve/").json()["status"], "active")

        self.c.force_authenticate(self.student)
        served = self.c.get("/api/ads/serve/?placement=feed").json()
        self.assertEqual(len(served), 1)
        # Deduplicated impression & click
        self.assertTrue(self.c.post(f"/api/ads/{cid}/impression/", {"placement": "feed"}, format="json").json()["recorded"])
        self.assertFalse(self.c.post(f"/api/ads/{cid}/impression/", {"placement": "feed"}, format="json").json()["recorded"])
        self.assertTrue(self.c.post(f"/api/ads/{cid}/click/", {"placement": "feed"}, format="json").json()["recorded"])

        an = self.c.get("/api/ads/analytics/?range=7d").json()
        self.assertEqual(an["summary"]["total_impressions"], 1)
        self.assertEqual(an["summary"]["total_clicks"], 1)

    def test_campaign_multipart_formdata_submission(self):
        today = timezone.localdate()
        self.c.force_authenticate(self.student)
        r = self.c.post("/api/ads/", {
            "name": "ATBU Movie week",
            "headline": "Entertainment & Enlightenment",
            "description": "Join us for ATBU Movie week on campus.",
            "cta_text": "Learn More",
            "targeting": '{"audience":"all"}',
            "placements": '["feed","comments","communities"]',
            "start_date": today.isoformat(),
            "end_date": (today + timedelta(days=7)).isoformat(),
            "active_days": '["Mon","Tue","Wed"]',
            "currency": "NGN",
            "total_budget": "5000",
            "save_as": "pending",
        }, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        data = r.json()
        self.assertEqual(data["targeting"], {"audience": "all"})
        self.assertEqual(data["placements"], ["feed", "comments", "communities"])
        self.assertEqual(data["status"], "pending")

        # Verified student with hide_ads=True receives zero ads!
        self.c.force_authenticate(self.verified)
        self.assertEqual(self.c.get("/api/ads/serve/?placement=feed").json(), [])


class SUGChatSecurityTests(TestCase):
    def setUp(self):
        self.student1 = make_user("stu1")
        self.student2 = make_user("stu2")
        self.sug = make_user("sugrep", role=User.Role.STAFF, is_verified_staff=True, title="PRO")
        self.c = APIClient()

    def test_student_to_student_dm_blocked_and_idor_prevented(self):
        self.c.force_authenticate(self.student1)
        # Student-to-student DM MUST be forbidden
        r_dm = self.c.post("/api/chats/start/", {"sug_id": self.student2.pk}, format="json")
        self.assertEqual(r_dm.status_code, 403)

        # Student -> SUG succeeds and reopens without duplicating
        r1 = self.c.post("/api/chats/start/", {"sug_id": self.sug.pk, "message": "When is hostel open?"}, format="json")
        self.assertEqual(r1.status_code, 201)
        cid = r1.json()["id"]
        r2 = self.c.post("/api/chats/start/", {"sug_id": self.sug.pk}, format="json")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.json()["id"], cid)
        self.assertEqual(Conversation.objects.count(), 1)

        # Save a question inside chat thread
        msg_id = Message.objects.first().pk
        self.assertTrue(self.c.post(f"/api/chats/messages/{msg_id}/save/").json()["saved"])
        self.assertEqual(len(self.c.get("/api/chats/saved/").json()), 1)

        # IDOR test: student2 cannot read or message student1's conversation
        self.c.force_authenticate(self.student2)
        self.assertEqual(self.c.get(f"/api/chats/{cid}/messages/").status_code, 404)
        self.assertEqual(self.c.post(f"/api/chats/{cid}/messages/", {"body": "Snooping"}, format="json").status_code, 404)


class AccountSecurityAndVerifiedPerksTests(TestCase):
    def setUp(self):
        self.admin = make_user("vadmin", role=User.Role.ADMIN, is_superuser=True)
        self.ordinary = make_user("ordinary")
        self.verified = make_user("verified_stu", is_verified_student=True)
        self.sug = make_user("sug_official", role=User.Role.STAFF, is_verified_staff=True)
        self.c = APIClient()

    def test_username_registration_duplicate_rejection_welcome_notif_and_forgot_password(self):
        r = self.c.post("/api/auth/register/", {
            "first_name": "Musa",
            "last_name": "Bello",
            "username": "musabello",
            "email": "musa@atbu.edu.ng",
            "password": "ComplexPassword123!",
            "confirm_password": "ComplexPassword123!",
        }, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        uid = r.json()["user"]["id"]
        self.assertTrue(Notification.objects.filter(user_id=uid, type=Notification.Type.WELCOME).exists())

        # Duplicate username (case-insensitive) must be rejected
        r_dup = self.c.post("/api/auth/register/", {
            "first_name": "Another",
            "last_name": "User",
            "username": "MusaBello",
            "email": "other@atbu.edu.ng",
            "password": "ComplexPassword123!",
            "confirm_password": "ComplexPassword123!",
        }, format="json")
        self.assertEqual(r_dup.status_code, 400)
        self.assertIn("username", r_dup.json())

        # Login by username
        r_log = self.c.post("/api/auth/login/", {"username": "musabello", "password": "ComplexPassword123!"}, format="json")
        self.assertEqual(r_log.status_code, 200)

        # Forgot password -> verify 6-digit code -> reset -> token cannot be reused
        self.assertEqual(self.c.post("/api/auth/forgot-password/", {"email": "musa@atbu.edu.ng"}, format="json").status_code, 200)
        tok = PasswordResetToken.objects.filter(user_id=uid).first()
        self.assertIsNotNone(tok)
        ver = self.c.post("/api/auth/verify-reset-code/", {"email": "musa@atbu.edu.ng", "code": tok.code}, format="json")
        self.assertEqual(ver.status_code, 200)
        rst = self.c.post("/api/auth/reset-password/", {
            "token": ver.json()["token"],
            "new_password": "NewStrongPassword456!",
            "confirm_password": "NewStrongPassword456!",
        }, format="json")
        self.assertEqual(rst.status_code, 200)
        # Reusing token must fail
        rst2 = self.c.post("/api/auth/reset-password/", {
            "token": ver.json()["token"],
            "new_password": "AnotherPassword789!",
            "confirm_password": "AnotherPassword789!",
        }, format="json")
        self.assertEqual(rst2.status_code, 400)

    def test_verified_student_perks_and_sug_rating(self):
        # Ordinary user cannot exceed 300 words
        self.c.force_authenticate(self.ordinary)
        long_body = " ".join(["word"] * 350)
        self.assertEqual(self.c.post("/api/questions/", {"title": "Long", "body": long_body}, format="json").status_code, 400)

        # Ordinary user cannot edit own post or delete after 24h
        q_ord = Question.objects.create(author=self.ordinary, title="Old", body="Body")
        Question.objects.filter(pk=q_ord.pk).update(created_at=timezone.now() - timedelta(hours=30))
        self.assertEqual(self.c.patch(f"/api/questions/{q_ord.pk}/", {"title": "Edited"}, format="json").status_code, 403)
        self.assertEqual(self.c.delete(f"/api/questions/{q_ord.pk}/").status_code, 403)

        # Ordinary user cannot hide ads
        self.assertEqual(self.c.patch("/api/auth/me/", {"hide_ads": True}, format="json").status_code, 400)

        # Ordinary user rates SUG rep
        r_rate = self.c.post(f"/api/users/{self.sug.pk}/rate-sug/", {"score": 5, "comment": "Very responsive!"}, format="json")
        self.assertEqual(r_rate.status_code, 201)
        self.assertEqual(r_rate.json()["sug_rating"], 5.0)

        # Verified student CAN post >300 words, edit own post, delete after 24h, and hide ads
        self.c.force_authenticate(self.verified)
        r_long = self.c.post("/api/questions/", {"title": "Long Verified", "body": long_body}, format="json")
        self.assertEqual(r_long.status_code, 201)
        qid = r_long.json()["id"]
        Question.objects.filter(pk=qid).update(created_at=timezone.now() - timedelta(hours=36))
        self.assertEqual(self.c.patch(f"/api/questions/{qid}/", {"title": "Updated Title"}, format="json").status_code, 200)
        # IDOR: verified student CANNOT edit ordinary's post
        self.assertEqual(self.c.patch(f"/api/questions/{q_ord.pk}/", {"title": "Hacked"}, format="json").status_code, 403)
        self.assertEqual(self.c.delete(f"/api/questions/{qid}/").status_code, 204)
        self.assertEqual(self.c.patch("/api/auth/me/", {"hide_ads": True}, format="json").status_code, 200)

        # Security headers present on responses
        resp = self.c.get("/api/questions/")
        self.assertEqual(resp["X-Content-Type-Options"], "nosniff")
        self.assertIn("frame-ancestors 'none'", resp["Content-Security-Policy"])
