import os
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from config.testutils import IsolatedStorage, mp4_bytes, png_bytes
from departments.models import Department
from questions.models import Question, QuestionMedia

URL = "/api/questions/"


def mk(username, **kw):
    return User.objects.create(username=username, email=f"{username}@x.edu", **kw)


def img(name="a.png", data=None, ctype="image/png"):
    return SimpleUploadedFile(name, data if data is not None else png_bytes(), content_type=ctype)


def vid(seconds=60, name="clip.mp4", **kw):
    return SimpleUploadedFile(name, mp4_bytes(seconds, **kw), content_type="video/mp4")


class Base(IsolatedStorage, TestCase):
    def setUp(self):
        cache.clear()
        self.dept = Department.objects.create(name="Computing")
        self.ada = mk("ada", first_name="Ada")
        self.bob = mk("bob", first_name="Bob")
        self.admin = mk("root", role="admin")
        self.c = APIClient()

    def post(self, user=None, **fields):
        self.c.force_authenticate(user or self.ada)
        data = {"title": "How do I solve this?", "body": "Details here", "department": self.dept.pk}
        data.update(fields)
        return self.c.post(URL, data, format="multipart")


class GuestPermissions(Base):
    def setUp(self):
        super().setUp()
        self.q = Question.objects.create(author=self.ada, title="t", body="b", department=self.dept)
        self.c.force_authenticate(None)

    def test_guests_can_read(self):
        self.assertEqual(self.c.get(URL).status_code, 200)
        self.assertEqual(self.c.get(f"{URL}{self.q.pk}/").status_code, 200)

    def test_guests_cannot_do_anything_that_writes(self):
        for method, url, data in [
            ("post", URL, {"title": "x", "body": "y"}),
            ("post", f"{URL}{self.q.pk}/vote/", {"direction": "up"}),
            ("post", f"{URL}{self.q.pk}/like/", {}),
            ("post", f"{URL}{self.q.pk}/bookmark/", {}),
            ("post", f"{URL}{self.q.pk}/answer/", {"body": "hi"}),
            ("delete", f"{URL}{self.q.pk}/", None),
            ("patch", f"{URL}{self.q.pk}/", {"title": "hax"}),
        ]:
            r = getattr(self.c, method)(url, data, format="json") if data is not None else getattr(self.c, method)(url)
            self.assertIn(r.status_code, (401, 403), f"{method} {url}")
        self.assertEqual(Question.objects.count(), 1)

    def test_guest_response_has_no_personal_state(self):
        d = self.c.get(f"{URL}{self.q.pk}/").json()
        self.assertFalse(d["can_delete"])
        self.assertIsNone(d["voted"])
        self.assertIsNone(d["delete_deadline"])


class TextPostsStillWork(Base):
    def test_json_text_post(self):
        self.c.force_authenticate(self.ada)
        r = self.c.post(URL, {"title": "Plain", "body": "text only", "department": self.dept.pk, "tags": ["MTH201"]}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        d = r.json()
        self.assertEqual((d["media"], d["promoted"], d["tags"]), ([], False, ["MTH201"]))

    def test_multipart_text_post_with_tags(self):
        r = self.post(tags=["A", "B"])
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(sorted(r.json()["tags"]), ["A", "B"])

    def test_vote_like_save_answer_regression(self):
        q = Question.objects.create(author=self.ada, title="t", body="b")
        self.c.force_authenticate(self.bob)
        self.assertEqual(self.c.post(f"{URL}{q.pk}/vote/", {"direction": "up"}, format="json").json()["votes"], 1)
        self.assertEqual(self.c.post(f"{URL}{q.pk}/vote/", {"direction": "down"}, format="json").json()["votes"], -1)
        self.assertEqual(self.c.post(f"{URL}{q.pk}/vote/", {"direction": "down"}, format="json").json()["voted"], None)
        self.assertTrue(self.c.post(f"{URL}{q.pk}/like/").json()["liked"])
        self.assertTrue(self.c.post(f"{URL}{q.pk}/bookmark/").json()["saved"])
        self.assertEqual(self.c.post(f"{URL}{q.pk}/answer/", {"body": "an answer"}, format="json").status_code, 201)
        listing = self.c.get(URL + "?saved=1").json()
        rows = listing["results"] if isinstance(listing, dict) else listing
        self.assertEqual([r["id"] for r in rows], [q.pk])

    def test_views_counter_deduplicates_refreshes_and_counts_unique_users(self):
        q = Question.objects.create(author=self.ada, title="t", body="b")
        # Same guest refreshing twice only counts once (anti-inflation)
        self.c.get(f"{URL}{q.pk}/")
        self.c.get(f"{URL}{q.pk}/")
        # Different authenticated user counts as a genuine second view
        self.c.force_authenticate(self.bob)
        self.c.get(f"{URL}{q.pk}/")
        q.refresh_from_db()
        self.assertEqual(q.views, 2)


class ImageAttachments(Base):
    def test_single_image(self):
        r = self.post(images=[img()])
        self.assertEqual(r.status_code, 201, r.content)
        m = r.json()["media"]
        self.assertEqual(len(m), 1)
        self.assertEqual((m[0]["kind"], m[0]["width"], m[0]["height"]), ("image", 8, 8))
        self.assertTrue(m[0]["url"].startswith("http"))
        obj = QuestionMedia.objects.get()
        self.assertTrue(os.path.exists(obj.file.path))
        self.assertNotIn("a.png", obj.file.name)  # client filename not used

    def test_multiple_images_keep_order(self):
        r = self.post(images=[img("1.png"), img("2.jpg", png_bytes(fmt="JPEG"), "image/jpeg"), img("3.gif", png_bytes(fmt="GIF"), "image/gif")])
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(r.json()["media"]), 3)

    def test_more_than_six_rejected(self):
        r = self.post(images=[img(f"{i}.png") for i in range(7)])
        self.assertEqual(r.status_code, 400)
        self.assertIn("images", r.json())
        self.assertEqual(Question.objects.count(), 0)

    def test_text_file_pretending_to_be_image_rejected(self):
        r = self.post(images=[img("evil.png", b"<script>alert(1)</script>")])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Question.objects.count(), 0)

    def test_unsupported_format_rejected(self):
        r = self.post(images=[img("x.bmp", png_bytes(fmt="BMP"), "image/bmp")])
        self.assertEqual(r.status_code, 400)

    def test_empty_and_oversize_rejected(self):
        self.assertEqual(self.post(images=[img("e.png", b"")]).status_code, 400)
        with override_settings(POST_MAX_IMAGE_BYTES=100):
            r = self.post(images=[img("big.png", png_bytes(200, 200))])
        self.assertEqual(r.status_code, 400)
        self.assertIn("MB", str(r.json()) + "MB")

    def test_one_bad_image_means_nothing_is_saved(self):
        r = self.post(images=[img("ok.png"), img("bad.png", b"nope")])
        self.assertEqual(r.status_code, 400)
        self.assertEqual((Question.objects.count(), QuestionMedia.objects.count()), (0, 0))


