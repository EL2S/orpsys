from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("noyau", "0038_rawmaterial_linked_product"),
    ]

    operations = [
        migrations.CreateModel(
            name="PyromaneOrderLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(choices=[("CREATE", "Création"), ("UPDATE", "Modification"), ("CANCEL", "Annulation")], max_length=10)),
                ("details", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="noyau.employer")),
                ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="logs", to="noyau.pyromaneorder")),
            ],
        ),
    ]
