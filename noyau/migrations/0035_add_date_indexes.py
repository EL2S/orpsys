from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("noyau", "0034_merge_20260325_01"),
    ]

    operations = [
        migrations.AlterField(
            model_name="stockmovement",
            name="date",
            field=models.DateTimeField(db_index=True),
        ),
        migrations.AlterField(
            model_name="saletransaction",
            name="date",
            field=models.DateTimeField(db_index=True),
        ),
        migrations.AlterField(
            model_name="bakerysale",
            name="date",
            field=models.DateTimeField(db_index=True),
        ),
        migrations.AlterField(
            model_name="saleproduction",
            name="production_date",
            field=models.DateField(db_index=True),
        ),
        migrations.AlterField(
            model_name="bakeryproduction",
            name="production_date",
            field=models.DateField(db_index=True),
        ),
    ]