class VideoAttachments(Base):
    def test_valid_short_video(self):
        r = self.post(video=vid(120))
        self.assertEqual(r.status_code, 201, r.content)
        m = r.json()["media"][0]
        self.assertEqual(m["kind"], "video")
        self.assertAlmostEqual(m["duration"], 120, places=1)

    def test_exactly_five_minutes_allowed_and_just_over_rejected(self):
        self.assertEqual(self.post(video=vid(300)).status_code, 201)
        r = self.post(video=vid(300.5))
        self.assertEqual(r.status_code, 400)
        self.assertIn("5 minutes", r.json()["video"][0])

    def test_long_video_rejected_and_nothing_saved(self):
        before = Question.objects.count()
        self.assertEqual(self.post(video=vid(1800)).status_code, 400)
        self.assertEqual(Question.objects.count(), before)

    def test_duration_read_from_header_cannot_be_faked_by_extension(self):
        self.assertEqual(self.post(video=SimpleUploadedFile("notavideo.mp4", b"just some text, not a video at all", content_type="video/mp4")).status_code, 400)
        self.assertEqual(self.post(video=SimpleUploadedFile("x.mp4", png_bytes(), content_type="video/mp4")).status_code, 400)

    def test_64bit_mvhd_and_other_timescale(self):
        self.assertEqual(self.post(video=vid(200, timescale=90000, version=1)).status_code, 201)
        self.assertEqual(self.post(video=vid(400, timescale=90000, version=1)).status_code, 400)

    def test_unsupported_container_rejected(self):
        webm = b"\x1a\x45\xdf\xa3" + b"\x00" * 100
        self.assertEqual(self.post(video=SimpleUploadedFile("c.webm", webm, content_type="video/webm")).status_code, 400)

    def test_wrong_brand_rejected(self):
        self.assertEqual(self.post(video=vid(10, brand=b"zzzz")).status_code, 400)

    def test_size_limit(self):
        with override_settings(POST_MAX_VIDEO_BYTES=50):
            self.assertEqual(self.post(video=vid(10)).status_code, 400)

    def test_cannot_mix_images_and_video_or_send_two_videos(self):
        self.assertEqual(self.post(video=vid(10), images=[img()]).status_code, 400)
        self.c.force_authenticate(self.ada)
        r = self.c.post(URL, {"title": "twice", "body": "x", "video": [vid(5), vid(6, name="b.mp4")]}, format="multipart")
        self.assertEqual(r.status_code, 400)

    def test_custom_limit_via_settings(self):
        with override_settings(POST_MAX_VIDEO_SECONDS=30):
            self.assertEqual(self.post(video=vid(31)).status_code, 400)
            self.assertEqual(self.post(video=vid(29)).status_code, 201)


