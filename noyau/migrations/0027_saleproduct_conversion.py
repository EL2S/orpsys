from django.db import migrations, models
import django.db.models.deletion
from decimal import Decimal


class Migration(migrations.Migration):

    dependencies = [
        ("noyau", "0026_pos_shift_report"),
    ]

    operations = [
        migrations.AddField(
            model_name="saleproduct",
            name="base_product",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="derived_products",
                to="noyau.saleproduct",
            ),
        ),
        migrations.AddField(
            model_name="saleproduct",
            name="conversion_factor",
            field=models.DecimalField(decimal_places=2, default=Decimal("1.00"), max_digits=10),
        ),
    ]

