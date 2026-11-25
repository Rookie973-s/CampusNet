import os

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from config.testutils import MIN_PDF, IsolatedStorage, png_bytes
from departments.models import Department
from library.models import AcademicDepartment, ClassRepresentative, Course, Document
from library.permissions import can_upload


def mk(username, **kw):
    return User.objects.create(username=username, email=f"{username}@x.edu", **kw)


def pdf(name="notes.pdf", data=MIN_PDF):
    return SimpleUploadedFile(name, data, content_type="application/pdf")


class Base(IsolatedStorage, TestCase):
    def setUp(self):
        cache.clear()
        self.sci = Department.objects.create(name="Sciences")
        self.eng = Department.objects.create(name="Engineering")
        self.bio = AcademicDepartment.objects.create(faculty=self.sci, name="Biochemistry")
        self.phy = AcademicDepartment.objects.create(faculty=self.sci, name="Physics")
        self.mech = AcademicDepartment.objects.create(faculty=self.eng, name="Mechanical")
        self.bio111 = Course.objects.create(academic_department=self.bio, code="bio 111", title="General Biology", level=100)
        self.bio112 = Course.objects.create(academic_department=self.bio, code="BIO 112", title="Cell Biology", level=100)
        self.bio211 = Course.objects.create(academic_department=self.bio, code="BIO 211", title="Genetics", level=200)
        self.phy101 = Course.objects.create(academic_department=self.phy, code="PHY 101", title="Mechanics", level=100)
        self.mec101 = Course.objects.create(academic_department=self.mech, code="MEE 101", title="Drawing", level=100)
        self.rep = mk("rep")  # 100L Biochemistry class rep
        ClassRepresentative.objects.create(user=self.rep, academic_department=self.bio, level=100)
        self.rep200 = mk("rep200")
        ClassRepresentative.objects.create(user=self.rep200, academic_department=self.bio, level=200)
        self.student = mk("student")
        self.admin = User.objects.create_superuser("root", "root@x.edu", "x")
        self.c = APIClient()

    def upload(self, user, course=None, **over):
        self.c.force_authenticate(user)
        data = {"title": "Past Questions 2024", "course": (course or self.bio111).pk, "description": "d", "file": pdf()}
        data.update(over)
        return self.c.post("/api/library/documents/", data, format="multipart")