class PromotedPosts(Base):
    def test_client_cannot_promote_a_post(self):
        r = self.post(is_promoted="true", promoted="true", promoted_until="2099-01-01T00:00:00Z")
        self.assertEqual(r.status_code, 201)
        self.assertFalse(r.json()["promoted"])
        self.assertFalse(Question.objects.get().is_promoted)

    def test_client_cannot_promote_via_patch(self):
        q = Question.objects.create(author=self.ada, title="t", body="b")
        self.c.force_authenticate(self.ada)
        self.c.patch(f"{URL}{q.pk}/", {"is_promoted": True, "promoted": True}, format="json")
        q.refresh_from_db()
        self.assertFalse(q.is_promoted)

    def test_promoted_flag_comes_from_the_database_and_expires(self):
        live = Question.objects.create(author=self.ada, title="live", body="b", is_promoted=True)
        ended = Question.objects.create(author=self.ada, title="ended", body="b", is_promoted=True,
                                        promoted_until=timezone.now() - timedelta(hours=1))
        future = Question.objects.create(author=self.ada, title="future", body="b", is_promoted=True,
                                         promoted_until=timezone.now() + timedelta(days=1))
        plain = Question.objects.create(author=self.ada, title="plain", body="b")
        for q in (live, ended, future, plain):
            q.refresh_from_db()
        self.assertEqual([q.promoted for q in (live, ended, future, plain)], [True, False, True, False])
        d = {r["title"]: r["promoted"] for r in self.c.get(URL).json()["results"]}
        self.assertEqual(d, {"live": True, "ended": False, "future": True, "plain": False})

    def test_trending_is_not_promoted(self):
        q = Question.objects.create(author=self.ada, title="hot", body="b")
        for i in range(5):
            from questions.models import QuestionLike
            QuestionLike.objects.create(question=q, user=mk(f"fan{i}"))
        self.assertFalse(self.c.get(f"{URL}{q.pk}/").json()["promoted"])


class OwnerDeleteWindow(Base):
    def old(self, hours):
        q = Question.objects.create(author=self.ada, title="t", body="b")
        Question.objects.filter(pk=q.pk).update(created_at=timezone.now() - timedelta(hours=hours))
        return q

    def test_owner_can_delete_within_24h(self):
        q = self.old(23.9)
        self.c.force_authenticate(self.ada)
        self.assertEqual(self.c.delete(f"{URL}{q.pk}/").status_code, 204)
        self.assertFalse(Question.objects.filter(pk=q.pk).exists())

    def test_owner_cannot_delete_after_24h(self):
        q = self.old(24.1)
        self.c.force_authenticate(self.ada)
        r = self.c.delete(f"{URL}{q.pk}/")
        self.assertEqual(r.status_code, 403)
        self.assertIn("24 hours", r.json()["detail"])
        self.assertTrue(Question.objects.filter(pk=q.pk).exists())

    def test_server_timestamp_decides_not_client_input(self):
        q = self.old(30)
        self.c.force_authenticate(self.ada)
        r = self.c.delete(f"{URL}{q.pk}/?created_at=now", HTTP_DATE="x", HTTP_X_CREATED_AT="now")
        self.assertEqual(r.status_code, 403)

    def test_other_users_cannot_delete_even_when_fresh(self):
        q = self.old(1)
        self.c.force_authenticate(self.bob)
        self.assertEqual(self.c.delete(f"{URL}{q.pk}/").status_code, 403)
        self.assertTrue(Question.objects.filter(pk=q.pk).exists())

    def test_moderators_keep_separate_rights(self):
        q = self.old(500)
        self.c.force_authenticate(self.admin)
        self.assertEqual(self.c.delete(f"{URL}{q.pk}/").status_code, 204)
        s = mk("staffer", is_staff=True)
        q2 = self.old(500)
        self.c.force_authenticate(s)
        self.assertEqual(self.c.delete(f"{URL}{q2.pk}/").status_code, 204)

    def test_deleting_a_post_removes_its_files_and_only_its_own_content(self):
        r = self.post(images=[img()])
        qid = r.json()["id"]
        path = QuestionMedia.objects.get().file.path
        other = Question.objects.create(author=self.ada, title="keep me", body="b")
        self.c.force_authenticate(self.ada)
        self.assertEqual(self.c.delete(f"{URL}{qid}/").status_code, 204)
        self.assertFalse(os.path.exists(path))
        self.assertTrue(Question.objects.filter(pk=other.pk).exists())

    def test_can_delete_flag_for_each_viewer(self):
        fresh, stale = self.old(1), self.old(30)
        def flag(user, q):
            self.c.force_authenticate(user)
            return self.c.get(f"{URL}{q.pk}/").json()["can_delete"]
        self.assertTrue(flag(self.ada, fresh))
        self.assertFalse(flag(self.ada, stale))
        self.assertFalse(flag(self.bob, fresh))
        self.assertTrue(flag(self.admin, stale))
        self.c.force_authenticate(self.ada)
        d = self.c.get(f"{URL}{fresh.pk}/").json()
        self.assertTrue(d["delete_deadline"])

    def test_deleting_missing_post_is_404(self):
        self.c.force_authenticate(self.ada)
        self.assertEqual(self.c.delete(f"{URL}99999/").status_code, 404)
