from django.db.models import Count, Q
from django.http import FileResponse, Http404
from rest_framework import parsers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from departments.models import Department

from . import conf
from .models import AcademicDepartment, Course, Document
from .permissions import LibraryPermission, get_rep
from .serializers import CourseSerializer, DocumentSerializer


class LibraryPagination(PageNumberPagination):
    page_size_query_param = None

    def get_page_size(self, request):
        return conf.PAGE_SIZE()


def _int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _apply_course_filters(qs, params, prefix=""):
    """Level / faculty / department / course filters. `prefix` is the path to the Course
    ('' when qs is Course, 'course__' when qs is Document). A non-numeric value matches nothing."""
    fields = {"level": "level", "faculty": "academic_department__faculty_id",
              "department": "academic_department_id", "course": "id"}
    for key, field in fields.items():
        raw = params.get(key)
        if raw:
            val = _int(raw)
            if val is None:
                return qs.none()
            qs = qs.filter(**{f"{prefix}{field}": val})
    return qs


class CourseViewSet(viewsets.ModelViewSet):
    """Courses (the folders). Browsable by anyone; only a class rep can add one, and only for their own class."""

    serializer_class = CourseSerializer
    permission_classes = [LibraryPermission]
    pagination_class = None
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = Course.objects.select_related("academic_department__faculty")
        return _apply_course_filters(qs, self.request.query_params)


class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentSerializer
    permission_classes = [LibraryPermission]
    pagination_class = LibraryPagination
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = Document.objects.select_related("course__academic_department__faculty", "uploaded_by")
        p = self.request.query_params
        qs = _apply_course_filters(qs, p, prefix="course__")
        q = (p.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(description__icontains=q) | Q(original_name__icontains=q)
                           | Q(course__code__icontains=q) | Q(course__title__icontains=q))
        if p.get("mine") and getattr(self.request.user, "is_authenticated", False):
            qs = qs.filter(uploaded_by=self.request.user)
        return qs

    @action(detail=True, methods=["get"], url_path="file")
    def file(self, request, pk=None):
        """Authenticated streaming; the storage path is never exposed publicly."""
        if conf.REQUIRE_LOGIN_TO_DOWNLOAD() and not getattr(request.user, "is_authenticated", False):
            return Response({"detail": "Sign in to open this document."}, status=status.HTTP_401_UNAUTHORIZED)
        doc = self.get_object()
        try:
            fh = doc.file.open("rb")
        except FileNotFoundError:
            raise Http404("File missing")
        download = request.query_params.get("download") == "1"
        resp = FileResponse(fh, content_type="application/pdf", as_attachment=download,
                            filename=doc.original_name or f"document-{doc.pk}.pdf")
        resp["X-Content-Type-Options"] = "nosniff"
        resp["Content-Security-Policy"] = "sandbox; default-src 'none'"
        resp["Cache-Control"] = "private, max-age=0, must-revalidate"
        return resp


@api_view(["GET"])
@permission_classes([AllowAny])
def folders(request):
    """Course folders for the library home: each course that has documents, with a few previews.

    Filters: level, faculty, department, q (course code/title or document title)."""
    if conf.REQUIRE_LOGIN_TO_BROWSE() and not getattr(request.user, "is_authenticated", False):
        return Response({"detail": "Authentication credentials were not provided."}, status=401)
    p = request.query_params
    qs = Course.objects.select_related("academic_department__faculty")
    qs = _apply_course_filters(qs, p)
    q = (p.get("q") or "").strip()
    doc_filter = Q()
    if q:
        doc_filter = (Q(documents__title__icontains=q) | Q(documents__description__icontains=q))
        qs = qs.filter(Q(code__icontains=q) | Q(title__icontains=q) | doc_filter).distinct()
    qs = qs.annotate(n_docs=Count("documents", distinct=True)).filter(n_docs__gt=0).order_by("level", "code")

    paginator = LibraryPagination()
    page = paginator.paginate_queryset(qs, request)
    out = []
    for c in page:
        previews = list(c.documents.values("id", "title")[:3])
        out.append({
            "id": c.id, "code": c.code, "title": c.title, "level": c.level,
            "faculty": c.academic_department.faculty_id, "faculty_name": c.academic_department.faculty.name,
            "department": c.academic_department_id, "department_name": c.academic_department.name,
            "document_count": c.n_docs, "previews": previews,
        })
    return paginator.get_paginated_response(out)


@api_view(["GET"])
@permission_classes([AllowAny])
def catalog(request):
    """Levels -> faculties -> departments for the filter dropdowns (real rows only)."""
    if conf.REQUIRE_LOGIN_TO_BROWSE() and not getattr(request.user, "is_authenticated", False):
        return Response({"detail": "Authentication credentials were not provided."}, status=401)
    by_faculty = {}
    for d in AcademicDepartment.objects.order_by("name"):
        by_faculty.setdefault(d.faculty_id, []).append({"id": d.pk, "name": d.name})
    return Response({
        "levels": conf.LEVELS(),
        "faculties": [{"id": f.pk, "name": f.name, "departments": by_faculty.get(f.pk, [])}
                      for f in Department.objects.all()],
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def my_permissions(request):
    """Guests get can_upload=false (not an error) so the UI can simply hide the button."""
    rep = get_rep(request.user)
    if not rep:
        return Response({"can_upload": False, "scope": None})
    return Response({"can_upload": True, "scope": {
        "level": rep.level,
        "faculty": rep.academic_department.faculty_id,
        "faculty_name": rep.academic_department.faculty.name,
        "department": rep.academic_department_id,
        "department_name": rep.academic_department.name,
    }})