class ClassRepAuthorization(Base):
    def test_guest_cannot_upload(self):
        self.c.force_authenticate(None)
        r = self.c.post("/api/library/documents/", {"title": "x" * 5, "course": self.bio111.pk, "file": pdf()}, format="multipart")
        self.assertEqual(r.status_code, 401)

    def test_ordinary_student_rejected_on_direct_api_call(self):
        r = self.upload(self.student)
        self.assertEqual(r.status_code, 403)
        self.assertEqual(Document.objects.count(), 0)

    def test_class_rep_can_upload_to_own_class(self):
        r = self.upload(self.rep)
        self.assertEqual(r.status_code, 201, r.content)
        d = r.json()
        self.assertEqual((d["course_code"], d["level"], d["faculty_name"], d["department_name"]), ("BIO 111", 100, "Sciences", "Biochemistry"))
        self.assertEqual(Document.objects.get().uploaded_by, self.rep)

    def test_rep_scope_is_enforced_per_level_and_per_department(self):
        self.assertEqual(self.upload(self.rep, self.bio211).status_code, 400)   # other level
        self.assertEqual(self.upload(self.rep, self.phy101).status_code, 400)   # other department
        self.assertEqual(self.upload(self.rep, self.mec101).status_code, 400)   # other faculty
        self.assertEqual(self.upload(self.rep200, self.bio111).status_code, 400)
        self.assertEqual(Document.objects.count(), 0)

    def test_cannot_self_grant_through_request_fields(self):
        r = self.upload(self.student, is_class_rep="true", class_rep="1", uploaded_by=self.rep.pk)
        self.assertEqual(r.status_code, 403)

    def test_revoked_rep_loses_access(self):
        ClassRepresentative.objects.filter(user=self.rep).update(active=False)
        self.assertEqual(self.upload(self.rep).status_code, 403)
        self.assertFalse(can_upload(self.rep))

    def test_inactive_user_denied(self):
        self.rep.is_active = False
        self.rep.save()
        self.assertFalse(can_upload(self.rep))

    def test_nobody_is_a_rep_by_default(self):
        self.assertFalse(can_upload(mk("fresh")))
        self.assertFalse(can_upload(None))

    def test_permissions_endpoint(self):
        self.c.force_authenticate(None)
        self.assertEqual(self.c.get("/api/library/permissions/").json(), {"can_upload": False, "scope": None})
        self.c.force_authenticate(self.student)
        self.assertFalse(self.c.get("/api/library/permissions/").json()["can_upload"])
        self.c.force_authenticate(self.rep)
        d = self.c.get("/api/library/permissions/").json()
        self.assertTrue(d["can_upload"])
        self.assertEqual((d["scope"]["level"], d["scope"]["department_name"], d["scope"]["faculty_name"]), (100, "Biochemistry", "Sciences"))

    def test_rep_can_add_a_course_only_for_own_class(self):
        self.c.force_authenticate(self.rep)
        ok = self.c.post("/api/library/courses/", {"code": "bio 113", "title": "Lab", "level": 100, "department": self.bio.pk}, format="json")
        self.assertEqual(ok.status_code, 201, ok.content)
        self.assertEqual(ok.json()["code"], "BIO 113")
        for bad in ({"level": 200, "department": self.bio.pk}, {"level": 100, "department": self.phy.pk}):
            r = self.c.post("/api/library/courses/", {"code": "X 1", "title": "", **bad}, format="json")
            self.assertEqual(r.status_code, 400)
        self.c.force_authenticate(self.student)
        self.assertEqual(self.c.post("/api/library/courses/", {"code": "Z 1", "level": 100, "department": self.bio.pk}, format="json").status_code, 403)

    def test_duplicate_course_code_rejected(self):
        self.c.force_authenticate(self.rep)
        r = self.c.post("/api/library/courses/", {"code": "BIO 111", "title": "dup", "level": 100, "department": self.bio.pk}, format="json")
        self.assertEqual(r.status_code, 400)


