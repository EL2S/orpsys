from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("noyau", "0040_loyalty_card_type"),
    ]

    operations = [
        migrations.CreateModel(
            name="ComptoirTable",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("zone", models.CharField(choices=[("A", "A"), ("B", "B"), ("VIP", "VIP"), ("TER", "TER")], max_length=10)),
                ("number", models.PositiveIntegerField()),
                ("is_active", models.BooleanField(default=True)),
                ("note", models.CharField(blank=True, default="", max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["zone", "number"],
            },
        ),
        migrations.AddConstraint(
            model_name="comptoirtable",
            constraint=models.UniqueConstraint(fields=("zone", "number"), name="uniq_comptoir_table_zone_number"),
        ),
    ]
