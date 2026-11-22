from rest_framework import generics, permissions

from .models import Department
from .serializers import DepartmentSerializer


class DepartmentListView(generics.ListAPIView):
    """GET /api/departments/ — powers DEPTS everywhere in the frontend."""

    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None