class PdfValidation(Base):
    def test_rejects_images_and_videos(self):
        self.assertEqual(self.upload(self.rep, file=SimpleUploadedFile("p.png", png_bytes(), content_type="image/png")).status_code, 400)
        self.assertEqual(self.upload(self.rep, file=SimpleUploadedFile("v.mp4", b"\x00\x00\x00\x18ftypmp42", content_type="video/mp4")).status_code, 400)

    def test_rejects_executable_and_html_renamed_to_pdf(self):
        r = self.upload(self.rep, file=pdf("a.pdf", b"MZ\x90\x00" + b"\x00" * 200))
        self.assertEqual(r.status_code, 400)
        self.assertIn("not a valid pdf", str(r.json()["file"]).lower())
        self.assertEqual(self.upload(self.rep, file=pdf("a.pdf", b"<html><script>1</script></html>")).status_code, 400)

    def test_rejects_wrong_extension_empty_truncated_and_oversize(self):
        self.assertEqual(self.upload(self.rep, file=pdf("notes.exe")).status_code, 400)
        self.assertEqual(self.upload(self.rep, file=pdf("e.pdf", b"")).status_code, 400)
        self.assertEqual(self.upload(self.rep, file=pdf("t.pdf", MIN_PDF[:-20])).status_code, 400)
        with override_settings(LIBRARY_MAX_PDF_BYTES=100):
            r = self.upload(self.rep, file=pdf())
        self.assertEqual(r.status_code, 400)
        self.assertIn("too large", str(r.json()["file"]).lower())

    def test_flags_javascript_and_obfuscated_names_with_warnings(self):
        evil = MIN_PDF.replace(b"/Type/Catalog", b"/Type/Catalog/OpenAction<</S/JavaScript/JS(app.alert(1))>>")
        r1 = self.upload(self.rep, file=pdf("js.pdf", evil))
        self.assertEqual(r1.status_code, 201)
        self.assertTrue(r1.json()["is_flagged"])
        self.assertTrue(len(r1.json()["security_warnings"]) >= 1)
        obf = MIN_PDF.replace(b"/Type/Catalog", b"/Type/Catalog/J#61vaScript 1")
        r2 = self.upload(self.rep, file=pdf("o.pdf", obf))
        self.assertEqual(r2.status_code, 201)
        self.assertTrue(r2.json()["is_flagged"])

    def test_storage_name_is_random_original_name_sanitised(self):
        r = self.upload(self.rep, file=pdf("../../etc/passwd\x00.pdf"))
        self.assertEqual(r.status_code, 201, r.content)
        d = Document.objects.get()
        self.assertRegex(d.file.name, r"^library/pdfs/[0-9a-f]{32}\.pdf$")
        self.assertNotIn("/", d.original_name)
        self.assertNotIn("..", d.original_name)

    def test_title_validation(self):
        self.assertEqual(self.upload(self.rep, title="ab").status_code, 400)
        self.c.force_authenticate(self.rep)
        self.assertEqual(self.c.post("/api/library/documents/", {"course": self.bio111.pk}, format="multipart").status_code, 400)


