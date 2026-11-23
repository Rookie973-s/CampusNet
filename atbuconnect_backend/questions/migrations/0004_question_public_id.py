import secrets
import string

from django.db import migrations, models

_BASE62 = string.ascii_letters + string.digits


def _backfill_public_ids(apps, schema_editor):
    Question = apps.get_model("questions", "Question")
    used = set(Question.objects.exclude(public_id="").values_list("public_id", flat=True))
    for q in Question.objects.filter(public_id=""):
        for _ in range(20):
            cand = "".join(secrets.choice(_BASE62) for _ in range(8))
            if cand not in used:
                used.add(cand)
                q.public_id = cand
                q.save(update_fields=["public_id"])
                break


class Migration(migrations.Migration):

    dependencies = [
        ('questions', '0003_answer_body_html_answer_image_answer_parent_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='question',
            name='public_id',
            field=models.CharField(blank=True, default='', max_length=16),
        ),
        migrations.RunPython(_backfill_public_ids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='question',
            name='public_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=16, unique=True),
        ),
    ]
