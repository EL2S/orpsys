from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("noyau", "0026_pos_shift_report"),
    ]

    operations = [
        migrations.AddField(
            model_name="bakerysale",
            name="paid_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="bakerysale",
            name="paid_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="bakery_sales_paid",
                to="noyau.employer",
            ),
        ),
    ]
