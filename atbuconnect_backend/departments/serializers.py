from rest_framework import serializers

from .models import Department


class DepartmentSerializer(serializers.ModelSerializer):
    sub_departments = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = ["id", "name", "color", "count", "sub_departments"]

    def get_sub_departments(self, obj):
        return [
            {"id": d.id, "name": d.name}
            for d in obj.academic_departments.all().order_by("name")
        ]
