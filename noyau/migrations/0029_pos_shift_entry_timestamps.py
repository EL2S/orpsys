from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("noyau", "0028_stockmovement_destination"),
    ]

    operations = [
        migrations.AddField(
            model_name="posshiftabime",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True),
        ),
        migrations.AddField(
            model_name="posshiftexpense",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True),
        ),
        migrations.AddField(
            model_name="posshiftconsumption",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True),
        ),
    ]