class BrowsingAndFolders(Base):
    def setUp(self):
        super().setUp()
        for user, course, title in [(self.rep, self.bio111, "BIO111 Lecture 1"), (self.rep, self.bio111, "BIO111 Past Q"),
                                    (self.rep, self.bio112, "Cell notes"), (self.rep200, self.bio211, "Genetics notes")]:
            r = self.upload(user, course, title=title, file=pdf(f"{title}.pdf"))
            self.assertEqual(r.status_code, 201, r.content)
        for course in (self.phy101, self.mec101):
            Document.objects.create(course=course, title=f"{course.code} notes", file="library/pdfs/x.pdf", uploaded_by=self.admin)
        self.c.force_authenticate(self.student)

    def folders(self, qs=""):
        r = self.c.get(f"/api/library/folders/{qs}")
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def codes(self, qs=""):
        return [f["code"] for f in self.folders(qs)["results"]]

    def test_guests_cannot_browse_folders_catalog_documents(self):
        guest = APIClient()
        for url in ("/api/library/folders/", "/api/library/catalog/", "/api/library/documents/", "/api/library/courses/"):
            self.assertEqual(guest.get(url).status_code, 401, url)

    def test_default_view_lists_real_courses_with_counts_and_previews(self):
        by = {f["code"]: f for f in self.folders()["results"]}
        self.assertEqual(set(by), {"BIO 111", "BIO 112", "BIO 211", "PHY 101", "MEE 101"})
        self.assertEqual(by["BIO 111"]["document_count"], 2)
        self.assertEqual(sorted(p["title"] for p in by["BIO 111"]["previews"]), ["BIO111 Lecture 1", "BIO111 Past Q"])
        self.assertEqual((by["BIO 111"]["faculty_name"], by["BIO 111"]["department_name"], by["BIO 111"]["title"]), ("Sciences", "Biochemistry", "General Biology"))

    def test_courses_without_documents_are_not_shown(self):
        Course.objects.create(academic_department=self.bio, code="BIO 999", title="Empty", level=300)
        self.assertNotIn("BIO 999", self.codes())

    def test_filters_combine(self):
        self.assertEqual(sorted(self.codes("?level=100")), ["BIO 111", "BIO 112", "MEE 101", "PHY 101"])
        self.assertEqual(sorted(self.codes(f"?level=100&faculty={self.sci.pk}")), ["BIO 111", "BIO 112", "PHY 101"])
        self.assertEqual(sorted(self.codes(f"?level=100&faculty={self.sci.pk}&department={self.bio.pk}")), ["BIO 111", "BIO 112"])
        self.assertEqual(self.codes(f"?level=200&faculty={self.sci.pk}&department={self.bio.pk}"), ["BIO 211"])
        self.assertEqual(self.codes(f"?level=200&department={self.phy.pk}"), [])

    def test_mismatched_parent_child_returns_nothing_instead_of_leaking(self):
        self.assertEqual(self.codes(f"?faculty={self.eng.pk}&department={self.bio.pk}"), [])

    def test_search_matches_code_title_or_document_title(self):
        self.assertEqual(self.codes("?q=bio 111"), ["BIO 111"])
        self.assertEqual(self.codes("?q=genetics"), ["BIO 211"])
        self.assertEqual(self.codes("?q=Past Q"), ["BIO 111"])
        self.assertEqual(self.codes("?q=zzzz"), [])
        self.assertEqual(self.codes(f"?q=notes&level=200"), ["BIO 211"])

    def test_garbage_filters_are_safe(self):
        self.assertEqual(self.codes("?level=abc"), [])
        self.assertEqual(self.codes("?faculty=x"), [])

    def test_folder_pagination(self):
        with override_settings(LIBRARY_PAGE_SIZE=2):
            d = self.folders()
            self.assertEqual((len(d["results"]), d["count"]), (2, 5))
            self.assertIsNotNone(d["next"])
            self.assertEqual(len(self.folders("?page=3")["results"]), 1)

    def test_documents_filter_by_course_and_levels(self):
        r = self.c.get(f"/api/library/documents/?course={self.bio111.pk}").json()
        self.assertEqual(r["count"], 2)
        r = self.c.get(f"/api/library/documents/?level=100&faculty={self.sci.pk}&department={self.bio.pk}").json()
        self.assertEqual(r["count"], 3)

    def test_catalog_uses_real_faculties_and_departments(self):
        d = self.c.get("/api/library/catalog/").json()
        names = {f["name"]: sorted(x["name"] for x in f["departments"]) for f in d["faculties"]}
        self.assertEqual(names, {"Sciences": ["Biochemistry", "Physics"], "Engineering": ["Mechanical"]})
        self.assertEqual(d["levels"], [100, 200, 300, 400, 500])

    def test_browsing_can_be_made_login_only(self):
        guest = APIClient()
        with override_settings(LIBRARY_REQUIRE_LOGIN_TO_BROWSE=True):
            for url in ("/api/library/folders/", "/api/library/catalog/", "/api/library/documents/"):
                self.assertEqual(guest.get(url).status_code, 401, url)


