from django import forms
from django.contrib import admin
from django.utils.safestring import mark_safe

from .models import Department
from library.models import AcademicDepartment


class AcademicDepartmentInline(admin.TabularInline):
    model = AcademicDepartment
    extra = 2
    verbose_name = "Department in this Faculty"
    verbose_name_plural = "Departments in this Faculty"

PRIMARY_AND_SECONDARY_COLORS = [
    ("#3B82F6", "Blue (Primary)"),
    ("#2563EB", "Royal Blue"),
    ("#0EA5E9", "Sky Blue"),
    ("#06B6D4", "Cyan"),
    ("#14B8A6", "Teal"),
    ("#10B981", "Emerald"),
    ("#22C55E", "Green"),
    ("#84CC16", "Lime"),
    ("#EAB308", "Yellow"),
    ("#F59E0B", "Amber"),
    ("#F97316", "Orange"),
    ("#EF4444", "Red"),
    ("#F43F5E", "Rose"),
    ("#EC4899", "Pink"),
    ("#A855F7", "Purple"),
    ("#8B5CF6", "Violet"),
    ("#6366F1", "Indigo"),
    ("#64748B", "Slate"),
]


class ColorSwatchWidget(forms.TextInput):
    """Tap-to-pick primary & secondary color swatch selector for Django Admin."""

    def render(self, name, value, attrs=None, renderer=None):
        current = (value or "#3B82F6").upper()
        input_id = (attrs or {}).get("id", f"id_{name}")
        swatches = []
        for hex_code, label in PRIMARY_AND_SECONDARY_COLORS:
            selected = "outline:3px solid #fff;box-shadow:0 0 0 5px #3B82F6;transform:scale(1.1);" if hex_code.upper() == current else ""
            swatches.append(
                f'<button type="button" title="{label}" data-color="{hex_code}" '
                f'onclick="var i=document.getElementById(\'{input_id}\');i.value=\'{hex_code}\';'
                f'this.parentNode.querySelectorAll(\'button\').forEach(function(b){{b.style.outline=\'none\';b.style.boxShadow=\'none\';b.style.transform=\'none\';}});'
                f'this.style.outline=\'3px solid #fff\';this.style.boxShadow=\'0 0 0 5px #3B82F6\';this.style.transform=\'scale(1.1)\';" '
                f'style="width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,.25);'
                f'background:{hex_code};cursor:pointer;transition:transform .12s;{selected}"></button>'
            )
        html = (
            f'<div style="display:flex;flex-direction:column;gap:10px;max-width:440px;">'
            f'<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">{"".join(swatches)}</div>'
            f'<div style="display:flex;align-items:center;gap:10px;">'
            f'<input type="color" id="{input_id}" name="{name}" value="{current}" '
            f'style="width:44px;height:34px;border:none;border-radius:8px;background:transparent;cursor:pointer;" />'
            f'<span style="font-size:12px;opacity:.75;">Tap any color swatch above, or pick a custom color.</span>'
            f'</div></div>'
        )
        return mark_safe(html)


class DepartmentAdminForm(forms.ModelForm):
    class Meta:
        model = Department
        fields = "__all__"
        widgets = {
            "color": ColorSwatchWidget(),
        }


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    form = DepartmentAdminForm
    inlines = [AcademicDepartmentInline]
    list_display = ["name", "color_preview", "order", "count"]
    ordering = ["order", "name"]

    @admin.display(description="Color")
    def color_preview(self, obj):
        return mark_safe(
            f'<span style="display:inline-flex;align-items:center;gap:6px;">'
            f'<span style="width:14px;height:14px;border-radius:50%;background:{obj.color};display:inline-block;"></span>'
            f'<span>{obj.color}</span></span>'
        )
