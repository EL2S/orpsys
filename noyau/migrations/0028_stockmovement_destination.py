from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("noyau", "0027_bakerysale_paid_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="stockmovement",
            name="destination",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
    ]
