"""
Seeds the database with demo data matching the shapes the frontend
mock data (DEPTS, STAFF, QUESTIONS, MEDIA_POSTS...) originally used.

Usage:
    python manage.py seed_demo
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from departments.models import Department
from media_app.models import MediaPost
from notifications.models import Notification
from questions.models import Answer, Question, Tag

User = get_user_model()

DEPTS = [
    ("Computer Science", "#3B82F6"),
    ("Electrical Engineering", "#8B5CF6"),
    ("Mechanical Engineering", "#F97316"),
    ("Mathematics", "#10B981"),
    ("Physics", "#06B6D4"),
    ("Agriculture", "#84CC16"),
    ("Business Administration", "#EC4899"),
    ("Medicine", "#EF4444"),
]

STAFF = [
    dict(username="s.ibrahim", first="Sarah", last="Ibrahim", email="s.ibrahim@atbu.edu.ng",
         title="Senior Lecturer", dept="Computer Science", bio="Researches distributed systems and teaches CSC301/CSC405.", bg="#8B5CF6"),
    dict(username="b.aliyu", first="Bala", last="Aliyu", email="b.aliyu@atbu.edu.ng",
         title="Lecturer I", dept="Electrical Engineering", bio="Power systems specialist, coordinates final year projects.", bg="#3B82F6"),
    dict(username="f.suleiman", first="Fatima", last="Suleiman", email="f.suleiman@atbu.edu.ng",
         title="Professor", dept="Mathematics", bio="20+ years teaching real analysis and numerical methods.", bg="#10B981"),
]

QUESTIONS = [
    dict(user="Ahmed Musa", dept="Mathematics", title="Best way to prepare for MTH201 exam?",
         body="I have my MTH201 exam in two weeks and I'm struggling with sequences and series. "
              "Does anyone have past questions or study tips that worked for them?",
         tags=["MTH201", "Exams", "Study Tips"]),
    dict(user="Grace Okoro", dept="Computer Science", title="Recommended textbook for CSC301 - Operating Systems?",
         body="The course outline lists a few options but I want to know which one lecturers "
              "actually reference in the exam. Any recommendations from those who took it recently?",
         tags=["CSC301", "Operating Systems", "Textbooks"]),
    dict(user="Ibrahim Yakubu", dept="Electrical Engineering", title="Difference between Lecturer I and Lecturer II?",
         body="Just curious about the academic ranking structure at ATBU and how it affects who "
              "teaches which courses in the department.",
         tags=["Careers", "Academic Structure"]),
]

MEDIA_CAPTIONS = [
    "Matriculation day for the 2026 set! 🎓",
    "Late night reading room energy before finals.",
    "Faculty of Computing hackathon winners.",
    "Convocation lecture hall, packed as always.",
]


class Command(BaseCommand):
    help = "Populate the database with demo departments, staff, questions and media."

    def handle(self, *args, **options):
        self.stdout.write("Seeding departments...")
        dept_objs = {}
        for i, (name, color) in enumerate(DEPTS):
            dept, _ = Department.objects.get_or_create(name=name, defaults={"color": color, "order": i})
            dept_objs[name] = dept

        self.stdout.write("Seeding staff users...")
        staff_users = []
        for s in STAFF:
            user, created = User.objects.get_or_create(
                username=s["username"],
                defaults=dict(
                    email=s["email"], first_name=s["first"], last_name=s["last"],
                    role=User.Role.STAFF, is_verified_staff=True, title=s["title"],
                    department=dept_objs[s["dept"]], bio=s["bio"], avatar_bg=s["bg"],
                    is_online=True,
                ),
            )
            if created:
                user.set_password("password123")
                user.save()
            staff_users.append(user)

        self.stdout.write("Seeding a demo student...")
        student, created = User.objects.get_or_create(
            username="a.yusuf",
            defaults=dict(
                email="amina@student.atbu.edu.ng", first_name="Amina", last_name="Yusuf",
                role=User.Role.STUDENT, department=dept_objs["Computer Science"],
                matric_number="U22CS0001", level="300 Level", avatar_bg="#EAB308",
            ),
        )
        if created:
            student.set_password("password123")
            student.save()

        self.stdout.write("Seeding questions + answers...")
        for q in QUESTIONS:
            question, created = Question.objects.get_or_create(
                title=q["title"],
                defaults=dict(
                    author=student, department=dept_objs[q["dept"]], body=q["body"], views=120,
                ),
            )
            if created:
                for t in q["tags"]:
                    tag, _ = Tag.objects.get_or_create(name=t)
                    question.tags.add(tag)
                Answer.objects.create(
                    question=question, author=staff_users[0],
                    body="Great question — check the course outline and past questions in the "
                         "faculty library, and don't skip tutorials; that's usually where exam hints show up.",
                )

        self.stdout.write("Seeding media posts...")
        for i, caption in enumerate(MEDIA_CAPTIONS):
            MediaPost.objects.get_or_create(
                caption=caption,
                defaults=dict(author=staff_users[i % len(staff_users)], type=MediaPost.Type.PHOTO),
            )

        self.stdout.write("Seeding a welcome notification for the demo student...")
        Notification.objects.get_or_create(
            user=student, text="Welcome to ATBUConnect! Ask your first question to get started.",
            defaults=dict(type=Notification.Type.SYSTEM),
        )

        self.stdout.write(self.style.SUCCESS("Done. Demo login: username=a.yusuf / password=password123"))
