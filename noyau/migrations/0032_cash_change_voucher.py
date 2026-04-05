from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("noyau", "0031_loyalty_points_remainder"),
    ]

    operations = [
        migrations.CreateModel(
            name="CashChangeVoucher",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=20, unique=True)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("issued_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField()),
                (
                    "status",
                    models.CharField(
                        choices=[("ISSUED", "Émis"), ("REDEEMED", "Utilisé"), ("EXPIRED", "Expiré"), ("VOID", "Annulé")],
                        default="ISSUED",
                        max_length=10,
                    ),
                ),
                ("redeemed_at", models.DateTimeField(blank=True, null=True)),
                ("voided_at", models.DateTimeField(blank=True, null=True)),
                ("void_reason", models.CharField(blank=True, default="", max_length=255)),
                (
                    "issued_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="change_vouchers_issued",
                        to="noyau.employer",
                    ),
                ),
                (
                    "issued_transaction",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="change_vouchers_issued",
                        to="noyau.saletransaction",
                    ),
                ),
                (
                    "redeemed_transaction",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="change_vouchers_redeemed",
                        to="noyau.saletransaction",
                    ),
                ),
                (
                    "voided_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="change_vouchers_voided",
                        to="noyau.employer",
                    ),
                ),
            ],
        ),
    ]
