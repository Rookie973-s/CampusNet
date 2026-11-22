import io, os, sys
from datetime import timedelta
sys.path.insert(0, "/home/claude/server")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django; django.setup()
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.utils import timezone
from PIL import Image
from pypdf import PdfWriter

call_command("migrate", verbosity=0)
from accounts.models import User, Follow
from departments.models import Department
from library.models import AcademicDepartment, ClassRepresentative, Course, Document
from questions.models import Answer, Question, QuestionMedia, Tag
from staffapp.models import StaffApplication
from notifications.models import Notification

for M in (Notification, StaffApplication, Document, Course, ClassRepresentative, AcademicDepartment, QuestionMedia, Answer, Question, Follow, Tag, User, Department):
    M.objects.all().delete()

PW = "pw12345!x"
dep = {n: Department.objects.create(name=n, color=c, order=i) for i, (n, c) in enumerate([("Computing", "#6366F1"), ("Engineering", "#3B82F6"), ("Sciences", "#10B981"), ("Law", "#F59E0B"), ("Medicine", "#EF4444")])}
def user(u, **kw):
    x = User(username=u, email=f"{u}@x.edu", **kw); x.set_password(PW); x.save(); return x
plain = user("plain", first_name="Plain", last_name="Student", department=dep["Computing"], matric_number="U22CS0003", level="200 Level", bio="Loves algorithms")
rep = user("rep", first_name="Rita", last_name="Rep", department=dep["Sciences"], matric_number="U22BC0001", level="100 Level")
staffer = user("lecturer", first_name="Dr", last_name="Lee", role="staff", is_verified_staff=True, title="Senior Lecturer", department=dep["Computing"], phone="08011112222")
admin = user("boss", first_name="Ada", last_name="Min", role="admin", is_staff=True, is_superuser=True)
other = user("other", first_name="Olu", last_name="Other", department=dep["Engineering"])

bio = AcademicDepartment.objects.create(faculty=dep["Sciences"], name="Biochemistry")
phy = AcademicDepartment.objects.create(faculty=dep["Sciences"], name="Physics")
mech = AcademicDepartment.objects.create(faculty=dep["Engineering"], name="Mechanical")
cs = AcademicDepartment.objects.create(faculty=dep["Computing"], name="Computer Science")
ClassRepresentative.objects.create(user=rep, academic_department=bio, level=100, granted_by=admin)
courses = {c: Course.objects.create(academic_department=d, code=c, title=t, level=l) for c, d, t, l in [
    ("BIO 111", bio, "General Biology", 100), ("BIO 112", bio, "Cell Biology", 100), ("BIO 211", bio, "Genetics", 200),
    ("PHY 101", phy, "Mechanics", 100), ("MEE 101", mech, "Drawing", 100), ("CSC 201", cs, "Data Structures", 200)]}

w = PdfWriter(); w.add_blank_page(width=300, height=200); b = io.BytesIO(); w.write(b); PDF = b.getvalue()
for code, titles in {"BIO 111": ["BIO 111 Lecture 1", "BIO 111 Past Questions"], "BIO 112": ["Cell notes"], "BIO 211": ["Genetics notes"], "PHY 101": ["PHY 101 notes"], "MEE 101": ["Drawing basics"], "CSC 201": ["Trees and graphs"]}.items():
    for t in titles:
        d = Document(course=courses[code], title=t, description="seed", original_name=t.replace(" ", "_") + ".pdf", size_bytes=len(PDF), uploaded_by=rep if code.startswith("BIO") else admin)
        d.file.save("x.pdf", ContentFile(PDF), save=False); d.save()

def q(author, title, body, hrs=1, dept="Computing", **kw):
    x = Question.objects.create(author=author, title=title, body=body, department=dep[dept], **kw)
    Question.objects.filter(pk=x.pk).update(created_at=timezone.now() - timedelta(hours=hrs)); return x
fresh = q(plain, "How do I implement a binary search tree?", "I keep getting stuck on deletion. Any pointers on the three cases?", 1)
stale = q(plain, "An old question from last week", "This one is older than a day so it cannot be deleted by me.", 30)
promo = q(other, "Registration deadline extended?", "Has the SUG announced the new date?", 2, "Engineering", is_promoted=True)
withimg = q(other, "What is this circuit diagram showing?", "Attached a photo of the diagram from class.", 3, "Engineering")
buf = io.BytesIO(); Image.new("RGB", (640, 400), (30, 90, 200)).save(buf, "PNG")
QuestionMedia.objects.create(question=withimg, kind="image", width=640, height=400, size_bytes=len(buf.getvalue())).file.save("a.png", ContentFile(buf.getvalue()), save=True)
answered = q(staffer, "Study tips for CSC 201?", "Looking for ways to prepare for the exam.", 5)
Answer.objects.create(question=answered, author=other, body="Practice past questions every day.")
Answer.objects.create(question=fresh, author=plain, body="Start by drawing the tree.")
Tag.objects.get_or_create(name="CSC201")
print("seeded", {k: v for k, v in dict(users=User.objects.count(), questions=Question.objects.count(), docs=Document.objects.count()).items()})
