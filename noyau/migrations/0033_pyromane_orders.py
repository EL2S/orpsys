from django.db import migrations, models
import django.db.models.deletion
import decimal


class Migration(migrations.Migration):

    dependencies = [
        ('noyau', '0032_cash_change_voucher'),
    ]

    operations = [
        migrations.CreateModel(
            name='PyromaneOrder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order_number', models.CharField(max_length=20, unique=True)),
                ('status', models.CharField(choices=[('PENDING', 'En attente de paiement'), ('PAID', 'Payee'), ('CANCELED', 'Annulee')], default='PENDING', max_length=10)),
                ('total_amount', models.DecimalField(decimal_places=2, default=decimal.Decimal('0.00'), max_digits=12)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('paid_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='pyromane_orders_paid', to='noyau.employer')),
                ('transaction', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='pyromane_orders', to='noyau.saletransaction')),
            ],
        ),
        migrations.CreateModel(
            name='PyromaneOrderItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.PositiveIntegerField(default=1)),
                ('unit_price', models.DecimalField(decimal_places=2, max_digits=10)),
                ('subtotal', models.DecimalField(decimal_places=2, max_digits=12)),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='noyau.pyromaneorder')),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='noyau.saleproduct')),
            ],
        ),
    ]
