from datetime import datetime, time
from decimal import Decimal
import json
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import EmailMessage
from django.core.management.base import BaseCommand
from django.db.models import Sum, F
from django.utils import timezone

from noyau.models import (
    BakerySale,
    BakerySaleItem,
    CashChangeVoucher,
    PosShiftAbime,
    PosShiftExpense,
    PosShiftRemise,
    PosShiftReport,
    PyromaneOrder,
    RawMaterial,
    SaleTransaction,
    SaleTransactionItem,
)


class Command(BaseCommand):
    help = "Genere le dashboard IA quotidien et l'enregistre (optionnel: email aux admins)."

    def handle(self, *args, **options):
        today = timezone.localdate()
        start_dt = timezone.make_aware(datetime.combine(today, time.min))
        end_dt = timezone.make_aware(datetime.combine(today, time.max))

        pyromane_orders = PyromaneOrder.objects.filter(
            status="PAID",
            paid_at__range=(start_dt, end_dt),
        )
        pyromane_total = pyromane_orders.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        pyromane_tickets = pyromane_orders.count()
        pyromane_tx_ids = pyromane_orders.exclude(transaction__isnull=True).values_list("transaction_id", flat=True)

        pos_tx = SaleTransaction.objects.filter(date__range=(start_dt, end_dt)).exclude(id__in=pyromane_tx_ids)
        pos_total = pos_tx.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        pos_tickets = pos_tx.count()

        bakery_sales = BakerySale.objects.filter(is_paid=True, paid_at__range=(start_dt, end_dt))
        bakery_total = bakery_sales.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        bakery_tickets = bakery_sales.count()

        total_ca = pos_total + bakery_total + pyromane_total
        total_tickets = pos_tickets + bakery_tickets + pyromane_tickets

        top_pos = (
            SaleTransactionItem.objects.filter(transaction__date__range=(start_dt, end_dt))
            .values("product__name")
            .annotate(qty=Sum("quantity"))
            .order_by("-qty")[:5]
        )
        top_pos_list = [f"{row['product__name']} - {int(row['qty'] or 0)} u" for row in top_pos]

        top_bakery = (
            BakerySaleItem.objects.filter(bakery__is_paid=True, bakery__paid_at__range=(start_dt, end_dt))
            .values("product__name")
            .annotate(qty=Sum("quantity"))
            .order_by("-qty")[:5]
        )
        top_bakery_list = [f"{row['product__name']} - {int(row['qty'] or 0)} u" for row in top_bakery]

        open_shifts = PosShiftReport.objects.filter(shift_date=today, closed_at__isnull=True).count()
        expenses_total = PosShiftExpense.objects.filter(report__shift_date=today).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        abimes_total = PosShiftAbime.objects.filter(report__shift_date=today).aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
        remises_total = PosShiftRemise.objects.filter(report__shift_date=today).aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")

        low_stock = RawMaterial.objects.filter(current_stock__lte=F("min_stock"))
        low_stock_names = list(low_stock.values_list("name", flat=True)[:3])
        vouchers_open = CashChangeVoucher.objects.filter(status="ISSUED").count()
        pyromane_pending = PyromaneOrder.objects.filter(status="PENDING").count()

        payload = {
            "date": today.strftime("%Y-%m-%d"),
            "generated_at": timezone.localtime().strftime("%d/%m/%Y %H:%M"),
            "summary": {
                "total_ca": float(total_ca),
                "total_tickets": total_tickets,
                "pos_ca": float(pos_total),
                "pos_tickets": pos_tickets,
                "mini_ca": float(bakery_total),
                "mini_tickets": bakery_tickets,
                "pyromane_ca": float(pyromane_total),
                "pyromane_tickets": pyromane_tickets,
            },
            "alerts": {
                "open_shifts": open_shifts,
                "expenses_total": float(expenses_total),
                "abimes_total": float(abimes_total),
                "remises_total": float(remises_total),
                "low_stock_count": low_stock.count(),
                "low_stock_names": low_stock_names,
                "pyromane_pending": pyromane_pending,
                "vouchers_open": vouchers_open,
            },
            "top_products": {
                "pos": top_pos_list,
                "mini_four": top_bakery_list,
            },
        }

        out_dir = Path(settings.MEDIA_ROOT) / "ai_daily_dashboard"
        out_dir.mkdir(parents=True, exist_ok=True)
        file_path = out_dir / f"ai_dashboard_{today.strftime('%Y%m%d')}.json"
        file_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

        self.stdout.write(self.style.SUCCESS(f"Dashboard IA quotidien enregistre: {file_path}"))

        recipients = list(User.objects.filter(is_superuser=True).exclude(email="").values_list("email", flat=True))
        email_host = getattr(settings, "EMAIL_HOST", None)
        if recipients and email_host:
            subject = f"Salimamoud - Dashboard IA {today.strftime('%d/%m/%Y')}"
            lines = [
                f"CA total: {int(total_ca)} KMF",
                f"Tickets: {total_tickets}",
                f"POS: {int(pos_total)} KMF - {pos_tickets} tickets",
                f"Mini-Four: {int(bakery_total)} KMF - {bakery_tickets} tickets",
                f"Pyromane: {int(pyromane_total)} KMF - {pyromane_tickets} tickets",
                "",
                "Alertes:",
                f"- Shifts non clotures: {open_shifts}",
                f"- Depenses caisse: {int(expenses_total)} KMF",
                f"- Abimes: {int(abimes_total)} - Remises: {int(remises_total)}",
                f"- Ruptures matieres: {low_stock.count()}",
                f"- Pyromane en attente: {pyromane_pending}",
                f"- Bons de monnaie ouverts: {vouchers_open}",
                "",
                "Top produits POS:",
                *(top_pos_list or ["Aucun"]),
                "",
                "Top produits Mini-Four:",
                *(top_bakery_list or ["Aucun"]),
            ]
            body = "\n".join(lines)
            try:
                EmailMessage(subject, body, to=recipients).send(fail_silently=False)
                self.stdout.write(self.style.SUCCESS(f"Email envoye aux admins: {', '.join(recipients)}"))
            except Exception as exc:
                self.stdout.write(self.style.WARNING(f"Envoi email echoue: {exc}"))
        else:
            self.stdout.write(self.style.WARNING("Email non configure ou aucun admin avec email."))
