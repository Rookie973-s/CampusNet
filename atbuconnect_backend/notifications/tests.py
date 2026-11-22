from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from notifications.models import Notification


class NotificationAccess(TestCase):
    def setUp(self):
        self.a = User.objects.create(username="a", email="a@x.edu")
        self.b = User.objects.create(username="b", email="b@x.edu")
        Notification.objects.create(user=self.a, text="for a")
        Notification.objects.create(user=self.a, text="for a 2", read=True)
        Notification.objects.create(user=self.b, text="for b")

    def test_guests_never_see_notifications(self):
        c = APIClient()
        for url in ("/api/notifications/", "/api/notifications/unread_count/"):
            self.assertEqual(c.get(url).status_code, 401)
        self.assertEqual(c.post("/api/notifications/mark_all_read/").status_code, 401)

    def test_user_sees_only_their_own(self):
        c = APIClient()
        c.force_authenticate(self.a)
        rows = c.get("/api/notifications/").json()
        rows = rows["results"] if isinstance(rows, dict) else rows
        self.assertEqual({r["text"] for r in rows}, {"for a", "for a 2"})

    def test_unread_count_and_mark_read(self):
        c = APIClient()
        c.force_authenticate(self.a)
        self.assertEqual(c.get("/api/notifications/unread_count/").json(), {"unread": 1})
        c.post("/api/notifications/mark_all_read/")
        self.assertEqual(c.get("/api/notifications/unread_count/").json(), {"unread": 0})
        self.assertEqual(Notification.objects.get(user=self.b).read, False)

    def test_cannot_mark_someone_elses_notification(self):
        c = APIClient()
        c.force_authenticate(self.a)
        nid = Notification.objects.get(user=self.b).pk
        self.assertEqual(c.post(f"/api/notifications/{nid}/read/").status_code, 404)