class FileAccessAndManagement(Base):
    def setUp(self):
        super().setUp()
        self.doc_id = self.upload(self.rep).json()["id"]
        self.c.force_authenticate(None)

    def test_guest_cannot_list_or_open_the_file(self):
        self.assertEqual(self.c.get("/api/library/documents/").status_code, 401)
        self.assertEqual(self.c.get(f"/api/library/documents/{self.doc_id}/file/").status_code, 401)
        self.assertEqual(self.c.get(f"/api/library/documents/{self.doc_id}/file/?download=1").status_code, 401)

    def test_signed_in_user_gets_the_exact_pdf_with_safe_headers(self):
        self.c.force_authenticate(self.student)
        r = self.c.get(f"/api/library/documents/{self.doc_id}/file/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(b"".join(r.streaming_content), MIN_PDF)
        self.assertEqual((r["Content-Type"], r["X-Content-Type-Options"]), ("application/pdf", "nosniff"))
        self.assertIn("sandbox", r["Content-Security-Policy"])
        self.assertNotIn("attachment", r.get("Content-Disposition", ""))
        d = self.c.get(f"/api/library/documents/{self.doc_id}/file/?download=1")
        self.assertIn("attachment", d["Content-Disposition"])
        self.assertIn("notes.pdf", d["Content-Disposition"])

    def test_download_can_be_made_public(self):
        with override_settings(LIBRARY_REQUIRE_LOGIN_TO_BROWSE=False, LIBRARY_REQUIRE_LOGIN_TO_DOWNLOAD=False):
            self.assertEqual(self.c.get(f"/api/library/documents/{self.doc_id}/file/").status_code, 200)

    def test_storage_path_never_in_api_and_not_under_media(self):
        self.c.force_authenticate(self.student)
        raw = self.c.get(f"/api/library/documents/{self.doc_id}/").content.decode()
        doc = Document.objects.get()
        self.assertNotIn("library/pdfs", raw)
        from django.conf import settings
        self.assertFalse(os.path.abspath(doc.file.path).startswith(os.path.abspath(settings.MEDIA_ROOT)))

    def test_persisted_and_retrievable_after_a_fresh_request(self):
        doc = Document.objects.get()
        self.assertTrue(os.path.exists(doc.file.path))
        self.assertEqual(open(doc.file.path, "rb").read(), MIN_PDF)
        self.assertEqual(doc.size_bytes, len(MIN_PDF))

    def test_missing_file_is_a_404_not_a_crash(self):
        doc = Document.objects.get()
        os.remove(doc.file.path)
        self.c.force_authenticate(self.student)
        self.assertEqual(self.c.get(f"/api/library/documents/{self.doc_id}/file/").status_code, 404)

    def test_only_owner_rep_or_admin_can_delete_or_edit(self):
        for user in (self.student, self.rep200):
            self.c.force_authenticate(user)
            self.assertEqual(self.c.delete(f"/api/library/documents/{self.doc_id}/").status_code, 403)
            self.assertEqual(self.c.patch(f"/api/library/documents/{self.doc_id}/", {"title": "hax"}, format="json").status_code, 403)
        self.assertTrue(Document.objects.filter(pk=self.doc_id).exists())

    def test_owner_edits_metadata_only(self):
        self.c.force_authenticate(self.rep)
        r = self.c.patch(f"/api/library/documents/{self.doc_id}/", {"title": "Renamed title", "course": self.bio211.pk, "uploaded_by": self.student.pk}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        doc = Document.objects.get()
        self.assertEqual((doc.title, doc.course, doc.uploaded_by), ("Renamed title", self.bio111, self.rep))

    def test_owner_who_lost_rep_status_cannot_delete(self):
        ClassRepresentative.objects.filter(user=self.rep).update(active=False)
        self.c.force_authenticate(self.rep)
        self.assertEqual(self.c.delete(f"/api/library/documents/{self.doc_id}/").status_code, 403)

    def test_owner_and_admin_can_delete(self):
        self.c.force_authenticate(self.rep)
        self.assertEqual(self.c.delete(f"/api/library/documents/{self.doc_id}/").status_code, 204)
        d2 = self.upload(self.rep).json()["id"]
        self.c.force_authenticate(self.admin)
        self.assertEqual(self.c.delete(f"/api/library/documents/{d2}/").status_code, 204)

    def test_no_replace_via_put(self):
        self.c.force_authenticate(self.rep)
        self.assertEqual(self.c.put(f"/api/library/documents/{self.doc_id}/", {"title": "x"}, format="json").status_code, 405)

    def test_mine_filter(self):
        self.c.force_authenticate(self.rep)
        self.assertEqual(self.c.get("/api/library/documents/?mine=1").json()["count"], 1)
        self.c.force_authenticate(self.student)
        self.assertEqual(self.c.get("/api/library/documents/?mine=1").json()["count"], 0)

    def test_course_with_documents_cannot_be_deleted_by_cascade(self):
        from django.db.models import ProtectedError
        with self.assertRaises(ProtectedError):
            self.bio111.delete()
