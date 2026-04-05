from django.db import migrations, models
import decimal


class Migration(migrations.Migration):

    dependencies = [
        ("noyau", "0030_aiassistant"),
    ]

    operations = [
        migrations.AddField(
            model_name="loyalty",
            name="points_remainder",
            field=models.DecimalField(decimal_places=2, default=decimal.Decimal("0.00"), max_digits=12),
        ),
    ]
