from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("noyau", "0039_pyromane_order_log"),
    ]

    operations = [
        migrations.AddField(
            model_name="loyalty",
            name="card_type",
            field=models.CharField(
                choices=[("STANDARD", "Standard"), ("PREMIUM", "Premium")],
                default="STANDARD",
                max_length=20,
            ),
        ),
    ]
