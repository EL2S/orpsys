from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_DOWN
import hashlib
import os
import re
import unicodedata
from urllib.parse import parse_qs, urlparse
from django.conf import settings
from django.http import JsonResponse
from django.core.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404, render, redirect
from django.urls import reverse, NoReverseMatch
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required, permission_required
from django.utils import timezone
import random
from django.contrib.contenttypes.models import ContentType
from django.db.models import Q, F, Sum, Count, Avg, Max, Min, IntegerField
from django.db.models.functions import TruncHour, TruncDate, Substr, Cast
import json
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone
import locale
from django.contrib.auth.models import User, Permission
from noyau.models import (
    BakeryProduct,
    BakerySale,
    BakerySaleItem,
    BakeryProduction,
    BakeryRecipe,
    BakeryRecipeItem,
    Employer,
    Loyalty,
    LoyaltyPointLedger,
    PosShiftAbime,
    PosShiftConsumption,
    PosShiftExpense,
    PosShiftRemise,
    PosShiftReport,
    PyromaneOrder,
    PyromaneOrderItem,
    PyromaneOrderLog,
    RawMaterial,
    RawMaterialLot,
    ResaleDelivery,
    SaleProduct,
    SaleProduction,
    SaleRecipe,
    SaleRecipeItem,
    SaleTransaction,
    SaleTransactionItem,
    StockMovement,
    CashChangeVoucher,
)
from django.core.files.storage import default_storage
import logging
# Définit la locale française (fallback si la locale n'est pas disponible)
try:
    locale.setlocale(locale.LC_TIME, "fr_FR.UTF-8")
except locale.Error:
    locale.setlocale(locale.LC_TIME, "")
from django.views.decorators.csrf import requires_csrf_token
import shutil
from django.utils.timezone import localdate

logger = logging.getLogger(__name__)

def clean_decimal(val):
    if val is None:
        return Decimal(0)
    if isinstance(val, str):
        val = val.replace(" ", "").replace(",", ".").strip()
    try:
        return round(Decimal(val), 2)
    except:
        return Decimal(0)

def parse_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes", "y", "on"}:
            return True
        if lowered in {"false", "0", "no", "n", "off"}:
            return False
    return default


def build_login_context():
    return {
        "employees_payload": list(
            Employer.objects.values("id", "badge_id", "setting").order_by("id")
        )
    }


def build_user_context(request):
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    return {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
    }


def parse_date(value, fallback):
    try:
        return date.fromisoformat(value)
    except Exception:
        return fallback


def normalize_shift(value, default="MATIN"):
    shift = (value or default or "MATIN").upper()
    if shift not in {"MATIN", "SOIR"}:
        shift = default
    return shift


def normalize_text(value):
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    cleaned = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return cleaned.lower().strip()


def get_current_shift(now_dt):
    current_time = now_dt.time()
    return "MATIN" if current_time < time(15, 0) else "SOIR"


def get_shift_window(shift_date, shift):
    shift = normalize_shift(shift)
    start_time = time(6, 0) if shift == "MATIN" else time(15, 0)
    end_time = time(15, 0) if shift == "MATIN" else time(22, 0)
    start_dt = timezone.make_aware(datetime.combine(shift_date, start_time))
    end_dt = timezone.make_aware(datetime.combine(shift_date, end_time))
    return start_dt, end_dt


def get_report_window(report, shift_date, shift):
    if report and report.opened_at:
        start_dt = report.opened_at
        end_dt = report.closed_at or timezone.now()
        return start_dt, end_dt
    return get_shift_window(shift_date, shift)


def get_pos_shift_remise_defaults(shift_date, shift):
    shift = (shift or "").upper()
    if shift not in {"MATIN", "SOIR"}:
        return {}

    prev_shift = "SOIR" if shift == "MATIN" else "MATIN"
    prev_date = shift_date - timedelta(days=1) if shift == "MATIN" else shift_date
    prev_report = (
        PosShiftReport.objects.filter(shift_date=prev_date, shift=prev_shift)
        .order_by("-opened_at")
        .first()
    )
    if not prev_report:
        return {}

    base_with_children_ids = set(
        SaleProduct.objects.exclude(base_product_id=None).values_list("base_product_id", flat=True)
    )
    resale_ar_ids = set(
        SaleProduct.objects.filter(product_type__in={"Vente en dépôt", "Achat & Revente"}).values_list("id", flat=True)
    )
    durable_ids = set(
        SaleProduct.objects.filter(stock_known=True, category__iexact="Durable").values_list("id", flat=True)
    )

    defaults = {}
    try:
        prev_payload = build_pos_shift_report_payload(prev_report, prev_date, prev_shift)
        for row in prev_payload.get("ready_rows", []):
            product_id = row.get("id")
            if (
                product_id in base_with_children_ids
                or product_id in resale_ar_ids
                or (shift == "MATIN" and product_id not in durable_ids)
            ):
                continue
            qty = clean_decimal(row.get("restes") or Decimal(0))
            if qty < 0:
                qty = Decimal(0)
            defaults[product_id] = qty
    except Exception:
        return {}

    return defaults


def get_resale_shift_stock_state(shift_date, start_dt, end_dt):
    delivered_current_qs = (
        ResaleDelivery.objects.filter(
            product__product_type="Vente en dépôt",
            delivered_at__gte=start_dt,
            delivered_at__lt=end_dt,
        )
        .values("product_id")
        .annotate(total=Sum("quantity"))
    )
    delivered_current_by_product = {
        row["product_id"]: row["total"] or Decimal(0)
        for row in delivered_current_qs
    }

    delivered_before_qs = (
        ResaleDelivery.objects.filter(
            product__product_type="Vente en dépôt",
            delivered_at__date=shift_date,
            delivered_at__lt=start_dt,
        )
        .values("product_id")
        .annotate(total=Sum("quantity"))
    )
    delivered_before_by_product = {
        row["product_id"]: row["total"] or Decimal(0)
        for row in delivered_before_qs
    }

    sales_before_qs = (
        SaleTransactionItem.objects.filter(
            product__product_type="Vente en dépôt",
            transaction__date__date=shift_date,
            transaction__date__lt=start_dt,
        )
        .values("product_id")
        .annotate(total=Sum("quantity"))
    )
    sales_before_by_product = {
        row["product_id"]: row["total"] or Decimal(0)
        for row in sales_before_qs
    }

    opening_by_product = {}
    for product_id, delivered_before in delivered_before_by_product.items():
        opening = delivered_before - sales_before_by_product.get(product_id, Decimal(0))
        if opening < 0:
            opening = Decimal(0)
        opening_by_product[product_id] = opening

    return {
        "opening_by_product": opening_by_product,
        "delivered_current_by_product": delivered_current_by_product,
    }


def seed_pos_shift_remises(report):
    if not report:
        return {}

    current = {
        remise.product_id: remise.quantity
        for remise in PosShiftRemise.objects.filter(report=report)
    }
    if current:
        return current

    defaults = get_pos_shift_remise_defaults(report.shift_date, report.shift)
    if not defaults:
        return {}

    products = {
        product.id: product
        for product in SaleProduct.objects.filter(id__in=defaults.keys())
    }
    to_create = []
    for product_id, quantity in defaults.items():
        if quantity <= 0:
            continue
        product = products.get(product_id)
        if not product:
            continue
        if product.product_type in {"Vente en dépôt", "Achat & Revente"}:
            continue
        if SaleProduct.objects.filter(base_product_id=product.id).exists():
            continue
        to_create.append(
            PosShiftRemise(
                report=report,
                product=product,
                quantity=quantity,
            )
        )

    if to_create:
        PosShiftRemise.objects.bulk_create(to_create)

    return {
        remise.product_id: remise.quantity
        for remise in PosShiftRemise.objects.filter(report=report)
    }


def parse_local_datetime_input(value):
    raw_value = (value or "").strip()
    if not raw_value:
        return None
    try:
        parsed = datetime.fromisoformat(raw_value)
    except ValueError:
        return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def serialize_pos_shift_report_row(report):
    cashier_name = ""
    if report.cashier and report.cashier.user:
        cashier_name = report.cashier.user.get_full_name().strip() or report.cashier.user.username
    elif report.cashier:
        cashier_name = f"Caissier #{report.cashier.id}"

    opened_at_local = timezone.localtime(report.opened_at) if report.opened_at else None
    closed_at_local = timezone.localtime(report.closed_at) if report.closed_at else None

    remises_count = getattr(report, "remises_count", report.remises.count())
    abimes_count = getattr(report, "abimes_count", report.abimes.count())
    consumptions_count = getattr(report, "consumptions_count", report.consumptions.count())
    expenses_count = getattr(report, "expenses_count", report.expenses.count())

    return {
        "id": report.id,
        "shift_date": report.shift_date.isoformat(),
        "shift_date_label": report.shift_date.strftime("%d/%m/%Y"),
        "shift": report.shift,
        "cashier_id": report.cashier_id,
        "cashier_name": cashier_name,
        "opened_at": opened_at_local.strftime("%Y-%m-%dT%H:%M") if opened_at_local else "",
        "opened_at_label": opened_at_local.strftime("%d/%m/%Y %H:%M") if opened_at_local else "—",
        "closed_at": closed_at_local.strftime("%Y-%m-%dT%H:%M") if closed_at_local else "",
        "closed_at_label": closed_at_local.strftime("%d/%m/%Y %H:%M") if closed_at_local else "—",
        "is_closed": bool(report.closed_at),
        "status_label": "Clôturé" if report.closed_at else "Ouvert",
        "note": report.note or "",
        "remises_count": remises_count,
        "abimes_count": abimes_count,
        "consumptions_count": consumptions_count,
        "expenses_count": expenses_count,
    }


def can_manage_pos_shift_reports(user):
    return any(
        user.has_perm(permission)
        for permission in (
            "noyau.view_posshiftreport",
            "noyau.change_posshiftreport",
            "noyau.delete_posshiftreport",
        )
    )


def build_secure_id_for_employer(employer):
    base = f"{employer.setting}|{employer.badge_id}|{employer.id}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def build_secure_id_for_loyalty(loyalty, legacy=False):
    setting = loyalty.get("setting") or "Salimamoud"
    card_id = loyalty.get("card_id") or ""
    loyalty_id = loyalty.get("id") or ""
    suffix = "LOYALTY2026" if legacy else loyalty_id
    base = f"{setting}|{card_id}|{suffix}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def extract_scan_value(raw_value):
    value = (raw_value or "").strip()
    if not value:
        return ""

    try:
        parsed_url = urlparse(value)
        scan_values = parse_qs(parsed_url.query).get("scan", [])
        if scan_values and scan_values[0].strip():
            return scan_values[0].strip()
    except Exception:
        pass

    hash_match = re.search(r"[a-fA-F0-9]{64}", value)
    if hash_match:
        return hash_match.group(0).lower()

    badge_match = re.search(r"BADGE\d+", value, flags=re.IGNORECASE)
    if badge_match:
        return badge_match.group(0).upper()

    return value


def get_user_from_scan(raw_scan, scan_employer_id=None):
    scan_value = extract_scan_value(raw_scan)
    if not scan_value:
        return None

    normalized_scan = scan_value.strip()
    if re.fullmatch(r"[a-f0-9]{64}", normalized_scan.lower()):
        employers = Employer.objects.select_related("user").all()
        secure_value = normalized_scan.lower()

        if scan_employer_id:
            employer = (
                Employer.objects.select_related("user")
                .filter(id=scan_employer_id)
                .first()
            )
            if employer:
                secure_id = build_secure_id_for_employer(employer)
                if secure_id == secure_value and employer.user and employer.user.is_active:
                    return employer.user

        for employer in employers:
            secure_id = build_secure_id_for_employer(employer)
            if secure_id == secure_value:
                if employer.user and employer.user.is_active:
                    return employer.user
                return None
        return None

    employer = (
        Employer.objects.select_related("user")
        .filter(badge_id__iexact=normalized_scan)
        .first()
    )
    if employer and employer.user and employer.user.is_active:
        return employer.user

    return None


def login_and_redirect_user(request, user, context):
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    login(request, user)

    if user.is_superuser:
        return redirect("view_dashboard")

    permission_to_url = {
        "view_dashboard": "view_dashboard",
        "view_aiassistant": "view_aiassistant",
        "view_employer": "view_employer",
        "view_loyalty": "view_loyalty",
        "view_saleproduct": "view_saleproduct",
        "view_salerecipe": "view_sale_recipes",
        "view_saleproduction": "view_sale_production",
        "view_rawmaterial": "view_rawmaterial",
        "view_pos": "view_pos",
        "view_pyromaneorder": "view_pyromane",
        "view_sale": "view_sale",
        "view_bakeryproduct": "view_bakeryproduct",
        "view_bakeryrecipe": "view_bakery_recipes",
        "view_bakeryproduction": "view_bakery_production",
        "view_bakery": "view_bakery",
        "view_cashchangevoucher": "view_cash_change_vouchers",
    }
    landing_priority = [
        "view_dashboard",
        "view_pos",
        "view_pyromaneorder",
        "view_bakery",
        "view_saleproduct",
        "view_saleproduction",
        "view_bakeryproduct",
        "view_bakeryproduction",
        "view_salerecipe",
        "view_bakeryrecipe",
        "view_loyalty",
        "view_employer",
        "view_sale",
        "view_cashchangevoucher",
        "view_aiassistant",
        "view_rawmaterial",
    ]

    user_permission_codenames = {
        perm.split(".", 1)[1]
        for perm in user.get_all_permissions()
        if "." in perm
    }

    for codename in landing_priority:
        if codename in user_permission_codenames:
            url_name = permission_to_url.get(codename, codename)
            try:
                return redirect(url_name)
            except NoReverseMatch:
                continue

    for codename in user_permission_codenames:
        url_name = permission_to_url.get(codename, codename)
        try:
            return redirect(url_name)
        except NoReverseMatch:
            continue

    context["error_message"] = "Aucune permission de vue trouvée."
    return render(request, "login.html", context)


@login_required
def user_logout(request):
    employer = getattr(request.user, "employer", None)
    if employer:
        now_local = timezone.localtime()
        session_shift = request.session.get("pos_shift", {})
        session_shift_value = (session_shift.get("shift") or "").upper()
        session_date_raw = session_shift.get("date")
        session_date = parse_date(session_date_raw or "", now_local.date())
        if session_shift_value in {"MATIN", "SOIR"} and session_date == now_local.date():
            report = PosShiftReport.objects.filter(
                shift_date=session_date,
                shift=session_shift_value,
                cashier=employer,
                closed_at__isnull=True,
            ).first()
            end_time = time(15, 0) if session_shift_value == "MATIN" else time(22, 0)
            if report and now_local.time() >= end_time:
                request.session["logout_blocked"] = True
                return redirect("view_pos")

    logout(request)
    return redirect("login")


# Create your views here.
def user_login(request):
    context = build_login_context()
    if request.method == "POST":
        login_type = (request.POST.get("type") or "").strip().lower()

        if login_type == "scan":
            scan_payload = request.POST.get("scan", "")
            scan_employer_id = request.POST.get("scan_employer_id", "").strip()
            user = get_user_from_scan(scan_payload, scan_employer_id=scan_employer_id)
            if user is not None:
                return login_and_redirect_user(request, user, context)

            context["error_message"] = "Badge non reconnu"
            return render(request, "login.html", context)

        username = request.POST.get("username")
        password = request.POST.get("password")
        user = authenticate(request, username=username, password=password)
        if user is not None:
            return login_and_redirect_user(request, user, context)

        else:
            context["error_message"] = "Nom d'utilisateur ou mot de passe incorrect"
            return render(request, "login.html", context)
    return render(request, "login.html", context)


@permission_required("noyau.view_dashboard", raise_exception=True)
def view_dashboard(request):
    
    current_user = request.user

    # Infos de base de l'utilisateur
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    # Récupérer l'employé lié
    try:
        employer = Employer.objects.get(user=current_user)
        role = employer.role
    except Employer.DoesNotExist:
        role = None

    context = {
        "first_name": first_name,
        "last_name": last_name,
        "role": role,
        "first_letter": first_letter,
    }

    return render(request, "dashboard.html", context)


@permission_required("noyau.view_aiassistant", raise_exception=True)
def view_aiassistant(request):
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    try:
        employer = Employer.objects.get(user=current_user)
        role = employer.role
    except Employer.DoesNotExist:
        role = None

    today = timezone.localdate()

    def period_bounds(start_date, end_date):
        start_dt = timezone.make_aware(datetime.combine(start_date, time.min))
        end_dt = timezone.make_aware(datetime.combine(end_date, time.max))
        return start_dt, end_dt

    def summarize_period(start_date, end_date):
        start_dt, end_dt = period_bounds(start_date, end_date)

        pyromane_orders = PyromaneOrder.objects.filter(
            status="PAID",
            paid_at__range=(start_dt, end_dt),
        )
        pyromane_total = pyromane_orders.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        pyromane_tickets = pyromane_orders.count()
        pyromane_tx_ids = pyromane_orders.exclude(transaction__isnull=True).values_list("transaction_id", flat=True)

        pos_transactions = SaleTransaction.objects.filter(date__range=(start_dt, end_dt)).exclude(id__in=pyromane_tx_ids)
        pos_total = pos_transactions.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        pos_tickets = pos_transactions.count()
        pos_discounts = pos_transactions.aggregate(total=Sum("discount_amount"))["total"] or Decimal("0.00")

        bakery_sales = BakerySale.objects.filter(is_paid=True, paid_at__range=(start_dt, end_dt))
        bakery_total = bakery_sales.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        bakery_tickets = bakery_sales.count()

        total_ca = pos_total + bakery_total + pyromane_total
        tickets_total = pos_tickets + bakery_tickets + pyromane_tickets
        ticket_moyen = (total_ca / tickets_total) if tickets_total else Decimal("0.00")

        pos_production_qty = (
            SaleProduction.objects.filter(production_date__range=(start_date, end_date))
            .aggregate(total=Sum("quantity"))["total"]
            or Decimal("0.00")
        )
        bakery_production_qty = (
            BakeryProduction.objects.filter(production_date__range=(start_date, end_date))
            .aggregate(total=Sum("quantity"))["total"]
            or Decimal("0.00")
        )

        sorties_qty = (
            StockMovement.objects.filter(movement_type="Sortie", date__range=(start_dt, end_dt))
            .aggregate(total=Sum("quantity"))["total"]
            or Decimal("0.00")
        )
        sorties_count = StockMovement.objects.filter(movement_type="Sortie", date__range=(start_dt, end_dt)).count()

        low_stock_qs = RawMaterial.objects.filter(current_stock__lte=F("min_stock"))
        low_stock_count = low_stock_qs.count()
        low_stock_names = list(low_stock_qs.values_list("name", flat=True)[:3])

        missing_sale_recipes = SaleProduct.objects.filter(recipe__isnull=True).count()
        missing_bakery_recipes = BakeryProduct.objects.filter(recipe__isnull=True).count()

        loyalty_new_cards = Loyalty.objects.filter(date__range=(start_date, end_date)).count()
        loyalty_points_earned = (
            SaleTransaction.objects.filter(date__range=(start_dt, end_dt))
            .aggregate(total=Sum("points_earned"))["total"]
            or 0
        )
        loyalty_points_redeemed = (
            SaleTransaction.objects.filter(date__range=(start_dt, end_dt))
            .aggregate(total=Sum("points_redeemed"))["total"]
            or 0
        )

        vouchers_issued = CashChangeVoucher.objects.filter(issued_at__range=(start_dt, end_dt)).count()
        vouchers_redeemed = CashChangeVoucher.objects.filter(redeemed_at__range=(start_dt, end_dt)).count()
        vouchers_open = CashChangeVoucher.objects.filter(status="ISSUED").count()

        shift_open = PosShiftReport.objects.filter(shift_date__range=(start_date, end_date), closed_at__isnull=True).count()

        top_pos = (
            SaleTransactionItem.objects.filter(transaction__date__range=(start_dt, end_dt))
            .values("product__name")
            .annotate(qty=Sum("quantity"), amount=Sum("subtotal"))
            .order_by("-qty")[:5]
        )
        top_pos_list = [
            {
                "name": row["product__name"],
                "qty": int(row["qty"] or 0),
                "amount": float(row["amount"] or 0),
            }
            for row in top_pos
        ]

        top_bakery = (
            BakerySaleItem.objects.filter(bakery__is_paid=True, bakery__paid_at__range=(start_dt, end_dt))
            .values("product__name")
            .annotate(qty=Sum("quantity"), amount=Sum("subtotal"))
            .order_by("-qty")[:5]
        )
        top_bakery_list = [
            {
                "name": row["product__name"],
                "qty": int(row["qty"] or 0),
                "amount": float(row["amount"] or 0),
            }
            for row in top_bakery
        ]

        abimes_qty = (
            PosShiftAbime.objects.filter(report__shift_date__range=(start_date, end_date))
            .aggregate(total=Sum("quantity"))["total"]
            or Decimal("0.00")
        )
        remises_qty = (
            PosShiftRemise.objects.filter(report__shift_date__range=(start_date, end_date))
            .aggregate(total=Sum("quantity"))["total"]
            or Decimal("0.00")
        )
        consumptions_qty = (
            PosShiftConsumption.objects.filter(report__shift_date__range=(start_date, end_date))
            .aggregate(total=Sum("quantity"))["total"]
            or Decimal("0.00")
        )
        expenses_total = (
            PosShiftExpense.objects.filter(report__shift_date__range=(start_date, end_date))
            .aggregate(total=Sum("amount"))["total"]
            or Decimal("0.00")
        )

        return {
            "start": start_date,
            "end": end_date,
            "summary": {
                "ca_total": float(total_ca),
                "tickets_total": tickets_total,
                "ticket_moyen": float(ticket_moyen),
                "pos": {"ca": float(pos_total), "tickets": pos_tickets},
                "mini_four": {"ca": float(bakery_total), "tickets": bakery_tickets},
                "pyromane": {"ca": float(pyromane_total), "tickets": pyromane_tickets},
                "pos_discounts": float(pos_discounts),
            },
            "top_pos": top_pos_list,
            "top_mini": top_bakery_list,
            "issues_meta": {
                "abimes": float(abimes_qty),
                "remises": float(remises_qty),
                "consumptions": float(consumptions_qty),
                "expenses": float(expenses_total),
            },
            "meta": {
                "pos_production_qty": float(pos_production_qty),
                "bakery_production_qty": float(bakery_production_qty),
                "sorties_qty": float(sorties_qty),
                "sorties_count": sorties_count,
                "low_stock_count": low_stock_count,
                "low_stock_names": low_stock_names,
                "missing_sale_recipes": missing_sale_recipes,
                "missing_bakery_recipes": missing_bakery_recipes,
                "loyalty_new_cards": loyalty_new_cards,
                "loyalty_points_earned": int(loyalty_points_earned or 0),
                "loyalty_points_redeemed": int(loyalty_points_redeemed or 0),
                "vouchers_issued": vouchers_issued,
                "vouchers_redeemed": vouchers_redeemed,
                "vouchers_open": vouchers_open,
                "shift_open": shift_open,
                "pyromane_pending": PyromaneOrder.objects.filter(status="PENDING").count(),
            },
        }

    def build_period(label, start_date, end_date):
        stats = summarize_period(start_date, end_date)
        start_dt, end_dt = period_bounds(start_date, end_date)
        span_days = (end_date - start_date).days + 1
        previous_start = start_date - timedelta(days=span_days)
        previous_end = end_date - timedelta(days=span_days)
        previous_stats = summarize_period(previous_start, previous_end)

        current_ca = stats["summary"]["ca_total"]
        previous_ca = previous_stats["summary"]["ca_total"]
        delta_pct = None
        if previous_ca > 0:
            delta_pct = ((current_ca - previous_ca) / previous_ca) * 100

        range_label = (
            start_date.strftime("%d/%m/%Y")
            if start_date == end_date
            else f"{start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')}"
        )

        meta = stats["meta"]
        issues_meta = stats["issues_meta"]
        top_pos = stats["top_pos"]
        top_mini = stats["top_mini"]

        sections = []

        pos_issues = []
        pos_improvements = []
        pos_actions = []
        if current_ca <= 0:
            pos_issues.append("Aucune vente POS enregistrée.")
            pos_improvements.append("Relancer les ventes POS avec une mise en avant rapide.")
            pos_actions.append("Mettre un produit phare en avant en caisse.")
        if delta_pct is not None and delta_pct <= -20:
            pos_issues.append(f"Baisse globale du CA de {abs(int(delta_pct))}% vs période précédente.")
            pos_improvements.append("Renforcer la visibilité des produits à forte marge.")
            pos_actions.append("Créer une offre flash sur les produits en baisse.")
        if issues_meta["abimes"] > 0:
            pos_issues.append(f"{int(issues_meta['abimes'])} produits abîmés signalés.")
            pos_improvements.append("Renforcer le contrôle qualité sur les produits fragiles.")
            pos_actions.append("Suivre les causes d'abîmés sur les 3 produits principaux.")
        if issues_meta["remises"] > 0:
            pos_issues.append(f"{int(issues_meta['remises'])} remises manuelles enregistrées.")
            pos_improvements.append("Limiter les remises et valider les justifications.")
            pos_actions.append("Vérifier les remises avec le caissier responsable.")
        if issues_meta["consumptions"] > 0:
            pos_issues.append(f"{int(issues_meta['consumptions'])} consommations internes enregistrées.")
            pos_improvements.append("Centraliser les consommations internes et les valider.")
            pos_actions.append("Mettre à jour la feuille des consommations internes.")
        if issues_meta["expenses"] > 0:
            pos_issues.append(f"Dépenses caisse: {int(issues_meta['expenses'])} KMF.")
            pos_improvements.append("Planifier les dépenses hors heures de pointe.")
            pos_actions.append("Classifier les dépenses par catégorie.")
        if stats["summary"]["pos_discounts"] > 0:
            pos_issues.append(f"Remises commerciales: {int(stats['summary']['pos_discounts'])} KMF.")
            pos_improvements.append("Suivre l'impact des remises sur la marge.")
            pos_actions.append("Comparer remises vs CA sur la période suivante.")

        if not pos_issues:
            pos_issues.append("Aucune alerte majeure détectée.")
            pos_improvements.append("Continuer le suivi quotidien des ventes POS.")
            pos_actions.append("Maintenir le rythme actuel en caisse.")

        sections.append({
            "title": "Caisse (POS)",
            "summary": [
                f"CA: {int(stats['summary']['pos']['ca'])} KMF",
                f"Tickets: {stats['summary']['pos']['tickets']}",
                f"Top POS: {top_pos[0]['name'] if top_pos else 'Aucun'}",
            ],
            "issues": pos_issues,
            "improvements": pos_improvements,
            "actions": pos_actions,
        })

        mini_issues = []
        mini_improvements = []
        mini_actions = []
        if stats["summary"]["mini_four"]["tickets"] == 0:
            mini_issues.append("Aucune vente Mini-Four enregistrée.")
            mini_improvements.append("Relancer la visibilité Mini-Four.")
            mini_actions.append("Afficher les offres Mini-Four en caisse.")
        if not mini_issues:
            mini_issues.append("Aucune alerte majeure détectée.")
            mini_improvements.append("Continuer le suivi Mini-Four.")
            mini_actions.append("Suivre les ventes Mini-Four chaque jour.")

        sections.append({
            "title": "Mini-Four",
            "summary": [
                f"CA: {int(stats['summary']['mini_four']['ca'])} KMF",
                f"Tickets: {stats['summary']['mini_four']['tickets']}",
                f"Top Mini-Four: {top_mini[0]['name'] if top_mini else 'Aucun'}",
            ],
            "issues": mini_issues,
            "improvements": mini_improvements,
            "actions": mini_actions,
        })

        pyro_issues = []
        pyro_improvements = []
        pyro_actions = []
        if meta["pyromane_pending"] > 0:
            pyro_issues.append(f"{meta['pyromane_pending']} commandes Pyromane en attente.")
            pyro_improvements.append("Accélérer le passage des commandes en caisse.")
            pyro_actions.append("Vérifier les commandes Pyromane non payées.")
        if not pyro_issues:
            pyro_issues.append("Aucune alerte majeure détectée.")
            pyro_improvements.append("Continuer le suivi Pyromane.")
            pyro_actions.append("Surveiller le volume Pyromane chaque jour.")

        sections.append({
            "title": "Pyromane Grill",
            "summary": [
                f"CA: {int(stats['summary']['pyromane']['ca'])} KMF",
                f"Tickets: {stats['summary']['pyromane']['tickets']}",
                f"En attente: {meta['pyromane_pending']}",
            ],
            "issues": pyro_issues,
            "improvements": pyro_improvements,
            "actions": pyro_actions,
        })

        stock_issues = []
        stock_improvements = []
        stock_actions = []
        if meta["low_stock_count"] > 0:
            stock_issues.append(f"{meta['low_stock_count']} matières premières sous le seuil.")
            stock_improvements.append("Planifier un réassort rapide.")
            stock_actions.append(f"Vérifier: {', '.join(meta['low_stock_names']) or 'stock critique'}.")
        if meta["sorties_count"] > 0:
            stock_issues.append(f"{meta['sorties_count']} sorties enregistrées ({int(meta['sorties_qty'])} unités).")
            stock_improvements.append("Comparer sorties vs production.")
            stock_actions.append("Valider les sorties non justifiées.")
        if not stock_issues:
            stock_issues.append("Aucune alerte majeure détectée.")
            stock_improvements.append("Maintenir le suivi des stocks.")
            stock_actions.append("Contrôler les seuils chaque semaine.")

        sections.append({
            "title": "Stocks & Sorties",
            "summary": [
                f"Sorties: {meta['sorties_count']} ({int(meta['sorties_qty'])} unités)",
                f"Ruptures: {meta['low_stock_count']}",
            ],
            "issues": stock_issues,
            "improvements": stock_improvements,
            "actions": stock_actions,
        })

        production_issues = []
        production_improvements = []
        production_actions = []
        if meta["pos_production_qty"] == 0 and meta["bakery_production_qty"] == 0:
            production_issues.append("Aucune production enregistrée.")
            production_improvements.append("Planifier une production minimale.")
            production_actions.append("Vérifier le planning de production.")
        if not production_issues:
            production_issues.append("Aucune alerte majeure détectée.")
            production_improvements.append("Continuer le suivi production.")
            production_actions.append("Comparer production vs ventes.")

        sections.append({
            "title": "Production",
            "summary": [
                f"Production POS: {int(meta['pos_production_qty'])} unités",
                f"Production Mini-Four: {int(meta['bakery_production_qty'])} unités",
            ],
            "issues": production_issues,
            "improvements": production_improvements,
            "actions": production_actions,
        })

        recipe_issues = []
        recipe_improvements = []
        recipe_actions = []
        if meta["missing_sale_recipes"] > 0 or meta["missing_bakery_recipes"] > 0:
            recipe_issues.append(f"Recettes POS manquantes: {meta['missing_sale_recipes']}.")
            recipe_issues.append(f"Recettes Mini-Four manquantes: {meta['missing_bakery_recipes']}.")
            recipe_improvements.append("Compléter les recettes manquantes.")
            recipe_actions.append("Planifier la saisie des recettes prioritaires.")
        if not recipe_issues:
            recipe_issues.append("Toutes les recettes sont renseignées.")
            recipe_improvements.append("Maintenir la qualité des fiches recettes.")
            recipe_actions.append("Vérifier les rendements.")

        sections.append({
            "title": "Recettes",
            "summary": [
                f"Recettes POS manquantes: {meta['missing_sale_recipes']}",
                f"Recettes Mini-Four manquantes: {meta['missing_bakery_recipes']}",
            ],
            "issues": recipe_issues,
            "improvements": recipe_improvements,
            "actions": recipe_actions,
        })

        loyalty_issues = []
        loyalty_improvements = []
        loyalty_actions = []
        if meta["loyalty_new_cards"] == 0:
            loyalty_issues.append("Aucune nouvelle carte fidélité créée.")
            loyalty_improvements.append("Relancer les inscriptions fidélité.")
            loyalty_actions.append("Proposer la carte à chaque client.")
        if not loyalty_issues:
            loyalty_issues.append("Aucune alerte majeure détectée.")
            loyalty_improvements.append("Continuer le suivi fidélité.")
            loyalty_actions.append("Suivre les points gagnés/utilisés.")

        sections.append({
            "title": "Fidélité",
            "summary": [
                f"Nouvelles cartes: {meta['loyalty_new_cards']}",
                f"Points gagnés: {meta['loyalty_points_earned']}",
                f"Points utilisés: {meta['loyalty_points_redeemed']}",
            ],
            "issues": loyalty_issues,
            "improvements": loyalty_improvements,
            "actions": loyalty_actions,
        })

        voucher_issues = []
        voucher_improvements = []
        voucher_actions = []
        if meta["vouchers_open"] > 0:
            voucher_issues.append(f"{meta['vouchers_open']} bons de monnaie en attente.")
            voucher_improvements.append("Réduire les bons en attente.")
            voucher_actions.append("Encourager l'utilisation des bons.")
        if not voucher_issues:
            voucher_issues.append("Aucune alerte majeure détectée.")
            voucher_improvements.append("Continuer le suivi des bons.")
            voucher_actions.append("Surveiller les expirations.")

        sections.append({
            "title": "Bons de monnaie",
            "summary": [
                f"Bons émis: {meta['vouchers_issued']}",
                f"Bons utilisés: {meta['vouchers_redeemed']}",
                f"En attente: {meta['vouchers_open']}",
            ],
            "issues": voucher_issues,
            "improvements": voucher_improvements,
            "actions": voucher_actions,
        })

        employee_issues = []
        employee_improvements = []
        employee_actions = []
        employee_sales = (
            SaleTransaction.objects.filter(date__range=(start_dt, end_dt))
            .exclude(employer__isnull=True)
            .values("employer__user__first_name", "employer__user__last_name")
            .annotate(total=Sum("total_amount"))
            .order_by("-total")
        )
        active_employees = employee_sales.count()
        top_employee = employee_sales.first()
        top_employee_label = (
            f"{top_employee['employer__user__first_name']} {top_employee['employer__user__last_name']}"
            if top_employee else "Aucun"
        )
        if active_employees == 0:
            employee_issues.append("Aucune activité employé enregistrée.")
            employee_improvements.append("Vérifier les comptes caissiers.")
            employee_actions.append("Assurer la connexion des caissiers.")
        if meta["shift_open"] > 0:
            employee_issues.append(f"{meta['shift_open']} shifts non clôturés.")
            employee_improvements.append("Clôturer les shifts à la fin de service.")
            employee_actions.append("Rappeler la clôture des shifts.")
        if not employee_issues:
            employee_issues.append("Aucune alerte majeure détectée.")
            employee_improvements.append("Continuer le suivi des performances.")
            employee_actions.append("Partager les résultats avec l'équipe.")

        sections.append({
            "title": "Employés",
            "summary": [
                f"Employés actifs: {active_employees}",
                f"Top vendeur: {top_employee_label}",
            ],
            "issues": employee_issues,
            "improvements": employee_improvements,
            "actions": employee_actions,
        })

        return {
            "label": label,
            "range_label": range_label,
            "summary": stats["summary"],
            "sections": sections,
        }

    periods = [
        ("Jour", today, today),
        ("Semaine", today - timedelta(days=6), today),
        ("1 mois", today - timedelta(days=29), today),
        ("3 mois", today - timedelta(days=89), today),
    ]

    ai_debrief_data = {
        "generated_at": timezone.localtime().strftime("%d/%m/%Y %H:%M"),
        "periods": [build_period(label, start, end) for label, start, end in periods],
    }

    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": role,
        "ai_debrief_data": ai_debrief_data,
    }
    return render(request, "ai_assistant.html", context)


@permission_required("noyau.view_aiassistant", raise_exception=True)
def ai_assistant_query(request):
    query = request.GET.get("q", "").strip()
    if not query:
        return JsonResponse({"success": False, "error": "Requête vide."}, status=400)

    normalized = normalize_text(query)
    today = timezone.localdate()
    salimamoud_keywords = {
        "debriefing", "debrifing", "vente", "ventes", "caisse", "pos", "pyromane", "mini",
        "four", "boulangerie", "stock", "matiere", "production", "recette", "fidelite",
        "fidélité", "bon", "voucher", "employe", "employer", "caissier", "caissiere",
        "shift", "abime", "remise", "depense", "consommation", "client", "carte",
        "produit", "article", "prix", "statut", "marge", "profit", "panier",
        "evolution", "évolution", "comparatif", "comparaison", "variation",
        "sortie", "sorties", "destination", "retirer", "retirer", "impaye", "impayé",
        "annule", "annulé", "attente", "pickup", "alerte", "anomalie",
        "dashboard", "journalier", "quotidien", "heure", "jour",
        "paiement", "mode", "categorie", "catégorie", "rupture", "delai", "délai",
        "performance", "ecart", "écart", "delta", "motif",
        "panier", "pointe", "pointe", "inactif", "inactifs", "perte", "sans", "taux",
    }

    def resolve_period(text):
        if "hier" in text:
            day = today - timedelta(days=1)
            return (day, day), day.strftime("%d/%m/%Y")
        if "toute la duree" in text or "toute la durée" in text:
            return None, "Historique complet"
        if "2 semaines" in text or "deux semaines" in text:
            start = today - timedelta(days=13)
            return (start, today), f"{start.strftime('%d/%m/%Y')} → {today.strftime('%d/%m/%Y')}"
        if "3 semaines" in text or "trois semaines" in text:
            start = today - timedelta(days=20)
            return (start, today), f"{start.strftime('%d/%m/%Y')} → {today.strftime('%d/%m/%Y')}"
        if "semaine derniere" in text or "semaine dernière" in text:
            end = today - timedelta(days=1)
            start = end - timedelta(days=6)
            return (start, end), f"{start.strftime('%d/%m/%Y')} → {end.strftime('%d/%m/%Y')}"
        if "2 mois" in text or "deux mois" in text:
            start = today - timedelta(days=59)
            return (start, today), f"{start.strftime('%d/%m/%Y')} → {today.strftime('%d/%m/%Y')}"
        if "mois dernier" in text or "mois précédente" in text or "mois precedent" in text:
            first_of_month = today.replace(day=1)
            end = first_of_month - timedelta(days=1)
            start = end.replace(day=1)
            return (start, end), f"{start.strftime('%d/%m/%Y')} → {end.strftime('%d/%m/%Y')}"
        if "historique" in text or "tout" in text:
            return None, "Historique complet"
        if "3 mois" in text or "trois mois" in text:
            start = today - timedelta(days=89)
            return (start, today), f"{start.strftime('%d/%m/%Y')} → {today.strftime('%d/%m/%Y')}"
        if "semaine" in text:
            start = today - timedelta(days=6)
            return (start, today), f"{start.strftime('%d/%m/%Y')} → {today.strftime('%d/%m/%Y')}"
        if "periode en cours" in text or "période en cours" in text or "ce mois" in text:
            start = today.replace(day=1)
            return (start, today), f"{start.strftime('%d/%m/%Y')} → {today.strftime('%d/%m/%Y')}"
        if "mois" in text:
            start = today - timedelta(days=29)
            return (start, today), f"{start.strftime('%d/%m/%Y')} → {today.strftime('%d/%m/%Y')}"
        if "aujourdhui" in text or "aujourd'hui" in text:
            return (today, today), today.strftime("%d/%m/%Y")
        return (today, today), today.strftime("%d/%m/%Y")

    def period_bounds(start_date, end_date):
        start_dt = timezone.make_aware(datetime.combine(start_date, time.min))
        end_dt = timezone.make_aware(datetime.combine(end_date, time.max))
        return start_dt, end_dt

    period, period_label = resolve_period(normalized)

    def filter_range(qs, field):
        if not period:
            return qs
        start_date, end_date = period
        start_dt, end_dt = period_bounds(start_date, end_date)
        return qs.filter(**{f"{field}__range": (start_dt, end_dt)})

    def filter_date_range(qs, field):
        if not period:
            return qs
        start_date, end_date = period
        return qs.filter(**{f"{field}__range": (start_date, end_date)})

    STOPWORDS = {
        "le", "la", "les", "un", "une", "des", "de", "du", "au", "aux", "a",
        "pour", "par", "sur", "dans", "avec", "sans", "chez", "ce", "cet", "cette",
        "aujourd'hui", "aujourdhui", "hier", "demain", "tous", "tout", "toute",
        "historique", "periode", "période", "cours", "mois", "semaine", "jour",
        "salimamoud",
    }

    def extract_terms(text):
        tokens = re.split(r"\s+", normalize_text(text))
        tokens = [t for t in tokens if t and t not in STOPWORDS and len(t) > 2]
        return tokens

    def extract_after_keywords(text, keywords):
        for kw in keywords:
            match = re.search(rf"{kw}\s+(.+)", text)
            if match:
                return match.group(1).strip()
        return ""

    def search_by_terms(qs, fields, phrase, tokens):
        if phrase:
            cond = Q()
            for field in fields:
                cond |= Q(**{f"{field}__icontains": phrase})
            return qs.filter(cond)
        for token in tokens:
            cond = Q()
            for field in fields:
                cond |= Q(**{f"{field}__icontains": token})
            qs = qs.filter(cond)
        return qs

    email_match = re.search(r"[\w\.-]+@[\w\.-]+\.\w+", query)
    employee_keywords = ["employe", "employer", "caissier", "caissiere"]
    employee_context = any(word in normalized for word in employee_keywords) or bool(email_match)
    employee_only = employee_context and not any(word in normalized for word in [
        "ticket", "tickets", "transaction", "transactions", "vente", "ventes", "top",
        "shift", "abime", "remise", "depense", "consommation", "comparatif", "vs", "contre",
        "performance",
    ])

    def resolve_employee(text):
        email = re.search(r"[\w\.-]+@[\w\.-]+\.\w+", query)
        if email:
            users = User.objects.filter(email__iexact=email.group(0))
        else:
            phrase = extract_after_keywords(text, employee_keywords + ["par"])
            tokens = extract_terms(query)
            user_qs = User.objects.all()
            if phrase:
                phrase_tokens = extract_terms(phrase)
                if len(phrase_tokens) >= 2:
                    user_qs = search_by_terms(user_qs, ["first_name", "last_name", "email"], "", phrase_tokens)
                else:
                    user_qs = search_by_terms(user_qs, ["first_name", "last_name", "email"], phrase, [])
            elif tokens:
                user_qs = search_by_terms(user_qs, ["first_name", "last_name", "email"], "", tokens)
            users = user_qs
        return users

    def resolve_employee_from_phrase(phrase):
        cleaned = normalize_text(phrase)
        cleaned = re.sub(r"\b(employe|employer|caissier|caissiere)\b", " ", cleaned)
        tokens = extract_terms(cleaned)
        if not tokens:
            return User.objects.none()
        return search_by_terms(User.objects.all(), ["first_name", "last_name", "email"], "", tokens)

    def build_employee_stats(employer, start_dt=None, end_dt=None, start_date=None, end_date=None):
        pos_qs = SaleTransaction.objects.filter(employer=employer) if employer else SaleTransaction.objects.none()
        bakery_qs = BakerySale.objects.filter(paid_by=employer, is_paid=True) if employer else BakerySale.objects.none()
        pyro_qs = PyromaneOrder.objects.filter(paid_by=employer, status="PAID") if employer else PyromaneOrder.objects.none()
        shift_qs = PosShiftReport.objects.filter(cashier=employer) if employer else PosShiftReport.objects.none()

        if start_dt and end_dt:
            pos_qs = pos_qs.filter(date__range=(start_dt, end_dt))
            bakery_qs = bakery_qs.filter(paid_at__range=(start_dt, end_dt))
            pyro_qs = pyro_qs.filter(paid_at__range=(start_dt, end_dt))
        if start_date and end_date:
            shift_qs = shift_qs.filter(shift_date__range=(start_date, end_date))

        pos_total = pos_qs.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        bakery_total = bakery_qs.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        pyro_total = pyro_qs.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")

        pos_tickets = pos_qs.count()
        bakery_tickets = bakery_qs.count()
        pyro_tickets = pyro_qs.count()

        shifts_open = shift_qs.filter(closed_at__isnull=True).count()
        abimes_qty = PosShiftAbime.objects.filter(report__in=shift_qs).aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
        remises_qty = PosShiftRemise.objects.filter(report__in=shift_qs).aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
        consumptions_qty = PosShiftConsumption.objects.filter(report__in=shift_qs).aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
        expenses_amt = PosShiftExpense.objects.filter(report__in=shift_qs).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

        alerts = 0
        if shifts_open > 0:
            alerts += 1
        if abimes_qty > 0:
            alerts += 1
        if remises_qty > 0:
            alerts += 1
        if consumptions_qty > 0:
            alerts += 1
        if expenses_amt > 0:
            alerts += 1

        reliability_score = max(0, 100 - alerts * 15)
        star_score = max(1, min(5, int(round(reliability_score / 20))))
        stars = "★" * star_score + "☆" * (5 - star_score)
        if reliability_score >= 85:
            badge = "OK"
        elif reliability_score >= 60:
            badge = "Attention"
        else:
            badge = "Critique"

        return {
            "pos_total": pos_total,
            "bakery_total": bakery_total,
            "pyro_total": pyro_total,
            "pos_tickets": pos_tickets,
            "bakery_tickets": bakery_tickets,
            "pyro_tickets": pyro_tickets,
            "shifts": shift_qs.count(),
            "shifts_open": shifts_open,
            "abimes": abimes_qty,
            "remises": remises_qty,
            "consumptions": consumptions_qty,
            "expenses": expenses_amt,
            "reliability_score": reliability_score,
            "stars": stars,
            "badge": badge,
            "alerts": alerts,
        }

    if employee_only:
        users = resolve_employee(normalized)

        if users.count() == 0:
            return JsonResponse({"success": False, "error": "Employé introuvable."}, status=404)

        if users.count() > 1:
            suggestions = [f"{u.first_name} {u.last_name} ({u.email})" for u in users[:5]]
            return JsonResponse({
                "success": True,
                "title": "Plusieurs employés trouvés",
                "period_label": period_label,
                "sections": [{
                    "title": "Employés",
                    "summary": suggestions,
                    "issues": ["Merci de préciser le nom ou l'email exact."],
                    "actions": ["Réessayez avec l'email complet."],
                }],
            })

        user = users.first()
        employer = getattr(user, "employer", None)

        transactions = SaleTransaction.objects.filter(employer=employer) if employer else SaleTransaction.objects.none()
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            transactions = transactions.filter(date__range=(start_dt, end_dt))
        pos_total = transactions.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        pos_tickets = transactions.count()

        bakery_sales = BakerySale.objects.filter(paid_by=employer) if employer else BakerySale.objects.none()
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            bakery_sales = bakery_sales.filter(paid_at__range=(start_dt, end_dt))
        bakery_total = bakery_sales.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        bakery_tickets = bakery_sales.count()

        pyromane_orders = PyromaneOrder.objects.filter(paid_by=employer) if employer else PyromaneOrder.objects.none()
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            pyromane_orders = pyromane_orders.filter(paid_at__range=(start_dt, end_dt))
        pyromane_total = pyromane_orders.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        pyromane_tickets = pyromane_orders.count()

        shifts = PosShiftReport.objects.filter(cashier=employer) if employer else PosShiftReport.objects.none()
        if period:
            shifts = shifts.filter(shift_date__range=(period[0], period[1]))
        shifts_total = shifts.count()
        shifts_open = shifts.filter(closed_at__isnull=True).count()

        actions_period = period if period else (today, today)
        actions_label = period_label if period else today.strftime("%d/%m/%Y")
        actions_start_dt, actions_end_dt = period_bounds(actions_period[0], actions_period[1])

        pos_actions = (
            SaleTransaction.objects.filter(employer=employer, date__range=(actions_start_dt, actions_end_dt))
            if employer else SaleTransaction.objects.none()
        )
        bakery_actions = (
            BakerySale.objects.filter(paid_by=employer, paid_at__range=(actions_start_dt, actions_end_dt))
            if employer else BakerySale.objects.none()
        )
        pyromane_actions = (
            PyromaneOrder.objects.filter(paid_by=employer, status="PAID", paid_at__range=(actions_start_dt, actions_end_dt))
            if employer else PyromaneOrder.objects.none()
        )

        shifts_actions = (
            PosShiftReport.objects.filter(cashier=employer, shift_date__range=(actions_period[0], actions_period[1]))
            if employer else PosShiftReport.objects.none()
        )
        abimes_actions = PosShiftAbime.objects.filter(report__in=shifts_actions)
        remises_actions = PosShiftRemise.objects.filter(report__in=shifts_actions)
        expenses_actions = PosShiftExpense.objects.filter(report__in=shifts_actions)
        cons_actions = PosShiftConsumption.objects.filter(report__in=shifts_actions)

        abimes_qty = abimes_actions.aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
        remises_qty = remises_actions.aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
        expenses_amt = expenses_actions.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        cons_qty = cons_actions.aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")

        issues_actions = []
        if shifts_actions.filter(closed_at__isnull=True).exists():
            issues_actions.append("Shift non clôturé sur la période.")
        if abimes_qty > 0:
            issues_actions.append(f"Abîmés signalés: {int(abimes_qty)}")
        if remises_qty > 0:
            issues_actions.append(f"Remises signalées: {int(remises_qty)}")
        if expenses_amt > 0:
            issues_actions.append(f"Dépenses caisse: {int(expenses_amt)} KMF")
        if cons_qty > 0:
            issues_actions.append(f"Consommations internes: {int(cons_qty)}")

        alerts_count = len(issues_actions)
        reliability_score = max(0, 100 - alerts_count * 15)
        star_score = max(1, min(5, int(round(reliability_score / 20))))
        stars = "★" * star_score + "☆" * (5 - star_score)
        if reliability_score >= 85:
            badge = "OK"
        elif reliability_score >= 60:
            badge = "Attention"
        else:
            badge = "Critique"
        reliability_label = (
            f"Fiabilité: {reliability_score}% ({alerts_count} alerte{'s' if alerts_count > 1 else ''}) · "
            f"{stars} · {badge}"
        )

        shift_scores = []
        for report in shifts_actions.select_related("cashier__user"):
            abime = report.abimes.aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
            remise = report.remises.aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
            cons = report.consumptions.aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
            exp = report.expenses.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
            alert_count = 0
            if report.closed_at is None:
                alert_count += 1
            if abime > 0:
                alert_count += 1
            if remise > 0:
                alert_count += 1
            if cons > 0:
                alert_count += 1
            if exp > 0:
                alert_count += 1
            score = max(0, 100 - alert_count * 15)
            shift_scores.append(
                f"{report.shift_date.strftime('%d/%m')} {report.shift} · {score}% · alertes {alert_count}"
            )

        history_period = period
        pos_hist = SaleTransaction.objects.filter(employer=employer) if employer else SaleTransaction.objects.none()
        bakery_hist = BakerySale.objects.filter(paid_by=employer) if employer else BakerySale.objects.none()
        pyro_hist = PyromaneOrder.objects.filter(paid_by=employer, status="PAID") if employer else PyromaneOrder.objects.none()
        shift_hist = PosShiftReport.objects.filter(cashier=employer) if employer else PosShiftReport.objects.none()
        if history_period:
            hist_start_dt, hist_end_dt = period_bounds(history_period[0], history_period[1])
            pos_hist = pos_hist.filter(date__range=(hist_start_dt, hist_end_dt))
            bakery_hist = bakery_hist.filter(paid_at__range=(hist_start_dt, hist_end_dt))
            pyro_hist = pyro_hist.filter(paid_at__range=(hist_start_dt, hist_end_dt))
            shift_hist = shift_hist.filter(shift_date__range=(history_period[0], history_period[1]))

        pos_hist = pos_hist.order_by("-date")
        bakery_hist = bakery_hist.order_by("-paid_at")
        pyro_hist = pyro_hist.order_by("-paid_at")
        shift_hist = shift_hist.order_by("-shift_date", "-shift")

        pos_hist_lines = [
            f"POS #{tx.id} · {tx.date.strftime('%d/%m %H:%M')} · {int(tx.total_amount)} KMF"
            for tx in pos_hist
        ]
        bakery_hist_lines = [
            f"Mini‑Four #{sale.id} · {(sale.paid_at or sale.date).strftime('%d/%m %H:%M')} · {int(sale.total_amount)} KMF"
            for sale in bakery_hist
        ]
        pyro_hist_lines = [
            f"Pyromane {order.order_number} · {order.paid_at.strftime('%d/%m %H:%M') if order.paid_at else '--'} · {int(order.total_amount)} KMF"
            for order in pyro_hist
        ]
        shift_hist_lines = [
            f"Shift {report.shift_date.strftime('%d/%m')} {report.shift} · {'Clôturé' if report.closed_at else 'Ouvert'}"
            for report in shift_hist
        ]

        return JsonResponse({
            "success": True,
            "title": f"Employé: {user.first_name} {user.last_name}",
            "period_label": period_label,
            "sections": [
                {
                    "title": "Actions (période)",
                    "summary": [
                        f"Période: {actions_label}",
                        f"POS: {int(pos_actions.aggregate(total=Sum('total_amount'))['total'] or 0)} KMF · {pos_actions.count()} tickets",
                        f"Mini‑Four: {int(bakery_actions.aggregate(total=Sum('total_amount'))['total'] or 0)} KMF · {bakery_actions.count()} tickets",
                        f"Pyromane: {int(pyromane_actions.aggregate(total=Sum('total_amount'))['total'] or 0)} KMF · {pyromane_actions.count()} tickets",
                        f"Abîmés: {int(abimes_qty)} · Remises: {int(remises_qty)} · Consommations: {int(cons_qty)}",
                        f"Dépenses: {int(expenses_amt)} KMF",
                        reliability_label,
                    ],
                    "issues": issues_actions or ["Aucun problème détecté sur la période."],
                    "actions": [],
                },
                {
                    "title": "Scores par shift",
                    "summary": shift_scores or ["Aucun shift sur la période."],
                    "issues": [],
                    "actions": [],
                },
                {
                    "title": "Historique POS",
                    "summary": pos_hist_lines or ["Aucune action POS."],
                    "issues": [],
                    "actions": [],
                },
                {
                    "title": "Historique Mini‑Four",
                    "summary": bakery_hist_lines or ["Aucune action Mini‑Four."],
                    "issues": [],
                    "actions": [],
                },
                {
                    "title": "Historique Pyromane",
                    "summary": pyro_hist_lines or ["Aucune action Pyromane."],
                    "issues": [],
                    "actions": [],
                },
                {
                    "title": "Historique Shifts",
                    "summary": shift_hist_lines or ["Aucun shift enregistré."],
                    "issues": [],
                    "actions": [],
                },
                {
                    "title": "Ventes POS",
                    "summary": [
                        f"CA: {int(pos_total)} KMF",
                        f"Tickets: {pos_tickets}",
                    ],
                    "issues": [],
                    "actions": [],
                },
                {
                    "title": "Mini-Four",
                    "summary": [
                        f"CA: {int(bakery_total)} KMF",
                        f"Tickets: {bakery_tickets}",
                    ],
                    "issues": [],
                    "actions": [],
                },
                {
                    "title": "Pyromane",
                    "summary": [
                        f"CA: {int(pyromane_total)} KMF",
                        f"Tickets: {pyromane_tickets}",
                    ],
                    "issues": [],
                    "actions": [],
                },
                {
                    "title": "Shifts",
                    "summary": [
                        f"Shifts: {shifts_total}",
                        f"Non clôturés: {shifts_open}",
                    ],
                    "issues": [],
                    "actions": [],
                },
            ],
        })

    vs_match = re.search(r"(.+?)\s+(vs|contre)\s+(.+)", normalized)
    if vs_match and any(word in normalized for word in employee_keywords):
        left_phrase = vs_match.group(1).strip()
        right_phrase = vs_match.group(3).strip()
        left_users = resolve_employee_from_phrase(left_phrase)
        right_users = resolve_employee_from_phrase(right_phrase)

        if left_users.count() == 0 or right_users.count() == 0:
            return JsonResponse({"success": False, "error": "Employé introuvable pour le comparatif."}, status=404)
        if left_users.count() > 1 or right_users.count() > 1:
            suggestions = []
            if left_users.count() > 1:
                suggestions += [f"{u.first_name} {u.last_name} ({u.email})" for u in left_users[:3]]
            if right_users.count() > 1:
                suggestions += [f"{u.first_name} {u.last_name} ({u.email})" for u in right_users[:3]]
            return JsonResponse({
                "success": True,
                "title": "Plusieurs employés trouvés",
                "period_label": period_label,
                "sections": [{
                    "title": "Employés",
                    "summary": suggestions,
                    "issues": ["Merci de préciser les deux employés (nom complet ou email)."],
                    "actions": [],
                }],
            })

        left_user = left_users.first()
        right_user = right_users.first()
        left_employer = getattr(left_user, "employer", None)
        right_employer = getattr(right_user, "employer", None)

        start_dt = end_dt = None
        start_date = end_date = None
        if period:
            start_date, end_date = period
            start_dt, end_dt = period_bounds(start_date, end_date)

        left_stats = build_employee_stats(left_employer, start_dt, end_dt, start_date, end_date)
        right_stats = build_employee_stats(right_employer, start_dt, end_dt, start_date, end_date)

        def total_ca(stats):
            return stats["pos_total"] + stats["bakery_total"] + stats["pyro_total"]

        def total_tickets(stats):
            return stats["pos_tickets"] + stats["bakery_tickets"] + stats["pyro_tickets"]

        left_total = total_ca(left_stats)
        right_total = total_ca(right_stats)
        left_tickets = total_tickets(left_stats)
        right_tickets = total_tickets(right_stats)

        def diff_line(label, left_val, right_val, suffix=""):
            diff = left_val - right_val
            sign = "+" if diff >= 0 else "-"
            return f"{label}: {int(left_val)}{suffix} vs {int(right_val)}{suffix} ({sign}{int(abs(diff))}{suffix})"

        return JsonResponse({
            "success": True,
            "title": "Comparatif employés",
            "period_label": period_label,
            "sections": [{
                "title": f"{left_user.first_name} {left_user.last_name}",
                "summary": [
                    f"CA total: {int(left_total)} KMF",
                    f"Tickets: {left_tickets}",
                    f"POS: {int(left_stats['pos_total'])} KMF · {left_stats['pos_tickets']} tickets",
                    f"Mini‑Four: {int(left_stats['bakery_total'])} KMF · {left_stats['bakery_tickets']} tickets",
                    f"Pyromane: {int(left_stats['pyro_total'])} KMF · {left_stats['pyro_tickets']} tickets",
                    f"Fiabilité: {left_stats['reliability_score']}% · {left_stats['stars']} · {left_stats['badge']}",
                ],
                "issues": [],
                "actions": [],
            }, {
                "title": f"{right_user.first_name} {right_user.last_name}",
                "summary": [
                    f"CA total: {int(right_total)} KMF",
                    f"Tickets: {right_tickets}",
                    f"POS: {int(right_stats['pos_total'])} KMF · {right_stats['pos_tickets']} tickets",
                    f"Mini‑Four: {int(right_stats['bakery_total'])} KMF · {right_stats['bakery_tickets']} tickets",
                    f"Pyromane: {int(right_stats['pyro_total'])} KMF · {right_stats['pyro_tickets']} tickets",
                    f"Fiabilité: {right_stats['reliability_score']}% · {right_stats['stars']} · {right_stats['badge']}",
                ],
                "issues": [],
                "actions": [],
            }, {
                "title": "Comparatif direct",
                "summary": [
                    diff_line("CA total", left_total, right_total, " KMF"),
                    diff_line("Tickets", left_tickets, right_tickets),
                    diff_line("POS", left_stats["pos_total"], right_stats["pos_total"], " KMF"),
                    diff_line("Mini‑Four", left_stats["bakery_total"], right_stats["bakery_total"], " KMF"),
                    diff_line("Pyromane", left_stats["pyro_total"], right_stats["pyro_total"], " KMF"),
                    diff_line("Fiabilité", left_stats["reliability_score"], right_stats["reliability_score"], "%"),
                ],
                "issues": [],
                "actions": [],
            }],
        })

    if "dashboard" in normalized or ("rapport" in normalized and ("quotidien" in normalized or "journalier" in normalized)):
        start_date = today
        end_date = today
        start_dt, end_dt = period_bounds(start_date, end_date)

        pyromane_orders = PyromaneOrder.objects.filter(status="PAID", paid_at__range=(start_dt, end_dt))
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
        top_pos_lines = [f"{row['product__name']} · {int(row['qty'] or 0)} u" for row in top_pos]
        top_bakery = (
            BakerySaleItem.objects.filter(bakery__is_paid=True, bakery__paid_at__range=(start_dt, end_dt))
            .values("product__name")
            .annotate(qty=Sum("quantity"))
            .order_by("-qty")[:5]
        )
        top_bakery_lines = [f"{row['product__name']} · {int(row['qty'] or 0)} u" for row in top_bakery]

        open_shifts = PosShiftReport.objects.filter(shift_date=today, closed_at__isnull=True).count()
        expenses_total = PosShiftExpense.objects.filter(report__shift_date=today).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        abimes_total = PosShiftAbime.objects.filter(report__shift_date=today).aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
        remises_total = PosShiftRemise.objects.filter(report__shift_date=today).aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")

        low_stock = RawMaterial.objects.filter(current_stock__lte=F("min_stock"))
        low_stock_names = list(low_stock.values_list("name", flat=True)[:3])
        vouchers_open = CashChangeVoucher.objects.filter(status="ISSUED").count()
        pyromane_pending = PyromaneOrder.objects.filter(status="PENDING").count()

        return JsonResponse({
            "success": True,
            "title": "Dashboard IA quotidien",
            "period_label": today.strftime("%d/%m/%Y"),
            "sections": [{
                "title": "Résumé",
                "summary": [
                    f"CA total: {int(total_ca)} KMF",
                    f"Tickets: {total_tickets}",
                    f"POS: {int(pos_total)} KMF · {pos_tickets} tickets",
                    f"Mini‑Four: {int(bakery_total)} KMF · {bakery_tickets} tickets",
                    f"Pyromane: {int(pyromane_total)} KMF · {pyromane_tickets} tickets",
                ],
                "issues": [],
                "actions": ["Dashboard prêt à être envoyé automatiquement chaque jour."],
            }, {
                "title": "Alertes du jour",
                "summary": [
                    f"Shifts non clôturés: {open_shifts}",
                    f"Dépenses caisse: {int(expenses_total)} KMF",
                    f"Abîmés: {int(abimes_total)} · Remises: {int(remises_total)}",
                    f"Ruptures matières: {low_stock.count()}",
                    f"Pyromane en attente: {pyromane_pending}",
                    f"Bons de monnaie ouverts: {vouchers_open}",
                ],
                "issues": [
                    f"Stock critique: {', '.join(low_stock_names) or 'Aucun'}",
                ],
                "actions": ["Traiter les alertes prioritaires."],
            }, {
                "title": "Top produits",
                "summary": [
                    "POS: " + (top_pos_lines[0] if top_pos_lines else "Aucun"),
                    "Mini‑Four: " + (top_bakery_lines[0] if top_bakery_lines else "Aucun"),
                ],
                "issues": [],
                "actions": [],
            }],
        })

    if "aide" in normalized or "help" in normalized:
        return JsonResponse({
            "success": True,
            "title": "Questions Salimamoud",
            "period_label": "",
            "sections": [{
                "title": "Exemples",
                "summary": [
                    "Débriefing",
                    "Employé Ali aujourd'hui",
                    "Employé Ali historique",
                    "Ventes semaine",
                    "Stocks période en cours",
                    "Sorties stock POS semaine",
                    "Comparatif production mois",
                    "Production aujourd'hui",
                    "Bons de monnaie historique",
                    "Bons émis aujourd'hui",
                    "Mini-Four non payées",
                    "Tickets aujourd'hui",
                    "Ticket 1245",
                    "Pyromane 12",
                    "Pyromane en attente aujourd'hui",
                    "Produit moka orange historique",
                    "Produit moka orange historique complet",
                    "Top produits par CA",
                    "Top employés ticket moyen",
                    "Comparatif employés Ali vs Sana",
                    "Ventes par mode de paiement",
                    "Ventes par categorie",
                    "Ventes par heure",
                    "Ventes par jour",
                    "Top abimes par produit",
                    "Top remises par produit",
                    "Top consommations par produit",
                    "Top depenses (motifs)",
                    "Abimes par caissier",
                    "Remises par caissier",
                    "Consommations par caissier",
                    "Depenses par caissier",
                    "Historique sorties stock farine",
                    "Comparatif produit croissant vs pain au lait",
                    "Top ruptures avant 10h",
                    "Bons expirant bientot",
                    "Delai moyen Pyromane",
                    "Top clients fidelite points",
                    "Performance Ali par shift",
                    "Ecart production vs ventes",
                    "Panier moyen aujourd'hui",
                    "Heures de pointe",
                    "Produits sans ventes semaine",
                    "Recettes manquantes",
                    "Clients fidelite inactifs 30 jours",
                    "Perte bons expires",
                    "Taux abimes semaine",
                    "Taux remises semaine",
                    "Top matieres consommees",
                    "Produit croissant heure rupture semaine",
                    "Produit croissant heure rupture 2 semaines",
                    "Produit croissant heure rupture 3 semaines",
                    "Produit croissant heure rupture 1 mois",
                    "Produit croissant heure rupture 2 mois",
                    "Produit croissant heure rupture 3 mois",
                    "Produit croissant heure rupture historique",
                    "Anomalies produits semaine",
                    "Progression produit croissant semaine",
                    "Comparatif produit croissant vs pain au lait multi",
                    "Top pertes financieres abimes remises",
                    "Alertes automatiques",
                    "Dashboard IA quotidien",
                    "Évolution CA semaine",
                    "Top produits par marge",
                ],
                "issues": [],
                "actions": ["Utilisez aujourd'hui, semaine, mois, 3 mois, historique."],
            }],
        })

    pg_match = re.search(r"pg-\d{8}-\d+", normalized)
    if not pg_match:
        pg_match = re.search(r"pg-?\d+", normalized)
    if pg_match:
        code = pg_match.group(0).upper()
        if not code.startswith("PG-"):
            code = code.replace("PG", "PG-")
        order = PyromaneOrder.objects.filter(order_number__iexact=code).first()
        if not order:
            return JsonResponse({"success": False, "error": "Commande Pyromane introuvable."}, status=404)
        items = PyromaneOrderItem.objects.filter(order=order).select_related("product")
        lines = [f"{it.product.name} · {it.quantity} u · {int(it.subtotal)} KMF" for it in items]
        cashier = ""
        if order.paid_by and order.paid_by.user:
            cashier = f"{order.paid_by.user.first_name} {order.paid_by.user.last_name}"
        return JsonResponse({
            "success": True,
            "title": f"Commande Pyromane {order.order_number}",
            "period_label": order.created_at.strftime("%d/%m/%Y %H:%M"),
            "sections": [{
                "title": "Résumé",
                "summary": [
                    f"Total: {int(order.total_amount)} KMF",
                    f"Statut: {order.status}",
                    f"Caissier: {cashier or 'N/A'}",
                ],
                "issues": [],
                "actions": [],
            }, {
                "title": "Détail",
                "summary": lines or ["Aucun article."],
                "issues": [],
                "actions": [],
            }],
        })

    pyro_id_match = re.search(r"pyromane\s*#?\s*(\d+)", normalized)
    if pyro_id_match:
        pyro_id = int(pyro_id_match.group(1))
        order = PyromaneOrder.objects.filter(id=pyro_id).first()
        if not order:
            return JsonResponse({"success": False, "error": "Commande Pyromane introuvable."}, status=404)
        items = PyromaneOrderItem.objects.filter(order=order).select_related("product")
        lines = [f"{it.product.name} · {it.quantity} u · {int(it.subtotal)} KMF" for it in items]
        cashier = ""
        if order.paid_by and order.paid_by.user:
            cashier = f"{order.paid_by.user.first_name} {order.paid_by.user.last_name}"
        return JsonResponse({
            "success": True,
            "title": f"Commande Pyromane #{order.id}",
            "period_label": order.created_at.strftime("%d/%m/%Y %H:%M"),
            "sections": [{
                "title": "Résumé",
                "summary": [
                    f"Numéro: {order.order_number}",
                    f"Total: {int(order.total_amount)} KMF",
                    f"Statut: {order.status}",
                    f"Caissier: {cashier or 'N/A'}",
                ],
                "issues": [],
                "actions": [],
            }, {
                "title": "Détail",
                "summary": lines or ["Aucun article."],
                "issues": [],
                "actions": [],
            }],
        })

    ticket_match = re.search(r"(ticket|transaction|tx|commande)\s*#?\s*(\d+)", normalized)
    if ticket_match:
        ticket_id = int(ticket_match.group(2))
        tx = SaleTransaction.objects.filter(id=ticket_id).first()
        if tx:
            items = SaleTransactionItem.objects.filter(transaction=tx).select_related("product")
            lines = [f"{it.product.name} · {it.quantity} u · {int(it.subtotal)} KMF" for it in items]
            cashier = "N/A"
            if tx.employer and tx.employer.user:
                cashier = f"{tx.employer.user.first_name} {tx.employer.user.last_name}"
            return JsonResponse({
                "success": True,
                "title": f"Ticket POS #{tx.id}",
                "period_label": tx.date.strftime("%d/%m/%Y %H:%M"),
                "sections": [{
                    "title": "Résumé",
                    "summary": [
                        f"Total: {int(tx.total_amount)} KMF",
                        f"Caissier: {cashier}",
                        f"Articles: {items.count()}",
                    ],
                    "issues": [],
                    "actions": [],
                }, {
                    "title": "Détail",
                    "summary": lines or ["Aucun article."],
                    "issues": [],
                    "actions": [],
                }],
            })

        sale = BakerySale.objects.filter(id=ticket_id).first()
        if sale:
            items = BakerySaleItem.objects.filter(bakery=sale).select_related("product")
            lines = [f"{it.product.name} · {it.quantity} u · {int(it.subtotal)} KMF" for it in items]
            cashier = "N/A"
            if sale.paid_by and sale.paid_by.user:
                cashier = f"{sale.paid_by.user.first_name} {sale.paid_by.user.last_name}"
            date_label = sale.paid_at or sale.date
            return JsonResponse({
                "success": True,
                "title": f"Ticket Mini-Four #{sale.id}",
                "period_label": date_label.strftime("%d/%m/%Y %H:%M"),
                "sections": [{
                    "title": "Résumé",
                    "summary": [
                        f"Total: {int(sale.total_amount)} KMF",
                        f"Client: {sale.client}",
                        f"Caissier: {cashier}",
                    ],
                    "issues": [],
                    "actions": [],
                }, {
                    "title": "Détail",
                    "summary": lines or ["Aucun article."],
                    "issues": [],
                    "actions": [],
                }],
            })

        return JsonResponse({"success": False, "error": "Ticket introuvable."}, status=404)

    if "ticket" in normalized or "tickets" in normalized or "transaction" in normalized:
        employee_filter = None
        if employee_context:
            users = resolve_employee(normalized)
            if users.count() == 0:
                return JsonResponse({"success": False, "error": "Employé introuvable."}, status=404)
            if users.count() > 1:
                suggestions = [f"{u.first_name} {u.last_name} ({u.email})" for u in users[:5]]
                return JsonResponse({
                    "success": True,
                    "title": "Plusieurs employés trouvés",
                    "period_label": period_label,
                    "sections": [{
                        "title": "Employés",
                        "summary": suggestions,
                        "issues": ["Merci de préciser le nom ou l'email exact."],
                        "actions": ["Réessayez avec l'email complet."],
                    }],
                })
            user = users.first()
            employee_filter = getattr(user, "employer", None)

        pos_tx = SaleTransaction.objects.select_related("employer__user").order_by("-date")
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            pos_tx = pos_tx.filter(date__range=(start_dt, end_dt))
        if employee_filter:
            pos_tx = pos_tx.filter(employer=employee_filter)
        pos_tx = pos_tx[:10]
        pos_lines = []
        for tx in pos_tx:
            cashier = ""
            if tx.employer and tx.employer.user:
                cashier = f"{tx.employer.user.first_name} {tx.employer.user.last_name}"
            pos_lines.append(
                f"#{tx.id} · {tx.date.strftime('%H:%M')} · {int(tx.total_amount)} KMF · {cashier or 'N/A'}"
            )

        bakery_sales = BakerySale.objects.select_related("paid_by__user").order_by("-paid_at")
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            bakery_sales = bakery_sales.filter(paid_at__range=(start_dt, end_dt))
        if employee_filter:
            bakery_sales = bakery_sales.filter(paid_by=employee_filter)
        bakery_sales = bakery_sales[:10]
        bakery_lines = []
        for sale in bakery_sales:
            cashier = ""
            if sale.paid_by and sale.paid_by.user:
                cashier = f"{sale.paid_by.user.first_name} {sale.paid_by.user.last_name}"
            sale_time = sale.paid_at or sale.date
            bakery_lines.append(
                f"#{sale.id} · {sale_time.strftime('%H:%M')} · {int(sale.total_amount)} KMF · {cashier or 'N/A'}"
            )

        pyro_orders = PyromaneOrder.objects.select_related("paid_by__user").filter(status="PAID").order_by("-paid_at")
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            pyro_orders = pyro_orders.filter(paid_at__range=(start_dt, end_dt))
        if employee_filter:
            pyro_orders = pyro_orders.filter(paid_by=employee_filter)
        pyro_orders = pyro_orders[:10]
        pyro_lines = []
        for order in pyro_orders:
            cashier = ""
            if order.paid_by and order.paid_by.user:
                cashier = f"{order.paid_by.user.first_name} {order.paid_by.user.last_name}"
            time_label = order.paid_at.strftime("%H:%M") if order.paid_at else "--"
            pyro_lines.append(
                f"{order.order_number} · {time_label} · {int(order.total_amount)} KMF · {cashier or 'N/A'}"
            )

        return JsonResponse({
            "success": True,
            "title": "Tickets",
            "period_label": period_label,
            "sections": [{
                "title": "POS",
                "summary": pos_lines or ["Aucun ticket."],
                "issues": [],
                "actions": ["Utilisez 'ticket #ID' pour le détail."],
            }, {
                "title": "Mini-Four",
                "summary": bakery_lines or ["Aucun ticket."],
                "issues": [],
                "actions": [],
            }, {
                "title": "Pyromane",
                "summary": pyro_lines or ["Aucun ticket."],
                "issues": [],
                "actions": [],
            }],
        })

    if "liste" in normalized and ("produit" in normalized or "article" in normalized):
        sale_products = list(SaleProduct.objects.order_by("name").values_list("name", flat=True)[:10])
        bakery_products = list(BakeryProduct.objects.order_by("name").values_list("name", flat=True)[:10])
        return JsonResponse({
            "success": True,
            "title": "Liste des produits",
            "period_label": "",
            "sections": [{
                "title": "POS",
                "summary": sale_products or ["Aucun produit POS."],
                "issues": [],
                "actions": [],
            }, {
                "title": "Mini-Four",
                "summary": bakery_products or ["Aucun produit Mini-Four."],
                "issues": [],
                "actions": [],
            }],
        })

    if "liste" in normalized and ("employe" in normalized or "employer" in normalized):
        employees = Employer.objects.select_related("user").all().order_by("user__first_name")[:10]
        names = [f"{e.user.first_name} {e.user.last_name}" for e in employees]
        return JsonResponse({
            "success": True,
            "title": "Liste des employés",
            "period_label": "",
            "sections": [{
                "title": "Employés",
                "summary": names or ["Aucun employé."],
                "issues": [],
                "actions": [],
            }],
        })

    if "liste" in normalized and ("client" in normalized or "fid" in normalized):
        clients = Loyalty.objects.order_by("client").values_list("client", flat=True)[:10]
        return JsonResponse({
            "success": True,
            "title": "Liste des clients fidélité",
            "period_label": "",
            "sections": [{
                "title": "Clients",
                "summary": list(clients) or ["Aucun client."],
                "issues": [],
                "actions": [],
            }],
        })

    if "top" in normalized and ("produit" in normalized or "article" in normalized) and ("marge" in normalized or "profit" in normalized):
        return JsonResponse({
            "success": True,
            "title": "Top produits par marge",
            "period_label": period_label,
            "sections": [{
                "title": "Marge indisponible",
                "summary": [
                    "Les coûts matières ne sont pas renseignés, impossible de calculer la marge.",
                    "Ajoutez les coûts matières premières (recettes) pour activer cette analyse.",
                ],
                "issues": [],
                "actions": ["Compléter les recettes avec coûts matières."],
            }],
        })

    if "top" in normalized and ("produit" in normalized or "ventes" in normalized):
        start_dt = end_dt = None
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
        sort_by_amount = (
            re.search(r"\bca\b", normalized)
            or "montant" in normalized
            or "chiffre" in normalized
            or "valeur" in normalized
        )
        sort_by_qty = "quantite" in normalized or "quantité" in normalized or "qte" in normalized or "volume" in normalized
        sort_mode = "amount" if sort_by_amount and not sort_by_qty else "qty"

        pos_items = SaleTransactionItem.objects.all()
        if period:
            pos_items = pos_items.filter(transaction__date__range=(start_dt, end_dt))
        if sort_mode == "amount":
            top_pos = (
                pos_items.values("product__name")
                .annotate(amount=Sum("subtotal"))
                .order_by("-amount")[:5]
            )
            top_pos_list = [f"{row['product__name']} · {int(row['amount'] or 0)} KMF" for row in top_pos]
        else:
            top_pos = (
                pos_items.values("product__name")
                .annotate(qty=Sum("quantity"))
                .order_by("-qty")[:5]
            )
            top_pos_list = [f"{row['product__name']} · {int(row['qty'] or 0)} u" for row in top_pos]

        bakery_items = BakerySaleItem.objects.filter(bakery__is_paid=True)
        if period:
            bakery_items = bakery_items.filter(bakery__paid_at__range=(start_dt, end_dt))
        if sort_mode == "amount":
            top_bakery = (
                bakery_items.values("product__name")
                .annotate(amount=Sum("subtotal"))
                .order_by("-amount")[:5]
            )
            top_bakery_list = [f"{row['product__name']} · {int(row['amount'] or 0)} KMF" for row in top_bakery]
        else:
            top_bakery = (
                bakery_items.values("product__name")
                .annotate(qty=Sum("quantity"))
                .order_by("-qty")[:5]
            )
            top_bakery_list = [f"{row['product__name']} · {int(row['qty'] or 0)} u" for row in top_bakery]

        return JsonResponse({
            "success": True,
            "title": "Top produits",
            "period_label": period_label,
            "sections": [{
                "title": "POS + Pyromane",
                "summary": [f"Tri: {'CA' if sort_mode == 'amount' else 'Quantité'}"] + (top_pos_list or ["Aucun produit vendu."]),
                "issues": [],
                "actions": [],
            }, {
                "title": "Mini-Four",
                "summary": [f"Tri: {'CA' if sort_mode == 'amount' else 'Quantité'}"] + (top_bakery_list or ["Aucune vente Mini-Four."]),
                "issues": [],
                "actions": [],
            }],
        })

    if ("mode de paiement" in normalized or "paiement" in normalized) and ("vente" in normalized or "ventes" in normalized or "ca " in normalized):
        start_date, end_date = period if period else (today, today)
        start_dt, end_dt = period_bounds(start_date, end_date)

        pyromane_orders = PyromaneOrder.objects.filter(status="PAID", paid_at__range=(start_dt, end_dt))
        pyromane_tx_ids = pyromane_orders.exclude(transaction__isnull=True).values_list("transaction_id", flat=True)

        pos_qs = SaleTransaction.objects.filter(date__range=(start_dt, end_dt)).exclude(id__in=pyromane_tx_ids)
        pos_cash = pos_qs.filter(points_redeemed=0, discount_amount=0).count()
        pos_cash_total = pos_qs.filter(points_redeemed=0, discount_amount=0).aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        pos_loyalty = pos_qs.filter(points_redeemed__gt=0).count()
        pos_loyalty_total = pos_qs.filter(points_redeemed__gt=0).aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        pos_voucher = pos_qs.filter(discount_amount__gt=0, points_redeemed=0).count()
        pos_voucher_total = pos_qs.filter(discount_amount__gt=0, points_redeemed=0).aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")

        bakery_qs = BakerySale.objects.filter(is_paid=True, paid_at__range=(start_dt, end_dt))
        bakery_methods = (
            bakery_qs.values("payment_method")
            .annotate(total=Sum("total_amount"), count=Count("id"))
            .order_by("-count")
        )
        bakery_lines = [
            f"{row['payment_method'] or 'N/A'} · {int(row['count'])} ventes · {int(row['total'] or 0)} KMF"
            for row in bakery_methods
        ]

        return JsonResponse({
            "success": True,
            "title": "Ventes par mode de paiement",
            "period_label": period_label,
            "sections": [{
                "title": "POS",
                "summary": [
                    f"Cash: {pos_cash} · {int(pos_cash_total)} KMF",
                    f"Carte fidélité: {pos_loyalty} · {int(pos_loyalty_total)} KMF",
                    f"Bon de monnaie: {pos_voucher} · {int(pos_voucher_total)} KMF",
                ],
                "issues": [],
                "actions": ["POS ne stocke pas un mode explicite, classification basée sur points/bon."],
            }, {
                "title": "Mini-Four",
                "summary": bakery_lines or ["Aucune vente Mini-Four."],
                "issues": [],
                "actions": [],
            }, {
                "title": "Pyromane",
                "summary": [
                    f"Commandes payées: {pyromane_orders.count()} · {int(pyromane_orders.aggregate(total=Sum('total_amount'))['total'] or 0)} KMF",
                ],
                "issues": [],
                "actions": ["Pyromane est payé via la caisse POS."],
            }],
        })

    if ("anomalie" in normalized or "baisse" in normalized) and ("produit" in normalized or "article" in normalized):
        start_date, end_date = period if period else (today - timedelta(days=6), today)
        start_dt, end_dt = period_bounds(start_date, end_date)
        length_days = (end_date - start_date).days + 1
        prev_end = start_date - timedelta(days=1)
        prev_start = prev_end - timedelta(days=length_days - 1)
        prev_start_dt, prev_end_dt = period_bounds(prev_start, prev_end)

        pyromane_tx_ids = PyromaneOrder.objects.filter(
            status="PAID",
            paid_at__range=(start_dt, end_dt),
        ).exclude(transaction__isnull=True).values_list("transaction_id", flat=True)
        pyromane_prev_ids = PyromaneOrder.objects.filter(
            status="PAID",
            paid_at__range=(prev_start_dt, prev_end_dt),
        ).exclude(transaction__isnull=True).values_list("transaction_id", flat=True)

        def compute_drop(items_qs, prev_qs):
            current = {
                row["product_id"]: row
                for row in items_qs.values("product_id", "product__name").annotate(qty=Sum("quantity"), amount=Sum("subtotal"))
            }
            previous = {
                row["product_id"]: row
                for row in prev_qs.values("product_id", "product__name").annotate(qty=Sum("quantity"), amount=Sum("subtotal"))
            }
            drops = []
            for product_id, prev in previous.items():
                prev_qty = float(prev.get("qty") or 0)
                if prev_qty <= 0:
                    continue
                current_row = current.get(product_id)
                curr_qty = float(current_row.get("qty") or 0) if current_row else 0
                drop_pct = (prev_qty - curr_qty) / prev_qty * 100
                if drop_pct >= 40:
                    name = prev.get("product__name") or (current_row.get("product__name") if current_row else "")
                    drops.append((name, curr_qty, prev_qty, drop_pct))
            drops.sort(key=lambda x: x[3], reverse=True)
            return [f"{name} · actuel {int(curr)} u · avant {int(prev)} u · -{drop:.0f}%" for name, curr, prev, drop in drops[:10]]

        pos_items = SaleTransactionItem.objects.filter(transaction__date__range=(start_dt, end_dt)).exclude(transaction_id__in=pyromane_tx_ids)
        pos_prev = SaleTransactionItem.objects.filter(transaction__date__range=(prev_start_dt, prev_end_dt)).exclude(transaction_id__in=pyromane_prev_ids)
        pos_lines = compute_drop(pos_items, pos_prev)

        bakery_items = BakerySaleItem.objects.filter(bakery__is_paid=True, bakery__paid_at__range=(start_dt, end_dt))
        bakery_prev = BakerySaleItem.objects.filter(bakery__is_paid=True, bakery__paid_at__range=(prev_start_dt, prev_end_dt))
        bakery_lines = compute_drop(bakery_items, bakery_prev)

        return JsonResponse({
            "success": True,
            "title": "Anomalies produits (baisse soudaine)",
            "period_label": period_label,
            "sections": [{
                "title": "POS",
                "summary": pos_lines or ["Aucune baisse soudaine detectee."],
                "issues": [],
                "actions": ["Verifier les produits en chute de volume."],
            }, {
                "title": "Mini-Four",
                "summary": bakery_lines or ["Aucune baisse soudaine detectee."],
                "issues": [],
                "actions": ["Verifier les produits en chute de volume."],
            }],
        })

    if ("top" in normalized or "classement" in normalized) and ("abime" in normalized or "abimes" in normalized):
        abime_qs = PosShiftAbime.objects.all()
        if period:
            abime_qs = abime_qs.filter(report__shift_date__range=(period[0], period[1]))
        top_abime = (
            abime_qs.values("product__name")
            .annotate(qty=Sum("quantity"))
            .order_by("-qty")[:10]
        )
        lines = [f"{row['product__name']} · {int(row['qty'])}" for row in top_abime]
        return JsonResponse({
            "success": True,
            "title": "Top abîmés par produit",
            "period_label": period_label,
            "sections": [{
                "title": "Abîmés",
                "summary": lines or ["Aucun abîmé."],
                "issues": [],
                "actions": [],
            }],
        })

    if ("top" in normalized or "classement" in normalized) and "remise" in normalized:
        remise_qs = PosShiftRemise.objects.all()
        if period:
            remise_qs = remise_qs.filter(report__shift_date__range=(period[0], period[1]))
        top_remise = (
            remise_qs.values("product__name")
            .annotate(qty=Sum("quantity"))
            .order_by("-qty")[:10]
        )
        lines = [f"{row['product__name']} · {int(row['qty'])}" for row in top_remise]
        return JsonResponse({
            "success": True,
            "title": "Top remises par produit",
            "period_label": period_label,
            "sections": [{
                "title": "Remises",
                "summary": lines or ["Aucune remise."],
                "issues": [],
                "actions": [],
            }],
        })

    if ("top" in normalized or "classement" in normalized) and "consommation" in normalized:
        cons_qs = PosShiftConsumption.objects.all()
        if period:
            cons_qs = cons_qs.filter(report__shift_date__range=(period[0], period[1]))
        top_cons = (
            cons_qs.values("product__name")
            .annotate(qty=Sum("quantity"))
            .order_by("-qty")[:10]
        )
        lines = [f"{row['product__name']} · {int(row['qty'])}" for row in top_cons]
        return JsonResponse({
            "success": True,
            "title": "Top consommations par produit",
            "period_label": period_label,
            "sections": [{
                "title": "Consommations",
                "summary": lines or ["Aucune consommation."],
                "issues": [],
                "actions": [],
            }],
        })

    if ("top" in normalized or "classement" in normalized) and ("depense" in normalized or "dépense" in normalized):
        exp_qs = PosShiftExpense.objects.all()
        if period:
            exp_qs = exp_qs.filter(report__shift_date__range=(period[0], period[1]))
        top_exp = (
            exp_qs.values("label")
            .annotate(total=Sum("amount"))
            .order_by("-total")[:10]
        )
        lines = [f"{row['label']} · {int(row['total'] or 0)} KMF" for row in top_exp]
        return JsonResponse({
            "success": True,
            "title": "Top depenses (motifs)",
            "period_label": period_label,
            "sections": [{
                "title": "Depenses",
                "summary": lines or ["Aucune depense."],
                "issues": [],
                "actions": [],
            }],
        })

    if "perte" in normalized and ("abime" in normalized or "abimes" in normalized or "remise" in normalized or "remises" in normalized):
        start_date, end_date = period if period else (today - timedelta(days=6), today)
        abime_qs = PosShiftAbime.objects.filter(report__shift_date__range=(start_date, end_date))
        remise_qs = PosShiftRemise.objects.filter(report__shift_date__range=(start_date, end_date))

        abime_map = {
            row["product_id"]: Decimal(row["qty"] or 0)
            for row in abime_qs.values("product_id").annotate(qty=Sum("quantity"))
        }
        remise_map = {
            row["product_id"]: Decimal(row["qty"] or 0)
            for row in remise_qs.values("product_id").annotate(qty=Sum("quantity"))
        }

        losses = []
        products = SaleProduct.objects.filter(id__in=set(abime_map.keys()) | set(remise_map.keys()))
        for product in products:
            abime_qty = abime_map.get(product.id, Decimal("0.00"))
            remise_qty = remise_map.get(product.id, Decimal("0.00"))
            total_qty = abime_qty + remise_qty
            if total_qty <= 0:
                continue
            loss_amount = total_qty * Decimal(product.unit_price or 0)
            losses.append((product.name, total_qty, loss_amount))
        losses.sort(key=lambda x: x[2], reverse=True)
        lines = [f"{name} · perte {int(amount)} KMF (qte {int(qty)})" for name, qty, amount in losses[:10]]
        total_loss = sum((loss[2] for loss in losses), Decimal("0.00"))

        return JsonResponse({
            "success": True,
            "title": "Top pertes financieres (abimes + remises)",
            "period_label": f"{start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')}",
            "sections": [{
                "title": "Pertes",
                "summary": [f"Total perte: {int(total_loss)} KMF"] + (lines or ["Aucune perte detectee."]),
                "issues": [],
                "actions": ["Analyser les produits les plus pertes."],
            }],
        })

    if ("abime" in normalized or "abimes" in normalized) and ("par caissier" in normalized or "par employe" in normalized):
        abime_qs = PosShiftAbime.objects.select_related("report__cashier__user")
        if period:
            abime_qs = abime_qs.filter(report__shift_date__range=(period[0], period[1]))
        per_cashier = (
            abime_qs.values("report__cashier__user__first_name", "report__cashier__user__last_name")
            .annotate(qty=Sum("quantity"))
            .order_by("-qty")[:10]
        )
        lines = [
            f"{row['report__cashier__user__first_name']} {row['report__cashier__user__last_name']} · {int(row['qty'])}"
            for row in per_cashier
        ]
        return JsonResponse({
            "success": True,
            "title": "Abimes par caissier",
            "period_label": period_label,
            "sections": [{
                "title": "Abimes",
                "summary": lines or ["Aucune donnee."],
                "issues": [],
                "actions": [],
            }],
        })

    if "remise" in normalized and ("par caissier" in normalized or "par employe" in normalized):
        remise_qs = PosShiftRemise.objects.select_related("report__cashier__user")
        if period:
            remise_qs = remise_qs.filter(report__shift_date__range=(period[0], period[1]))
        per_cashier = (
            remise_qs.values("report__cashier__user__first_name", "report__cashier__user__last_name")
            .annotate(qty=Sum("quantity"))
            .order_by("-qty")[:10]
        )
        lines = [
            f"{row['report__cashier__user__first_name']} {row['report__cashier__user__last_name']} · {int(row['qty'])}"
            for row in per_cashier
        ]
        return JsonResponse({
            "success": True,
            "title": "Remises par caissier",
            "period_label": period_label,
            "sections": [{
                "title": "Remises",
                "summary": lines or ["Aucune donnee."],
                "issues": [],
                "actions": [],
            }],
        })

    if "consommation" in normalized and ("par caissier" in normalized or "par employe" in normalized):
        cons_qs = PosShiftConsumption.objects.select_related("report__cashier__user")
        if period:
            cons_qs = cons_qs.filter(report__shift_date__range=(period[0], period[1]))
        per_cashier = (
            cons_qs.values("report__cashier__user__first_name", "report__cashier__user__last_name")
            .annotate(qty=Sum("quantity"))
            .order_by("-qty")[:10]
        )
        lines = [
            f"{row['report__cashier__user__first_name']} {row['report__cashier__user__last_name']} · {int(row['qty'])}"
            for row in per_cashier
        ]
        return JsonResponse({
            "success": True,
            "title": "Consommations par caissier",
            "period_label": period_label,
            "sections": [{
                "title": "Consommations",
                "summary": lines or ["Aucune donnee."],
                "issues": [],
                "actions": [],
            }],
        })

    if ("progression" in normalized or "evolution" in normalized or "évolution" in normalized) and ("produit" in normalized or "article" in normalized):
        product_phrase = extract_after_keywords(normalized, ["produit", "article"])
        product_tokens = extract_terms(query)
        sale_match = search_by_terms(SaleProduct.objects.all(), ["name"], product_phrase, product_tokens)
        bakery_match = search_by_terms(BakeryProduct.objects.all(), ["name"], product_phrase, product_tokens)
        if sale_match.count() + bakery_match.count() == 0:
            return JsonResponse({"success": False, "error": "Produit introuvable."}, status=404)
        if sale_match.count() + bakery_match.count() > 1:
            suggestions = [p.name for p in sale_match[:3]] + [p.name for p in bakery_match[:3]]
            return JsonResponse({
                "success": True,
                "title": "Plusieurs produits trouvés",
                "period_label": period_label,
                "sections": [{
                    "title": "Produits",
                    "summary": suggestions,
                    "issues": ["Merci de preciser le produit exact."],
                    "actions": [],
                }],
            })

        start_date, end_date = period if period else (today - timedelta(days=6), today)
        start_dt, end_dt = period_bounds(start_date, end_date)

        if sale_match.exists():
            product = sale_match.first()
            day = start_date
            lines = []
            while day <= end_date:
                day_start = timezone.make_aware(datetime.combine(day, time.min))
                day_end = timezone.make_aware(datetime.combine(day, time.max))
                items = SaleTransactionItem.objects.filter(product=product, transaction__date__range=(day_start, day_end))
                qty = items.aggregate(total=Sum("quantity"))["total"] or 0
                amount = items.aggregate(total=Sum("subtotal"))["total"] or Decimal("0.00")
                lines.append(f"{day.strftime('%d/%m')} · {int(qty)} u · {int(amount)} KMF")
                day += timedelta(days=1)
            return JsonResponse({
                "success": True,
                "title": f"Progression produit: {product.name}",
                "period_label": f"{start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')}",
                "sections": [{
                    "title": "Progression jour par jour",
                    "summary": lines,
                    "issues": [],
                    "actions": [],
                }],
            })

        product = bakery_match.first()
        day = start_date
        lines = []
        while day <= end_date:
            day_start = timezone.make_aware(datetime.combine(day, time.min))
            day_end = timezone.make_aware(datetime.combine(day, time.max))
            items = BakerySaleItem.objects.filter(product=product, bakery__paid_at__range=(day_start, day_end))
            qty = items.aggregate(total=Sum("quantity"))["total"] or 0
            amount = items.aggregate(total=Sum("subtotal"))["total"] or Decimal("0.00")
            lines.append(f"{day.strftime('%d/%m')} · {int(qty)} u · {int(amount)} KMF")
            day += timedelta(days=1)
        return JsonResponse({
            "success": True,
            "title": f"Progression produit: {product.name}",
            "period_label": f"{start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')}",
            "sections": [{
                "title": "Progression jour par jour",
                "summary": lines,
                "issues": [],
                "actions": [],
            }],
        })

    if ("comparatif" in normalized or "comparaison" in normalized) and ("produit" in normalized or "article" in normalized) and ("multi" in normalized or "plusieurs" in normalized or "period" in normalized or "période" in normalized):
        prod_match = re.search(r"produit\s+(.+?)\s+(vs|contre)\s+(.+)", normalized)
        if prod_match:
            left_phrase = prod_match.group(1).strip()
            right_phrase = prod_match.group(3).strip()
            left_sale = search_by_terms(SaleProduct.objects.all(), ["name"], left_phrase, extract_terms(left_phrase))
            right_sale = search_by_terms(SaleProduct.objects.all(), ["name"], right_phrase, extract_terms(right_phrase))
            left_bakery = search_by_terms(BakeryProduct.objects.all(), ["name"], left_phrase, extract_terms(left_phrase))
            right_bakery = search_by_terms(BakeryProduct.objects.all(), ["name"], right_phrase, extract_terms(right_phrase))

            if left_sale.count() == 1 and right_sale.count() == 1:
                left = left_sale.first()
                right = right_sale.first()
                channel = "POS"
            elif left_bakery.count() == 1 and right_bakery.count() == 1:
                left = left_bakery.first()
                right = right_bakery.first()
                channel = "Mini-Four"
            else:
                return JsonResponse({"success": False, "error": "Les deux produits doivent etre du meme canal (POS ou Mini-Four)."}, status=400)

            def compute_period(days):
                start_date = today - timedelta(days=days - 1)
                start_dt, end_dt = period_bounds(start_date, today)
                if channel == "POS":
                    left_items = SaleTransactionItem.objects.filter(product=left, transaction__date__range=(start_dt, end_dt))
                    right_items = SaleTransactionItem.objects.filter(product=right, transaction__date__range=(start_dt, end_dt))
                else:
                    left_items = BakerySaleItem.objects.filter(product=left, bakery__paid_at__range=(start_dt, end_dt))
                    right_items = BakerySaleItem.objects.filter(product=right, bakery__paid_at__range=(start_dt, end_dt))
                left_qty = left_items.aggregate(total=Sum("quantity"))["total"] or 0
                right_qty = right_items.aggregate(total=Sum("quantity"))["total"] or 0
                left_amt = left_items.aggregate(total=Sum("subtotal"))["total"] or Decimal("0.00")
                right_amt = right_items.aggregate(total=Sum("subtotal"))["total"] or Decimal("0.00")
                return {
                    "label": f"{days} jours",
                    "left_qty": left_qty,
                    "right_qty": right_qty,
                    "left_amt": left_amt,
                    "right_amt": right_amt,
                }

            periods = [7, 30, 90]
            sections = []
            for days in periods:
                stats = compute_period(days)
                sections.append({
                    "title": f"Comparatif {channel} - {stats['label']}",
                    "summary": [
                        f"{left.name}: {int(stats['left_qty'])} u · {int(stats['left_amt'])} KMF",
                        f"{right.name}: {int(stats['right_qty'])} u · {int(stats['right_amt'])} KMF",
                        f"Ecart: {int(stats['left_qty'] - stats['right_qty'])} u · {int(stats['left_amt'] - stats['right_amt'])} KMF",
                    ],
                    "issues": [],
                    "actions": [],
                })
            return JsonResponse({
                "success": True,
                "title": f"Comparatif produits (multi-periodes)",
                "period_label": "7j / 30j / 90j",
                "sections": sections,
            })

    if ("depense" in normalized or "dépense" in normalized) and ("par caissier" in normalized or "par employe" in normalized):
        exp_qs = PosShiftExpense.objects.select_related("report__cashier__user")
        if period:
            exp_qs = exp_qs.filter(report__shift_date__range=(period[0], period[1]))
        per_cashier = (
            exp_qs.values("report__cashier__user__first_name", "report__cashier__user__last_name")
            .annotate(total=Sum("amount"))
            .order_by("-total")[:10]
        )
        lines = [
            f"{row['report__cashier__user__first_name']} {row['report__cashier__user__last_name']} · {int(row['total'] or 0)} KMF"
            for row in per_cashier
        ]
        return JsonResponse({
            "success": True,
            "title": "Depenses par caissier",
            "period_label": period_label,
            "sections": [{
                "title": "Depenses",
                "summary": lines or ["Aucune donnee."],
                "issues": [],
                "actions": [],
            }],
        })

    if ("sortie" in normalized or "sorties" in normalized) and ("historique" in normalized or "detail" in normalized or "detaill" in normalized):
        material_phrase = extract_after_keywords(normalized, ["sortie", "sorties", "stock", "matiere"])
        material_tokens = extract_terms(query)
        material_qs = search_by_terms(RawMaterial.objects.all(), ["name"], material_phrase, material_tokens)
        if material_qs.count() == 1:
            material = material_qs.first()
            movement_qs = StockMovement.objects.filter(raw_material=material, movement_type="Sortie")
            movement_qs = filter_range(movement_qs, "date")
            movement_qs = movement_qs.order_by("-date")
            lines = [
                f"{timezone.localtime(m.date).strftime('%d/%m/%Y %H:%M')} · {m.quantity} {material.unit} · {m.destination or '-'}"
                for m in movement_qs
            ]
            return JsonResponse({
                "success": True,
                "title": f"Historique sorties stock: {material.name}",
                "period_label": period_label,
                "sections": [{
                    "title": "Sorties",
                    "summary": lines or ["Aucune sortie enregistree."],
                    "issues": [],
                    "actions": [],
                }],
            })

    if ("comparatif" in normalized or "comparaison" in normalized or "vs" in normalized) and ("produit" in normalized or "article" in normalized):
        prod_match = re.search(r"produit\s+(.+?)\s+(vs|contre)\s+(.+)", normalized)
        if prod_match:
            left_phrase = prod_match.group(1).strip()
            right_phrase = prod_match.group(3).strip()
            left_qs = search_by_terms(SaleProduct.objects.all(), ["name"], left_phrase, extract_terms(left_phrase))
            right_qs = search_by_terms(SaleProduct.objects.all(), ["name"], right_phrase, extract_terms(right_phrase))
            if left_qs.count() == 1 and right_qs.count() == 1:
                left = left_qs.first()
                right = right_qs.first()
                start_dt, end_dt = period_bounds(period[0], period[1]) if period else (None, None)
                left_sales = SaleTransactionItem.objects.filter(product=left)
                right_sales = SaleTransactionItem.objects.filter(product=right)
                if period:
                    left_sales = left_sales.filter(transaction__date__range=(start_dt, end_dt))
                    right_sales = right_sales.filter(transaction__date__range=(start_dt, end_dt))
                left_qty = left_sales.aggregate(total=Sum("quantity"))["total"] or 0
                right_qty = right_sales.aggregate(total=Sum("quantity"))["total"] or 0
                left_amt = left_sales.aggregate(total=Sum("subtotal"))["total"] or Decimal("0.00")
                right_amt = right_sales.aggregate(total=Sum("subtotal"))["total"] or Decimal("0.00")
                return JsonResponse({
                    "success": True,
                    "title": "Comparatif produits",
                    "period_label": period_label,
                    "sections": [{
                        "title": left.name,
                        "summary": [
                            f"Ventes: {int(left_qty)} u",
                            f"CA: {int(left_amt)} KMF",
                        ],
                        "issues": [],
                        "actions": [],
                    }, {
                        "title": right.name,
                        "summary": [
                            f"Ventes: {int(right_qty)} u",
                            f"CA: {int(right_amt)} KMF",
                        ],
                        "issues": [],
                        "actions": [],
                    }, {
                        "title": "Ecart",
                        "summary": [
                            f"Quantite: {int(left_qty - right_qty)} u",
                            f"CA: {int(left_amt - right_amt)} KMF",
                        ],
                        "issues": [],
                        "actions": [],
                    }],
                })

    if "categorie" in normalized or "catégorie" in normalized:
        start_dt = end_dt = None
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
        pos_items = SaleTransactionItem.objects.all()
        if period:
            pos_items = pos_items.filter(transaction__date__range=(start_dt, end_dt))
        pos_cats = (
            pos_items.values("product__category")
            .annotate(amount=Sum("subtotal"), qty=Sum("quantity"))
            .order_by("-amount")[:10]
        )
        pos_lines = [
            f"{row['product__category'] or 'N/A'} · {int(row['amount'] or 0)} KMF · {int(row['qty'] or 0)} u"
            for row in pos_cats
        ]

        bakery_items = BakerySaleItem.objects.filter(bakery__is_paid=True)
        if period:
            bakery_items = bakery_items.filter(bakery__paid_at__range=(start_dt, end_dt))
        bakery_cats = (
            bakery_items.values("product__category")
            .annotate(amount=Sum("subtotal"), qty=Sum("quantity"))
            .order_by("-amount")[:10]
        )
        bakery_lines = [
            f"{row['product__category'] or 'N/A'} · {int(row['amount'] or 0)} KMF · {int(row['qty'] or 0)} u"
            for row in bakery_cats
        ]

        return JsonResponse({
            "success": True,
            "title": "Ventes par categorie",
            "period_label": period_label,
            "sections": [{
                "title": "POS",
                "summary": pos_lines or ["Aucune vente POS."],
                "issues": [],
                "actions": [],
            }, {
                "title": "Mini-Four",
                "summary": bakery_lines or ["Aucune vente Mini-Four."],
                "issues": [],
                "actions": [],
            }],
        })

    if "rupture" in normalized and ("top" in normalized or "classement" in normalized or "avant 10" in normalized):
        start_date, end_date = period if period else (today - timedelta(days=6), today)
        cutoff = time(10, 0)
        products = SaleProduct.objects.filter(stock_known=True).order_by("name")
        results = []
        day = start_date
        for product in products:
            early_count = 0
            total_days = 0
            day = start_date
            while day <= end_date:
                produced = SaleProduction.objects.filter(product=product, production_date=day).aggregate(
                    total=Sum("quantity")
                )["total"] or Decimal("0.00")
                if produced <= 0:
                    day += timedelta(days=1)
                    continue
                total_days += 1
                items = (
                    SaleTransactionItem.objects
                    .filter(product=product, transaction__date__date=day)
                    .select_related("transaction")
                    .order_by("transaction__date")
                )
                sold_time = None
                total_sold = Decimal("0.00")
                for item in items:
                    total_sold += Decimal(item.quantity or 0)
                    if total_sold >= produced:
                        sold_time = timezone.localtime(item.transaction.date).time()
                        break
                if sold_time and sold_time < cutoff:
                    early_count += 1
                day += timedelta(days=1)
            if total_days:
                results.append((product.name, early_count, total_days))
        results.sort(key=lambda x: (x[1] / max(x[2], 1)), reverse=True)
        lines = [f"{name} · {early}/{total} jours" for name, early, total in results[:10]]
        return JsonResponse({
            "success": True,
            "title": "Top ruptures avant 10h",
            "period_label": f"{start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')}",
            "sections": [{
                "title": "Ruptures",
                "summary": lines or ["Aucune rupture detectee."],
                "issues": [],
                "actions": ["Augmenter la production des produits critiques."],
            }],
        })

    if "bon" in normalized and ("expire" in normalized or "expir" in normalized) and ("bientot" in normalized or "bientôt" in normalized):
        days_match = re.search(r"(\d+)\s*jour", normalized)
        days = int(days_match.group(1)) if days_match else 7
        limit_date = timezone.now() + timedelta(days=days)
        soon_qs = CashChangeVoucher.objects.filter(status="ISSUED", expires_at__lte=limit_date).order_by("expires_at")
        lines = [
            f"{v.code} · {int(v.amount)} KMF · expire {timezone.localtime(v.expires_at).strftime('%d/%m/%Y')}"
            for v in soon_qs[:10]
        ]
        return JsonResponse({
            "success": True,
            "title": "Bons expirant bientot",
            "period_label": f"Dans {days} jours",
            "sections": [{
                "title": "Bons",
                "summary": lines or ["Aucun bon bientot expire."],
                "issues": [],
                "actions": ["Contacter les clients si necessaire."],
            }],
        })

    if "pyromane" in normalized and ("delai" in normalized or "délai" in normalized or "attente" in normalized):
        start_date, end_date = period if period else (today, today)
        start_dt, end_dt = period_bounds(start_date, end_date)
        orders = PyromaneOrder.objects.filter(status="PAID", paid_at__range=(start_dt, end_dt), created_at__isnull=False)
        if orders.exists():
            total_seconds = 0
            for o in orders:
                total_seconds += max(0, (o.paid_at - o.created_at).total_seconds())
            avg_seconds = total_seconds / orders.count()
            avg_minutes = int(avg_seconds // 60)
            return JsonResponse({
                "success": True,
                "title": "Delai moyen Pyromane",
                "period_label": period_label,
                "sections": [{
                    "title": "Delai",
                    "summary": [
                        f"Commandes: {orders.count()}",
                        f"Delai moyen: {avg_minutes} min",
                    ],
                    "issues": [],
                    "actions": ["Reduire le temps entre prise et paiement."],
                }],
            })
        return JsonResponse({
            "success": True,
            "title": "Delai moyen Pyromane",
            "period_label": period_label,
            "sections": [{
                "title": "Delai",
                "summary": ["Aucune commande payee sur la periode."],
                "issues": [],
                "actions": [],
            }],
        })

    if "top" in normalized and ("fidelite" in normalized or "fidélité" in normalized):
        sort_points = "point" in normalized
        if sort_points:
            top_loyalty = Loyalty.objects.order_by("-points_balance")[:10]
            lines = [f"{l.client} · {int(l.points_balance)} pts" for l in top_loyalty]
            title = "Top clients fidelite (points)"
        else:
            top_loyalty = Loyalty.objects.order_by("-solde")[:10]
            lines = [f"{l.client} · {int(l.solde)} KMF" for l in top_loyalty]
            title = "Top clients fidelite (solde)"
        return JsonResponse({
            "success": True,
            "title": title,
            "period_label": "",
            "sections": [{
                "title": "Clients",
                "summary": lines or ["Aucun client fidelite."],
                "issues": [],
                "actions": [],
            }],
        })

    if ("performance" in normalized or "par shift" in normalized) and employee_context:
        users = resolve_employee(normalized)
        if users.count() == 0:
            return JsonResponse({"success": False, "error": "Employe introuvable."}, status=404)
        if users.count() > 1:
            suggestions = [f"{u.first_name} {u.last_name} ({u.email})" for u in users[:5]]
            return JsonResponse({
                "success": True,
                "title": "Plusieurs employes trouves",
                "period_label": period_label,
                "sections": [{
                    "title": "Employes",
                    "summary": suggestions,
                    "issues": ["Merci de preciser le nom ou l'email exact."],
                    "actions": [],
                }],
            })
        user = users.first()
        employer = getattr(user, "employer", None)
        if not employer:
            return JsonResponse({"success": False, "error": "Employe introuvable."}, status=404)

        start_date, end_date = period if period else (today, today)
        start_dt, end_dt = period_bounds(start_date, end_date)

        pos_tx = SaleTransaction.objects.filter(employer=employer, date__range=(start_dt, end_dt))
        bakery_tx = BakerySale.objects.filter(paid_by=employer, paid_at__range=(start_dt, end_dt))
        pyro_tx = PyromaneOrder.objects.filter(paid_by=employer, status="PAID", paid_at__range=(start_dt, end_dt))

        def split_shift(qs, date_field):
            matin = qs.filter(**{f"{date_field}__time__lt": time(15, 0)})
            soir = qs.filter(**{f"{date_field}__time__gte": time(15, 0)})
            return matin, soir

        pos_matin, pos_soir = split_shift(pos_tx, "date")
        bak_matin, bak_soir = split_shift(bakery_tx, "paid_at")
        pyro_matin, pyro_soir = split_shift(pyro_tx, "paid_at")

        def total(qs, field):
            return qs.aggregate(total=Sum(field))["total"] or Decimal("0.00")

        matin_total = total(pos_matin, "total_amount") + total(bak_matin, "total_amount") + total(pyro_matin, "total_amount")
        soir_total = total(pos_soir, "total_amount") + total(bak_soir, "total_amount") + total(pyro_soir, "total_amount")

        return JsonResponse({
            "success": True,
            "title": f"Performance par shift: {user.first_name} {user.last_name}",
            "period_label": period_label,
            "sections": [{
                "title": "Matin",
                "summary": [
                    f"CA: {int(matin_total)} KMF",
                    f"POS: {int(total(pos_matin, 'total_amount'))} KMF",
                    f"Mini-Four: {int(total(bak_matin, 'total_amount'))} KMF",
                    f"Pyromane: {int(total(pyro_matin, 'total_amount'))} KMF",
                ],
                "issues": [],
                "actions": [],
            }, {
                "title": "Soir",
                "summary": [
                    f"CA: {int(soir_total)} KMF",
                    f"POS: {int(total(pos_soir, 'total_amount'))} KMF",
                    f"Mini-Four: {int(total(bak_soir, 'total_amount'))} KMF",
                    f"Pyromane: {int(total(pyro_soir, 'total_amount'))} KMF",
                ],
                "issues": [],
                "actions": [],
            }],
        })

    if ("ecart" in normalized or "delta" in normalized) and ("production" in normalized and ("vente" in normalized or "ventes" in normalized)):
        start_date, end_date = period if period else (today - timedelta(days=6), today)
        pos_prod = SaleProduction.objects.filter(production_date__range=(start_date, end_date))
        start_dt, end_dt = period_bounds(start_date, end_date)
        pos_sales = SaleTransactionItem.objects.filter(transaction__date__range=(start_dt, end_dt))
        prod_map = {
            row["product_id"]: Decimal(row["total"] or 0)
            for row in pos_prod.values("product_id").annotate(total=Sum("quantity"))
        }
        sales_map = {
            row["product_id"]: Decimal(row["total"] or 0)
            for row in pos_sales.values("product_id").annotate(total=Sum("quantity"))
        }
        lines = []
        for product_id, produced in prod_map.items():
            sold = sales_map.get(product_id, Decimal("0.00"))
            diff = produced - sold
            product = SaleProduct.objects.filter(id=product_id).first()
            name = product.name if product else f"Produit {product_id}"
            lines.append((name, diff, produced, sold))
        lines.sort(key=lambda x: abs(x[1]), reverse=True)
        summary = [f"{name} · prod {int(prod)} · vendu {int(sold)} · ecart {int(diff)}" for name, diff, prod, sold in lines[:10]]
        return JsonResponse({
            "success": True,
            "title": "Ecart production vs ventes",
            "period_label": f"{start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')}",
            "sections": [{
                "title": "Ecart",
                "summary": summary or ["Aucun ecart detecte."],
                "issues": [],
                "actions": ["Ajuster la production des produits en ecart."],
            }],
        })

    if "alerte" in normalized or "anomalie" in normalized:
        start_date, end_date = period if period else (today - timedelta(days=6), today)
        start_dt, end_dt = period_bounds(start_date, end_date)

        open_shifts = PosShiftReport.objects.filter(
            shift_date__range=(start_date, end_date),
            closed_at__isnull=True,
        ).select_related("cashier__user")
        open_lines = []
        for report in open_shifts:
            cashier_name = ""
            if report.cashier and report.cashier.user:
                cashier_name = f"{report.cashier.user.first_name} {report.cashier.user.last_name}"
            open_lines.append(f"{report.shift_date.strftime('%d/%m')} {report.shift} · {cashier_name or 'N/A'}")

        exp_rows = list(
            PosShiftExpense.objects.filter(report__shift_date__range=(start_date, end_date))
            .values("report_id")
            .annotate(total=Sum("amount"))
        )
        avg_expense = (
            PosShiftExpense.objects.filter(report__shift_date__range=(start_date, end_date))
            .values("report_id")
            .annotate(total=Sum("amount"))
            .aggregate(avg=Avg("total"))["avg"]
            or Decimal("0.00")
        )
        threshold = avg_expense * Decimal("1.7") if avg_expense > 0 else Decimal("0.00")
        exp_map = {row["report_id"]: Decimal(row["total"] or 0) for row in exp_rows}
        high_expense_ids = [rid for rid, total in exp_map.items() if total > threshold and total > 0]
        high_reports = PosShiftReport.objects.filter(id__in=high_expense_ids).select_related("cashier__user")
        expense_lines = []
        for report in high_reports:
            cashier_name = ""
            if report.cashier and report.cashier.user:
                cashier_name = f"{report.cashier.user.first_name} {report.cashier.user.last_name}"
            total = exp_map.get(report.id, Decimal("0.00"))
            expense_lines.append(
                f"{report.shift_date.strftime('%d/%m')} {report.shift} · {cashier_name or 'N/A'} · {int(total)} KMF"
            )

        def early_sellout_stats(product, start_date, end_date, cutoff):
            day = start_date
            early_count = 0
            total_days = 0
            while day <= end_date:
                produced = SaleProduction.objects.filter(product=product, production_date=day).aggregate(
                    total=Sum("quantity")
                )["total"] or Decimal("0.00")
                if produced <= 0:
                    day += timedelta(days=1)
                    continue
                total_days += 1
                items = (
                    SaleTransactionItem.objects
                    .filter(product=product, transaction__date__date=day)
                    .select_related("transaction")
                    .order_by("transaction__date")
                )
                sold_time = None
                total_sold = Decimal("0.00")
                for item in items:
                    total_sold += Decimal(item.quantity or 0)
                    if total_sold >= produced:
                        sold_time = timezone.localtime(item.transaction.date).time()
                        break
                if sold_time and sold_time < cutoff:
                    early_count += 1
                day += timedelta(days=1)
            return early_count, total_days

        rupture_lines = []
        product_ids = (
            SaleProduction.objects.filter(production_date__range=(start_date, end_date))
            .values_list("product_id", flat=True)
            .distinct()
        )
        products = SaleProduct.objects.filter(id__in=product_ids, stock_known=True).order_by("name")
        for product in products:
            early_count, total_days = early_sellout_stats(product, start_date, end_date, time(10, 0))
            if total_days == 0:
                continue
            if early_count >= 3 or early_count >= max(1, total_days // 2):
                rupture_lines.append(
                    f"{product.name} · rupture avant 10h: {early_count}/{total_days} jours"
                )

        issues = []
        if rupture_lines:
            issues.append(f"Ruptures fréquentes: {len(rupture_lines)} produits.")
        if expense_lines:
            issues.append(f"Dépenses caisse anormales: {len(expense_lines)} shifts.")
        if open_lines:
            issues.append(f"Shifts non clôturés: {len(open_lines)}.")
        if not issues:
            issues.append("Aucune alerte automatique détectée.")

        return JsonResponse({
            "success": True,
            "title": "Alertes automatiques",
            "period_label": f"{start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')}",
            "sections": [{
                "title": "Résumé",
                "summary": [
                    f"Ruptures fréquentes: {len(rupture_lines)}",
                    f"Dépenses caisse anormales: {len(expense_lines)}",
                    f"Shifts non clôturés: {len(open_lines)}",
                ],
                "issues": issues,
                "actions": ["Vérifier les alertes détaillées ci-dessous."],
            }, {
                "title": "Ruptures fréquentes",
                "summary": rupture_lines or ["Aucune rupture trop fréquente."],
                "issues": [],
                "actions": ["Ajuster la production des produits listés."],
            }, {
                "title": "Dépenses caisse anormales",
                "summary": expense_lines or ["Aucune dépense anormale détectée."],
                "issues": [],
                "actions": ["Vérifier la justification des dépenses."],
            }, {
                "title": "Shifts non clôturés",
                "summary": open_lines or ["Aucun shift non clôturé."],
                "issues": [],
                "actions": ["Clôturer les shifts ouverts."],
            }],
        })

    if "shift" in normalized or "matin" in normalized or "soir" in normalized:
        shift_qs = PosShiftReport.objects.all()
        if period:
            shift_qs = shift_qs.filter(shift_date__range=(period[0], period[1]))
        if "matin" in normalized:
            shift_qs = shift_qs.filter(shift="MATIN")
        if "soir" in normalized:
            shift_qs = shift_qs.filter(shift="SOIR")
        total_shifts = shift_qs.count()
        open_shifts = shift_qs.filter(closed_at__isnull=True).count()

        detail_mode = any(word in normalized for word in ["detail", "detaill", "rapport", "cloture", "clôture", "journal"])
        if detail_mode:
            reports = shift_qs.select_related("cashier__user").order_by("-shift_date", "-shift")[:8]
            lines = []
            total_abime = Decimal("0")
            total_remise = Decimal("0")
            total_cons = Decimal("0")
            total_exp = Decimal("0")
            for report in reports:
                abime_qty = report.abimes.aggregate(total=Sum("quantity"))["total"] or Decimal("0")
                remise_qty = report.remises.aggregate(total=Sum("quantity"))["total"] or Decimal("0")
                cons_qty = report.consumptions.aggregate(total=Sum("quantity"))["total"] or Decimal("0")
                exp_amt = report.expenses.aggregate(total=Sum("amount"))["total"] or Decimal("0")
                total_abime += abime_qty
                total_remise += remise_qty
                total_cons += cons_qty
                total_exp += exp_amt
                cashier_name = ""
                if report.cashier and report.cashier.user:
                    cashier_name = f"{report.cashier.user.first_name} {report.cashier.user.last_name}"
                lines.append(
                    f"{report.shift_date.strftime('%d/%m/%Y')} {report.shift} · {cashier_name or 'N/A'} · "
                    f"Abîmés {int(abime_qty)} · Remises {int(remise_qty)} · Consommations {int(cons_qty)} · Dépenses {int(exp_amt)} KMF"
                )
            return JsonResponse({
                "success": True,
                "title": "Shifts caisse (détail)",
                "period_label": period_label,
                "sections": [{
                    "title": "Résumé",
                    "summary": [
                        f"Shifts: {total_shifts}",
                        f"Ouverts: {open_shifts}",
                        f"Abîmés: {int(total_abime)}",
                        f"Remises: {int(total_remise)}",
                        f"Consommations: {int(total_cons)}",
                        f"Dépenses: {int(total_exp)} KMF",
                    ],
                    "issues": [],
                    "actions": [],
                }, {
                    "title": "Derniers shifts",
                    "summary": lines or ["Aucun shift sur la période."],
                    "issues": [],
                    "actions": [],
                }],
            })

        return JsonResponse({
            "success": True,
            "title": "Shifts caisse",
            "period_label": period_label,
            "sections": [{
                "title": "Shifts",
                "summary": [
                    f"Total: {total_shifts}",
                    f"Ouverts: {open_shifts}",
                ],
                "issues": [],
                "actions": ["Clôturer les shifts ouverts."],
            }],
        })

    if "abime" in normalized or "abim" in normalized:
        abime_qs = PosShiftAbime.objects.all()
        if period:
            abime_qs = abime_qs.filter(report__shift_date__range=(period[0], period[1]))
        total_abime = abime_qs.aggregate(total=Sum("quantity"))["total"] or 0
        top_abime = (
            abime_qs.values("product__name")
            .annotate(qty=Sum("quantity"))
            .order_by("-qty")[:5]
        )
        top_list = [f"{row['product__name']} · {int(row['qty'])}" for row in top_abime]
        return JsonResponse({
            "success": True,
            "title": "Produits abîmés",
            "period_label": period_label,
            "sections": [{
                "title": "Abîmés",
                "summary": [
                    f"Total: {int(total_abime)}",
                    "Top: " + (top_list[0] if top_list else "Aucun"),
                ],
                "issues": top_list or ["Aucun produit abîmé."],
                "actions": ["Analyser les causes d'abîmés."],
            }],
        })

    if "remise" in normalized:
        remise_qs = PosShiftRemise.objects.all()
        if period:
            remise_qs = remise_qs.filter(report__shift_date__range=(period[0], period[1]))
        total_remise = remise_qs.aggregate(total=Sum("quantity"))["total"] or 0
        return JsonResponse({
            "success": True,
            "title": "Remises",
            "period_label": period_label,
            "sections": [{
                "title": "Remises",
                "summary": [
                    f"Total: {int(total_remise)}",
                ],
                "issues": [],
                "actions": ["Vérifier les remises importantes."],
            }],
        })

    if "depense" in normalized or "dépense" in normalized:
        expense_qs = PosShiftExpense.objects.all()
        if period:
            expense_qs = expense_qs.filter(report__shift_date__range=(period[0], period[1]))
        total_expense = expense_qs.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        return JsonResponse({
            "success": True,
            "title": "Dépenses caisse",
            "period_label": period_label,
            "sections": [{
                "title": "Dépenses",
                "summary": [
                    f"Total: {int(total_expense)} KMF",
                ],
                "issues": [],
                "actions": ["Classer les dépenses par catégorie."],
            }],
        })

    if "consommation" in normalized:
        consumption_qs = PosShiftConsumption.objects.all()
        if period:
            consumption_qs = consumption_qs.filter(report__shift_date__range=(period[0], period[1]))
        total_consumption = consumption_qs.aggregate(total=Sum("quantity"))["total"] or 0
        return JsonResponse({
            "success": True,
            "title": "Consommations internes",
            "period_label": period_label,
            "sections": [{
                "title": "Consommations",
                "summary": [
                    f"Total: {int(total_consumption)}",
                ],
                "issues": [],
                "actions": ["Valider les consommations internes."],
            }],
        })

    if "top" in normalized and ("client" in normalized or "clients" in normalized):
        pos_clients = SaleTransaction.objects.filter(loyalty__isnull=False)
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            pos_clients = pos_clients.filter(date__range=(start_dt, end_dt))
        top_loyalty = (
            pos_clients.values("loyalty__client")
            .annotate(total=Sum("total_amount"))
            .order_by("-total")[:5]
        )
        top_loyalty_list = [f"{row['loyalty__client']} · {int(row['total'])} KMF" for row in top_loyalty]

        bakery_clients = BakerySale.objects.filter(is_paid=True)
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            bakery_clients = bakery_clients.filter(paid_at__range=(start_dt, end_dt))
        top_bakery = (
            bakery_clients.values("client")
            .annotate(total=Sum("total_amount"))
            .order_by("-total")[:5]
        )
        top_bakery_list = [f"{row['client']} · {int(row['total'])} KMF" for row in top_bakery]

        return JsonResponse({
            "success": True,
            "title": "Top clients",
            "period_label": period_label,
            "sections": [{
                "title": "POS (fidélité)",
                "summary": top_loyalty_list or ["Aucun client fidélité."],
                "issues": [],
                "actions": [],
            }, {
                "title": "Mini-Four",
                "summary": top_bakery_list or ["Aucun client Mini-Four."],
                "issues": [],
                "actions": [],
            }],
        })

    if (
        "top" in normalized
        and ("employe" in normalized or "employer" in normalized or "vendeur" in normalized or "caissier" in normalized)
        and ("moyen" in normalized or "moyenne" in normalized or "panier" in normalized)
    ):
        pos_sales = SaleTransaction.objects.exclude(employer__isnull=True)
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            pos_sales = pos_sales.filter(date__range=(start_dt, end_dt))
        pos_agg = pos_sales.values("employer_id").annotate(
            total=Sum("total_amount"),
            tickets=Count("id"),
        )

        bakery_sales = BakerySale.objects.filter(is_paid=True, paid_by__isnull=False)
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            bakery_sales = bakery_sales.filter(paid_at__range=(start_dt, end_dt))
        bakery_agg = bakery_sales.values("paid_by_id").annotate(
            total=Sum("total_amount"),
            tickets=Count("id"),
        )

        pyro_sales = PyromaneOrder.objects.filter(status="PAID", paid_by__isnull=False)
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            pyro_sales = pyro_sales.filter(paid_at__range=(start_dt, end_dt))
        pyro_agg = pyro_sales.values("paid_by_id").annotate(
            total=Sum("total_amount"),
            tickets=Count("id"),
        )

        totals = {}
        counts = {}
        for row in pos_agg:
            emp_id = row["employer_id"]
            totals[emp_id] = totals.get(emp_id, 0) + float(row["total"] or 0)
            counts[emp_id] = counts.get(emp_id, 0) + int(row["tickets"] or 0)
        for row in bakery_agg:
            emp_id = row["paid_by_id"]
            totals[emp_id] = totals.get(emp_id, 0) + float(row["total"] or 0)
            counts[emp_id] = counts.get(emp_id, 0) + int(row["tickets"] or 0)
        for row in pyro_agg:
            emp_id = row["paid_by_id"]
            totals[emp_id] = totals.get(emp_id, 0) + float(row["total"] or 0)
            counts[emp_id] = counts.get(emp_id, 0) + int(row["tickets"] or 0)

        averages = {}
        for emp_id, total in totals.items():
            ticket_count = counts.get(emp_id, 0)
            if ticket_count > 0:
                averages[emp_id] = total / ticket_count

        top_ids = sorted(averages, key=lambda k: averages[k], reverse=True)[:5]
        employers = Employer.objects.select_related("user").filter(id__in=top_ids)
        employer_map = {e.id: e for e in employers}
        top_list = []
        for emp_id in top_ids:
            emp = employer_map.get(emp_id)
            if not emp or not emp.user:
                continue
            top_list.append(
                f"{emp.user.first_name} {emp.user.last_name} · {int(averages[emp_id])} KMF · {counts.get(emp_id, 0)} tickets"
            )

        return JsonResponse({
            "success": True,
            "title": "Top employés (ticket moyen)",
            "period_label": period_label,
            "sections": [{
                "title": "Ticket moyen",
                "summary": top_list or ["Aucun employé actif."],
                "issues": [],
                "actions": [],
            }],
        })

    if "top" in normalized and ("employe" in normalized or "employer" in normalized or "vendeur" in normalized or "caissier" in normalized):
        pos_sales = SaleTransaction.objects.exclude(employer__isnull=True)
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            pos_sales = pos_sales.filter(date__range=(start_dt, end_dt))
        pos_agg = pos_sales.values("employer_id").annotate(total=Sum("total_amount"))

        bakery_sales = BakerySale.objects.filter(is_paid=True, paid_by__isnull=False)
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            bakery_sales = bakery_sales.filter(paid_at__range=(start_dt, end_dt))
        bakery_agg = bakery_sales.values("paid_by_id").annotate(total=Sum("total_amount"))

        pyro_sales = PyromaneOrder.objects.filter(status="PAID", paid_by__isnull=False)
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            pyro_sales = pyro_sales.filter(paid_at__range=(start_dt, end_dt))
        pyro_agg = pyro_sales.values("paid_by_id").annotate(total=Sum("total_amount"))

        totals = {}
        for row in pos_agg:
            totals[row["employer_id"]] = totals.get(row["employer_id"], 0) + float(row["total"] or 0)
        for row in bakery_agg:
            totals[row["paid_by_id"]] = totals.get(row["paid_by_id"], 0) + float(row["total"] or 0)
        for row in pyro_agg:
            totals[row["paid_by_id"]] = totals.get(row["paid_by_id"], 0) + float(row["total"] or 0)

        top_ids = sorted(totals, key=lambda k: totals[k], reverse=True)[:5]
        employers = Employer.objects.select_related("user").filter(id__in=top_ids)
        employer_map = {e.id: e for e in employers}
        top_list = []
        for emp_id in top_ids:
            emp = employer_map.get(emp_id)
            if not emp or not emp.user:
                continue
            top_list.append(f"{emp.user.first_name} {emp.user.last_name} · {int(totals[emp_id])} KMF")

        return JsonResponse({
            "success": True,
            "title": "Top employés",
            "period_label": period_label,
            "sections": [{
                "title": "Employés",
                "summary": top_list or ["Aucun employé actif."],
                "issues": [],
                "actions": [],
            }],
        })

    if "fiabilite" in normalized or "fiabilité" in normalized:
        reports = PosShiftReport.objects.all()
        if period:
            reports = reports.filter(shift_date__range=(period[0], period[1]))
        reports = reports.select_related("cashier__user")

        alerts_map = {}
        shift_map = {}
        for report in reports:
            emp_id = report.cashier_id
            if not emp_id:
                continue
            shift_map.setdefault(emp_id, 0)
            shift_map[emp_id] += 1

            abime = report.abimes.aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
            remise = report.remises.aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
            cons = report.consumptions.aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
            exp = report.expenses.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
            alert_count = 0
            if report.closed_at is None:
                alert_count += 1
            if abime > 0:
                alert_count += 1
            if remise > 0:
                alert_count += 1
            if cons > 0:
                alert_count += 1
            if exp > 0:
                alert_count += 1
            alerts_map[emp_id] = alerts_map.get(emp_id, 0) + alert_count

        if not alerts_map:
            return JsonResponse({
                "success": True,
                "title": "Classement fiabilité",
                "period_label": period_label,
                "sections": [{
                    "title": "Employés",
                    "summary": ["Aucun shift disponible."],
                    "issues": [],
                    "actions": [],
                }],
            })

        def calc_score(alerts):
            return max(0, 100 - alerts * 15)

        scores = {emp_id: calc_score(alerts) for emp_id, alerts in alerts_map.items()}
        sorted_ids = sorted(scores, key=lambda k: scores[k], reverse=True)
        employers = Employer.objects.select_related("user").filter(id__in=sorted_ids)
        employer_map = {e.id: e for e in employers}
        lines = []
        rankings = []
        for emp_id in sorted_ids[:10]:
            emp = employer_map.get(emp_id)
            if not emp or not emp.user:
                continue
            alerts = alerts_map.get(emp_id, 0)
            shifts_count = shift_map.get(emp_id, 0)
            score = scores[emp_id]
            stars = "★" * max(1, min(5, int(round(score / 20)))) + "☆" * (5 - max(1, min(5, int(round(score / 20)))))
            if score >= 85:
                badge = "OK"
            elif score >= 60:
                badge = "Attention"
            else:
                badge = "Critique"
            lines.append(
                f"{emp.user.first_name} {emp.user.last_name} · Fiabilité {score}% · {stars} · {badge} · Alertes {alerts} · Shifts {shifts_count}"
            )
            rankings.append({
                "name": f"{emp.user.first_name} {emp.user.last_name}",
                "score": int(score),
                "alerts": int(alerts),
                "shifts": int(shifts_count),
                "badge": badge,
            })

        return JsonResponse({
            "success": True,
            "title": "Classement fiabilité",
            "period_label": period_label,
            "rankings": rankings,
            "sections": [{
                "title": "Employés",
                "summary": lines or ["Aucun employé."],
                "issues": [],
                "actions": [],
            }],
        })

    if "client" in normalized:
        name_phrase = extract_after_keywords(normalized, ["client"])
        name_tokens = extract_terms(query)
        client_loyalty_qs = search_by_terms(Loyalty.objects.all(), ["client", "phone", "card_id"], name_phrase, name_tokens)
        bakery_client_qs = search_by_terms(BakerySale.objects.all(), ["client", "phone"], name_phrase, name_tokens)
        if client_loyalty_qs.count() == 1:
            loyalty = client_loyalty_qs.first()
            history = LoyaltyPointLedger.objects.filter(loyalty=loyalty).order_by("-date")[:10]
            history_lines = [f"{h.date.strftime('%d/%m/%Y')} · {h.points} pts · {h.note}" for h in history]
            return JsonResponse({
                "success": True,
                "title": f"Client fidélité: {loyalty.client}",
                "period_label": period_label,
                "sections": [{
                    "title": "Fidélité",
                    "summary": [
                        f"Carte: {loyalty.card_id}",
                        f"Solde: {int(loyalty.solde)} KMF",
                        f"Points: {int(loyalty.points_balance)}",
                    ],
                    "issues": [],
                    "actions": [],
                }, {
                    "title": "Historique récent",
                    "summary": history_lines or ["Aucun historique disponible."],
                    "issues": [],
                    "actions": [],
                }],
            })
        if bakery_client_qs.count() == 1:
            client = bakery_client_qs.first()
            sales = BakerySale.objects.filter(client=client.client)
            if period:
                start_dt, end_dt = period_bounds(period[0], period[1])
                sales = sales.filter(paid_at__range=(start_dt, end_dt))
            total = sales.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
            return JsonResponse({
                "success": True,
                "title": f"Client Mini-Four: {client.client}",
                "period_label": period_label,
                "sections": [{
                    "title": "Mini-Four",
                    "summary": [
                        f"Commandes: {sales.count()}",
                        f"Total: {int(total)} KMF",
                    ],
                    "issues": [],
                    "actions": [],
                }],
            })
        if client_loyalty_qs.count() + bakery_client_qs.count() > 1:
            suggestions = list(client_loyalty_qs.values_list("client", flat=True)[:5]) + list(bakery_client_qs.values_list("client", flat=True)[:5])
            return JsonResponse({
                "success": True,
                "title": "Plusieurs clients trouvés",
                "period_label": period_label,
                "sections": [{
                    "title": "Clients",
                    "summary": suggestions,
                    "issues": ["Merci de préciser le nom ou le téléphone."],
                    "actions": [],
                }],
            })

    if "produit" in normalized and ("sans vente" in normalized or "sans ventes" in normalized):
        start_date, end_date = period if period else (today, today)
        start_dt, end_dt = period_bounds(start_date, end_date)
        pos_sales = (
            SaleTransactionItem.objects.filter(transaction__date__range=(start_dt, end_dt))
            .values("product_id")
            .annotate(qty=Sum("quantity"))
        )
        sold_ids = {row["product_id"] for row in pos_sales}
        pos_missing = SaleProduct.objects.filter(stock_known=True).exclude(id__in=sold_ids).order_by("name")[:20]
        pos_lines = [p.name for p in pos_missing]

        bakery_sales = (
            BakerySaleItem.objects.filter(bakery__is_paid=True, bakery__paid_at__range=(start_dt, end_dt))
            .values("product_id")
            .annotate(qty=Sum("quantity"))
        )
        bakery_sold_ids = {row["product_id"] for row in bakery_sales}
        bakery_missing = BakeryProduct.objects.exclude(id__in=bakery_sold_ids).order_by("name")[:20]
        bakery_lines = [p.name for p in bakery_missing]

        return JsonResponse({
            "success": True,
            "title": "Produits sans ventes",
            "period_label": period_label,
            "sections": [{
                "title": "POS",
                "summary": pos_lines or ["Tous les produits ont des ventes."],
                "issues": [],
                "actions": [],
            }, {
                "title": "Mini-Four",
                "summary": bakery_lines or ["Tous les produits ont des ventes."],
                "issues": [],
                "actions": [],
            }],
        })

    if "recette" in normalized and ("manquante" in normalized or "manquantes" in normalized):
        missing_sale = SaleProduct.objects.filter(recipe__isnull=True).order_by("name")[:20]
        missing_bakery = BakeryProduct.objects.filter(recipe__isnull=True).order_by("name")[:20]
        return JsonResponse({
            "success": True,
            "title": "Recettes manquantes",
            "period_label": "",
            "sections": [{
                "title": "POS",
                "summary": [p.name for p in missing_sale] or ["Aucune recette manquante."],
                "issues": [],
                "actions": [],
            }, {
                "title": "Mini-Four",
                "summary": [p.name for p in missing_bakery] or ["Aucune recette manquante."],
                "issues": [],
                "actions": [],
            }],
        })

    if "panier moyen" in normalized or ("ticket moyen" in normalized and not employee_context):
        start_date, end_date = period if period else (today, today)
        start_dt, end_dt = period_bounds(start_date, end_date)

        pyromane_orders = PyromaneOrder.objects.filter(status="PAID", paid_at__range=(start_dt, end_dt))
        pyromane_tx_ids = pyromane_orders.exclude(transaction__isnull=True).values_list("transaction_id", flat=True)

        pos_tx = SaleTransaction.objects.filter(date__range=(start_dt, end_dt)).exclude(id__in=pyromane_tx_ids)
        bakery_sales = BakerySale.objects.filter(is_paid=True, paid_at__range=(start_dt, end_dt))

        pos_total = pos_tx.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        bakery_total = bakery_sales.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        pyro_total = pyromane_orders.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")

        pos_avg = (pos_total / pos_tx.count()) if pos_tx.count() else Decimal("0.00")
        bakery_avg = (bakery_total / bakery_sales.count()) if bakery_sales.count() else Decimal("0.00")
        pyro_avg = (pyro_total / pyromane_orders.count()) if pyromane_orders.count() else Decimal("0.00")

        return JsonResponse({
            "success": True,
            "title": "Panier moyen",
            "period_label": period_label,
            "sections": [{
                "title": "POS",
                "summary": [
                    f"Panier moyen: {int(pos_avg)} KMF",
                    f"Tickets: {pos_tx.count()}",
                ],
                "issues": [],
                "actions": [],
            }, {
                "title": "Mini-Four",
                "summary": [
                    f"Panier moyen: {int(bakery_avg)} KMF",
                    f"Tickets: {bakery_sales.count()}",
                ],
                "issues": [],
                "actions": [],
            }, {
                "title": "Pyromane",
                "summary": [
                    f"Panier moyen: {int(pyro_avg)} KMF",
                    f"Tickets: {pyromane_orders.count()}",
                ],
                "issues": [],
                "actions": [],
            }],
        })

    if "heure de pointe" in normalized or "heures de pointe" in normalized:
        start_date, end_date = period if period else (today, today)
        start_dt, end_dt = period_bounds(start_date, end_date)
        pyromane_orders = PyromaneOrder.objects.filter(status="PAID", paid_at__range=(start_dt, end_dt))
        pyromane_tx_ids = pyromane_orders.exclude(transaction__isnull=True).values_list("transaction_id", flat=True)
        pos_qs = SaleTransaction.objects.filter(date__range=(start_dt, end_dt)).exclude(id__in=pyromane_tx_ids)
        bakery_qs = BakerySale.objects.filter(is_paid=True, paid_at__range=(start_dt, end_dt))
        pyro_qs = pyromane_orders

        pos_rows = pos_qs.annotate(bucket=TruncHour("date")).values("bucket").annotate(total=Sum("total_amount")).order_by("-total")[:3]
        bakery_rows = bakery_qs.annotate(bucket=TruncHour("paid_at")).values("bucket").annotate(total=Sum("total_amount")).order_by("-total")[:3]
        pyro_rows = pyro_qs.annotate(bucket=TruncHour("paid_at")).values("bucket").annotate(total=Sum("total_amount")).order_by("-total")[:3]

        def fmt(rows):
            lines = []
            for row in rows:
                label = timezone.localtime(row["bucket"]).strftime("%Hh")
                lines.append(f"{label} · {int(row['total'] or 0)} KMF")
            return lines

        return JsonResponse({
            "success": True,
            "title": "Heures de pointe",
            "period_label": period_label,
            "sections": [{
                "title": "POS",
                "summary": fmt(pos_rows) or ["Aucune vente POS."],
                "issues": [],
                "actions": [],
            }, {
                "title": "Mini-Four",
                "summary": fmt(bakery_rows) or ["Aucune vente Mini-Four."],
                "issues": [],
                "actions": [],
            }, {
                "title": "Pyromane",
                "summary": fmt(pyro_rows) or ["Aucune vente Pyromane."],
                "issues": [],
                "actions": [],
            }],
        })

    if "client" in normalized and ("inactif" in normalized or "inactifs" in normalized):
        days_match = re.search(r"(\d+)\s*jour", normalized)
        days = int(days_match.group(1)) if days_match else 30
        cutoff = timezone.now() - timedelta(days=days)
        inactive = (
            Loyalty.objects.annotate(last_tx=Max("saletransaction__date"))
            .filter(Q(last_tx__lt=cutoff) | Q(last_tx__isnull=True))
            .order_by("client")[:20]
        )
        lines = [
            f"{c.client} · {c.last_tx.strftime('%d/%m/%Y') if c.last_tx else 'Aucune vente'}"
            for c in inactive
        ]
        return JsonResponse({
            "success": True,
            "title": "Clients fidelite inactifs",
            "period_label": f">{days} jours",
            "sections": [{
                "title": "Clients",
                "summary": lines or ["Aucun client inactif."],
                "issues": [],
                "actions": ["Relancer les clients inactifs."],
            }],
        })

    if "perte" in normalized and "bon" in normalized and ("expire" in normalized or "expir" in normalized):
        qs = CashChangeVoucher.objects.filter(status="EXPIRED")
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            qs = qs.filter(expires_at__range=(start_dt, end_dt))
        total_loss = qs.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        return JsonResponse({
            "success": True,
            "title": "Perte bons expires",
            "period_label": period_label,
            "sections": [{
                "title": "Perte",
                "summary": [
                    f"Nombre: {qs.count()}",
                    f"Montant: {int(total_loss)} KMF",
                ],
                "issues": [],
                "actions": ["Suivre les bons expirant bientot."],
            }],
        })

    if "taux" in normalized and ("abime" in normalized or "abimes" in normalized):
        start_date, end_date = period if period else (today, today)
        start_dt, end_dt = period_bounds(start_date, end_date)
        abimes_total = PosShiftAbime.objects.filter(report__shift_date__range=(start_date, end_date)).aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
        sold_total = SaleTransactionItem.objects.filter(transaction__date__range=(start_dt, end_dt)).aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
        rate = (abimes_total / sold_total * 100) if sold_total > 0 else Decimal("0.00")
        return JsonResponse({
            "success": True,
            "title": "Taux d'abimes",
            "period_label": period_label,
            "sections": [{
                "title": "Taux",
                "summary": [
                    f"Abimes: {int(abimes_total)}",
                    f"Vendus: {int(sold_total)}",
                    f"Taux: {rate:.1f}%",
                ],
                "issues": [],
                "actions": [],
            }],
        })

    if "taux" in normalized and "remise" in normalized:
        start_date, end_date = period if period else (today, today)
        start_dt, end_dt = period_bounds(start_date, end_date)
        remises_total = PosShiftRemise.objects.filter(report__shift_date__range=(start_date, end_date)).aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
        sold_total = SaleTransactionItem.objects.filter(transaction__date__range=(start_dt, end_dt)).aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
        rate = (remises_total / sold_total * 100) if sold_total > 0 else Decimal("0.00")
        return JsonResponse({
            "success": True,
            "title": "Taux de remises",
            "period_label": period_label,
            "sections": [{
                "title": "Taux",
                "summary": [
                    f"Remises: {int(remises_total)}",
                    f"Vendus: {int(sold_total)}",
                    f"Taux: {rate:.1f}%",
                ],
                "issues": [],
                "actions": [],
            }],
        })

    if "top" in normalized and ("matiere" in normalized or "matiere premiere" in normalized):
        start_date, end_date = period if period else (today - timedelta(days=6), today)
        start_dt, end_dt = period_bounds(start_date, end_date)
        movements = StockMovement.objects.filter(movement_type="Sortie", date__range=(start_dt, end_dt))
        top_mat = (
            movements.values("raw_material__name", "raw_material__unit")
            .annotate(qty=Sum("quantity"))
            .order_by("-qty")[:10]
        )
        lines = [
            f"{row['raw_material__name']} · {float(row['qty'] or 0):.2f} {row['raw_material__unit'] or ''}"
            for row in top_mat
        ]
        return JsonResponse({
            "success": True,
            "title": "Top matieres consommees",
            "period_label": f"{start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')}",
            "sections": [{
                "title": "Matieres",
                "summary": lines or ["Aucune sortie enregistree."],
                "issues": [],
                "actions": [],
            }],
        })

    product_keywords = ["produit", "article", "menu", "prix", "statut", "recette", "ingredient", "ingrédient"]
    product_phrase = extract_after_keywords(normalized, product_keywords)
    product_tokens = extract_terms(query)
    product_qs = search_by_terms(SaleProduct.objects.all(), ["name"], product_phrase, product_tokens)
    bakery_product_qs = search_by_terms(BakeryProduct.objects.all(), ["name"], product_phrase, product_tokens)
    matched_sale_products = product_qs[:5]
    matched_bakery_products = bakery_product_qs[:5]

    if any(word in normalized for word in product_keywords) or matched_sale_products.exists() or matched_bakery_products.exists():
        if matched_sale_products.count() + matched_bakery_products.count() == 0:
            return JsonResponse({"success": False, "error": "Produit introuvable."}, status=404)

        if matched_sale_products.count() + matched_bakery_products.count() > 1:
            suggestions = [p.name for p in matched_sale_products] + [p.name for p in matched_bakery_products]
            return JsonResponse({
                "success": True,
                "title": "Plusieurs produits trouvés",
                "period_label": period_label,
                "sections": [{
                    "title": "Produits",
                    "summary": suggestions,
                    "issues": ["Merci de préciser le produit exact."],
                    "actions": ["Réessayez avec le nom complet."],
                }],
            })

        if matched_sale_products.exists():
            product = matched_sale_products.first()
            status_label = "Prêt" if product.stock_known else "À produire"
            pos_sales = SaleTransactionItem.objects.filter(product=product)
            if period:
                start_dt, end_dt = period_bounds(period[0], period[1])
                pos_sales = pos_sales.filter(transaction__date__range=(start_dt, end_dt))
            pos_qty = pos_sales.aggregate(total=Sum("quantity"))["total"] or 0
            pos_amount = pos_sales.aggregate(total=Sum("subtotal"))["total"] or Decimal("0.00")

            prod_qs = SaleProduction.objects.filter(product=product)
            prod_qs = filter_date_range(prod_qs, "production_date")
            prod_qty = prod_qs.aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")

            full_history = (
                ("historique" in normalized and ("complet" in normalized or "total" in normalized))
                or "toute la duree" in normalized
                or "toute la durée" in normalized
            )
            history_limit = None if full_history else (20 if ("historique" in normalized or "tout" in normalized) else 8)
            sales_qs = pos_sales.select_related("transaction").order_by("-transaction__date")
            sales_history = sales_qs if history_limit is None else sales_qs[:history_limit]
            sales_lines = [
                f"{item.transaction.date.strftime('%d/%m/%Y %H:%M')} · {item.quantity} u · {int(item.subtotal)} KMF"
                for item in sales_history
            ]
            prod_qs_ordered = prod_qs.order_by("-production_date")
            prod_history = prod_qs_ordered if history_limit is None else prod_qs_ordered[:history_limit]
            prod_lines = [
                f"{prod.production_date.strftime('%d/%m/%Y')} · {prod.quantity} u"
                for prod in prod_history
            ]

            recipe = getattr(product, "recipe", None)
            recipe_lines = []
            if recipe:
                recipe_lines.append(f"Rendement: {recipe.yield_quantity} {recipe.yield_unit}")
                items = recipe.items.select_related("raw_material").all()[:6]
                for item in items:
                    recipe_lines.append(f"{item.raw_material.name}: {item.quantity}")
            else:
                recipe_lines.append("Recette non renseignée.")

            def compute_sellout_metrics(product, days):
                if not product.stock_known:
                    return None
                start_date = today - timedelta(days=days - 1)
                end_date = today
                day = start_date
                times = []
                shift_counts = {"MATIN": 0, "SOIR": 0}
                shift_times = {"MATIN": [], "SOIR": []}
                total_produced = Decimal("0.00")
                production_days = 0
                while day <= end_date:
                    produced = SaleProduction.objects.filter(
                        product=product,
                        production_date=day,
                    ).aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
                    if produced <= 0:
                        day += timedelta(days=1)
                        continue
                    total_produced += produced
                    production_days += 1
                    items = (
                        SaleTransactionItem.objects
                        .filter(product=product, transaction__date__date=day)
                        .select_related("transaction")
                        .order_by("transaction__date")
                    )
                    total = Decimal("0.00")
                    sold_time = None
                    for item in items:
                        total += Decimal(item.quantity or 0)
                        if total >= produced:
                            sold_time = timezone.localtime(item.transaction.date)
                            break
                    if sold_time:
                        times.append(sold_time)
                        if sold_time.time() < time(15, 0):
                            shift_counts["MATIN"] += 1
                            shift_times["MATIN"].append(sold_time)
                        else:
                            shift_counts["SOIR"] += 1
                            shift_times["SOIR"].append(sold_time)
                    day += timedelta(days=1)
                if not times:
                    return None

                def to_seconds(dt):
                    t = dt.time()
                    return t.hour * 3600 + t.minute * 60 + t.second

                def fmt(sec):
                    h = int(sec // 3600) % 24
                    m = int((sec % 3600) // 60)
                    return f"{h:02d}:{m:02d}"

                seconds = [to_seconds(t) for t in times]
                avg = sum(seconds) / len(seconds)
                avg_produced = (total_produced / production_days) if production_days > 0 else Decimal("0.00")

                def avg_shift_time(label):
                    if not shift_times[label]:
                        return None
                    sec = [to_seconds(t) for t in shift_times[label]]
                    return fmt(sum(sec) / len(sec))

                return {
                    "avg": fmt(avg),
                    "avg_seconds": avg,
                    "earliest": fmt(min(seconds)),
                    "latest": fmt(max(seconds)),
                    "count": len(times),
                    "days": days,
                    "shift_counts": shift_counts,
                    "shift_avg": {
                        "MATIN": avg_shift_time("MATIN"),
                        "SOIR": avg_shift_time("SOIR"),
                    },
                    "avg_produced": avg_produced,
                }

            week_metrics = compute_sellout_metrics(product, 7)
            month_metrics = compute_sellout_metrics(product, 30)
            include_daily_sellout = any(word in normalized for word in ["heure", "fini", "rupture"])
            daily_sellout_lines = []
            if include_daily_sellout and product.stock_known:
                if period:
                    start_date, end_date = period
                else:
                    start_date = today - timedelta(days=89)
                    end_date = today
                day = start_date
                while day <= end_date:
                    produced = SaleProduction.objects.filter(product=product, production_date=day).aggregate(
                        total=Sum("quantity")
                    )["total"] or Decimal("0.00")
                    if produced <= 0:
                        daily_sellout_lines.append(f"{day.strftime('%d/%m/%Y')} · Pas de production")
                        day += timedelta(days=1)
                        continue
                    items = (
                        SaleTransactionItem.objects
                        .filter(product=product, transaction__date__date=day)
                        .select_related("transaction")
                        .order_by("transaction__date")
                    )
                    sold_time = None
                    total = Decimal("0.00")
                    for item in items:
                        total += Decimal(item.quantity or 0)
                        if total >= produced:
                            sold_time = timezone.localtime(item.transaction.date).strftime("%H:%M")
                            break
                    if sold_time:
                        daily_sellout_lines.append(f"{day.strftime('%d/%m/%Y')} · Fini a {sold_time}")
                    else:
                        daily_sellout_lines.append(f"{day.strftime('%d/%m/%Y')} · Pas de rupture")
                    day += timedelta(days=1)
            sellout_lines = []
            sellout_issues = []
            sellout_actions = []
            if not product.stock_known:
                sellout_lines.append("Produit à produire : pas de rupture au comptoir.")
            else:
                if week_metrics:
                    sellout_lines.append(
                        f"Semaine: moyenne {week_metrics['avg']} · jours en rupture {week_metrics['count']}/{week_metrics['days']} · "
                        f"plus tôt {week_metrics['earliest']} · plus tard {week_metrics['latest']}"
                    )
                    sellout_lines.append(
                        f"Semaine (shift): Matin {week_metrics['shift_counts']['MATIN']} · Soir {week_metrics['shift_counts']['SOIR']}"
                    )
                    if week_metrics["shift_avg"]["MATIN"] or week_metrics["shift_avg"]["SOIR"]:
                        sellout_lines.append(
                            f"Heures moyennes: Matin {week_metrics['shift_avg']['MATIN'] or '--'} · "
                            f"Soir {week_metrics['shift_avg']['SOIR'] or '--'}"
                        )
                    if week_metrics["avg_seconds"] < 9 * 3600:
                        sellout_issues.append("Semaine: rupture trop tôt (avant 9h).")
                        if week_metrics["avg_produced"] > 0:
                            target_sec = 9 * 3600
                            extra = (Decimal(target_sec) / Decimal(week_metrics["avg_seconds"]) - Decimal("1.0")) * week_metrics["avg_produced"]
                            extra_units = max(1, int(extra.to_integral_value(rounding=ROUND_DOWN)))
                            sellout_actions.append(f"Recommandation semaine: produire +{extra_units} unités.")
                else:
                    sellout_lines.append("Semaine: aucune rupture détectée.")
                if month_metrics:
                    sellout_lines.append(
                        f"Mois: moyenne {month_metrics['avg']} · jours en rupture {month_metrics['count']}/{month_metrics['days']} · "
                        f"plus tôt {month_metrics['earliest']} · plus tard {month_metrics['latest']}"
                    )
                    sellout_lines.append(
                        f"Mois (shift): Matin {month_metrics['shift_counts']['MATIN']} · Soir {month_metrics['shift_counts']['SOIR']}"
                    )
                    if month_metrics["shift_avg"]["MATIN"] or month_metrics["shift_avg"]["SOIR"]:
                        sellout_lines.append(
                            f"Heures moyennes: Matin {month_metrics['shift_avg']['MATIN'] or '--'} · "
                            f"Soir {month_metrics['shift_avg']['SOIR'] or '--'}"
                        )
                    if month_metrics["avg_seconds"] < 9 * 3600:
                        sellout_issues.append("Mois: rupture trop tôt (avant 9h).")
                        if month_metrics["avg_produced"] > 0:
                            target_sec = 9 * 3600
                            extra = (Decimal(target_sec) / Decimal(month_metrics["avg_seconds"]) - Decimal("1.0")) * month_metrics["avg_produced"]
                            extra_units = max(1, int(extra.to_integral_value(rounding=ROUND_DOWN)))
                            sellout_actions.append(f"Recommandation mois: produire +{extra_units} unités.")
                else:
                    sellout_lines.append("Mois: aucune rupture détectée.")

            return JsonResponse({
                "success": True,
                "title": f"Produit POS: {product.name}",
                "period_label": period_label,
                "sections": [{
                    "title": "Informations",
                    "summary": [
                        f"Statut: {status_label}",
                        f"Prix: {int(product.unit_price)} KMF",
                        f"Ventes: {int(pos_qty)} u · {int(pos_amount)} KMF",
                        f"Production: {int(prod_qty)} u",
                    ],
                    "issues": [],
                    "actions": [],
                }, {
                    "title": "Rupture comptoir",
                    "summary": sellout_lines,
                    "issues": sellout_issues or ["Aucune alerte de rupture tôt."],
                    "actions": sellout_actions or ["Ajuster la production si rupture trop tôt."],
                }, {
                    "title": "Heure de rupture (par jour)",
                    "summary": daily_sellout_lines or ["Ajoutez 'heure' ou 'rupture' dans la question pour voir le detail."],
                    "issues": [],
                    "actions": [],
                }, {
                    "title": "Recette",
                    "summary": recipe_lines,
                    "issues": [],
                    "actions": [],
                }, {
                    "title": "Historique ventes",
                    "summary": sales_lines or ["Aucune vente sur la période."],
                    "issues": [],
                    "actions": [],
                }, {
                    "title": "Historique production",
                    "summary": prod_lines or ["Aucune production sur la période."],
                    "issues": [],
                    "actions": [],
                }],
            })

        product = matched_bakery_products.first()
        bakery_sales = BakerySaleItem.objects.filter(product=product)
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            bakery_sales = bakery_sales.filter(bakery__paid_at__range=(start_dt, end_dt))
        bakery_qty = bakery_sales.aggregate(total=Sum("quantity"))["total"] or 0
        bakery_amount = bakery_sales.aggregate(total=Sum("subtotal"))["total"] or Decimal("0.00")
        bakery_prod = BakeryProduction.objects.filter(product=product)
        bakery_prod = filter_date_range(bakery_prod, "production_date")
        bakery_prod_qty = bakery_prod.aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")

        full_history = (
            ("historique" in normalized and ("complet" in normalized or "total" in normalized))
            or "toute la duree" in normalized
            or "toute la durée" in normalized
        )
        history_limit = None if full_history else (20 if ("historique" in normalized or "tout" in normalized) else 8)
        bakery_sales_qs = bakery_sales.select_related("bakery").order_by("-bakery__paid_at")
        bakery_sales_history = bakery_sales_qs if history_limit is None else bakery_sales_qs[:history_limit]
        bakery_sales_lines = [
            f"{(item.bakery.paid_at or item.bakery.date).strftime('%d/%m/%Y %H:%M')} · {item.quantity} u · {int(item.subtotal)} KMF"
            for item in bakery_sales_history
        ]
        bakery_prod_qs = bakery_prod.order_by("-production_date")
        bakery_prod_history = bakery_prod_qs if history_limit is None else bakery_prod_qs[:history_limit]
        bakery_prod_lines = [
            f"{prod.production_date.strftime('%d/%m/%Y')} · {prod.quantity} u"
            for prod in bakery_prod_history
        ]

        recipe = getattr(product, "recipe", None)
        recipe_lines = []
        if recipe:
            recipe_lines.append(f"Rendement: {recipe.yield_quantity} {recipe.yield_unit}")
            items = recipe.items.select_related("raw_material").all()[:6]
            for item in items:
                recipe_lines.append(f"{item.raw_material.name}: {item.quantity}")
        else:
            recipe_lines.append("Recette non renseignée.")

        return JsonResponse({
            "success": True,
            "title": f"Produit Mini-Four: {product.name}",
            "period_label": period_label,
            "sections": [{
                "title": "Informations",
                "summary": [
                    f"Prix: {int(product.price)} KMF",
                    f"Ventes: {int(bakery_qty)} u · {int(bakery_amount)} KMF",
                    f"Production: {int(bakery_prod_qty)} u",
                ],
                "issues": [],
                "actions": [],
            }, {
                "title": "Recette",
                "summary": recipe_lines,
                "issues": [],
                "actions": [],
            }, {
                "title": "Historique ventes",
                "summary": bakery_sales_lines or ["Aucune vente sur la période."],
                "issues": [],
                "actions": [],
            }, {
                "title": "Historique production",
                "summary": bakery_prod_lines or ["Aucune production sur la période."],
                "issues": [],
                "actions": [],
            }],
        })

    evolution_keywords = ["evolution", "évolution", "comparatif", "comparaison", "variation", "vs"]
    if any(word in normalized for word in evolution_keywords) and (
        re.search(r"\bca\b", normalized) or "vente" in normalized or "ventes" in normalized or "chiffre" in normalized
    ):
        if period:
            start_date, end_date = period
            period_label = f"{start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')}"
        else:
            end_date = today
            start_date = today - timedelta(days=29)
            period_label = f"{start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')}"

        length_days = (end_date - start_date).days + 1
        prev_end = start_date - timedelta(days=1)
        prev_start = prev_end - timedelta(days=length_days - 1)
        prev_label = f"{prev_start.strftime('%d/%m/%Y')} → {prev_end.strftime('%d/%m/%Y')}"

        start_dt, end_dt = period_bounds(start_date, end_date)
        prev_start_dt, prev_end_dt = period_bounds(prev_start, prev_end)

        def sum_channel(qs, field, date_field, range_tuple):
            return qs.filter(**{f"{date_field}__range": range_tuple}).aggregate(total=Sum(field))["total"] or Decimal("0.00")

        pos_total = sum_channel(SaleTransaction.objects.all(), "total_amount", "date", (start_dt, end_dt))
        pos_prev = sum_channel(SaleTransaction.objects.all(), "total_amount", "date", (prev_start_dt, prev_end_dt))

        bakery_total = sum_channel(BakerySale.objects.filter(is_paid=True), "total_amount", "paid_at", (start_dt, end_dt))
        bakery_prev = sum_channel(BakerySale.objects.filter(is_paid=True), "total_amount", "paid_at", (prev_start_dt, prev_end_dt))

        pyro_total = sum_channel(PyromaneOrder.objects.filter(status="PAID"), "total_amount", "paid_at", (start_dt, end_dt))
        pyro_prev = sum_channel(PyromaneOrder.objects.filter(status="PAID"), "total_amount", "paid_at", (prev_start_dt, prev_end_dt))

        def delta_line(label, current, previous):
            diff = current - previous
            sign = "+" if diff >= 0 else "-"
            if previous > 0:
                pct = (diff / previous) * 100
                pct_label = f"{sign}{abs(pct):.1f}%"
            else:
                pct_label = "N/A"
            return f"{label}: {int(current)} KMF · {sign}{int(abs(diff))} KMF · {pct_label}"

        total_current = pos_total + bakery_total + pyro_total
        total_prev = pos_prev + bakery_prev + pyro_prev

        return JsonResponse({
            "success": True,
            "title": "Évolution du CA",
            "period_label": period_label,
            "sections": [{
                "title": "Périodes",
                "summary": [
                    f"Actuelle: {period_label}",
                    f"Précédente: {prev_label}",
                ],
                "issues": [],
                "actions": [],
            }, {
                "title": "Comparatif",
                "summary": [
                    delta_line("Total", total_current, total_prev),
                    delta_line("POS", pos_total, pos_prev),
                    delta_line("Mini-Four", bakery_total, bakery_prev),
                    delta_line("Pyromane", pyro_total, pyro_prev),
                ],
                "issues": [],
                "actions": [],
            }],
        })

    if ("par heure" in normalized or "horaire" in normalized) or ("par jour" in normalized or "journalier" in normalized or "quotidien" in normalized):
        by_hour = "par heure" in normalized or "horaire" in normalized
        start_date, end_date = period if period else (today, today)
        start_dt, end_dt = period_bounds(start_date, end_date)

        pyromane_tx_ids = PyromaneOrder.objects.filter(
            status="PAID",
            paid_at__range=(start_dt, end_dt),
        ).exclude(transaction__isnull=True).values_list("transaction_id", flat=True)

        pos_qs = SaleTransaction.objects.filter(date__range=(start_dt, end_dt)).exclude(id__in=pyromane_tx_ids)
        bakery_qs = BakerySale.objects.filter(is_paid=True, paid_at__range=(start_dt, end_dt))
        pyro_qs = PyromaneOrder.objects.filter(status="PAID", paid_at__range=(start_dt, end_dt))

        bucket_func = TruncHour if by_hour else TruncDate
        pos_rows = pos_qs.annotate(bucket=bucket_func("date")).values("bucket").annotate(total=Sum("total_amount")).order_by("bucket")
        bakery_rows = bakery_qs.annotate(bucket=bucket_func("paid_at")).values("bucket").annotate(total=Sum("total_amount")).order_by("bucket")
        pyro_rows = pyro_qs.annotate(bucket=bucket_func("paid_at")).values("bucket").annotate(total=Sum("total_amount")).order_by("bucket")

        buckets = {}
        for row in pos_rows:
            bucket = row["bucket"]
            buckets.setdefault(bucket, {"pos": 0, "bakery": 0, "pyro": 0})
            buckets[bucket]["pos"] = float(row["total"] or 0)
        for row in bakery_rows:
            bucket = row["bucket"]
            buckets.setdefault(bucket, {"pos": 0, "bakery": 0, "pyro": 0})
            buckets[bucket]["bakery"] = float(row["total"] or 0)
        for row in pyro_rows:
            bucket = row["bucket"]
            buckets.setdefault(bucket, {"pos": 0, "bakery": 0, "pyro": 0})
            buckets[bucket]["pyro"] = float(row["total"] or 0)

        def fmt_bucket(bucket):
            if not bucket:
                return "--"
            if by_hour:
                return timezone.localtime(bucket).strftime("%Hh")
            return bucket.strftime("%d/%m")

        sorted_keys = sorted([b for b in buckets.keys() if b is not None])
        total_lines = []
        pos_lines = []
        bakery_lines = []
        pyro_lines = []
        for key in sorted_keys:
            data = buckets[key]
            label = fmt_bucket(key)
            total = data["pos"] + data["bakery"] + data["pyro"]
            total_lines.append(f"{label} · {int(total)} KMF")
            pos_lines.append(f"{label} · {int(data['pos'])} KMF")
            bakery_lines.append(f"{label} · {int(data['bakery'])} KMF")
            pyro_lines.append(f"{label} · {int(data['pyro'])} KMF")

        return JsonResponse({
            "success": True,
            "title": f"Ventes par {'heure' if by_hour else 'jour'}",
            "period_label": f"{start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')}",
            "sections": [{
                "title": "Total",
                "summary": total_lines or ["Aucune vente sur la période."],
                "issues": [],
                "actions": [],
            }, {
                "title": "POS",
                "summary": pos_lines or ["Aucune vente POS."],
                "issues": [],
                "actions": [],
            }, {
                "title": "Mini‑Four",
                "summary": bakery_lines or ["Aucune vente Mini‑Four."],
                "issues": [],
                "actions": [],
            }, {
                "title": "Pyromane",
                "summary": pyro_lines or ["Aucune vente Pyromane."],
                "issues": [],
                "actions": [],
            }],
        })

    if "vente" in normalized or "ventes" in normalized or "ca " in normalized:
        employee_filter = None
        if employee_context:
            users = resolve_employee(normalized)
            if users.count() == 0:
                return JsonResponse({"success": False, "error": "Employé introuvable."}, status=404)
            if users.count() > 1:
                suggestions = [f"{u.first_name} {u.last_name} ({u.email})" for u in users[:5]]
                return JsonResponse({
                    "success": True,
                    "title": "Plusieurs employés trouvés",
                    "period_label": period_label,
                    "sections": [{
                        "title": "Employés",
                        "summary": suggestions,
                        "issues": ["Merci de préciser le nom ou l'email exact."],
                        "actions": ["Réessayez avec l'email complet."],
                    }],
                })
            user = users.first()
            employee_filter = getattr(user, "employer", None)

        pos_tx = SaleTransaction.objects.all()
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            pos_tx = pos_tx.filter(date__range=(start_dt, end_dt))
        if employee_filter:
            pos_tx = pos_tx.filter(employer=employee_filter)
        pos_total = pos_tx.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        pos_tickets = pos_tx.count()

        bakery_sales = BakerySale.objects.filter(is_paid=True)
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            bakery_sales = bakery_sales.filter(paid_at__range=(start_dt, end_dt))
        if employee_filter:
            bakery_sales = bakery_sales.filter(paid_by=employee_filter)
        bakery_total = bakery_sales.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        bakery_tickets = bakery_sales.count()

        pyromane_orders = PyromaneOrder.objects.filter(status="PAID")
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            pyromane_orders = pyromane_orders.filter(paid_at__range=(start_dt, end_dt))
        if employee_filter:
            pyromane_orders = pyromane_orders.filter(paid_by=employee_filter)
        pyromane_total = pyromane_orders.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        pyromane_tickets = pyromane_orders.count()

        return JsonResponse({
            "success": True,
            "title": "Synthèse des ventes",
            "period_label": period_label,
            "sections": [{
                "title": "Ventes",
                "summary": [
                    f"POS: {int(pos_total)} KMF · {pos_tickets} tickets",
                    f"Mini-Four: {int(bakery_total)} KMF · {bakery_tickets} tickets",
                    f"Pyromane: {int(pyromane_total)} KMF · {pyromane_tickets} tickets",
                ],
                "issues": [],
                "actions": [],
            }],
        })

    if (
        "sortie" in normalized
        or "sorties" in normalized
        or "destination" in normalized
    ) and ("stock" in normalized or "matiere" in normalized):
        start_date, end_date = period if period else (today - timedelta(days=29), today)
        start_dt, end_dt = period_bounds(start_date, end_date)

        def build_dest_summary(dest_code, label):
            qs = StockMovement.objects.filter(
                movement_type="Sortie",
                date__range=(start_dt, end_dt),
                destination=dest_code,
            )
            total_qty = qs.aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
            top = (
                qs.values("raw_material__name")
                .annotate(qty=Sum("quantity"))
                .order_by("-qty")[:5]
            )
            top_list = [f"{row['raw_material__name']} · {float(row['qty'] or 0):.2f}" for row in top]
            return {
                "title": label,
                "summary": [
                    f"Sorties: {qs.count()}",
                    f"Quantité totale: {float(total_qty):.2f}",
                ] + (top_list or ["Aucune sortie enregistrée."]),
            }

        sections = []
        if "pos" in normalized or "caisse" in normalized:
            sections.append(build_dest_summary("POS", "Sorties POS"))
        elif "mini" in normalized or "four" in normalized or "boulangerie" in normalized:
            sections.append(build_dest_summary("BAKERY", "Sorties Mini-Four"))
        else:
            sections.append(build_dest_summary("POS", "Sorties POS"))
            sections.append(build_dest_summary("BAKERY", "Sorties Mini-Four"))

        return JsonResponse({
            "success": True,
            "title": "Sorties de stock",
            "period_label": f"{start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')}",
            "sections": [{
                "title": section["title"],
                "summary": section["summary"],
                "issues": [],
                "actions": [],
            } for section in sections],
        })

    if "stock" in normalized or "matiere" in normalized or "matiere premiere" in normalized:
        low_stock_qs = RawMaterial.objects.filter(current_stock__lte=F("min_stock"))
        low_stock_list = list(low_stock_qs.values_list("name", flat=True)[:5])
        material_phrase = extract_after_keywords(normalized, ["matiere", "matiere premiere", "stock"])
        material_tokens = extract_terms(query)
        material_qs = search_by_terms(RawMaterial.objects.all(), ["name"], material_phrase, material_tokens)
        if material_qs.count() == 1 and (material_phrase or "matiere" in normalized or "stock" in normalized):
            material = material_qs.first()
            status = "Critique" if material.current_stock <= material.min_stock else "OK"
            return JsonResponse({
                "success": True,
                "title": f"Matière première: {material.name}",
                "period_label": period_label,
                "sections": [{
                    "title": "Stock",
                    "summary": [
                        f"Stock actuel: {material.current_stock} {material.unit}",
                        f"Seuil minimum: {material.min_stock} {material.unit}",
                        f"Statut: {status}",
                    ],
                    "issues": [],
                    "actions": [],
                }],
            })
        sorties_qs = StockMovement.objects.filter(movement_type="Sortie")
        sorties_qs = filter_range(sorties_qs, "date")
        sorties_count = sorties_qs.count()
        sorties_qty = sorties_qs.aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")

        return JsonResponse({
            "success": True,
            "title": "Stocks & Sorties",
            "period_label": period_label,
            "sections": [{
                "title": "Stock",
                "summary": [
                    f"Ruptures: {low_stock_qs.count()}",
                    f"Sorties: {sorties_count} ({int(sorties_qty)} unités)",
                    f"Critiques: {', '.join(low_stock_list) or 'Aucun'}",
                ],
                "issues": ["Vérifier les matières critiques si la liste est non vide."],
                "actions": ["Planifier un réassort si nécessaire."],
            }],
        })

    if "comparatif" in normalized and "production" in normalized:
        start_date, end_date = period if period else (today - timedelta(days=29), today)

        def build_stock_map(destination_value):
            stock_totals = StockMovement.objects.filter(
                movement_type="Sortie",
                date__date__gte=start_date,
                date__date__lte=end_date,
                destination=destination_value,
            ).values("raw_material_id", "raw_material__name", "raw_material__unit").annotate(
                total=Sum("quantity")
            )
            return {
                row["raw_material_id"]: {
                    "name": row["raw_material__name"],
                    "unit": row["raw_material__unit"],
                    "stock_out": row["total"] or Decimal(0),
                }
                for row in stock_totals
            }

        def build_theoretical_map(productions, recipe_by_product):
            theoretical = {}
            for production in productions:
                recipe = recipe_by_product.get(production.product_id)
                if not recipe or recipe.yield_quantity <= 0:
                    continue
                factor = production.quantity / recipe.yield_quantity
                for item in recipe.items.all():
                    material_id = item.raw_material_id
                    qty = (item.quantity or Decimal(0)) * factor
                    theoretical[material_id] = theoretical.get(material_id, Decimal(0)) + qty
            return theoretical

        sale_recipes = SaleRecipe.objects.select_related("product").prefetch_related("items__raw_material")
        sale_recipe_by_product = {recipe.product_id: recipe for recipe in sale_recipes}
        sale_productions = SaleProduction.objects.filter(
            production_date__gte=start_date,
            production_date__lte=end_date,
            product__stock_known=True,
        ).select_related("product")

        bakery_recipes = BakeryRecipe.objects.select_related("product").prefetch_related("items__raw_material")
        bakery_recipe_by_product = {recipe.product_id: recipe for recipe in bakery_recipes}
        bakery_productions = BakeryProduction.objects.filter(
            production_date__gte=start_date,
            production_date__lte=end_date,
        ).select_related("product")

        pos_stock_by_material = build_stock_map("POS")
        bakery_stock_by_material = build_stock_map("BAKERY")
        pos_theoretical_by_material = build_theoretical_map(sale_productions, sale_recipe_by_product)
        bakery_theoretical_by_material = build_theoretical_map(bakery_productions, bakery_recipe_by_product)

        pos_ids = set(pos_stock_by_material.keys()) | set(pos_theoretical_by_material.keys())
        bakery_ids = set(bakery_stock_by_material.keys()) | set(bakery_theoretical_by_material.keys())
        all_ids = pos_ids | bakery_ids
        materials_lookup = {
            material["id"]: material
            for material in RawMaterial.objects.filter(id__in=all_ids).values("id", "name", "unit")
        }

        def build_rows(stock_by_material, theoretical_by_material, material_ids):
            rows = []
            for material_id in material_ids:
                stock_row = stock_by_material.get(material_id, {})
                stock_out = stock_row.get("stock_out", Decimal(0))
                theoretical = theoretical_by_material.get(material_id, Decimal(0))
                material_info = materials_lookup.get(material_id, {})
                unit = stock_row.get("unit") or material_info.get("unit") or ""
                name = stock_row.get("name") or material_info.get("name") or "N/A"
                rows.append({
                    "name": name,
                    "unit": unit,
                    "stock_out": stock_out,
                    "theoretical": theoretical,
                    "delta": stock_out - theoretical,
                })
            return rows

        def summarize_rows(rows, label):
            total_out = sum((row["stock_out"] or Decimal(0)) for row in rows)
            total_theoretical = sum((row["theoretical"] or Decimal(0)) for row in rows)
            delta = total_out - total_theoretical
            top_over = sorted(rows, key=lambda r: r["delta"], reverse=True)[:3]
            top_under = sorted(rows, key=lambda r: r["delta"])[:3]
            summary = [
                f"Sorties: {float(total_out):.2f}",
                f"Théorique: {float(total_theoretical):.2f}",
                f"Delta: {float(delta):.2f}",
            ]
            issues = []
            if top_over:
                issues.append("Surconsommation: " + ", ".join(
                    f"{r['name']} ({float(r['delta']):.2f} {r['unit']})" for r in top_over if r["delta"] > 0
                ) or "Aucune")
            if top_under:
                issues.append("Sous-consommation: " + ", ".join(
                    f"{r['name']} ({float(r['delta']):.2f} {r['unit']})" for r in top_under if r["delta"] < 0
                ) or "Aucune")
            return {
                "title": label,
                "summary": summary,
                "issues": issues or ["Aucun écart notable."],
            }

        pos_rows = build_rows(pos_stock_by_material, pos_theoretical_by_material, pos_ids)
        bakery_rows = build_rows(bakery_stock_by_material, bakery_theoretical_by_material, bakery_ids)

        sections = [
            summarize_rows(pos_rows, "Comparatif POS"),
            summarize_rows(bakery_rows, "Comparatif Mini-Four"),
        ]

        return JsonResponse({
            "success": True,
            "title": "Comparatif Production / Stock",
            "period_label": f"{start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')}",
            "sections": [{
                "title": section["title"],
                "summary": section["summary"],
                "issues": section["issues"],
                "actions": ["Vérifier les écarts importants."],
            } for section in sections],
        })

    if "production" in normalized:
        pos_prod = SaleProduction.objects.all()
        pos_prod = filter_date_range(pos_prod, "production_date")
        pos_qty = pos_prod.aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
        bakery_prod = BakeryProduction.objects.all()
        bakery_prod = filter_date_range(bakery_prod, "production_date")
        bakery_qty = bakery_prod.aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
        return JsonResponse({
            "success": True,
            "title": "Production",
            "period_label": period_label,
            "sections": [{
                "title": "Production",
                "summary": [
                    f"POS: {int(pos_qty)} unités",
                    f"Mini-Four: {int(bakery_qty)} unités",
                ],
                "issues": [],
                "actions": ["Comparer production vs ventes."],
            }],
        })

    if "recette" in normalized:
        missing_sale = SaleProduct.objects.filter(recipe__isnull=True).count()
        missing_bakery = BakeryProduct.objects.filter(recipe__isnull=True).count()
        return JsonResponse({
            "success": True,
            "title": "Recettes",
            "period_label": period_label,
            "sections": [{
                "title": "Recettes manquantes",
                "summary": [
                    f"POS: {missing_sale}",
                    f"Mini-Four: {missing_bakery}",
                ],
                "issues": [],
                "actions": ["Compléter les recettes manquantes."],
            }],
        })

    if "fidelite" in normalized or "fidélité" in normalized:
        card_match = re.search(r"\b[A-Z0-9]{4,}\b", query)
        phone_match = re.search(r"\b\d{6,}\b", query)
        loyalty_qs = Loyalty.objects.all()
        if card_match:
            loyalty_qs = loyalty_qs.filter(card_id__icontains=card_match.group(0))
        if phone_match:
            loyalty_qs = loyalty_qs.filter(phone__icontains=phone_match.group(0))
        if loyalty_qs.count() == 1:
            loyalty = loyalty_qs.first()
            history = LoyaltyPointLedger.objects.filter(loyalty=loyalty).order_by("-date")[:5]
            history_lines = [f"{h.date.strftime('%d/%m/%Y')} · {h.points} pts · {h.note}" for h in history]
            return JsonResponse({
                "success": True,
                "title": f"Client fidélité: {loyalty.client}",
                "period_label": period_label,
                "sections": [{
                    "title": "Fidélité",
                    "summary": [
                        f"Carte: {loyalty.card_id}",
                        f"Solde: {int(loyalty.solde)} KMF",
                        f"Points: {int(loyalty.points_balance)}",
                    ],
                    "issues": [],
                    "actions": [],
                }, {
                    "title": "Historique récent",
                    "summary": history_lines or ["Aucun historique disponible."],
                    "issues": [],
                    "actions": [],
                }],
            })
        loyalty_qs = Loyalty.objects.all()
        if period:
            loyalty_qs = loyalty_qs.filter(date__range=(period[0], period[1]))
        new_cards = loyalty_qs.count()
        points_earned = SaleTransaction.objects.all()
        points_redeemed = SaleTransaction.objects.all()
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            points_earned = points_earned.filter(date__range=(start_dt, end_dt))
            points_redeemed = points_redeemed.filter(date__range=(start_dt, end_dt))
        points_earned_total = points_earned.aggregate(total=Sum("points_earned"))["total"] or 0
        points_redeemed_total = points_redeemed.aggregate(total=Sum("points_redeemed"))["total"] or 0
        return JsonResponse({
            "success": True,
            "title": "Fidélité",
            "period_label": period_label,
            "sections": [{
                "title": "Fidélité",
                "summary": [
                    f"Nouvelles cartes: {new_cards}",
                    f"Points gagnés: {int(points_earned_total)}",
                    f"Points utilisés: {int(points_redeemed_total)}",
                ],
                "issues": [],
                "actions": ["Suivre les inscriptions fidélité."],
            }],
        })

    if "bon" in normalized or "voucher" in normalized:
        code_match = re.search(r"brm[-\w]+", normalized)
        if code_match:
            voucher = CashChangeVoucher.objects.filter(code__iexact=code_match.group(0)).first()
            if voucher:
                return JsonResponse({
                    "success": True,
                    "title": f"Bon: {voucher.code}",
                    "period_label": period_label,
                    "sections": [{
                        "title": "Bon de monnaie",
                        "summary": [
                            f"Montant: {int(voucher.amount)} KMF",
                            f"Statut: {voucher.status}",
                            f"Expire le: {voucher.expires_at.strftime('%d/%m/%Y')}",
                        ],
                        "issues": [],
                        "actions": [],
                    }],
                })
        status_filter = None
        if "emis" in normalized or "émis" in normalized:
            status_filter = "ISSUED"
        elif "utilise" in normalized or "utilisé" in normalized:
            status_filter = "REDEEMED"
        elif "expire" in normalized or "expir" in normalized:
            status_filter = "EXPIRED"
        elif "annule" in normalized or "annulé" in normalized:
            status_filter = "VOID"

        cashier_filter = None
        if employee_context:
            users = resolve_employee(normalized)
            if users.count() == 1:
                cashier_filter = getattr(users.first(), "employer", None)

        issued_qs = CashChangeVoucher.objects.all()
        redeemed_qs = CashChangeVoucher.objects.all()
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            issued_qs = issued_qs.filter(issued_at__range=(start_dt, end_dt))
            redeemed_qs = redeemed_qs.filter(redeemed_at__range=(start_dt, end_dt))

        filter_qs = issued_qs
        if status_filter:
            filter_qs = filter_qs.filter(status=status_filter)
        if cashier_filter:
            filter_qs = filter_qs.filter(issued_by=cashier_filter)

        top_list = list(filter_qs.order_by("-issued_at")[:5])
        top_lines = [f"{v.code} · {int(v.amount)} KMF · {v.status}" for v in top_list]

        return JsonResponse({
            "success": True,
            "title": "Bons de monnaie",
            "period_label": period_label,
            "sections": [{
                "title": "Résumé",
                "summary": [
                    f"Émis: {issued_qs.count()}",
                    f"Utilisés: {redeemed_qs.count()}",
                    f"En attente: {CashChangeVoucher.objects.filter(status='ISSUED').count()}",
                    f"Filtre statut: {status_filter or 'Aucun'}",
                ],
                "issues": [],
                "actions": [],
            }, {
                "title": "Derniers bons",
                "summary": top_lines or ["Aucun bon sur la période."],
                "issues": [],
                "actions": [],
            }],
        })

    if "pyromane" in normalized:
        status = None
        if "attente" in normalized or "pending" in normalized:
            status = "PENDING"
        elif "paye" in normalized or "payé" in normalized:
            status = "PAID"
        elif "annule" in normalized or "annulé" in normalized:
            status = "CANCELED"

        orders_qs = PyromaneOrder.objects.all()
        date_field = "created_at"
        if status == "PAID":
            orders_qs = orders_qs.filter(status="PAID")
            date_field = "paid_at"
        elif status == "CANCELED":
            orders_qs = orders_qs.filter(status="CANCELED")
        elif status == "PENDING":
            orders_qs = orders_qs.filter(status="PENDING")

        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            orders_qs = orders_qs.filter(**{f"{date_field}__range": (start_dt, end_dt)})

        orders = orders_qs.order_by(f"-{date_field}")[:8]
        lines = []
        for order in orders:
            time_label = getattr(order, date_field)
            time_label = time_label.strftime("%d/%m %H:%M") if time_label else "--"
            lines.append(
                f"{order.order_number} · {time_label} · {int(order.total_amount)} KMF · {order.status}"
            )

        return JsonResponse({
            "success": True,
            "title": "Pyromane",
            "period_label": period_label,
            "sections": [{
                "title": "Commandes",
                "summary": [
                    f"Statut: {status or 'Tous'}",
                    f"Total: {orders_qs.count()}",
                ] + (lines or ["Aucune commande sur la période."]),
                "issues": [],
                "actions": ["Charger les commandes en caisse."],
            }],
        })

    if (
        ("mini" in normalized or "four" in normalized or "boulangerie" in normalized)
        and ("impaye" in normalized or "impayé" in normalized or "retirer" in normalized or "pickup" in normalized)
    ):
        start_date, end_date = period if period else (today - timedelta(days=29), today)
        start_dt, end_dt = period_bounds(start_date, end_date)

        pending_qs = BakerySale.objects.filter(is_paid=False)
        pending_qs = pending_qs.filter(date__range=(start_dt, end_dt))
        pickup_today = BakerySale.objects.filter(pickup_date=today)

        pending_lines = [
            f"#{sale.id} · {sale.client} · {int(sale.total_amount)} KMF"
            for sale in pending_qs.order_by("-date")[:6]
        ]
        pickup_lines = [
            f"#{sale.id} · {sale.client} · {int(sale.total_amount)} KMF"
            for sale in pickup_today.order_by("-date")[:6]
        ]

        return JsonResponse({
            "success": True,
            "title": "Mini-Four",
            "period_label": f"{start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')}",
            "sections": [{
                "title": "Non payées",
                "summary": [
                    f"Total: {pending_qs.count()}",
                ] + (pending_lines or ["Aucune commande impayée."]),
                "issues": [],
                "actions": [],
            }, {
                "title": "À retirer aujourd'hui",
                "summary": [
                    f"Total: {pickup_today.count()}",
                ] + (pickup_lines or ["Aucun retrait aujourd'hui."]),
                "issues": [],
                "actions": [],
            }],
        })

    if "mini" in normalized or "four" in normalized or "boulangerie" in normalized:
        bakery_sales = BakerySale.objects.filter(is_paid=True)
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            bakery_sales = bakery_sales.filter(paid_at__range=(start_dt, end_dt))
        total = bakery_sales.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        return JsonResponse({
            "success": True,
            "title": "Mini-Four",
            "period_label": period_label,
            "sections": [{
                "title": "Mini-Four",
                "summary": [
                    f"CA: {int(total)} KMF",
                    f"Tickets: {bakery_sales.count()}",
                ],
                "issues": [],
                "actions": ["Suivre les ventes Mini-Four."],
            }],
        })

    if "caisse" in normalized or "pos" in normalized:
        pos_tx = SaleTransaction.objects.all()
        if period:
            start_dt, end_dt = period_bounds(period[0], period[1])
            pos_tx = pos_tx.filter(date__range=(start_dt, end_dt))
        total = pos_tx.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        return JsonResponse({
            "success": True,
            "title": "Caisse (POS)",
            "period_label": period_label,
            "sections": [{
                "title": "Caisse",
                "summary": [
                    f"CA: {int(total)} KMF",
                    f"Tickets: {pos_tx.count()}",
                ],
                "issues": [],
                "actions": ["Suivre les ventes POS."],
            }],
        })

    if not any(keyword in normalized for keyword in salimamoud_keywords):
        return JsonResponse({
            "success": False,
            "error": "Question hors périmètre Salimamoud.",
        }, status=400)

    return JsonResponse({
        "success": False,
        "error": "Question Salimamoud non reconnue. Précisez la demande (ex: ventes, stock, produit, employé).",
    }, status=400)


def get_assignable_permissions():
    allowed_codenames = {
        "view_dashboard",
        "view_aiassistant",
        "view_pos",
        "view_pyromaneorder",
        "view_employer",
        "add_employer",
        "change_employer",
        "delete_employer",
        "view_loyalty",
        "add_loyalty",
        "change_loyalty",
        "delete_loyalty",
        "view_saleproduct",
        "add_saleproduct",
        "change_saleproduct",
        "delete_saleproduct",
        "view_salerecipe",
        "add_salerecipe",
        "change_salerecipe",
        "view_saleproduction",
        "add_saleproduction",
        "change_saleproduction",
        "view_rawmaterial",
        "add_rawmaterial",
        "change_rawmaterial",
        "delete_rawmaterial",
        "view_sale",
        "view_cashchangevoucher",
        "view_bakeryproduct",
        "add_bakeryproduct",
        "change_bakeryproduct",
        "delete_bakeryproduct",
        "view_bakeryrecipe",
        "add_bakeryrecipe",
        "change_bakeryrecipe",
        "view_bakeryproduction",
        "add_bakeryproduction",
        "view_bakery",
    }

    return Permission.objects.filter(
        codename__in=allowed_codenames
    )


@permission_required("noyau.view_employer", raise_exception=True)
def view_employer(request):
    
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""

    # Récupérer tous les employés
    employees = Employer.objects.select_related("user").all().order_by("-id")

    # Préparer la liste pour JSON
    employees_data = []
    for emp in employees:
        employees_data.append(
            {
                "id": emp.id,
                "full_name": f"{emp.user.first_name.capitalize()} {emp.user.last_name.capitalize()}",
                "role": emp.role,
                "email": emp.user.email,
                "badge_id": emp.badge_id,
                "username": emp.user.username,
            }
        )

    permissions = get_assignable_permissions()

    permissions_data = []
    for permission in permissions:
        permissions_data.append(
            {
                "id": permission.id,
                "name": permission.name,
            }
        )

    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "employees": employees_data,
        "permissions": permissions_data,
    }
    if request.method == "POST":
        first_name = request.POST.get("first_name", "").strip()
        last_name = request.POST.get("last_name", "").strip()
        email = request.POST.get("email", "").strip()
        password = request.POST.get("password", "").strip()
        role = request.POST.get("role", "").strip()
        type = request.POST.get("type", "").strip()
        if type == "add":
            if not request.user.has_perm("noyau.add_employer"):
                raise PermissionDenied
            if role == "Administrateur":
                last_username = (
                    User.objects.filter(username__regex=r"^ADM\d+$")
                    .order_by("-username")
                    .first()
                )

                if last_username and last_username.username:
                    match = re.match(r"^ADM(\d+)$", last_username.username)
                    if match:
                        number = int(match.group(1)) + 1
                    else:
                        number = 1
                else:
                    number = 1
                new_username = f"ADM{number:04d}"
            elif role == "Gérant":
                last_username = (
                    User.objects.filter(username__regex=r"^MAN\d+$")
                    .order_by("-username")
                    .first()
                )

                if last_username and last_username.username:
                    match = re.match(r"^MAN(\d+)$", last_username.username)
                    if match:
                        number = int(match.group(1)) + 1
                    else:
                        number = 1
                else:
                    number = 1
                new_username = f"MAN{number:04d}"
            elif role == "Caissier":
                last_username = (
                    User.objects.filter(username__regex=r"^CAS\d+$")
                    .order_by("-username")
                    .first()
                )

                if last_username and last_username.username:
                    match = re.match(r"^CAS(\d+)$", last_username.username)
                    if match:
                        number = int(match.group(1)) + 1
                    else:
                        number = 1
                else:
                    number = 1
                new_username = f"CAS{number:04d}"
            else:
                last_username = (
                    User.objects.filter(username__regex=r"^EMP\d+$")
                    .order_by("-username")
                    .first()
                )

                if last_username and last_username.username:
                    match = re.match(r"^EMP(\d+)$", last_username.username)
                    if match:
                        number = int(match.group(1)) + 1
                    else:
                        number = 1
                else:
                    number = 1

                new_username = f"EMP{number:04d}"

            add_user = User.objects.create_user(
                username=new_username, password=password
            )
            add_user.first_name = first_name
            add_user.last_name = last_name
            add_user.email = email
            add_user.save()
            if role != "Employé":
                add_user.is_staff = True
                add_user.is_active = True
                is_superuser = True if role == "Administrateur" else False
                add_user.is_superuser = is_superuser
                add_user.save()
                aut_rem_options = request.POST.getlist("aut_rem")
                for permission_id in aut_rem_options:
                    permission = Permission.objects.get(id=permission_id)
                    add_user.user_permissions.add(permission)

            last_badge = (
                Employer.objects.filter(badge_id__regex=r"^BADGE\d+$")
                .order_by("-badge_id")
                .first()
            )

            if last_badge and last_badge.badge_id:
                match = re.match(r"^BADGE(\d+)$", last_badge.badge_id)
                if match:
                    badge_id = int(match.group(1)) + 1
                else:
                    badge_id = 1
            else:
                badge_id = 1

            new_badge_id = f"BADGE{badge_id:04d}"
            Employer.objects.create(
                user=add_user, role=role, badge_id=new_badge_id
            )
            
        if type == "change":
            if not request.user.has_perm("noyau.change_employer"):
                raise PermissionDenied
            employer_id = request.POST.get("employer_id", "").strip()
            employer = get_object_or_404(Employer, id=employer_id)
            old_user = get_object_or_404(User, id=employer.user_id)
            old_user.first_name = first_name
            old_user.last_name = last_name
            old_user.email = email
            if password:
                old_user.set_password(password)

            if role != "Employé":
                old_user.is_staff = True
                is_superuser = True if role == "Administrateur" else False
                old_user.is_superuser = is_superuser

            old_user.save()
            employer.role = role
            employer.save()
            old_user.user_permissions.clear()
            if role != "Employé":
                aut_rem_options = request.POST.getlist("aut_rem")
                for permission_id in aut_rem_options:
                    permission = Permission.objects.get(id=permission_id)
                    old_user.user_permissions.add(permission)

        return redirect("view_employer")
    return render(request, "employer/view_employer.html", context)


@permission_required("noyau.view_employer", raise_exception=True)
def get_employer(request, employer_id):
    
    try:
        employer = Employer.objects.get(id=employer_id)
        permissions_employer = []
        permissions_data = []
        old_user = get_object_or_404(User, id=employer.user_id)

        assignable_permissions = get_assignable_permissions()

        user_permissions = old_user.user_permissions.filter(
            id__in=assignable_permissions.values("id")
        )
        for permission in user_permissions:
            permissions_employer.append(
                {
                    "id": permission.id,
                    "name": permission.name,
                }
            )
        unassigned_permissions = assignable_permissions.exclude(
            id__in=user_permissions.values_list("id", flat=True)
        )

        for permission in unassigned_permissions:
            permissions_data.append(
                {
                    "id": permission.id,
                    "name": permission.name,
                }
            )

        data = {
            "id": employer.id,
            "role": employer.role,
            "first_name": old_user.first_name,
            "last_name": old_user.last_name,
            "email": old_user.email,
            "permissions": permissions_data,
            "user_permissions": permissions_employer,
            "setting": employer.setting,
            "badge_id": employer.badge_id,
        }
        return JsonResponse({"success": True, "employer": data})
    except Employer.DoesNotExist:
        return JsonResponse({"error": "Employé introuvable."}, status=404)


@permission_required("noyau.delete_employer", raise_exception=True)
def delete_employer(request, employer_id):
    
    employer = get_object_or_404(Employer, id=employer_id)
    employer.delete()
    return redirect("view_employer")

# Règles métier
POINT_EARN_STEP = Decimal("2500.00")  # Caisse: 2500 KMF = 1 point gagne
POINT_TOPUP_STEP = Decimal("100.00") # Recharge carte: 100 KMF = 1 point gagne
POINT_VALUE = Decimal("100.00")       # 1 point = 100 KMF de remise
POINT_TO_SOLDE_KMF = Decimal("100.00")  # 1 point gagne = 100 KMF de solde
VOUCHER_EXPIRY_DAYS = 30
VOUCHER_CODE_PREFIX = "BRM-"
PYROMANE_ORDER_PREFIX = "PG-"
PYROMANE_ORDER_START = 1

def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def calculate_earned_points(amount: Decimal) -> int:
    if amount <= 0:
        return 0
    return int((amount / POINT_EARN_STEP).to_integral_value(rounding=ROUND_DOWN))


def calculate_topup_points(amount: Decimal) -> int:
    if amount <= 0:
        return 0
    return int((amount / POINT_TOPUP_STEP).to_integral_value(rounding=ROUND_DOWN))


def max_redeemable_points(amount: Decimal) -> int:
    if amount <= 0:
        return 0
    return int((amount / POINT_VALUE).to_integral_value(rounding=ROUND_DOWN))


def points_to_solde(points: int) -> Decimal:
    safe_points = max(int(points or 0), 0)
    return _q(Decimal(safe_points) * POINT_TO_SOLDE_KMF)


def normalize_wallet(solde: Decimal):
    normalized_points = int((clean_decimal(solde) / POINT_TO_SOLDE_KMF).to_integral_value(rounding=ROUND_DOWN))
    normalized_points = max(normalized_points, 0)
    return normalized_points, points_to_solde(normalized_points)


def generate_voucher_code():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    rng = random.SystemRandom()
    for _ in range(50):
        code = VOUCHER_CODE_PREFIX + "".join(rng.choice(alphabet) for _ in range(5))
        if not CashChangeVoucher.objects.filter(code=code).exists():
            return code
    raise ValueError("Impossible de generer un code de bon unique.")


def ensure_voucher_status(voucher: CashChangeVoucher):
    if voucher.status == "ISSUED" and voucher.expires_at < timezone.now():
        voucher.status = "EXPIRED"
        voucher.save(update_fields=["status"])
    return voucher


def create_change_voucher(amount: Decimal, employer: Employer, transaction: SaleTransaction):
    amount = _q(amount)
    if amount <= 0:
        return None
    expires_at = timezone.now() + timedelta(days=VOUCHER_EXPIRY_DAYS)
    return CashChangeVoucher.objects.create(
        code=generate_voucher_code(),
        amount=amount,
        issued_by=employer,
        issued_transaction=transaction,
        expires_at=expires_at,
    )


def serialize_change_voucher(voucher: CashChangeVoucher):
    if not voucher:
        return None
    return {
        "code": voucher.code,
        "amount": float(_q(voucher.amount)),
    }


def generate_pyromane_order_number():
    # Format: PG-YYYYMMDD-### (sequence resets daily)
    today = localdate()
    date_prefix = today.strftime("%Y%m%d")
    prefix = f"{PYROMANE_ORDER_PREFIX}{date_prefix}-"

    max_numeric = (
        PyromaneOrder.objects
        .filter(order_number__startswith=prefix)
        .annotate(
            num=Cast(
                Substr("order_number", len(prefix) + 1),
                IntegerField(),
            )
        )
        .aggregate(max_num=Max("num"))
        .get("max_num")
    )
    base = max_numeric or 0
    next_number = max(base + 1, PYROMANE_ORDER_START)

    for _ in range(500):
        candidate = f"{prefix}{next_number:03d}"
        if not PyromaneOrder.objects.filter(order_number=candidate).exists():
            return candidate
        next_number += 1

    # Fallback to timestamp if something is wrong
    fallback = f"{prefix}{timezone.now().strftime('%H%M%S')}"
    if not PyromaneOrder.objects.filter(order_number=fallback).exists():
        return fallback
    raise ValueError("Impossible de generer un numero PG unique.")

@permission_required("noyau.view_loyalty", raise_exception=True)
def view_loyalty(request):
    
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    loyalties = Loyalty.objects.all().order_by("-id")
    loyalties_json = loyalties.values(
        "id",
        "card_id",
        "card_type",
        "setting",
        "phone",
        "solde",
        "client",
        "points_balance",
    ).order_by("client")
    loyalties_json = json.dumps(list(loyalties_json), cls=DjangoJSONEncoder)
    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "loyalties": loyalties,
        "loyalties_json": loyalties_json,
    }
    if request.method == "POST":
        client = request.POST.get("client", "").strip()
        phone = request.POST.get("phone", "").strip()
        type = request.POST.get("type", "").strip()
        solde = clean_decimal(request.POST.get("solde", "").strip())
        card_type = request.POST.get("card_type", Loyalty.CARD_TYPE_STANDARD).strip().upper() or Loyalty.CARD_TYPE_STANDARD
        valid_card_types = {choice[0] for choice in Loyalty.CARD_TYPE_CHOICES}
        if card_type not in valid_card_types:
            card_type = Loyalty.CARD_TYPE_STANDARD
        
        if type == "change":
            if not request.user.has_perm("noyau.change_loyalty"):
                raise PermissionDenied
            loyalty_id = request.POST.get("loyalty_id", "").strip()
            loyalty = get_object_or_404(Loyalty, id=loyalty_id)
            loyalty.client = client
            loyalty.phone = phone
            loyalty.card_type = card_type
            loyalty.save()
            
        if type == "solde":
            if not request.user.has_perm("noyau.change_loyalty"):
                raise PermissionDenied
            loyalty_id = request.POST.get("loyalty_id", "").strip()
            points_balance = calculate_topup_points(solde)
            loyalty = get_object_or_404(Loyalty, id=loyalty_id)
            balance = int(loyalty.points_balance or 0) + points_balance
            
            LoyaltyPointLedger.objects.create(
                loyalty=loyalty,
                move_type="Recharge",
                points=points_balance,
                balance_after=balance,
                note="Recharge carte",
                date=date.today()
            )
            
            loyalty.points_balance = balance
            loyalty.solde = points_to_solde(balance)
            loyalty.save()
            
        if type == "scan":
            if not request.user.has_perm("noyau.change_loyalty"):
                raise PermissionDenied
            loyalty_id = request.POST.get("loyalty_id", "").strip()
            points_balance = calculate_topup_points(solde)
            loyalty = get_object_or_404(Loyalty, id=loyalty_id)
            balance = int(loyalty.points_balance or 0) + points_balance
            
            LoyaltyPointLedger.objects.create(
                loyalty=loyalty,
                move_type="Recharge",
                points=points_balance,
                balance_after=balance,
                note="Recharge carte",
                date=date.today()
            )
            
            loyalty.client = client
            loyalty.phone = phone
            loyalty.points_balance = balance
            loyalty.solde = points_to_solde(balance)
            loyalty.save()
            
        return redirect("view_loyalty")
    return render(request, "loyalty/view_loyalty.html", context)


@permission_required("noyau.view_loyalty", raise_exception=True)
def get_loyalty(request, loyalty_id):
    
    try:
        loyalty = Loyalty.objects.get(id=loyalty_id)

        data = {
            "id": loyalty.id,
            "client": loyalty.client,
            "phone": loyalty.phone,
            "solde": float(loyalty.solde),
            "card_id": loyalty.card_id,
            "setting": loyalty.setting,
            "points_balance": int(loyalty.points_balance or 0),
            "card_type": loyalty.card_type,
        }
        return JsonResponse({"success": True, "loyalty": data})
    except Loyalty.DoesNotExist:
        return JsonResponse({"error": "Carte introuvable."}, status=404)

@permission_required("noyau.view_loyalty", raise_exception=True)
def get_history_client_loyalty(request, loyalty_id):
    
    try:
        histories = LoyaltyPointLedger.objects.filter(loyalty_id=loyalty_id).order_by("date")
        data = []
        for history in histories:
            data.append({
                'id': history.id,
                'points': int(history.points),
                'balance_after': int(history.balance_after),
                'move_type': history.move_type,
                'note': history.note,
                'date': history.date.strftime('%d/%m/%Y'),
            })
        return JsonResponse({"success": True, "histories": data})
    except LoyaltyPointLedger.DoesNotExist:
        return JsonResponse({"error": "LoyaltyPointLedger introuvable."}, status=404)


@permission_required("noyau.add_loyalty", raise_exception=True)
def add_loyalty(request):
    
    if request.method == "POST":
        try:
            payload = {}
            if request.content_type and "application/json" in request.content_type:
                payload = json.loads(request.body or "{}")
            else:
                payload = request.POST

            today = date.today()
            initial_solde = Decimal("2000.00")
            initial_points = calculate_topup_points(initial_solde)
            client = "Nouveau Client"
            card_type = str(payload.get("card_type", Loyalty.CARD_TYPE_STANDARD)).strip().upper() or Loyalty.CARD_TYPE_STANDARD

            valid_card_types = {choice[0] for choice in Loyalty.CARD_TYPE_CHOICES}
            if card_type not in valid_card_types:
                return JsonResponse({"error": "Type de carte invalide."}, status=400)

            last_card = (
                Loyalty.objects.filter(card_id__regex=r"^CARD\d+$")
                .order_by("-card_id")
                .first()
            )

            if last_card and last_card.card_id:
                match = re.match(r"^CARD(\d+)$", last_card.card_id)
                if match:
                    card_id = int(match.group(1)) + 1
                else:
                    card_id = 1
            else:
                card_id = 1

            new_card_id = f"CARD{card_id:04d}"

            loyalty = Loyalty.objects.create(
                card_id=new_card_id,
                solde=initial_solde,
                client=client,
                date=today,
                phone="-",
                card_type=card_type,
                points_balance=initial_points,
                points_remainder=Decimal("0.00"),
            )
            LoyaltyPointLedger.objects.create(
                loyalty=loyalty,
                move_type="Recharge",
                points=initial_points,
                balance_after=initial_points,
                note=f"Creation de carte {loyalty.get_card_type_display()}",
                date=today,
            )
            return JsonResponse({"success": True})
        except json.JSONDecodeError:
            return JsonResponse({"error": "Données JSON invalides."}, status=400)
    return JsonResponse({"error": "Méthode non autorisée."}, status=405)


@permission_required("noyau.delete_loyalty", raise_exception=True)
def delete_loyalty(request, loyalty_id):
    
    loyalty = get_object_or_404(Loyalty, id=loyalty_id)
    loyalty.delete()
    return redirect("view_loyalty")


def _save_uploaded_image(file, name, folder_name):
    allowed_extensions = [".png", ".jpg", ".jpeg", ".gif"]
    ext = os.path.splitext(file.name)[1].lower()

    if ext not in allowed_extensions:
        raise ValueError("Format de fichier non autorisé.")

    clean_name = name.replace(" ", "_")
    unique_name = f"{clean_name}{ext}"

    folder = os.path.join(settings.MEDIA_ROOT, folder_name)
    os.makedirs(folder, exist_ok=True)

    path = os.path.join(folder, unique_name)

    # Try to compress using Pillow; fallback to raw save if Pillow is unavailable.
    try:
        from PIL import Image, ImageFile

        ImageFile.LOAD_TRUNCATED_IMAGES = True
        file.seek(0)
        with Image.open(file) as img:
            if ext in [".jpg", ".jpeg"]:
                img = img.convert("RGB")

            max_size = 1000
            img.thumbnail((max_size, max_size))

            tmp_path = f"{path}.tmp"
            if ext in [".jpg", ".jpeg"]:
                img.save(tmp_path, "JPEG", quality=80, optimize=True, progressive=True)
            elif ext == ".png":
                img.save(tmp_path, "PNG", optimize=True)
            elif ext == ".gif":
                img.save(tmp_path, "GIF", optimize=True)
            else:
                img.save(tmp_path)
            os.replace(tmp_path, path)
    except Exception:
        file.seek(0)
        with default_storage.open(path, "wb+") as destination:
            for chunk in file.chunks():
                destination.write(chunk)

    return os.path.join(folder_name, unique_name)


def save_product(file, name):
    return _save_uploaded_image(file, name, "products")

def default_image(name):
    clean_name = name.replace(" ", "_")
    unique_name = f"{clean_name}.png"
    
    folder = os.path.join(settings.MEDIA_ROOT, "products")
    
    os.makedirs(folder, exist_ok=True)
    dest_path = os.path.join(folder, unique_name)
    
    src_path = os.path.join(settings.BASE_DIR, "static", "img", "logo", "salimamoud.png")
    
    shutil.copy(src_path, dest_path)

    return os.path.join("products", unique_name)


@permission_required("noyau.view_saleproduct", raise_exception=True)
def view_saleproduct(request):
    
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    products = SaleProduct.objects.all().order_by("-id")
    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "products": products,
        "products_json": json.dumps(
            list(SaleProduct.objects.values("id", "name").order_by("name")),
            cls=DjangoJSONEncoder,
        ),
    }
    if request.method == "POST":
        name = request.POST.get("name", "").strip()
        category = request.POST.get("category", "").strip()
        product_type = request.POST.get("product_type", "").strip()
        stock_known = parse_bool(request.POST.get("stock_known", None), default=False)
        unit_price = clean_decimal(request.POST.get("unit_price", "").strip())
        base_product_id = request.POST.get("base_product_id", "").strip()
        conversion_factor = clean_decimal(request.POST.get("conversion_factor", "").strip() or "1")
        image = request.FILES.get("image")
        type = request.POST.get("type", "").strip()
        base_product = None
        if base_product_id:
            base_product = SaleProduct.objects.filter(id=base_product_id).first()
        if conversion_factor <= 0:
            conversion_factor = Decimal("1.00")
        if type == "add":
            if not request.user.has_perm("noyau.add_saleproduct"):
                raise PermissionDenied
            if image:
                image_path = save_product(image, name)
            else:
                image_path = default_image(name)
                
            SaleProduct.objects.create(
                name=name,
                product_type=product_type,
                category=category,
                stock_known=stock_known,
                unit_price=unit_price,
                image=image_path,
                base_product=base_product,
                conversion_factor=conversion_factor,
            )
        if type == "change":
            if not request.user.has_perm("noyau.change_saleproduct"):
                raise PermissionDenied
            product_id = request.POST.get("product_id", "").strip()
            product = get_object_or_404(SaleProduct, id=product_id)
            if image:
                if product and product.image:
                    old_image_path = os.path.join(settings.MEDIA_ROOT, product.image)
                    if os.path.exists(old_image_path):
                        os.remove(old_image_path)
                        
                image_path = save_product(image, name)
                product.image=image_path
                
            product.name=name
            product.product_type=product_type
            product.category=category
            product.stock_known=stock_known
            product.unit_price=unit_price
            product.base_product=base_product
            product.conversion_factor=conversion_factor
            product.save()
        return redirect("view_saleproduct")
    return render(request, "product/view_product.html", context)

@permission_required("noyau.view_saleproduct", raise_exception=True)
def get_saleproduct(request, product_id):
    
    try:
        product = SaleProduct.objects.get(id=product_id)

        data = {
            "name": product.name,
            "category": product.category,
            "unit_price": float(product.unit_price),
            "product_type": product.product_type,
            "stock_known": product.stock_known,
            "image": product.image,
            "base_product_id": product.base_product_id,
            "conversion_factor": float(product.conversion_factor or Decimal("1.00")),
        }
        return JsonResponse({"success": True, "product": data})
    except SaleProduct.DoesNotExist:
        return JsonResponse({"error": "Produit introuvable."}, status=404)

@permission_required("noyau.delete_saleproduct", raise_exception=True)
def delete_saleproduct(request, product_id):
    
    product = get_object_or_404(SaleProduct, id=product_id)
    if product and product.image:
        old_image_path = os.path.join(settings.MEDIA_ROOT, product.image)
        if os.path.exists(old_image_path):
            os.remove(old_image_path)
    product.delete()
    return redirect("view_saleproduct")


@permission_required("noyau.view_rawmaterial", raise_exception=True)
def view_rawmaterial(request):
    
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    inventories = list(RawMaterial.objects.all().order_by("-id"))
    today = localdate()
    fefo_ids = [inv.id for inv in inventories if inv.stock_mode == "FEFO"]
    expiry_map = {}
    lots_count_map = {}
    if fefo_ids:
        expiry_rows = RawMaterialLot.objects.filter(
            raw_material_id__in=fefo_ids,
            quantity__gt=0,
        ).values("raw_material_id").annotate(min_expiry=Min("expiration_date"))
        expiry_map = {row["raw_material_id"]: row["min_expiry"] for row in expiry_rows}
        lots_counts = RawMaterialLot.objects.filter(
            raw_material_id__in=fefo_ids,
            quantity__gt=0,
        ).values("raw_material_id").annotate(total=Count("id"))
        lots_count_map = {row["raw_material_id"]: row["total"] for row in lots_counts}
    for inv in inventories:
        inv.expiry_date = expiry_map.get(inv.id)
        inv.expiry_status = ""
        inv.lots_count = lots_count_map.get(inv.id, 0)
        if inv.stock_mode == "FEFO":
            if inv.expiry_date:
                days = (inv.expiry_date - today).days
                if days < 0:
                    inv.expiry_status = "expired"
                elif days <= 21:
                    inv.expiry_status = "soon"
                else:
                    inv.expiry_status = "ok"
            else:
                inv.expiry_status = "ok"
    inventories_json = [
        {
            "id": inv.id,
            "name": inv.name,
            "current_stock": float(inv.current_stock or 0),
            "unit": inv.unit,
            "min_stock": float(inv.min_stock or 0),
            "stock_mode": inv.stock_mode,
            "expiry_status": inv.expiry_status,
            "expiry_date": inv.expiry_date.isoformat() if inv.expiry_date else None,
            "lots_count": inv.lots_count or 0,
            "linked_product_id": inv.linked_product_id,
        }
        for inv in inventories
    ]
    movements = StockMovement.objects.all().order_by("-id")
    movements_json = movements.annotate(
        name=F("raw_material__name"),unit=F("raw_material__unit")
    ).values(
        "id",
        "raw_material_id",
        "unit",
        "name",
        "movement_type",
        "quantity",
        "date",
        "assigned_to",
        "destination",
    ).order_by("date")
    movements_json = list(movements_json)
    expired_count = sum(
        1 for inv in inventories if inv.stock_mode == "FEFO" and inv.expiry_status == "expired"
    )
    soon_count = sum(
        1 for inv in inventories if inv.stock_mode == "FEFO" and inv.expiry_status == "soon"
    )
    fefo_count = sum(1 for inv in inventories if inv.stock_mode == "FEFO")
    sale_products_json = list(
        SaleProduct.objects.filter(product_type="Achat & Revente")
        .values("id", "name")
        .order_by("name")
    )
    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "inventories": inventories,
        "inventories_json":inventories_json,
        "movements_json": movements_json,
        "expired_count": expired_count,
        "soon_count": soon_count,
        "fefo_count": fefo_count,
        "sale_products_json": sale_products_json,
    }
    if request.method == "POST":
        name = request.POST.get("name", "").strip()
        unit = request.POST.get("unit", "").strip()
        current_stock = clean_decimal(request.POST.get("current_stock", "").strip())
        min_stock = clean_decimal(request.POST.get("min_stock", "").strip())
        stock_mode = (request.POST.get("stock_mode", "NORMAL") or "NORMAL").upper()
        initial_expiry_str = request.POST.get("initial_expiry", "").strip()
        initial_expiry = None
        if initial_expiry_str:
            try:
                initial_expiry = date.fromisoformat(initial_expiry_str)
            except Exception:
                initial_expiry = None
        linked_product_id = request.POST.get("linked_product", "").strip()
        linked_product = None
        if linked_product_id:
            try:
                linked_product = SaleProduct.objects.get(id=linked_product_id, product_type="Achat & Revente")
            except SaleProduct.DoesNotExist:
                linked_product = None
        type = request.POST.get("type", "").strip()
        if type == "add":
            if not request.user.has_perm("noyau.add_rawmaterial"):
                raise PermissionDenied
            if not name and linked_product:
                name = linked_product.name
            inventory = RawMaterial.objects.create(
                name=name,
                unit=unit,
                current_stock=current_stock,
                min_stock=min_stock,
                stock_mode=stock_mode,
                linked_product=linked_product,
            )
            
            if current_stock > 0:
                StockMovement.objects.create(
                    raw_material = inventory,
                    quantity = current_stock,
                    movement_type = "Entrée",
                    date = timezone.now(),
                    assigned_to = f"{first_name} {last_name}"
                )
                if stock_mode == "FEFO":
                    RawMaterialLot.objects.create(
                        raw_material=inventory,
                        quantity=current_stock,
                        expiration_date=initial_expiry,
                    )
            
        if type == "change":
            if not request.user.has_perm("noyau.change_rawmaterial"):
                raise PermissionDenied
            inventory_id = request.POST.get("inventory_id", "").strip()
            inventory = get_object_or_404(RawMaterial, id=inventory_id)
            inventory.name=name
            inventory.unit=unit
            inventory.min_stock=min_stock
            inventory.stock_mode=stock_mode
            inventory.linked_product=linked_product
            inventory.save()
        if type == "in":
            if not request.user.has_perm("noyau.change_rawmaterial"):
                raise PermissionDenied
            aut_ch_options = request.POST.getlist("aut_ch")
            quantities = request.POST.getlist('quantity[]')
            expiry_dates = request.POST.getlist('expiry_date[]')
            for i, inventory_id in enumerate(aut_ch_options):
                if i >= len(quantities):
                    continue
                inventory = get_object_or_404(RawMaterial, id=inventory_id)
                quantity = clean_decimal(quantities[i])
                if quantity <= 0:
                    continue
                expiry_str = expiry_dates[i].strip() if i < len(expiry_dates) else ""
                expiry_date = None
                if expiry_str:
                    try:
                        expiry_date = date.fromisoformat(expiry_str)
                    except Exception:
                        expiry_date = None
                inventory.current_stock = clean_decimal(inventory.current_stock) + quantity
                inventory.save()
                
                StockMovement.objects.create(
                    raw_material = inventory,
                    quantity = quantity,
                    movement_type = "Entrée",
                    date = timezone.now(),
                    assigned_to = f"{first_name} {last_name}"
                )
                if inventory.stock_mode == "FEFO":
                    RawMaterialLot.objects.create(
                        raw_material=inventory,
                        quantity=quantity,
                        expiration_date=expiry_date,
                    )
                
        if type == "out":
            if not request.user.has_perm("noyau.change_rawmaterial"):
                raise PermissionDenied
            aut_ch_options = request.POST.getlist("aut_ch")
            quantities = request.POST.getlist('quantity[]')
            assigned_to = request.POST.get("assigned_to", "").strip()
            destination = request.POST.get("destination", "").strip()
            movement_date_str = request.POST.get("movement_date", "").strip()
            movement_dt = timezone.now()
            if movement_date_str:
                try:
                    movement_date = date.fromisoformat(movement_date_str)
                    movement_dt = timezone.make_aware(datetime.combine(movement_date, datetime.min.time()))
                except Exception:
                    movement_dt = timezone.now()
            for i, inventory_id in enumerate(aut_ch_options):
                if i >= len(quantities):
                    continue
                inventory = get_object_or_404(RawMaterial, id=inventory_id)
                quantity = clean_decimal(quantities[i])
                if quantity <= 0:
                    continue

                actual_quantity = quantity
                if inventory.stock_mode == "FEFO":
                    remaining = quantity
                    lots = RawMaterialLot.objects.filter(
                        raw_material=inventory,
                        quantity__gt=0,
                    ).order_by(
                        F("expiration_date").asc(nulls_last=True),
                        "received_at",
                        "id",
                    )
                    for lot in lots:
                        if remaining <= 0:
                            break
                        take = min(lot.quantity, remaining)
                        lot.quantity = clean_decimal(lot.quantity) - take
                        lot.save(update_fields=["quantity"])
                        remaining -= take
                    actual_quantity = quantity - remaining
                    if actual_quantity <= 0:
                        continue

                inventory.current_stock = clean_decimal(inventory.current_stock) - actual_quantity
                if inventory.current_stock < 0:
                    inventory.current_stock = Decimal(0)
                inventory.save()
                StockMovement.objects.create(
                    raw_material = inventory,
                    quantity = actual_quantity,
                    movement_type = "Sortie",
                    date = movement_dt,
                    assigned_to = assigned_to,
                    destination = destination,
                )
            
        return redirect("view_rawmaterial")
    return render(request, "inventory/view_inventory.html", context)


@permission_required("noyau.view_salerecipe", raise_exception=True)
def view_sale_recipes(request):
    context = build_user_context(request)
    base_with_children_ids = set(
        SaleProduct.objects.exclude(base_product_id=None).values_list("base_product_id", flat=True)
    )
    resale_ar_ids = set(
        SaleProduct.objects.filter(stock_known=True, product_type="Achat & Revente").values_list("id", flat=True)
    )
    products = SaleProduct.objects.filter(
        stock_known=True,
        product_type="Fabriqué sur place",
    ).exclude(id__in=base_with_children_ids).exclude(product_type="Vente en dépôt").order_by("name")
    recipes = SaleRecipe.objects.select_related("product")
    recipes_by_product = {recipe.product_id: recipe for recipe in recipes}
    rows = [{"product": product, "recipe": recipes_by_product.get(product.id)} for product in products]
    context.update({
        "rows": rows,
        "domain": "pos",
        "domain_label": "POS",
        "page_title": "Recettes POS",
    })
    return render(request, "recipes/view_recipes.html", context)


@permission_required("noyau.view_salerecipe", raise_exception=True)
def edit_sale_recipe(request, product_id):
    context = build_user_context(request)
    product = get_object_or_404(SaleProduct, id=product_id)
    if not product.stock_known or product.product_type != "Fabriqué sur place" or product.product_type == "Vente en dépôt":
        return redirect("view_sale_recipes")
    if SaleProduct.objects.filter(base_product_id=product.id).exists():
        return redirect("view_sale_recipes")
    recipe = SaleRecipe.objects.filter(product=product).prefetch_related("items__raw_material").first()
    raw_materials = RawMaterial.objects.all().order_by("name")

    if request.method == "POST":
        if recipe:
            if not request.user.has_perm("noyau.change_salerecipe"):
                raise PermissionDenied
        else:
            if not request.user.has_perm("noyau.add_salerecipe"):
                raise PermissionDenied
        yield_quantity = clean_decimal(request.POST.get("yield_quantity", "").strip())
        yield_unit = request.POST.get("yield_unit", "").strip() or "unité"
        note = request.POST.get("note", "").strip()
        if yield_quantity <= 0:
            yield_quantity = Decimal("1.00")

        if recipe:
            recipe.yield_quantity = yield_quantity
            recipe.yield_unit = yield_unit
            recipe.note = note
            recipe.save()
        else:
            recipe = SaleRecipe.objects.create(
                product=product,
                yield_quantity=yield_quantity,
                yield_unit=yield_unit,
                note=note,
            )

        recipe.items.all().delete()
        raw_ids = request.POST.getlist("raw_material_id[]")
        quantities = request.POST.getlist("quantity[]")
        for raw_id, qty in zip(raw_ids, quantities):
            if not raw_id or not qty:
                continue
            quantity = clean_decimal(qty)
            if quantity <= 0:
                continue
            raw_material = get_object_or_404(RawMaterial, id=raw_id)
            SaleRecipeItem.objects.create(
                recipe=recipe,
                raw_material=raw_material,
                quantity=quantity,
            )

        return redirect("edit_sale_recipe", product_id=product.id)

    items = recipe.items.all() if recipe else []
    context.update({
        "product": product,
        "recipe": recipe,
        "items": items,
        "raw_materials": raw_materials,
        "domain": "pos",
        "domain_label": "POS",
        "page_title": f"Recette - {product.name}",
    })
    return render(request, "recipes/edit_recipe.html", context)


@permission_required("noyau.view_bakeryrecipe", raise_exception=True)
def view_bakery_recipes(request):
    context = build_user_context(request)
    products = BakeryProduct.objects.all().order_by("name")
    recipes = BakeryRecipe.objects.select_related("product")
    recipes_by_product = {recipe.product_id: recipe for recipe in recipes}
    rows = [{"product": product, "recipe": recipes_by_product.get(product.id)} for product in products]
    context.update({
        "rows": rows,
        "domain": "bakery",
        "domain_label": "Boulangerie",
        "page_title": "Recettes Boulangerie",
    })
    return render(request, "recipes/view_recipes.html", context)


@permission_required("noyau.view_bakeryrecipe", raise_exception=True)
def edit_bakery_recipe(request, product_id):
    context = build_user_context(request)
    product = get_object_or_404(BakeryProduct, id=product_id)
    recipe = BakeryRecipe.objects.filter(product=product).prefetch_related("items__raw_material").first()
    raw_materials = RawMaterial.objects.all().order_by("name")

    if request.method == "POST":
        if recipe:
            if not request.user.has_perm("noyau.change_bakeryrecipe"):
                raise PermissionDenied
        else:
            if not request.user.has_perm("noyau.add_bakeryrecipe"):
                raise PermissionDenied
        yield_quantity = clean_decimal(request.POST.get("yield_quantity", "").strip())
        yield_unit = request.POST.get("yield_unit", "").strip() or "unité"
        note = request.POST.get("note", "").strip()
        if yield_quantity <= 0:
            yield_quantity = Decimal("1.00")

        if recipe:
            recipe.yield_quantity = yield_quantity
            recipe.yield_unit = yield_unit
            recipe.note = note
            recipe.save()
        else:
            recipe = BakeryRecipe.objects.create(
                product=product,
                yield_quantity=yield_quantity,
                yield_unit=yield_unit,
                note=note,
            )

        recipe.items.all().delete()
        raw_ids = request.POST.getlist("raw_material_id[]")
        quantities = request.POST.getlist("quantity[]")
        for raw_id, qty in zip(raw_ids, quantities):
            if not raw_id or not qty:
                continue
            quantity = clean_decimal(qty)
            if quantity <= 0:
                continue
            raw_material = get_object_or_404(RawMaterial, id=raw_id)
            BakeryRecipeItem.objects.create(
                recipe=recipe,
                raw_material=raw_material,
                quantity=quantity,
            )

        return redirect("edit_bakery_recipe", product_id=product.id)

    items = recipe.items.all() if recipe else []
    context.update({
        "product": product,
        "recipe": recipe,
        "items": items,
        "raw_materials": raw_materials,
        "domain": "bakery",
        "domain_label": "Boulangerie",
        "page_title": f"Recette - {product.name}",
    })
    return render(request, "recipes/edit_recipe.html", context)


@permission_required("noyau.view_saleproduction", raise_exception=True)
def view_sale_production(request):
    context = build_user_context(request)
    selected_date = parse_date(request.GET.get("date", ""), localdate())
    selected_shift = (request.GET.get("shift") or "MATIN").upper()
    if selected_shift not in {"MATIN", "SOIR", "TOUS"}:
        selected_shift = "MATIN"
    locked_notice = request.GET.get("locked") == "1"
    base_with_children_ids = set(
        SaleProduct.objects.exclude(base_product_id=None).values_list("base_product_id", flat=True)
    )
    products = SaleProduct.objects.filter(
        stock_known=True,
        product_type="Fabriqué sur place",
    ).exclude(id__in=base_with_children_ids).order_by("name")
    productions_query = SaleProduction.objects.select_related("product", "product__recipe", "recorded_by").filter(
        production_date=selected_date,
        product__stock_known=True,
        product__product_type="Fabriqué sur place",
        product__id__in=products.values_list("id", flat=True),
    )
    if selected_shift != "TOUS":
        productions_query = productions_query.filter(shift=selected_shift)
    productions = productions_query.order_by("-recorded_at")

    shift_report = None
    is_shift_locked = False
    shift_cashier_label = ""
    if selected_shift in {"MATIN", "SOIR"}:
        shift_report = PosShiftReport.objects.filter(shift_date=selected_date, shift=selected_shift).select_related("cashier__user").first()
        is_shift_locked = bool(shift_report and shift_report.closed_at)
        if shift_report and shift_report.cashier and shift_report.cashier.user:
            shift_cashier_label = shift_report.cashier.user.get_full_name()
    else:
        reports = PosShiftReport.objects.filter(shift_date=selected_date, shift__in=["MATIN", "SOIR"]).select_related("cashier__user")
        parts = []
        for report in reports:
            if report.cashier and report.cashier.user:
                parts.append(f"{report.shift.title()} : {report.cashier.user.get_full_name()}")
        shift_cashier_label = " · ".join(parts)

    summary_total = productions_query.aggregate(total=Sum("quantity"))["total"] or Decimal(0)
    summary_products = productions_query.values("product_id").distinct().count()
    summary_top = list(
        productions_query.values("product__name")
        .annotate(total=Sum("quantity"))
        .order_by("-total")[:3]
    )
    shift_totals = SaleProduction.objects.filter(
        production_date=selected_date,
        product__stock_known=True,
        product__product_type="Fabriqué sur place",
    ).values("shift").annotate(total=Sum("quantity"))
    matin_total = Decimal(0)
    soir_total = Decimal(0)
    for row in shift_totals:
        if row["shift"] == "MATIN":
            matin_total = row["total"] or Decimal(0)
        elif row["shift"] == "SOIR":
            soir_total = row["total"] or Decimal(0)

    productions_payload = [
        {
            "product": p.product.name,
            "quantity": float(p.quantity),
            "shift": p.shift,
            "note": p.note or "",
            "recorded_by": p.recorded_by.user.get_full_name() if p.recorded_by and p.recorded_by.user else "",
        }
        for p in productions
    ]
    production_meta = {
        "date": selected_date.isoformat(),
        "shift": selected_shift,
        "shift_label": "Matin" if selected_shift == "MATIN" else "Soir" if selected_shift == "SOIR" else "Tous",
        "cashier": shift_cashier_label,
        "matin_total": float(matin_total),
        "soir_total": float(soir_total),
    }
    detail_url = f"{reverse('view_sale_production')}?date={selected_date.isoformat()}&shift=TOUS"

    if request.method == "POST":
        product_id = request.POST.get("product_id", "").strip()
        quantity = clean_decimal(request.POST.get("quantity", "").strip())
        production_date = parse_date(request.POST.get("production_date", ""), selected_date)
        shift = (request.POST.get("shift") or selected_shift or "MATIN").upper()
        if shift not in {"MATIN", "SOIR"}:
            shift = "MATIN"
        lock_report = PosShiftReport.objects.filter(shift_date=production_date, shift=shift).first()
        if lock_report and lock_report.closed_at:
            return redirect(f"{reverse('view_sale_production')}?date={production_date.isoformat()}&shift={shift}&locked=1")
        note = request.POST.get("note", "").strip()
        if product_id and quantity > 0:
            product = get_object_or_404(SaleProduct, id=product_id)
            if not product.stock_known or product.product_type != "Fabriqué sur place":
                return redirect(f"{reverse('view_sale_production')}?date={production_date.isoformat()}")
            if product.id in base_with_children_ids:
                return redirect(f"{reverse('view_sale_production')}?date={production_date.isoformat()}")
            existing = SaleProduction.objects.filter(
                product=product,
                production_date=production_date,
                shift=shift,
            ).order_by("-recorded_at").first()
            if existing:
                if not request.user.has_perm("noyau.change_saleproduction"):
                    raise PermissionDenied
                existing.quantity = clean_decimal(existing.quantity) + quantity
                if note:
                    existing.note = f"{existing.note} | {note}".strip(" |")
                existing.recorded_by = getattr(request.user, "employer", None)
                existing.shift = shift
                existing.save()
            else:
                if not request.user.has_perm("noyau.add_saleproduction"):
                    raise PermissionDenied
                SaleProduction.objects.create(
                    product=product,
                    quantity=quantity,
                    production_date=production_date,
                    shift=shift,
                    note=note,
                    recorded_by=getattr(request.user, "employer", None),
                )
        return redirect(f"{reverse('view_sale_production')}?date={production_date.isoformat()}")

    for production in productions:
        recipe = getattr(production.product, "recipe", None)
        production.recipe_unit = recipe.yield_unit if recipe else ""

    context.update({
        "products": products,
        "productions": productions,
        "selected_date": selected_date,
        "selected_shift": selected_shift,
        "shift_cashier_label": shift_cashier_label,
        "summary_total": summary_total,
        "summary_products": summary_products,
        "summary_top": summary_top,
        "matin_total": matin_total,
        "soir_total": soir_total,
        "productions_json": productions_payload,
        "production_meta": production_meta,
        "detail_url": detail_url,
        "shift_locked": is_shift_locked,
        "locked_notice": locked_notice,
        "domain": "pos",
        "domain_label": "POS",
        "page_title": "Production POS",
    })
    return render(request, "production/view_production.html", context)


@permission_required("noyau.view_bakeryproduction", raise_exception=True)
def view_bakery_production(request):
    context = build_user_context(request)
    selected_date = parse_date(request.GET.get("date", ""), localdate())
    products = BakeryProduct.objects.all().order_by("name")
    productions = BakeryProduction.objects.select_related("product", "product__recipe", "recorded_by").filter(
        production_date=selected_date
    ).order_by("-recorded_at")

    if request.method == "POST":
        if not request.user.has_perm("noyau.add_bakeryproduction"):
            raise PermissionDenied
        product_id = request.POST.get("product_id", "").strip()
        quantity = clean_decimal(request.POST.get("quantity", "").strip())
        production_date = parse_date(request.POST.get("production_date", ""), selected_date)
        note = request.POST.get("note", "").strip()
        if product_id and quantity > 0:
            product = get_object_or_404(BakeryProduct, id=product_id)
            BakeryProduction.objects.create(
                product=product,
                quantity=quantity,
                production_date=production_date,
                note=note,
                recorded_by=getattr(request.user, "employer", None),
            )
        return redirect(f"{reverse('view_bakery_production')}?date={production_date.isoformat()}")

    for production in productions:
        recipe = getattr(production.product, "recipe", None)
        production.recipe_unit = recipe.yield_unit if recipe else ""

    context.update({
        "products": products,
        "productions": productions,
        "selected_date": selected_date,
        "domain": "bakery",
        "domain_label": "Boulangerie",
        "page_title": "Production Boulangerie",
    })
    return render(request, "production/view_production.html", context)


@permission_required("noyau.view_saleproduction", raise_exception=True)
def view_production_report(request):
    context = build_user_context(request)
    today = localdate()
    start_date = parse_date(request.GET.get("start", ""), today)
    end_date = parse_date(request.GET.get("end", ""), today)
    if end_date < start_date:
        start_date, end_date = end_date, start_date

    def build_stock_map(destination_value):
        stock_totals = StockMovement.objects.filter(
            movement_type="Sortie",
            date__date__gte=start_date,
            date__date__lte=end_date,
            destination=destination_value,
        ).values("raw_material_id", "raw_material__name", "raw_material__unit").annotate(
            total=Sum("quantity")
        )
        return {
            row["raw_material_id"]: {
                "name": row["raw_material__name"],
                "unit": row["raw_material__unit"],
                "stock_out": row["total"] or Decimal(0),
            }
            for row in stock_totals
        }

    def build_theoretical_map(productions, recipe_by_product):
        theoretical = {}
        for production in productions:
            recipe = recipe_by_product.get(production.product_id)
            if not recipe or recipe.yield_quantity <= 0:
                continue
            factor = production.quantity / recipe.yield_quantity
            for item in recipe.items.all():
                material_id = item.raw_material_id
                qty = (item.quantity or Decimal(0)) * factor
                theoretical[material_id] = theoretical.get(material_id, Decimal(0)) + qty
        return theoretical

    sale_recipes = SaleRecipe.objects.select_related("product").prefetch_related("items__raw_material").filter(
        product__product_type="Fabriqué sur place",
    )
    sale_recipe_by_product = {recipe.product_id: recipe for recipe in sale_recipes}
    sale_productions = SaleProduction.objects.filter(
        production_date__gte=start_date,
        production_date__lte=end_date,
        product__stock_known=True,
        product__product_type="Fabriqué sur place",
    ).select_related("product")

    bakery_recipes = BakeryRecipe.objects.select_related("product").prefetch_related("items__raw_material")
    bakery_recipe_by_product = {recipe.product_id: recipe for recipe in bakery_recipes}
    bakery_productions = BakeryProduction.objects.filter(
        production_date__gte=start_date,
        production_date__lte=end_date,
    ).select_related("product")

    pos_stock_by_material = build_stock_map("POS")
    bakery_stock_by_material = build_stock_map("BAKERY")
    pos_theoretical_by_material = build_theoretical_map(sale_productions, sale_recipe_by_product)
    bakery_theoretical_by_material = build_theoretical_map(bakery_productions, bakery_recipe_by_product)

    pos_ids = set(pos_stock_by_material.keys()) | set(pos_theoretical_by_material.keys())
    bakery_ids = set(bakery_stock_by_material.keys()) | set(bakery_theoretical_by_material.keys())
    all_ids = pos_ids | bakery_ids
    materials_lookup = {
        material["id"]: material
        for material in RawMaterial.objects.filter(id__in=all_ids).values("id", "name", "unit")
    }

    def build_rows(stock_by_material, theoretical_by_material, material_ids):
        rows = []
        for material_id in material_ids:
            stock_row = stock_by_material.get(material_id, {})
            stock_out = stock_row.get("stock_out", Decimal(0))
            theoretical = theoretical_by_material.get(material_id, Decimal(0))
            material_info = materials_lookup.get(material_id, {})
            unit = stock_row.get("unit") or material_info.get("unit")
            name = stock_row.get("name") or material_info.get("name")
            rows.append({
                "name": name,
                "unit": unit,
                "stock_out": stock_out,
                "theoretical": theoretical,
                "delta": stock_out - theoretical,
            })
        rows.sort(key=lambda x: (x["name"] or "").lower())
        return rows

    pos_rows = build_rows(pos_stock_by_material, pos_theoretical_by_material, pos_ids)
    bakery_rows = build_rows(bakery_stock_by_material, bakery_theoretical_by_material, bakery_ids)

    context.update({
        "pos_rows": pos_rows,
        "bakery_rows": bakery_rows,
        "pos_rows_json": [
            {
                "name": row["name"],
                "unit": row["unit"],
                "stock_out": float(row["stock_out"] or 0),
                "theoretical": float(row["theoretical"] or 0),
                "delta": float(row["delta"] or 0),
            }
            for row in pos_rows
        ],
        "bakery_rows_json": [
            {
                "name": row["name"],
                "unit": row["unit"],
                "stock_out": float(row["stock_out"] or 0),
                "theoretical": float(row["theoretical"] or 0),
                "delta": float(row["delta"] or 0),
            }
            for row in bakery_rows
        ],
        "start_date": start_date,
        "end_date": end_date,
        "page_title": "Comparatif Production / Stock",
    })
    return render(request, "production/production_report.html", context)

@permission_required("noyau.view_rawmaterial", raise_exception=True)
def get_rawmaterial(request, inventory_id):
    
    try:
        inventory = RawMaterial.objects.get(id=inventory_id)

        data = {
            "name": inventory.name,
            "unit": inventory.unit,
            "current_stock": inventory.current_stock,
            "min_stock": inventory.min_stock,
            "stock_mode": inventory.stock_mode,
            "linked_product_id": inventory.linked_product_id,
        }
        return JsonResponse({"success": True, "inventory": data})
    except RawMaterial.DoesNotExist:
        return JsonResponse({"error": "Ingrédient introuvable."}, status=404)


@permission_required("noyau.view_rawmaterial", raise_exception=True)
def get_rawmaterial_lots(request, inventory_id):
    inventory = get_object_or_404(RawMaterial, id=inventory_id)
    if inventory.stock_mode != "FEFO":
        return JsonResponse({"success": False, "error": "Ingrédient non FEFO."}, status=400)
    lots = RawMaterialLot.objects.filter(
        raw_material=inventory,
        quantity__gt=0,
    ).order_by(
        F("expiration_date").asc(nulls_last=True),
        "received_at",
        "id",
    )
    data = [
        {
            "id": lot.id,
            "quantity": float(lot.quantity or 0),
            "expiration_date": lot.expiration_date.isoformat() if lot.expiration_date else None,
            "received_at": lot.received_at.isoformat() if lot.received_at else None,
        }
        for lot in lots
    ]
    return JsonResponse({
        "success": True,
        "name": inventory.name,
        "unit": inventory.unit,
        "lots": data,
    })


@permission_required("noyau.change_rawmaterial", raise_exception=True)
def update_rawmaterial_lots(request, inventory_id):
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "Méthode non autorisée."}, status=405)
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Données invalides."}, status=400)

    inventory = get_object_or_404(RawMaterial, id=inventory_id)
    if inventory.stock_mode != "FEFO":
        return JsonResponse({"success": False, "error": "Ingrédient non FEFO."}, status=400)

    lots_payload = payload.get("lots", [])
    if not isinstance(lots_payload, list):
        return JsonResponse({"success": False, "error": "Lots invalides."}, status=400)

    updated = 0
    for item in lots_payload:
        lot_id = item.get("id")
        expiry_str = (item.get("expiration_date") or "").strip()
        if not lot_id:
            continue
        lot = RawMaterialLot.objects.filter(id=lot_id, raw_material=inventory).first()
        if not lot:
            continue
        expiry_date = None
        if expiry_str:
            try:
                expiry_date = date.fromisoformat(expiry_str)
            except Exception:
                expiry_date = None
        lot.expiration_date = expiry_date
        lot.save(update_fields=["expiration_date"])
        updated += 1

    return JsonResponse({"success": True, "updated": updated})

@permission_required("noyau.delete_rawmaterial", raise_exception=True)
def delete_rawmaterial(request, inventory_id):
    
    inventory = get_object_or_404(RawMaterial, id=inventory_id)
    inventory.delete()
    return redirect("view_rawmaterial")

@permission_required("noyau.view_pos", raise_exception=True)
def view_pos(request):
    
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    now_dt = timezone.localtime()
    today = now_dt.date()
    time_shift = get_current_shift(now_dt)
    employer = getattr(request.user, "employer", None)

    # Auto-close previous day shifts at 00:00 if they were left open
    stale_reports = PosShiftReport.objects.filter(shift_date__lt=today, closed_at__isnull=True)
    for report in stale_reports:
        close_time = datetime.combine(report.shift_date + timedelta(days=1), time(0, 0))
        report.closed_at = timezone.make_aware(close_time)
        report.save(update_fields=["closed_at"])
    session_shift = request.session.get("pos_shift", {})
    shift_choice = None
    session_shift_date = session_shift.get("date")
    session_shift_value = (session_shift.get("shift") or "").upper()
    session_shift_confirmed = bool(session_shift.get("confirmed"))
    if session_shift_date == today.isoformat() and session_shift_value in {"MATIN", "SOIR"}:
        shift_choice = session_shift_value
    if not shift_choice and employer:
        existing_report = (
            PosShiftReport.objects.filter(shift_date=today, cashier=employer)
            .order_by("-opened_at")
            .first()
        )
        if existing_report and not existing_report.closed_at:
            shift_choice = existing_report.shift
    effective_shift = shift_choice
    shift_report = (
        PosShiftReport.objects.filter(shift_date=today, shift=shift_choice).first()
        if shift_choice
        else None
    )
    remises_defaults_raw = get_pos_shift_remise_defaults(today, effective_shift) if effective_shift else {}
    remises_defaults = {
        str(product_id): float(quantity)
        for product_id, quantity in remises_defaults_raw.items()
    }
    shift_start, shift_end = get_report_window(shift_report, today, effective_shift) if effective_shift else (None, None)
    production_totals = SaleProduction.objects.filter(
        production_date=today,
        product__stock_known=True,
        shift=effective_shift,
    ).values("product_id").annotate(total=Sum("quantity"))
    production_by_product = {
        row["product_id"]: row["total"] or Decimal(0)
        for row in production_totals
    }
    sales_qs = SaleTransactionItem.objects.filter(
        product__stock_known=True,
    )
    if shift_start and shift_end:
        sales_qs = sales_qs.filter(transaction__date__gte=shift_start, transaction__date__lt=shift_end)
    else:
        sales_qs = sales_qs.filter(transaction__date__date=today)
    sales_totals = sales_qs.values("product_id").annotate(total=Sum("quantity"))
    sales_by_product = {
        row["product_id"]: row["total"] or Decimal(0)
        for row in sales_totals
    }
    resale_sales_qs = SaleTransactionItem.objects.filter(
        product__product_type="Vente en dépôt",
    )
    if shift_start and shift_end:
        resale_sales_qs = resale_sales_qs.filter(transaction__date__gte=shift_start, transaction__date__lt=shift_end)
    else:
        resale_sales_qs = resale_sales_qs.filter(transaction__date__date=today)
    resale_sales_total = resale_sales_qs.aggregate(total=Sum("subtotal"))["total"] or Decimal(0)
    ar_sales_qs = SaleTransactionItem.objects.filter(
        product__product_type="Achat & Revente",
    )
    if shift_start and shift_end:
        ar_sales_qs = ar_sales_qs.filter(transaction__date__gte=shift_start, transaction__date__lt=shift_end)
    else:
        ar_sales_qs = ar_sales_qs.filter(transaction__date__date=today)
    ar_sales_total = ar_sales_qs.aggregate(total=Sum("subtotal"))["total"] or Decimal(0)
    resale_types = {"Vente en dépôt"}
    resale_opening_by_product = {}
    resale_delivered_current_by_product = {}
    if shift_start and shift_end:
        resale_state = get_resale_shift_stock_state(today, shift_start, shift_end)
        resale_opening_by_product = resale_state["opening_by_product"]
        resale_delivered_current_by_product = resale_state["delivered_current_by_product"]
    else:
        resale_deliveries = ResaleDelivery.objects.filter(
            product__product_type="Vente en dépôt",
            delivered_at__date=today,
        ).values("product_id").annotate(total=Sum("quantity"))
        resale_delivered_current_by_product = {
            row["product_id"]: row["total"] or Decimal(0) for row in resale_deliveries
        }
    ar_out_qs = StockMovement.objects.filter(
        movement_type="Sortie",
        destination="POS",
        raw_material__linked_product__product_type="Achat & Revente",
    )
    if shift_start and shift_end:
        ar_out_qs = ar_out_qs.filter(date__gte=shift_start, date__lt=shift_end)
    else:
        ar_out_qs = ar_out_qs.filter(date__date=today)
    ar_out_qs = ar_out_qs.values("raw_material__linked_product_id").annotate(total=Sum("quantity"))
    ar_out_by_product = {
        row["raw_material__linked_product_id"]: row["total"] or Decimal(0)
        for row in ar_out_qs
    }
    ar_out_before_by_product = {}
    ar_sales_before_by_product = {}
    if shift_start:
        ar_out_before_qs = StockMovement.objects.filter(
            movement_type="Sortie",
            destination="POS",
            raw_material__linked_product__product_type="Achat & Revente",
            date__lt=shift_start,
        ).values("raw_material__linked_product_id").annotate(total=Sum("quantity"))
        ar_out_before_by_product = {
            row["raw_material__linked_product_id"]: row["total"] or Decimal(0)
            for row in ar_out_before_qs
        }
        ar_sales_before_qs = SaleTransactionItem.objects.filter(
            product__product_type="Achat & Revente",
            transaction__date__lt=shift_start,
        ).values("product_id").annotate(total=Sum("quantity"))
        ar_sales_before_by_product = {
            row["product_id"]: row["total"] or Decimal(0)
            for row in ar_sales_before_qs
        }
    data = []
    products = SaleProduct.objects.select_related("base_product").order_by('name')
    products_payload = []
    remises_by_product = {}
    abimes_by_product = {}
    if shift_report:
        remises_by_product = seed_pos_shift_remises(shift_report)
        abimes_by_product = {
            row["product_id"]: row["qty"] or Decimal(0)
            for row in PosShiftAbime.objects.filter(report=shift_report)
            .values("product_id")
            .annotate(qty=Sum("quantity"))
        }
    if not remises_by_product and remises_defaults:
        remises_by_product = {int(pid): clean_decimal(qty) for pid, qty in remises_defaults.items()}
    available_by_product = {}
    for product_id, prod_qty in production_by_product.items():
        available_by_product[product_id] = prod_qty + remises_by_product.get(product_id, Decimal(0))
    for product_id, remise_qty in remises_by_product.items():
        if product_id not in available_by_product:
            available_by_product[product_id] = remise_qty

    remises_current = {
        str(product_id): float(remise_qty)
        for product_id, remise_qty in remises_by_product.items()
    }

    base_consumption = {}
    base_production_by_id = dict(available_by_product)
    for product in products:
        if not product.base_product_id:
            continue
        factor = product.conversion_factor or Decimal("1.00")
        if factor <= 0:
            continue
        sold_child = sales_by_product.get(product.id, Decimal(0))
        abimes_child = abimes_by_product.get(product.id, Decimal(0))
        base_consumption[product.base_product_id] = base_consumption.get(product.base_product_id, Decimal(0)) + ((sold_child + abimes_child) * factor)
        produced_child = available_by_product.get(product.id, Decimal(0))
        if produced_child:
            base_production_by_id[product.base_product_id] = base_production_by_id.get(product.base_product_id, Decimal(0)) + (produced_child * factor)

    remaining_base_by_id = {}
    for product in products:
        produced = base_production_by_id.get(product.id, Decimal(0))
        sold = sales_by_product.get(product.id, Decimal(0))
        consumed_by_children = base_consumption.get(product.id, Decimal(0))
        abimes = abimes_by_product.get(product.id, Decimal(0))
        remaining = produced - sold - consumed_by_children - abimes
        if remaining < 0:
            remaining = Decimal(0)
        remaining_base_by_id[product.id] = remaining

    for product in products:
        if not product.stock_known:
            stock_value = "∞"
            data.append({
                'id': product.id,
                'image': product.image,
                'unit_price': float(product.unit_price),
                'name': product.name,
                'category': product.category,
                'product_type': product.product_type,
                'stock_known': product.stock_known,
                'stock': stock_value,
            })
            products_payload.append({
                "id": product.id,
                "name": product.name,
                "unit_price": float(product.unit_price),
                "stock_known": product.stock_known,
                "category": product.category,
                "base_product_id": product.base_product_id,
                "product_type": product.product_type,
            })
            continue

        sold = sales_by_product.get(product.id, Decimal(0))
        abimes = abimes_by_product.get(product.id, Decimal(0))
        remaining = Decimal(0)
        if product.product_type in resale_types:
            opening = resale_opening_by_product.get(product.id, Decimal(0))
            delivered_current = resale_delivered_current_by_product.get(product.id, Decimal(0))
            remaining = opening + delivered_current - sold
        elif product.product_type == "Achat & Revente":
            opening = ar_out_before_by_product.get(product.id, Decimal(0)) - ar_sales_before_by_product.get(product.id, Decimal(0))
            if opening < 0:
                opening = Decimal(0)
            delivered_current = ar_out_by_product.get(product.id, Decimal(0))
            remaining = opening + delivered_current - sold
        elif product.base_product_id:
            factor = product.conversion_factor or Decimal("1.00")
            base_remaining = remaining_base_by_id.get(product.base_product_id, Decimal(0))
            if factor > 0:
                remaining = base_remaining / factor
            else:
                remaining = remaining_base_by_id.get(product.id, Decimal(0))
        else:
            remaining = remaining_base_by_id.get(product.id, Decimal(0))
        if remaining < 0:
            remaining = Decimal(0)
        stock_value = int(remaining)
        data.append({
            'id': product.id,
            'image': product.image,
            'unit_price': float(product.unit_price),
            'name': product.name,
            'category': product.category,
            'product_type': product.product_type,
            'stock_known': product.stock_known,
            'stock': stock_value,
        })
        products_payload.append({
            "id": product.id,
            "name": product.name,
            "unit_price": float(product.unit_price),
            "stock_known": product.stock_known,
            "category": product.category,
            "base_product_id": product.base_product_id,
            "product_type": product.product_type,
        })
    loyalties_json = json.dumps([], cls=DjangoJSONEncoder)
    pyromane_orders = []
    logout_blocked = bool(request.session.pop("logout_blocked", False))

    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "products" : data,
        "loyalties_json": loyalties_json,
        "products_json": products_payload,
        "remises_defaults": remises_defaults,
        "remises_current": remises_current,
        "pyromane_orders_json": json.dumps(pyromane_orders, cls=DjangoJSONEncoder),
        "resale_total": resale_sales_total,
        "ar_total": ar_sales_total,
        "shift_json": {
            "date": today.isoformat(),
            "shift": shift_choice or "",
            "report_id": shift_report.id if shift_report else None,
            "is_closed": bool(shift_report and shift_report.closed_at),
            "cashier": f"{first_name} {last_name}",
            "time_shift": time_shift,
            "needs_confirm": bool(shift_choice and shift_choice != time_shift and not session_shift_confirmed),
            "logout_blocked": logout_blocked,
            "resale_total": float(resale_sales_total),
            "ar_total": float(ar_sales_total),
        },
    }
    return render(request, "pos/view_pos.html", context)


@permission_required("noyau.view_pos", raise_exception=True)
def resolve_loyalty(request):
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "Méthode non autorisée."}, status=405)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Données invalides."}, status=400)

    raw_code = str(payload.get("code") or "").strip().lower()
    if not raw_code:
        return JsonResponse({"success": False, "error": "Code manquant."}, status=400)

    if not re.fullmatch(r"[a-f0-9]{64}", raw_code):
        return JsonResponse({"success": False, "error": "Code invalide."}, status=400)

    loyalties = Loyalty.objects.values(
        "id",
        "card_id",
        "card_type",
        "setting",
        "phone",
        "solde",
        "client",
        "points_balance",
        "points_remainder",
    )

    for loyalty in loyalties:
        secure_id = build_secure_id_for_loyalty(loyalty, legacy=False)
        if secure_id == raw_code:
            loyalty_payload = {
                "id": loyalty["id"],
                "card_id": loyalty["card_id"],
                "setting": loyalty["setting"],
                "phone": loyalty["phone"],
                "solde": float(loyalty["solde"] or 0),
                "client": loyalty["client"],
                "points_balance": int(loyalty["points_balance"] or 0),
                "points_remainder": float(loyalty["points_remainder"] or 0),
                "card_type": loyalty["card_type"],
            }
            return JsonResponse({"success": True, "loyalty": loyalty_payload})

        legacy_id = build_secure_id_for_loyalty(loyalty, legacy=True)
        if legacy_id == raw_code:
            loyalty_payload = {
                "id": loyalty["id"],
                "card_id": loyalty["card_id"],
                "setting": loyalty["setting"],
                "phone": loyalty["phone"],
                "solde": float(loyalty["solde"] or 0),
                "client": loyalty["client"],
                "points_balance": int(loyalty["points_balance"] or 0),
                "points_remainder": float(loyalty["points_remainder"] or 0),
                "card_type": loyalty["card_type"],
            }
            return JsonResponse({"success": True, "loyalty": loyalty_payload})

    return JsonResponse({"success": False, "error": "Carte introuvable."}, status=404)


@permission_required("noyau.view_pyromaneorder", raise_exception=True)
def view_pyromane(request):
    if request.user.has_perm("noyau.view_pos"):
        return redirect("view_pos")
    return redirect("view_dashboard")


@permission_required("noyau.view_pyromaneorder", raise_exception=True)
def pyromane_order_create(request):
    if request.method != "POST":
        return JsonResponse({"error": "Méthode non autorisée."}, status=405)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Données invalides."}, status=400)

    items = payload.get("items", [])
    if not items:
        return JsonResponse({"error": "Aucun produit sélectionné."}, status=400)

    try:
        employer = getattr(request.user, "employer", None)
        order_number = generate_pyromane_order_number()
        order = PyromaneOrder.objects.create(order_number=order_number, status="PENDING")

        total_amount = Decimal("0.00")
        created_items = []
        for item in items:
            product_id = item.get("id")
            quantity = int(item.get("quantity") or 0)
            if not product_id or quantity <= 0:
                continue
            product = SaleProduct.objects.filter(id=product_id, stock_known=False).first()
            if not product:
                continue
            unit_price = clean_decimal(item.get("price", product.unit_price))
            subtotal = _q(unit_price * quantity)
            total_amount += subtotal
            PyromaneOrderItem.objects.create(
                order=order,
                product=product,
                quantity=quantity,
                unit_price=unit_price,
                subtotal=subtotal,
            )
            created_items.append({
                "product_id": product_id,
                "name": product.name,
                "quantity": quantity,
                "unit_price": float(unit_price),
            })

        if total_amount <= 0:
            order.delete()
            return JsonResponse({"error": "Commande invalide."}, status=400)

        order.total_amount = _q(total_amount)
        order.save(update_fields=["total_amount"])

        PyromaneOrderLog.objects.create(
            order=order,
            action="CREATE",
            details={
                "items": created_items,
                "total_amount": float(order.total_amount),
            },
            created_by=employer,
        )

        return JsonResponse({
            "success": True,
            "order_number": order.order_number,
            "order_id": order.id,
        })
    except Exception as exc:
        # NOTE: expose short error detail to help debug production issues (can be removed later)
        return JsonResponse(
            {"error": f"Erreur serveur lors de la création: {exc.__class__.__name__}: {exc}"},
            status=500,
        )


@permission_required("noyau.view_pos", raise_exception=True)
def pyromane_orders_pending(request):
    pending_orders = (
        PyromaneOrder.objects
        .prefetch_related("items__product", "logs")
        .filter(status="PENDING")
        .order_by("-created_at")
    )
    orders_payload = []
    for order in pending_orders:
        items_payload = []
        for item in order.items.all():
            items_payload.append({
                "product_id": item.product.id,
                "name": item.product.name,
                "unit_price": float(item.unit_price),
                "quantity": item.quantity,
            })
        orders_payload.append({
            "id": order.id,
            "order_number": order.order_number,
            "total_amount": float(order.total_amount),
            "created_at": timezone.localtime(order.created_at).strftime("%H:%M"),
            "items": items_payload,
            "modified": any(log.action != "CREATE" for log in order.logs.all()),
        })
    return JsonResponse({"success": True, "orders": orders_payload})


@permission_required("noyau.view_pos", raise_exception=True)
def pyromane_order_logs(request):
    order_id = request.GET.get("order_id")
    if not order_id:
        return JsonResponse({"success": False, "error": "Commande introuvable."}, status=400)
    order = PyromaneOrder.objects.filter(id=order_id).first()
    if not order:
        return JsonResponse({"success": False, "error": "Commande Pyromane introuvable."}, status=404)

    logs = []
    for log in order.logs.select_related("created_by__user").order_by("-created_at"):
        user_label = ""
        if log.created_by and log.created_by.user:
            user_label = log.created_by.user.get_full_name()
        logs.append({
            "action": log.action,
            "created_at": timezone.localtime(log.created_at).strftime("%d/%m %H:%M"),
            "user": user_label,
            "details": log.details or {},
        })
    return JsonResponse({"success": True, "logs": logs})


@permission_required("noyau.view_pos", raise_exception=True)
def pyromane_order_update(request):
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "Méthode non autorisée."}, status=405)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Données invalides."}, status=400)

    order_id = payload.get("order_id")
    if not order_id:
        return JsonResponse({"success": False, "error": "Commande introuvable."}, status=400)

    order = PyromaneOrder.objects.filter(id=order_id).first()
    if not order:
        return JsonResponse({"success": False, "error": "Commande Pyromane introuvable."}, status=404)
    if order.status != "PENDING":
        return JsonResponse({"success": False, "error": "Cette commande n'est plus modifiable."}, status=400)

    items_payload = payload.get("items", []) or []
    employer = getattr(request.user, "employer", None)
    normalized_items = {}
    for item in items_payload:
        product_id = item.get("product_id")
        quantity = int(item.get("quantity") or 0)
        if not product_id or quantity <= 0:
            continue
        normalized_items[int(product_id)] = quantity

    existing_items = {item.product_id: item for item in order.items.select_related("product")}
    before_items = [
        {
            "product_id": item.product_id,
            "name": item.product.name,
            "quantity": item.quantity,
            "unit_price": float(item.unit_price),
        }
        for item in existing_items.values()
    ]

    # remove deleted items
    for product_id, item in list(existing_items.items()):
        if product_id not in normalized_items:
            item.delete()
            existing_items.pop(product_id, None)

    total_amount = Decimal("0.00")
    # update / create items
    for product_id, quantity in normalized_items.items():
        item = existing_items.get(product_id)
        if item:
            item.quantity = quantity
            item.subtotal = _q(item.unit_price * quantity)
            item.save(update_fields=["quantity", "subtotal"])
            total_amount += item.subtotal
        else:
            product = SaleProduct.objects.filter(id=product_id, stock_known=False).first()
            if not product:
                continue
            unit_price = clean_decimal(product.unit_price)
            subtotal = _q(unit_price * quantity)
            PyromaneOrderItem.objects.create(
                order=order,
                product=product,
                quantity=quantity,
                unit_price=unit_price,
                subtotal=subtotal,
            )
            total_amount += subtotal

    if total_amount <= 0:
        order.status = "CANCELED"
        order.total_amount = Decimal("0.00")
        order.save(update_fields=["status", "total_amount"])
        PyromaneOrderLog.objects.create(
            order=order,
            action="CANCEL",
            details={
                "before": before_items,
                "after": [],
            },
            created_by=employer,
        )
        return JsonResponse({
            "success": True,
            "order": {
                "id": order.id,
                "status": order.status,
                "total_amount": float(order.total_amount),
                "items": [],
            },
        })

    order.total_amount = _q(total_amount)
    order.save(update_fields=["total_amount"])

    updated_items = []
    for item in order.items.select_related("product"):
        updated_items.append({
            "product_id": item.product_id,
            "name": item.product.name,
            "unit_price": float(item.unit_price),
            "quantity": item.quantity,
        })

    PyromaneOrderLog.objects.create(
        order=order,
        action="UPDATE",
        details={
            "before": before_items,
            "after": updated_items,
        },
        created_by=employer,
    )

    return JsonResponse({
        "success": True,
        "order": {
            "id": order.id,
            "status": order.status,
            "total_amount": float(order.total_amount),
            "items": updated_items,
        },
    })


def build_pos_shift_report_payload(report, shift_date, shift):
    start_dt, end_dt = get_report_window(report, shift_date, shift)

    resale_state = get_resale_shift_stock_state(shift_date, start_dt, end_dt)
    resale_opening_by_product = resale_state["opening_by_product"]
    resale_delivered_current_by_product = resale_state["delivered_current_by_product"]

    sales_items = SaleTransactionItem.objects.filter(
        transaction__date__gte=start_dt,
        transaction__date__lt=end_dt,
    ).values("product_id").annotate(
        qty=Sum("quantity"),
        amount=Sum("subtotal"),
    )
    sales_by_product = {
        row["product_id"]: {
            "qty": row["qty"] or Decimal(0),
            "amount": row["amount"] or Decimal(0),
        }
        for row in sales_items
    }

    production_items = SaleProduction.objects.filter(
        production_date=shift_date,
        shift=shift,
    ).values("product_id").annotate(
        qty=Sum("quantity")
    )
    production_by_product = {row["product_id"]: row["qty"] or Decimal(0) for row in production_items}

    # Achat & Revente : sorties vers POS (stock movement) + ventes avant la fenêtre
    ar_out_current = StockMovement.objects.filter(
        movement_type="Sortie",
        destination="POS",
        raw_material__linked_product__isnull=False,
        raw_material__linked_product__product_type="Achat & Revente",
        date__gte=start_dt,
        date__lt=end_dt,
    ).values("raw_material__linked_product_id").annotate(total=Sum("quantity"))
    ar_out_by_product = {
        row["raw_material__linked_product_id"]: row["total"] or Decimal(0)
        for row in ar_out_current
    }

    ar_out_before = StockMovement.objects.filter(
        movement_type="Sortie",
        destination="POS",
        raw_material__linked_product__isnull=False,
        raw_material__linked_product__product_type="Achat & Revente",
        date__lt=start_dt,
    ).values("raw_material__linked_product_id").annotate(total=Sum("quantity"))
    ar_out_before_by_product = {
        row["raw_material__linked_product_id"]: row["total"] or Decimal(0)
        for row in ar_out_before
    }

    ar_sales_before = SaleTransactionItem.objects.filter(
        transaction__date__lt=start_dt,
    ).values("product_id").annotate(qty=Sum("quantity"))
    ar_sales_before_by_product = {
        row["product_id"]: row["qty"] or Decimal(0)
        for row in ar_sales_before
    }

    remises_by_product = {
        r.product_id: r.quantity for r in PosShiftRemise.objects.filter(report=report)
    }
    abimes_by_product = {
        row["product_id"]: row["qty"] or Decimal(0)
        for row in PosShiftAbime.objects.filter(report=report)
        .values("product_id")
        .annotate(qty=Sum("quantity"))
    }

    ready_products = SaleProduct.objects.filter(stock_known=True).order_by("name")
    make_products = SaleProduct.objects.filter(stock_known=False).order_by("name")

    ready_rows = []
    resale_rows = []
    ar_rows = []
    for product in ready_products:
        sold = sales_by_product.get(product.id, {}).get("qty", Decimal(0))
        if product.product_type == "Vente en dépôt":
            opening = resale_opening_by_product.get(product.id, Decimal(0))
            delivered_current = resale_delivered_current_by_product.get(product.id, Decimal(0))
            delivered = opening + delivered_current
            restes = delivered - sold
            if restes < 0:
                restes = Decimal(0)
            resale_rows.append({
                "id": product.id,
                "name": product.name,
                "opening": opening,
                "received": delivered_current,
                "delivered": delivered,
                "sold": sold,
                "restes": restes,
                "unit_price": product.unit_price,
                "amount": sold * product.unit_price,
            })
            continue
        if product.product_type == "Achat & Revente":
            delivered = ar_out_by_product.get(product.id, Decimal(0))
            opening = ar_out_before_by_product.get(product.id, Decimal(0)) - ar_sales_before_by_product.get(product.id, Decimal(0))
            if opening < 0:
                opening = Decimal(0)
            restes = opening + delivered - sold
            if restes < 0:
                restes = Decimal(0)
            ar_rows.append({
                "id": product.id,
                "name": product.name,
                "delivered": delivered,
                "sold": sold,
                "restes": restes,
                "unit_price": product.unit_price,
                "amount": sold * product.unit_price,
            })
            continue

        remises = remises_by_product.get(product.id, Decimal(0))
        prod = production_by_product.get(product.id, Decimal(0))
        abimes = abimes_by_product.get(product.id, Decimal(0))
        total = remises + prod
        restes = total - sold - abimes
        if restes < 0:
            restes = Decimal(0)
        ready_rows.append({
            "id": product.id,
            "name": product.name,
            "remises": remises,
            "prod": prod,
            "total": total,
            "sold": sold,
            "abimes": abimes,
            "restes": restes,
            "unit_price": product.unit_price,
            "amount": sold * product.unit_price,
        })

    make_rows = []
    for product in make_products:
        sold = sales_by_product.get(product.id, {}).get("qty", Decimal(0))
        make_rows.append({
            "id": product.id,
            "name": product.name,
            "prod": sold,
            "total": sold,
            "sold": sold,
            "unit_price": product.unit_price,
            "amount": sold * product.unit_price,
        })

    expenses = list(
        PosShiftExpense.objects.filter(report=report).values("label", "amount")
    )

    bakery_sales_qs = (
        BakerySale.objects.filter(is_paid=True)
        .filter(
            Q(paid_at__gte=start_dt, paid_at__lt=end_dt)
            | Q(paid_at__isnull=True, date__gte=start_dt, date__lt=end_dt)
        )
        .order_by("paid_at", "date")
    )
    bakery_rows = []
    bakery_total = Decimal(0)
    for sale in bakery_sales_qs:
        paid_time = sale.paid_at or sale.date
        time_label = timezone.localtime(paid_time).strftime("%H:%M") if paid_time else ""
        bakery_rows.append({
            "order": f"Commande #{sale.id}",
            "client": sale.client,
            "payment_method": sale.payment_method,
            "time": time_label,
            "amount": sale.total_amount,
        })
        bakery_total += clean_decimal(sale.total_amount)
    consumptions = []
    consumption_total = Decimal(0)
    for item in PosShiftConsumption.objects.filter(report=report).select_related("product"):
        amount = item.product.unit_price * item.quantity
        consumptions.append({
            "person_name": item.person_name,
            "product": item.product.name,
            "quantity": item.quantity,
            "unit_price": item.product.unit_price,
            "amount": amount,
        })
        consumption_total += amount

    pos_sales_total = sum(((row.get("amount") or Decimal(0)) for row in sales_by_product.values()), Decimal(0))
    expense_total = sum(((row.get("amount") or Decimal(0)) for row in expenses), Decimal(0))
    resale_total = sum((row.get("amount") or Decimal(0)) for row in resale_rows)
    ar_total = sum((row.get("amount") or Decimal(0)) for row in ar_rows)
    sales_total = pos_sales_total + bakery_total
    net_total = sales_total - expense_total - consumption_total

    return {
        "shift_date": shift_date.isoformat(),
        "shift": shift,
        "cashier": report.cashier.user.get_full_name() if report.cashier and report.cashier.user else "",
        "ready_rows": ready_rows,
        "resale_rows": resale_rows,
        "ar_rows": ar_rows,
        "make_rows": make_rows,
        "bakery_rows": bakery_rows,
        "expenses": expenses,
        "consumptions": consumptions,
        "totals": {
            "sales_total": sales_total,
            "pos_sales_total": pos_sales_total,
            "bakery_sales_total": bakery_total,
            "resale_total": resale_total,
            "ar_total": ar_total,
            "expense_total": expense_total,
            "consumption_total": consumption_total,
            "net_total": net_total,
        },
    }


@permission_required("noyau.view_pos", raise_exception=True)
def pos_shift_start(request):
    if request.method != "POST":
        return JsonResponse({"error": "Méthode non autorisée."}, status=405)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Données invalides."}, status=400)

    shift_date = parse_date(payload.get("date"), localdate())
    shift = normalize_shift(payload.get("shift"), default=get_current_shift(timezone.localtime()))
    employer = getattr(request.user, "employer", None)

    report, _ = PosShiftReport.objects.get_or_create(
        shift_date=shift_date,
        shift=shift,
        defaults={"cashier": employer},
    )
    if report.cashier is None:
        report.cashier = employer
        report.save()

    PosShiftRemise.objects.filter(report=report).delete()
    remises = payload.get("remises", [])
    for item in remises:
        product_id = item.get("product_id")
        quantity = clean_decimal(item.get("quantity"))
        if not product_id or quantity <= 0:
            continue
        product = get_object_or_404(SaleProduct, id=product_id)
        if not product.stock_known:
            continue
        if product.product_type in {"Vente en dépôt", "Achat & Revente"}:
            continue
        if SaleProduct.objects.filter(base_product_id=product.id).exists():
            continue
        PosShiftRemise.objects.create(
            report=report,
            product=product,
            quantity=quantity,
        )

    return JsonResponse({"success": True, "report_id": report.id})


@permission_required("noyau.view_pos", raise_exception=True)
def pos_shift_select(request):
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "Méthode non autorisée."}, status=405)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Données invalides."}, status=400)

    shift = (payload.get("shift") or "").upper()
    if shift not in {"MATIN", "SOIR"}:
        return JsonResponse({"success": False, "error": "Shift invalide."}, status=400)

    force = bool(payload.get("force"))
    now_dt = timezone.localtime()
    time_shift = get_current_shift(now_dt)
    if not force and shift != time_shift:
        return JsonResponse({
            "success": False,
            "requires_confirm": True,
            "time_shift": time_shift,
            "requested_shift": shift,
            "message": "Le shift sélectionné ne correspond pas à l'heure actuelle.",
        }, status=409)

    employer = getattr(request.user, "employer", None)
    if employer is None:
        return JsonResponse({"success": False, "error": "Aucun caissier associé."}, status=400)

    today = localdate()
    report = PosShiftReport.objects.filter(shift_date=today, shift=shift).first()
    if report:
        if report.closed_at:
            return JsonResponse({"success": False, "error": "Ce shift est déjà clôturé."}, status=409)
        if report.cashier and report.cashier != employer:
            return JsonResponse({
                "success": False,
                "error": f"Shift déjà attribué à {report.cashier.user.get_full_name()}.",
            }, status=409)
        if report.cashier is None:
            report.cashier = employer
            report.save()
    else:
        report = PosShiftReport.objects.create(
            shift_date=today,
            shift=shift,
            cashier=employer,
        )

    seed_pos_shift_remises(report)

    request.session["pos_shift"] = {
        "date": today.isoformat(),
        "shift": shift,
        "confirmed": bool(shift != time_shift),
    }

    return JsonResponse({
        "success": True,
        "shift_data": {
            "date": today.isoformat(),
            "shift": shift,
            "report_id": report.id,
            "is_closed": bool(report.closed_at),
            "cashier": employer.user.get_full_name() if employer and employer.user else "",
            "time_shift": time_shift,
            "needs_confirm": False,
        },
    })


@permission_required("noyau.view_pos", raise_exception=True)
def pos_resale_stock_receive(request):
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "Méthode non autorisée."}, status=405)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Données invalides."}, status=400)

    items = payload.get("items", [])
    if not items:
        return JsonResponse({"success": False, "error": "Aucune donnée à enregistrer."}, status=400)

    employer = getattr(request.user, "employer", None)
    now_dt = timezone.now()
    for item in items:
        product_id = item.get("product_id")
        quantity = clean_decimal(item.get("quantity"))
        if not product_id or quantity <= 0:
            continue
        product = get_object_or_404(SaleProduct, id=product_id)
        if product.product_type != "Vente en dépôt":
            continue
        ResaleDelivery.objects.create(
            product=product,
            quantity=quantity,
            delivered_at=now_dt,
            delivered_by=employer,
        )

    return JsonResponse({"success": True})


@permission_required("noyau.view_pos", raise_exception=True)
def pos_ar_stock_receive(request):
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "Méthode non autorisée."}, status=405)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Données invalides."}, status=400)

    items = payload.get("items", [])
    if not items:
        return JsonResponse({"success": False, "error": "Aucune donnée à enregistrer."}, status=400)

    employer = getattr(request.user, "employer", None)
    assigned_to = ""
    if employer and employer.user:
        assigned_to = employer.user.get_full_name()
    now_dt = timezone.now()

    missing = []
    for item in items:
        product_id = item.get("product_id")
        quantity = clean_decimal(item.get("quantity"))
        if not product_id or quantity <= 0:
            continue
        product = get_object_or_404(SaleProduct, id=product_id)
        if product.product_type != "Achat & Revente":
            continue
        inventory = RawMaterial.objects.filter(linked_product=product).first()
        if not inventory:
            missing.append(product.name)
            continue

        actual_quantity = quantity
        if inventory.stock_mode == "FEFO":
            remaining = quantity
            lots = RawMaterialLot.objects.filter(
                raw_material=inventory,
                quantity__gt=0,
            ).order_by(
                F("expiration_date").asc(nulls_last=True),
                "received_at",
                "id",
            )
            for lot in lots:
                if remaining <= 0:
                    break
                take = min(lot.quantity, remaining)
                lot.quantity = clean_decimal(lot.quantity) - take
                lot.save(update_fields=["quantity"])
                remaining -= take
            actual_quantity = quantity - remaining
            if actual_quantity <= 0:
                continue

        inventory.current_stock = clean_decimal(inventory.current_stock) - actual_quantity
        if inventory.current_stock < 0:
            inventory.current_stock = Decimal(0)
        inventory.save(update_fields=["current_stock"])

        StockMovement.objects.create(
            raw_material=inventory,
            quantity=actual_quantity,
            movement_type="Sortie",
            date=now_dt,
            assigned_to=assigned_to,
            destination="POS",
        )

    if missing:
        return JsonResponse({
            "success": False,
            "error": "Stock introuvable pour: " + ", ".join(missing),
        }, status=400)

    return JsonResponse({"success": True})


def _get_or_create_shift_report(request, shift_date, shift):
    employer = getattr(request.user, "employer", None)
    report, _ = PosShiftReport.objects.get_or_create(
        shift_date=shift_date,
        shift=shift,
        defaults={"cashier": employer},
    )
    if report.cashier is None:
        report.cashier = employer
        report.save()
    return report


@permission_required("noyau.view_pos", raise_exception=True)
def pos_shift_abimes(request):
    if request.method != "POST":
        return JsonResponse({"error": "Méthode non autorisée."}, status=405)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Données invalides."}, status=400)

    shift_date = parse_date(payload.get("date"), localdate())
    shift = normalize_shift(payload.get("shift"), default=get_current_shift(timezone.localtime()))
    items = payload.get("abimes", [])
    if not items:
        return JsonResponse({"error": "Aucune donnée à enregistrer."}, status=400)

    report = _get_or_create_shift_report(request, shift_date, shift)
    created = 0
    for item in items:
        product_id = item.get("product_id")
        quantity = clean_decimal(item.get("quantity"))
        if not product_id or quantity <= 0:
            continue
        product = get_object_or_404(SaleProduct, id=product_id)
        if not product.stock_known:
            continue
        if product.product_type in {"Vente en dépôt", "Achat & Revente"}:
            continue
        if SaleProduct.objects.filter(base_product_id=product.id).exists():
            continue
        PosShiftAbime.objects.create(
            report=report,
            product=product,
            quantity=quantity,
        )
        created += 1

    if created == 0:
        return JsonResponse({"error": "Aucun abîmé valide à enregistrer."}, status=400)

    return JsonResponse({"success": True})


@permission_required("noyau.view_pos", raise_exception=True)
def pos_shift_consumptions(request):
    if request.method != "POST":
        return JsonResponse({"error": "Méthode non autorisée."}, status=405)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Données invalides."}, status=400)

    shift_date = parse_date(payload.get("date"), localdate())
    shift = normalize_shift(payload.get("shift"), default=get_current_shift(timezone.localtime()))
    items = payload.get("consumptions", [])
    if not items:
        return JsonResponse({"error": "Aucune donnée à enregistrer."}, status=400)

    report = _get_or_create_shift_report(request, shift_date, shift)
    created = 0
    for item in items:
        person_name = (item.get("person_name") or "").strip()
        product_id = item.get("product_id")
        quantity = int(item.get("quantity") or 0)
        if not person_name or not product_id or quantity <= 0:
            continue
        product = get_object_or_404(SaleProduct, id=product_id)
        PosShiftConsumption.objects.create(
            report=report,
            person_name=person_name,
            product=product,
            quantity=quantity,
        )
        created += 1

    if created == 0:
        return JsonResponse({"error": "Aucune consommation valide à enregistrer."}, status=400)

    return JsonResponse({"success": True})


@permission_required("noyau.view_pos", raise_exception=True)
def pos_shift_expenses(request):
    if request.method != "POST":
        return JsonResponse({"error": "Méthode non autorisée."}, status=405)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Données invalides."}, status=400)

    shift_date = parse_date(payload.get("date"), localdate())
    shift = normalize_shift(payload.get("shift"), default=get_current_shift(timezone.localtime()))
    items = payload.get("expenses", [])
    if not items:
        return JsonResponse({"error": "Aucune donnée à enregistrer."}, status=400)

    report = _get_or_create_shift_report(request, shift_date, shift)
    created = 0
    for item in items:
        label = (item.get("label") or "").strip()
        amount = clean_decimal(item.get("amount"))
        if not label or amount <= 0:
            continue
        PosShiftExpense.objects.create(
            report=report,
            label=label,
            amount=amount,
        )
        created += 1

    if created == 0:
        return JsonResponse({"error": "Aucune dépense valide à enregistrer."}, status=400)

    return JsonResponse({"success": True})


@permission_required("noyau.view_pos", raise_exception=True)
def pos_shift_close(request):
    if request.method != "POST":
        return JsonResponse({"error": "Méthode non autorisée."}, status=405)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Données invalides."}, status=400)

    shift_date = parse_date(payload.get("date"), localdate())
    shift = normalize_shift(payload.get("shift"), default=get_current_shift(timezone.localtime()))
    employer = getattr(request.user, "employer", None)
    close_only = bool(payload.get("close_only"))

    report = PosShiftReport.objects.filter(
        shift_date=shift_date,
        shift=shift,
    ).first()
    if not report:
        return JsonResponse({"error": "Aucun shift à clôturer."}, status=404)
    if report.cashier and employer and report.cashier != employer:
        return JsonResponse({"error": "Shift attribué à un autre caissier."}, status=409)
    if report.cashier is None and employer:
        report.cashier = employer
        report.save(update_fields=["cashier"])
    if report.closed_at:
        return JsonResponse({"error": "Ce shift est déjà clôturé."}, status=409)

    if close_only:
        report.closed_at = timezone.now()
        report.save(update_fields=["closed_at"])
        report_payload = build_pos_shift_report_payload(report, shift_date, shift)
        return JsonResponse({"success": True, "report": report_payload})

    PosShiftAbime.objects.filter(report=report).delete()
    for item in payload.get("abimes", []):
        product_id = item.get("product_id")
        quantity = clean_decimal(item.get("quantity"))
        if not product_id or quantity <= 0:
            continue
        product = get_object_or_404(SaleProduct, id=product_id)
        if not product.stock_known:
            continue
        PosShiftAbime.objects.create(
            report=report,
            product=product,
            quantity=quantity,
        )

    PosShiftExpense.objects.filter(report=report).delete()
    for item in payload.get("expenses", []):
        label = (item.get("label") or "").strip()
        amount = clean_decimal(item.get("amount"))
        if not label or amount <= 0:
            continue
        PosShiftExpense.objects.create(
            report=report,
            label=label,
            amount=amount,
        )

    PosShiftConsumption.objects.filter(report=report).delete()
    for item in payload.get("consumptions", []):
        person_name = (item.get("person_name") or "").strip()
        product_id = item.get("product_id")
        quantity = int(item.get("quantity") or 0)
        if not person_name or not product_id or quantity <= 0:
            continue
        product = get_object_or_404(SaleProduct, id=product_id)
        PosShiftConsumption.objects.create(
            report=report,
            person_name=person_name,
            product=product,
            quantity=quantity,
        )

    report.closed_at = timezone.now()
    report.save()

    report_payload = build_pos_shift_report_payload(report, shift_date, shift)
    return JsonResponse({"success": True, "report": report_payload})


@permission_required("noyau.view_sale", raise_exception=True)
def pos_shift_report_data(request):
    if request.method != "GET":
        return JsonResponse({"error": "Méthode non autorisée."}, status=405)

    shift_date = parse_date(request.GET.get("date", ""), localdate())
    cashier_id = (request.GET.get("cashier_id") or "").strip()
    raw_shift = (request.GET.get("shift") or "").upper()

    if cashier_id:
        try:
            cashier_id_int = int(cashier_id)
        except (TypeError, ValueError):
            return JsonResponse({"error": "Caissier invalide."}, status=400)

        reports_qs = (
            PosShiftReport.objects.filter(shift_date=shift_date, cashier_id=cashier_id_int)
            .select_related("cashier__user")
            .order_by("shift")
        )
        reports = [
            build_pos_shift_report_payload(report, shift_date, report.shift)
            for report in reports_qs
        ]
        return JsonResponse({"success": True, "reports": reports})

    if raw_shift == "TOUS":
        reports = []
        for shift in ["MATIN", "SOIR"]:
            report = PosShiftReport.objects.filter(
                shift_date=shift_date,
                shift=shift,
            ).first()
            if report:
                reports.append(build_pos_shift_report_payload(report, shift_date, shift))
        return JsonResponse({"success": True, "reports": reports})

    shift = normalize_shift(raw_shift, default=get_current_shift(timezone.localtime()))
    report = PosShiftReport.objects.filter(
        shift_date=shift_date,
        shift=shift,
    ).first()
    if not report:
        return JsonResponse({"success": True, "report": None})

    payload = build_pos_shift_report_payload(report, shift_date, shift)
    return JsonResponse({"success": True, "report": payload})


@permission_required("noyau.view_sale", raise_exception=True)
def pos_shift_cashiers(request):
    if request.method != "GET":
        return JsonResponse({"error": "Méthode non autorisée."}, status=405)

    shift_date = parse_date(request.GET.get("date", ""), localdate())
    reports = (
        PosShiftReport.objects.filter(shift_date=shift_date)
        .select_related("cashier__user")
        .order_by("shift")
    )
    seen = set()
    cashiers = []
    for report in reports:
        cashier = report.cashier
        if not cashier or cashier.id in seen:
            continue
        seen.add(cashier.id)
        name = ""
        if cashier.user:
            name = cashier.user.get_full_name().strip() or cashier.user.username
        if not name:
            name = f"Caissier #{cashier.id}"
        cashiers.append({"id": cashier.id, "name": name})

    return JsonResponse({"success": True, "cashiers": cashiers})


@permission_required("noyau.view_sale", raise_exception=True)
def get_pos_shift_report_manage(request, report_id):
    if request.method != "GET":
        return JsonResponse({"success": False, "error": "Méthode non autorisée."}, status=405)

    report = get_object_or_404(
        PosShiftReport.objects.select_related("cashier__user").annotate(
            remises_count=Count("remises", distinct=True),
            abimes_count=Count("abimes", distinct=True),
            consumptions_count=Count("consumptions", distinct=True),
            expenses_count=Count("expenses", distinct=True),
        ),
        id=report_id,
    )
    return JsonResponse({"success": True, "report": serialize_pos_shift_report_row(report)})


@permission_required("noyau.change_posshiftreport", raise_exception=True)
def update_pos_shift_report_manage(request, report_id):
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "Méthode non autorisée."}, status=405)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Données invalides."}, status=400)

    report = get_object_or_404(PosShiftReport, id=report_id)

    shift_date = parse_date(payload.get("shift_date", ""), None)
    shift = normalize_shift((payload.get("shift") or "").upper(), default="MATIN")
    cashier_id = payload.get("cashier_id")
    opened_at = parse_local_datetime_input(payload.get("opened_at"))
    closed_at = parse_local_datetime_input(payload.get("closed_at"))
    note = (payload.get("note") or "").strip()

    if not shift_date:
        return JsonResponse({"success": False, "error": "Date de shift invalide."}, status=400)
    if not opened_at:
        return JsonResponse({"success": False, "error": "Date d'ouverture invalide."}, status=400)
    if closed_at and closed_at < opened_at:
        return JsonResponse({"success": False, "error": "La clôture doit être après l'ouverture."}, status=400)

    cashier = None
    if cashier_id not in [None, "", "null"]:
        try:
            cashier = Employer.objects.get(id=int(cashier_id))
        except (Employer.DoesNotExist, TypeError, ValueError):
            return JsonResponse({"success": False, "error": "Caissier invalide."}, status=400)

    conflict = PosShiftReport.objects.filter(shift_date=shift_date, shift=shift).exclude(id=report.id).exists()
    if conflict:
        return JsonResponse({"success": False, "error": "Un shift existe déjà pour cette date et ce créneau."}, status=400)

    report.shift_date = shift_date
    report.shift = shift
    report.cashier = cashier
    report.opened_at = opened_at
    report.closed_at = closed_at
    report.note = note
    report.save(update_fields=["shift_date", "shift", "cashier", "opened_at", "closed_at", "note"])

    report = (
        PosShiftReport.objects.select_related("cashier__user")
        .annotate(
            remises_count=Count("remises", distinct=True),
            abimes_count=Count("abimes", distinct=True),
            consumptions_count=Count("consumptions", distinct=True),
            expenses_count=Count("expenses", distinct=True),
        )
        .get(id=report.id)
    )
    return JsonResponse({"success": True, "report": serialize_pos_shift_report_row(report)})


@permission_required("noyau.delete_posshiftreport", raise_exception=True)
def delete_pos_shift_report_manage(request, report_id):
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "Méthode non autorisée."}, status=405)

    report = get_object_or_404(
        PosShiftReport.objects.annotate(
            remises_count=Count("remises", distinct=True),
            abimes_count=Count("abimes", distinct=True),
            consumptions_count=Count("consumptions", distinct=True),
            expenses_count=Count("expenses", distinct=True),
        ),
        id=report_id,
    )

    counts = {
        "remises": getattr(report, "remises_count", 0),
        "abimes": getattr(report, "abimes_count", 0),
        "consumptions": getattr(report, "consumptions_count", 0),
        "expenses": getattr(report, "expenses_count", 0),
    }
    report.delete()
    return JsonResponse({"success": True, "deleted_id": report_id, "counts": counts})

@permission_required("noyau.view_pos", raise_exception=True)
def add_transaction(request):
    if request.method != "POST":
        return JsonResponse({"error": "Méthode non autorisée."}, status=405)

    try:
        data = json.loads(request.body)

        method = (data.get("method") or "cash").strip().lower()
        if method not in {"cash", "card"}:
            method = "cash"

        gross_total = clean_decimal(data.get("gross_total", data.get("total", 0)))
        items = data.get("items", [])
        loyalty_id = data.get("loyalty_id")

        voucher_code = (data.get("voucher_code") or "").strip().upper()
        if voucher_code.startswith("BRM") and not voucher_code.startswith(VOUCHER_CODE_PREFIX) and len(voucher_code) > 3:
            voucher_code = f"{VOUCHER_CODE_PREFIX}{voucher_code[3:]}"
        issue_change_voucher = bool(data.get("issue_change_voucher"))
        cash_received = clean_decimal(data.get("cash_received", 0))
        pyromane_order_id = data.get("pyromane_order_id")

        pyromane_order = None
        if pyromane_order_id:
            try:
                pyromane_order = PyromaneOrder.objects.filter(id=int(pyromane_order_id)).first()
            except (TypeError, ValueError):
                pyromane_order = None
            if not pyromane_order:
                return JsonResponse({"error": "Commande Pyromane introuvable."}, status=404)
            if pyromane_order.status != "PENDING":
                return JsonResponse({"error": "Cette commande Pyromane est deja payee."}, status=400)

        voucher = None
        voucher_applied = Decimal("0.00")
        voucher_remainder = Decimal("0.00")

        if voucher_code:
            if not voucher_code.startswith(VOUCHER_CODE_PREFIX):
                return JsonResponse({"error": "Code de bon invalide."}, status=400)
            voucher = CashChangeVoucher.objects.filter(code=voucher_code).first()
            if not voucher:
                return JsonResponse({"error": "Bon de rendu monnaie introuvable."}, status=404)
            voucher = ensure_voucher_status(voucher)
            if voucher.status == "REDEEMED":
                return JsonResponse({"error": "Ce bon a deja ete utilise."}, status=400)
            if voucher.status == "VOID":
                return JsonResponse({"error": "Ce bon est annule."}, status=400)
            if voucher.status == "EXPIRED":
                return JsonResponse({"error": "Ce bon est expire."}, status=400)
            voucher_applied = min(_q(voucher.amount), _q(gross_total))
            voucher_remainder = _q(_q(voucher.amount) - voucher_applied)

        total = _q(_q(gross_total) - voucher_applied)
        if total < 0:
            total = Decimal("0.00")

        try:
            requested_points_redeemed = int(data.get("points_redeemed", 0) or 0)
        except (TypeError, ValueError):
            requested_points_redeemed = 0
        requested_points_redeemed = max(requested_points_redeemed, 0)

        employer = Employer.objects.filter(user=request.user).first()

        loyalty = None
        loyalty_points = 0
        loyalty_solde = Decimal("0.00")
        loyalty_remainder = Decimal("0.00")
        if loyalty_id not in [None, "", "null"]:
            try:
                loyalty = Loyalty.objects.filter(id=int(loyalty_id)).first()
            except (TypeError, ValueError):
                loyalty = None
            if loyalty is None:
                return JsonResponse({"error": "Carte de fidelite introuvable."}, status=400)
            loyalty_points = int(loyalty.points_balance or 0)
            loyalty_solde = points_to_solde(loyalty_points)
            loyalty_remainder = clean_decimal(loyalty.points_remainder)

        points_redeemed = 0
        points_earned = 0
        discount_amount = _q(voucher_applied)
        total_to_pay = _q(total)

        if loyalty:
            if method == "card":
                total_to_pay = _q(total)

                if (total_to_pay % POINT_TO_SOLDE_KMF) != 0:
                    return JsonResponse({"error": "Le paiement carte doit etre un multiple de 100 KMF."}, status=400)

                points_redeemed = int((total_to_pay / POINT_TO_SOLDE_KMF).to_integral_value(rounding=ROUND_DOWN))
                points_earned = 0
            else:
                points_redeemed = 0
                total_to_pay = _q(total)

                total_for_points = _q(loyalty_remainder + total_to_pay)
                points_earned = int((total_for_points / POINT_EARN_STEP).to_integral_value(rounding=ROUND_DOWN))
                loyalty_remainder = _q(total_for_points - (Decimal(points_earned) * POINT_EARN_STEP))

        redeem_solde_value = _q(Decimal(points_redeemed) * POINT_TO_SOLDE_KMF)

        if method == "card":
            if not loyalty:
                return JsonResponse({"error": "Une carte de fidelite est requise pour ce paiement."}, status=400)

            if points_redeemed > loyalty_points:
                return JsonResponse({"error": "Points insuffisants sur la carte."}, status=400)

            required_solde = redeem_solde_value
            if required_solde > loyalty_solde:
                return JsonResponse({"error": "Solde insuffisant sur la carte."}, status=400)
        else:
            if total_to_pay > 0 and cash_received < total_to_pay:
                return JsonResponse({"error": "Montant recu insuffisant."}, status=400)

        transaction = SaleTransaction.objects.create(
            employer=employer,
            loyalty=loyalty,
            gross_amount=_q(gross_total),
            discount_amount=_q(discount_amount),
            total_amount=_q(total_to_pay),
            date=timezone.now(),
            points_earned=points_earned,
            points_redeemed=points_redeemed,
        )

        if employer:
            tx_local = timezone.localtime(transaction.date)
            shift_date = tx_local.date()
            shift = get_current_shift(tx_local)
            _get_or_create_shift_report(request, shift_date, shift)

        for item in items:
            product_id = item.get("id")
            quantity = int(item.get("quantity") or 0)
            subtotal = clean_decimal(item.get("subtotal", 0))

            if quantity <= 0:
                continue

            product = SaleProduct.objects.get(id=product_id)
            SaleTransactionItem.objects.create(
                transaction=transaction,
                product=product,
                quantity=quantity,
                subtotal=_q(subtotal),
            )

        if loyalty:
            start_points = loyalty_points
            balance_after_redeem = max(start_points - points_redeemed, 0)
            balance_after_earn = balance_after_redeem + points_earned

            if points_redeemed > 0:
                LoyaltyPointLedger.objects.create(
                    loyalty=loyalty,
                    transaction=transaction,
                    move_type="Paiement" if method == "card" else "Remise",
                    points=-points_redeemed,
                    balance_after=balance_after_redeem,
                    date=timezone.now(),
                    note=f"Paiement par points ({points_redeemed})" if method == "card" else f"Remise de {points_redeemed} points",
                )

            if points_earned > 0:
                LoyaltyPointLedger.objects.create(
                    loyalty=loyalty,
                    transaction=transaction,
                    move_type="Gain",
                    points=points_earned,
                    balance_after=balance_after_earn,
                    date=timezone.now(),
                    note=f"Points gagnes sur ticket #{transaction.id}",
                )

            loyalty.points_balance = balance_after_earn
            loyalty.solde = points_to_solde(balance_after_earn)
            loyalty.points_remainder = loyalty_remainder
            loyalty.save()

        if pyromane_order:
            pyromane_order.status = "PAID"
            pyromane_order.paid_at = timezone.now()
            pyromane_order.paid_by = employer
            pyromane_order.transaction = transaction
            pyromane_order.save(update_fields=["status", "paid_at", "paid_by", "transaction"])

        vouchers_to_print = []
        if voucher:
            voucher.status = "REDEEMED"
            voucher.redeemed_at = timezone.now()
            voucher.redeemed_transaction = transaction
            voucher.save(update_fields=["status", "redeemed_at", "redeemed_transaction"])

            if voucher_remainder > 0:
                remainder_voucher = create_change_voucher(voucher_remainder, employer, transaction)
                if remainder_voucher:
                    vouchers_to_print.append(serialize_change_voucher(remainder_voucher))

        if method == "cash" and issue_change_voucher and total_to_pay > 0:
            change_amount = _q(cash_received - total_to_pay)
            if change_amount > 0:
                change_voucher = create_change_voucher(change_amount, employer, transaction)
                if change_voucher:
                    vouchers_to_print.append(serialize_change_voucher(change_voucher))

        return JsonResponse({
            "success": True,
            "transaction_id": transaction.id,
            "total_amount": float(total_to_pay),
            "points_earned": points_earned,
            "points_redeemed": points_redeemed,
            "discount_amount": float(discount_amount),
            "voucher_applied": float(voucher_applied),
            "vouchers_to_print": vouchers_to_print,
        })

    except Exception:
        logger.exception("Erreur lors de la creation de la transaction POS.")
        return JsonResponse({"error": "Une erreur est survenue lors du traitement."}, status=400)

def remove_accents(text):
    return ''.join(
        c for c in unicodedata.normalize('NFD', text)
        if unicodedata.category(c) != 'Mn'
    )


def build_escpos_qr(data: str, size: int = 6, error: str = "M") -> str:
    error_map = {"L": 48, "M": 49, "Q": 50, "H": 51}
    err_value = error_map.get(error.upper(), 49)
    payload = data.encode("utf-8")
    store_len = len(payload) + 3
    pL = store_len % 256
    pH = store_len // 256
    qr_bytes = (
        b"\x1d\x28\x6b\x04\x00\x31\x41\x32"
        + b"\x1d\x28\x6b\x03\x00\x31\x43" + bytes([size])
        + b"\x1d\x28\x6b\x03\x00\x31\x45" + bytes([err_value])
        + b"\x1d\x28\x6b" + bytes([pL, pH]) + b"\x31\x50\x30" + payload
        + b"\x1d\x28\x6b\x03\x00\x31\x51\x30"
    )
    return qr_bytes.decode("latin-1")


@permission_required("noyau.view_pos", raise_exception=True)
def pos_voucher_scan(request):
    if request.method != "GET":
        return JsonResponse({"error": "Méthode non autorisée."}, status=405)

    code = (request.GET.get("code") or "").strip().upper()
    if code.startswith("BRM") and not code.startswith(VOUCHER_CODE_PREFIX) and len(code) > 3:
        code = f"{VOUCHER_CODE_PREFIX}{code[3:]}"
    if not code or not code.startswith(VOUCHER_CODE_PREFIX):
        return JsonResponse({"error": "Code de bon invalide."}, status=400)

    voucher = CashChangeVoucher.objects.filter(code=code).first()
    if not voucher:
        return JsonResponse({"error": "Bon de rendu monnaie introuvable."}, status=404)

    voucher = ensure_voucher_status(voucher)
    if voucher.status == "REDEEMED":
        return JsonResponse({"error": "Ce bon a deja ete utilise."}, status=400)
    if voucher.status == "VOID":
        return JsonResponse({"error": "Ce bon est annule."}, status=400)
    if voucher.status == "EXPIRED":
        return JsonResponse({"error": "Ce bon est expire."}, status=400)

    return JsonResponse({
        "success": True,
        "voucher": {
            "code": voucher.code,
            "amount": float(voucher.amount),
            "expires_at": timezone.localtime(voucher.expires_at).strftime("%d/%m/%Y"),
        },
    })


@permission_required("noyau.view_pos", raise_exception=True)
def print_change_voucher(request):
    if request.method != "POST":
        return JsonResponse({"error": "Méthode non autorisée."}, status=405)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Données invalides."}, status=400)

    code = (payload.get("code") or "").strip().upper()
    if code.startswith("BRM") and not code.startswith(VOUCHER_CODE_PREFIX) and len(code) > 3:
        code = f"{VOUCHER_CODE_PREFIX}{code[3:]}"
    if not code:
        return JsonResponse({"error": "Code de bon manquant."}, status=400)

    voucher = CashChangeVoucher.objects.filter(code=code).first()
    if not voucher:
        return JsonResponse({"error": "Bon de rendu monnaie introuvable."}, status=404)

    issued_at = timezone.localtime(voucher.issued_at or timezone.now())
    expires_at = timezone.localtime(voucher.expires_at)
    cashier = "—"
    if voucher.issued_by and voucher.issued_by.user:
        cashier_name = f"{voucher.issued_by.user.first_name} {voucher.issued_by.user.last_name}".strip()
        cashier = cashier_name or voucher.issued_by.user.username

    ticket_id = voucher.issued_transaction.id if voucher.issued_transaction else "—"
    amount = f"{_q(voucher.amount)} KMF"

    try:
        TICKET_WIDTH = 48
        voucher_text = chr(27) + chr(64)
        voucher_text += "SALIMAMOUD".center(TICKET_WIDTH) + "\n"
        voucher_text += "BON DE RENDU MONNAIE".center(TICKET_WIDTH) + "\n"
        voucher_text += "-" * TICKET_WIDTH + "\n"
        voucher_text += f"DATE    : {issued_at.strftime('%d/%m/%Y')}\n"
        voucher_text += f"HEURE   : {issued_at.strftime('%H:%M')}\n"
        voucher_text += f"BON N°  : {voucher.code}\n"
        voucher_text += f"TICKET  : {ticket_id}\n"
        voucher_text += "-" * TICKET_WIDTH + "\n"
        voucher_text += "MONTANT".center(TICKET_WIDTH) + "\n"
        voucher_text += amount.center(TICKET_WIDTH) + "\n"
        voucher_text += "-" * TICKET_WIDTH + "\n"
        voucher_text += chr(27) + chr(97) + chr(1)
        voucher_text += build_escpos_qr(voucher.code)
        voucher_text += chr(27) + chr(97) + chr(0)
        voucher_text += "\n"
        voucher_text += "Valable uniquement chez Salimamoud".center(TICKET_WIDTH) + "\n"
        voucher_text += "Utilisable comme paiement".center(TICKET_WIDTH) + "\n"
        voucher_text += "Non echangeable contre l'argent".center(TICKET_WIDTH) + "\n"
        voucher_text += f"Valable {VOUCHER_EXPIRY_DAYS} jours".center(TICKET_WIDTH) + "\n"
        voucher_text += f"Expire le : {expires_at.strftime('%d/%m/%Y')}\n"
        voucher_text += f"Caissier : {cashier}\n"
        voucher_text += "\n" * 4
        voucher_text += chr(27) + chr(105)

        voucher_text = remove_accents(voucher_text)
        return JsonResponse({"success": True, "text": voucher_text})
    except Exception:
        logger.exception("Erreur lors de la generation du bon de rendu monnaie.")
        return JsonResponse({"error": "Une erreur est survenue lors de la generation du bon."}, status=400)

@permission_required("noyau.view_pos", raise_exception=True)
def print_ticket(request):
    if request.method != "POST":
        return JsonResponse({"error": "Méthode non autorisée."}, status=405)

    try:
        data = json.loads(request.body or "{}")
        transaction_id = data.get("transaction_id")
        transaction = None
        if transaction_id not in [None, "", "null"]:
            try:
                transaction = (
                    SaleTransaction.objects
                    .select_related("employer__user")
                    .filter(id=int(transaction_id))
                    .first()
                )
            except (TypeError, ValueError):
                transaction = None

        if not transaction:
            transaction = (
                SaleTransaction.objects
                .select_related("employer__user")
                .order_by("-id")
                .first()
            )

        if not transaction:
            return JsonResponse({"error": "Aucune transaction trouvée."}, status=400)

        items = list(
            SaleTransactionItem.objects
            .select_related("product")
            .filter(transaction=transaction)
            .order_by("id")
        )
        payload_items = data.get("items", [])
        total = _q(transaction.total_amount)
        TICKET_WIDTH = 48
        issued_vouchers = list(
            transaction.change_vouchers_issued.order_by("issued_at", "id")
        )
        tx_local = timezone.localtime(transaction.date)
        cashier = "—"
        if transaction.employer and transaction.employer.user:
            cashier_name = f"{transaction.employer.user.first_name} {transaction.employer.user.last_name}".strip()
            cashier = cashier_name or transaction.employer.user.username

        # ---------------------------
        # RÉGLAGES D'IMPRESSION THERMIQUE
        # ---------------------------
        ticket_text  = chr(27) + chr(64)      

        # ---------------------------
        # EN-TÊTE
        # ---------------------------
        ticket_text += "SALIMAMOUD".center(TICKET_WIDTH) + "\n"
        ticket_text += "Salon de the".center(TICKET_WIDTH) + "\n"
        ticket_text += "Comores, Moroni".center(TICKET_WIDTH) + "\n"
        ticket_text += "-" * TICKET_WIDTH + "\n"
        ticket_text += f"DATE    : {tx_local.strftime('%d/%m/%Y')}\n"
        ticket_text += f"HEURE   : {tx_local.strftime('%H:%M')}\n"
        ticket_text += f"TICKET  : {transaction.id}\n"
        ticket_text += f"CAISSIER: {cashier}\n"
        ticket_text += "-" * TICKET_WIDTH + "\n"

        # ---------------------------
        # ARTICLES
        # ---------------------------
        rendered_items = items
        if not rendered_items and payload_items:
            fallback_items = []
            for item in payload_items:
                product_id = item.get("id")
                quantity = int(item.get("quantity", 1) or 1)
                subtotal = clean_decimal(item.get("subtotal", 0))
                product = SaleProduct.objects.filter(id=product_id).first()
                fallback_items.append({
                    "name": product.name if product else "Produit inconnu",
                    "quantity": quantity,
                    "subtotal": subtotal,
                })
            rendered_items = fallback_items

        for item in rendered_items:
            if isinstance(item, SaleTransactionItem):
                article = item.product.name.capitalize() if item.product else "Produit inconnu"
                quantity = item.quantity
                subtotal = _q(item.subtotal)
            else:
                article = (item.get("name") or "Produit inconnu").capitalize()
                quantity = item.get("quantity", 1)
                subtotal = _q(clean_decimal(item.get("subtotal", 0)))

            article_text = f"{article} x{quantity}"
            prix = f"{_q(clean_decimal(subtotal))} KMF"
            espaces = TICKET_WIDTH - len(article_text) - len(prix)
            ticket_text += article_text + " " * max(1, espaces) + prix + "\n"

        # ---------------------------
        # TOTAL
        # ---------------------------
        ticket_text += "-" * TICKET_WIDTH + "\n"
        total_line = f"TOTAL"
        total_label = f"{_q(total)} KMF"
        espaces_total = TICKET_WIDTH - len(total_line) - len(total_label)
        ticket_text += total_line + " " * max(1, espaces_total) + f"{total_label}\n"
        ticket_text += "-" * TICKET_WIDTH + "\n\n"

        # ---------------------------
        # BON DE RENDU / RESTE A UTILISER
        # ---------------------------
        voucher_section = ""
        if issued_vouchers:
            voucher_section += "-" * TICKET_WIDTH + "\n"
            for voucher in issued_vouchers:
                voucher_amount = f"{_q(voucher.amount)} KMF"
                voucher_section += chr(27) + chr(97) + chr(1)
                voucher_section += "\n"
                voucher_section += "MONTANT\n"
                voucher_section += voucher_amount + "\n\n"
                voucher_section += build_escpos_qr(voucher.code)
                voucher_section += chr(27) + chr(97) + chr(0)
                voucher_section += "\n\n"
            voucher_section += "-" * TICKET_WIDTH + "\n"

        # ---------------------------
        # MESSAGE DE FIN
        # ---------------------------
        ticket_text += "MERCI".center(TICKET_WIDTH) + "\n"
        ticket_text += "BONNE JOURNEE".center(TICKET_WIDTH) + "\n"
        if voucher_section:
            ticket_text += "\n"
            ticket_text += voucher_section

        # ---------------------------
        # FEED + CUT
        # ---------------------------
        ticket_text += "\n" * 6
        ticket_text += chr(27) + chr(105)  # ESC i = couper le papier

        # ---------------------------
        # SUPPRESSION DES ACCENTS POUR ESC/POS
        # ---------------------------
        ticket_text = remove_accents(ticket_text)

        return JsonResponse({'success': True, 'text': ticket_text})

    except Exception:
        logger.exception("Erreur lors de la generation du ticket POS.")
        return JsonResponse({"error": "Une erreur est survenue lors de la generation du ticket."}, status=400)

def save_bakery(file, name):
    return _save_uploaded_image(file, name, "bakeries")

def default_image_bakery(name):
    clean_name = name.replace(" ", "_")
    unique_name = f"{clean_name}.png"
    
    folder = os.path.join(settings.MEDIA_ROOT, "bakeries")
    
    os.makedirs(folder, exist_ok=True)
    dest_path = os.path.join(folder, unique_name)
    
    src_path = os.path.join(settings.BASE_DIR, "static", "img", "logo", "salimamoud.png")
    
    shutil.copy(src_path, dest_path)

    return os.path.join("bakeries", unique_name)


@permission_required("noyau.view_bakeryproduct", raise_exception=True)
def view_bakeryproduct(request):
    
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    products = BakeryProduct.objects.all().order_by("-id")
    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "products": products,
    }
    if request.method == "POST":
        name = request.POST.get("name", "").strip()
        price = clean_decimal(request.POST.get("price", "").strip())
        image = request.FILES.get("image")
        type = request.POST.get("type", "").strip()
        category = request.POST.get("category", "").strip()
        if type == "add":
            if not request.user.has_perm("noyau.add_bakeryproduct"):
                raise PermissionDenied
            if image:
                image_path = save_bakery(image, name)
            else:
                image_path = default_image_bakery(name)
                
            BakeryProduct.objects.create(
                name=name,
                price=price,
                image=image_path,
                category=category
            )
        if type == "change":
            if not request.user.has_perm("noyau.change_bakeryproduct"):
                raise PermissionDenied
            product_id = request.POST.get("product_id", "").strip()
            product = get_object_or_404(BakeryProduct, id=product_id)
            if image:
                if product and product.image:
                    old_image_path = os.path.join(settings.MEDIA_ROOT, product.image)
                    if os.path.exists(old_image_path):
                        os.remove(old_image_path)
                        
                image_path = save_bakery(image, name)
                product.image=image_path
                
            product.name=name
            product.price=price
            product.category=category
            product.save()
        return redirect("view_bakeryproduct")
    return render(request, "bakeryproduct/view_bakeryproduct.html", context)

@permission_required("noyau.view_bakeryproduct", raise_exception=True)
def get_bakeryproduct(request, product_id):
    
    try:
        product = BakeryProduct.objects.get(id=product_id)

        data = {
            "name": product.name,
            "price": float(product.price),
            "image": product.image,
            "category": product.category,
        }
        return JsonResponse({"success": True, "product": data})
    except BakeryProduct.DoesNotExist:
        return JsonResponse({"error": "Produit introuvable."}, status=404)

@permission_required("noyau.delete_bakeryproduct", raise_exception=True)
def delete_bakeryproduct(request, product_id):
    
    product = get_object_or_404(BakeryProduct, id=product_id)
    if product and product.image:
        old_image_path = os.path.join(settings.MEDIA_ROOT, product.image)
        if os.path.exists(old_image_path):
            os.remove(old_image_path)
    product.delete()
    return redirect("view_bakeryproduct")

@permission_required("noyau.view_bakery", raise_exception=True)
def view_bakery(request):
    
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    data = []
    products = BakeryProduct.objects.order_by('name').all()
    for product in products:
        data.append({
            'id': product.id,
            'image': product.image,
            'price': float(product.price),
            'name': product.name,
            'category': product.category,
        })
    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "products": data,
    }
    return render(request, "bakery/view_bakery.html", context)

@permission_required("noyau.view_bakery", raise_exception=True)
def order_confirmation(request):
    
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
    }
    if request.method == "POST":
        name = request.POST.get("name", "").strip()
        phone = request.POST.get("phone", "").strip()
        payment_method = request.POST.get("payment_method", "Espèces")
        items_json = request.POST.get("items", "{}")
        pickup_date = request.POST.get("pickup_date", "").strip()
        time = request.POST.get("time", "").strip()

        # Décoder JSON en liste de dictionnaires
        try:
            items = json.loads(items_json)  # Transforme la chaîne JSON en dict
        except json.JSONDecodeError:
            items = {}

        total_amount = sum(item['quantity'] * item['price'] for item in items.values())

        employer = getattr(request.user, "employer", None)
        sale = BakerySale.objects.create(
            date=timezone.now(),
            pickup_date=pickup_date,
            employer=employer,
            client=name,
            phone=phone,
            total_amount=total_amount,
            payment_method=payment_method,
            is_paid=False,
            time=time  
        )

        for item in items.values():
            product_id = item['id']
            quantity = item['quantity']
            subtotal = quantity * item['price']
            
            # Récupérer le produit correspondant
            product = BakeryProduct.objects.get(id=product_id)
            
            BakerySaleItem.objects.create(
                bakery=sale,
                product=product,
                quantity=quantity,
                subtotal=subtotal
            )

        return redirect("view_bakery")
    return render(request, "bakery/confirmation.html", context)

@permission_required("noyau.view_sale", raise_exception=True)
def view_sale(request):
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""

    transactions_qs = (
        SaleTransaction.objects
        .select_related("employer__user", "loyalty")
        .order_by("-date")
    )

    transactionData = []
    total_pos_gross = Decimal("0.00")
    total_pos_discount = Decimal("0.00")
    total_pos_net = Decimal("0.00")
    total_points_earned = 0
    total_points_redeemed = 0

    for transaction in transactions_qs:
        username = (
            transaction.employer.user.username
            if transaction.employer and getattr(transaction.employer, "user", None)
            else "-"
        )
        client = transaction.loyalty.client if transaction.loyalty else "Comptoir"
        payment_method = "Carte fidélité" if transaction.loyalty else "Espèces"

        gross_amount = clean_decimal(transaction.gross_amount or transaction.total_amount)
        discount_amount = clean_decimal(transaction.discount_amount)
        total_amount = clean_decimal(transaction.total_amount)

        points_earned = int(transaction.points_earned or 0)
        points_redeemed = int(transaction.points_redeemed or 0)

        total_pos_gross += gross_amount
        total_pos_discount += discount_amount
        total_pos_net += total_amount
        total_points_earned += points_earned
        total_points_redeemed += points_redeemed

        transactionData.append(
            {
                "id": transaction.id,
                "username": username,
                "client": client,
                "payment_method": payment_method,
                "gross_amount": float(gross_amount),
                "discount_amount": float(discount_amount),
                "total_amount": float(total_amount),
                "points_earned": points_earned,
                "points_redeemed": points_redeemed,
                "date": transaction.date.strftime("%d/%m/%Y"),
                "time": transaction.date.strftime("%H:%M"),
            }
        )

    usernames = sorted(
        {
            username
            for username in transactions_qs.values_list("employer__user__username", flat=True)
            if username
        }
    )
    usernameData = [{"username": username} for username in usernames]

    sales_qs = (
        BakerySale.objects
        .select_related("employer__user")
        .filter(is_paid=True)
        .order_by("-pickup_date", "-date")
    )

    saleData = []
    total_bakery_net = Decimal("0.00")

    for sale in sales_qs:
        username = (
            sale.employer.user.username
            if sale.employer and getattr(sale.employer, "user", None)
            else "-"
        )
        pickup_reference_date = sale.pickup_date if sale.pickup_date else sale.date.date()
        pickup_time = sale.time.strftime("%H:%M") if sale.time else "-"
        total_amount = clean_decimal(sale.total_amount)

        total_bakery_net += total_amount

        saleData.append(
            {
                "id": sale.id,
                "payment_method": sale.payment_method or "-",
                "username": username,
                "client": sale.client if sale.client else "-",
                "phone": sale.phone if sale.phone else "-",
                "total_amount": float(total_amount),
                "date": sale.date.strftime("%d/%m/%Y"),
                "pickup_date": pickup_reference_date.strftime("%d/%m/%Y"),
                "pickup_time": pickup_time,
            }
        )

    employers = sorted(
        {
            username
            for username in sales_qs.values_list("employer__user__username", flat=True)
            if username
        }
    )
    employerData = [{"username": username} for username in employers]

    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "transactions": transactionData,
        "sales": saleData,
        "usernames": usernameData,
        "employers": employerData,
        "pos_summary": {
            "count": len(transactionData),
            "gross_amount": float(total_pos_gross),
            "discount_amount": float(total_pos_discount),
            "net_amount": float(total_pos_net),
            "points_earned": total_points_earned,
            "points_redeemed": total_points_redeemed,
        },
        "bakery_summary": {
            "count": len(saleData),
            "net_amount": float(total_bakery_net),
        },
        "overall_summary": {
            "count": len(transactionData) + len(saleData),
            "net_amount": float(total_pos_net + total_bakery_net),
        },
    }
    return render(request, "sale/view_sale.html", context)


def view_pos_shift_reports(request):
    if not can_manage_pos_shift_reports(request.user):
        raise PermissionDenied

    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""

    shift_reports_qs = (
        PosShiftReport.objects
        .select_related("cashier__user")
        .annotate(
            remises_count=Count("remises", distinct=True),
            abimes_count=Count("abimes", distinct=True),
            consumptions_count=Count("consumptions", distinct=True),
            expenses_count=Count("expenses", distinct=True),
        )
        .order_by("-shift_date", "-shift", "-opened_at")
    )
    shift_reports = [serialize_pos_shift_report_row(report) for report in shift_reports_qs]

    shift_cashiers = []
    for employer in Employer.objects.select_related("user").order_by("user__first_name", "user__last_name"):
        if not employer.user:
            continue
        label = employer.user.get_full_name().strip() or employer.user.username
        shift_cashiers.append({"id": employer.id, "name": label})

    today = localdate()
    total_reports = shift_reports_qs.count()
    open_reports = shift_reports_qs.filter(closed_at__isnull=True).count()
    closed_reports = total_reports - open_reports
    today_reports = shift_reports_qs.filter(shift_date=today).count()

    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "shift_reports": shift_reports,
        "shift_cashiers": shift_cashiers,
        "can_change_shift_reports": request.user.has_perm("noyau.change_posshiftreport"),
        "can_delete_shift_reports": request.user.has_perm("noyau.delete_posshiftreport"),
        "shift_summary": {
            "total": total_reports,
            "open": open_reports,
            "closed": closed_reports,
            "today": today_reports,
        },
    }
    return render(request, "pos/view_shift_reports.html", context)


@permission_required("noyau.view_cashchangevoucher", raise_exception=True)
def view_cash_change_vouchers(request):
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""

    now = timezone.now()
    CashChangeVoucher.objects.filter(status="ISSUED", expires_at__lt=now).update(status="EXPIRED")

    vouchers_qs = (
        CashChangeVoucher.objects
        .select_related("issued_by__user", "issued_transaction", "redeemed_transaction")
        .order_by("-issued_at")
    )

    query = (request.GET.get("q") or "").strip()
    status_filter = (request.GET.get("status") or "").strip().upper()
    start_date = parse_date(request.GET.get("start", ""), None)
    end_date = parse_date(request.GET.get("end", ""), None)

    if query:
        if query.isdigit():
            vouchers_qs = vouchers_qs.filter(
                Q(issued_transaction__id=int(query)) | Q(redeemed_transaction__id=int(query))
            )
        else:
            vouchers_qs = vouchers_qs.filter(
                Q(code__icontains=query)
                | Q(issued_by__user__username__icontains=query)
                | Q(issued_by__user__first_name__icontains=query)
                | Q(issued_by__user__last_name__icontains=query)
            )

    if status_filter == "ACTIVE":
        vouchers_qs = vouchers_qs.filter(status="ISSUED", expires_at__gte=now)
    elif status_filter in {"ISSUED", "REDEEMED", "EXPIRED", "VOID"}:
        vouchers_qs = vouchers_qs.filter(status=status_filter)

    if start_date:
        vouchers_qs = vouchers_qs.filter(issued_at__date__gte=start_date)
    if end_date:
        vouchers_qs = vouchers_qs.filter(issued_at__date__lte=end_date)

    total_count = vouchers_qs.count()
    total_amount = vouchers_qs.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    issued_count = vouchers_qs.filter(status="ISSUED").count()
    redeemed_count = vouchers_qs.filter(status="REDEEMED").count()
    expired_count = vouchers_qs.filter(status="EXPIRED").count()
    void_count = vouchers_qs.filter(status="VOID").count()
    active_count = vouchers_qs.filter(status="ISSUED", expires_at__gte=now).count()

    issued_amount = vouchers_qs.filter(status="ISSUED").aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    redeemed_amount = vouchers_qs.filter(status="REDEEMED").aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    expired_amount = vouchers_qs.filter(status="EXPIRED").aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    void_amount = vouchers_qs.filter(status="VOID").aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "vouchers": vouchers_qs,
        "filters": {
            "q": query,
            "status": status_filter,
            "start": start_date.isoformat() if start_date else "",
            "end": end_date.isoformat() if end_date else "",
        },
        "summary": {
            "total_count": total_count,
            "total_amount": total_amount,
            "active_count": active_count,
            "issued_count": issued_count,
            "redeemed_count": redeemed_count,
            "expired_count": expired_count,
            "void_count": void_count,
            "issued_amount": issued_amount,
            "redeemed_amount": redeemed_amount,
            "expired_amount": expired_amount,
            "void_amount": void_amount,
        },
    }
    return render(request, "voucher/view_vouchers.html", context)

@permission_required("noyau.view_sale", raise_exception=True)
def get_sale(request, sale_id):
    
    try:
        sales = BakerySaleItem.objects.filter(bakery_id=sale_id)
        data = []
        for sale in sales:
            data.append({
                'name': sale.product.name,
                'image': sale.product.image,
                'price': float(sale.product.price),
                'quantity': sale.quantity,
                'subtotal': float(sale.subtotal),
            })
        return JsonResponse({"success": True, "sales": data})
    except BakerySaleItem.DoesNotExist:
        return JsonResponse({"error": "Produit introuvable."}, status=404)

@permission_required("noyau.view_sale", raise_exception=True)
def get_transaction(request, transaction_id):
    
    try:
        transactions = SaleTransactionItem.objects.filter(transaction_id=transaction_id)
        data = []
        for transaction in transactions:
            data.append({
                'name': transaction.product.name,
                'image': transaction.product.image,
                'price': float(transaction.product.unit_price),
                'quantity': transaction.quantity,
                'subtotal': float(transaction.subtotal),
            })
        return JsonResponse({"success": True, "transactions": data})
    except SaleTransactionItem.DoesNotExist:
        return JsonResponse({"error": "Produit introuvable."}, status=404)

@permission_required("noyau.view_pos", raise_exception=True)
def view_order(request):
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    sales = (
        BakerySale.objects
        .prefetch_related("bakerysaleitem_set__product")
        .filter(is_paid=False)
        .order_by("pickup_date")
    )

    orders = []
    total_orders = sales.count()

    for sale in sales:
        items = sale.bakerysaleitem_set.all()
        order_items = []
        item_count = items.count()

        for item in items:
            order_items.append({
                "name": item.product.name if item.product else "",
                "quantity": item.quantity,
                "subtotal": float(item.subtotal),
                "image": item.product.image if item.product else None,
            })

        orders.append({
            "id": sale.id,
            "client": sale.client,
            "phone": f"Téléphone : {sale.phone}",
            "order_number": f"Commande #{sale.id}",
            "pickup_date": sale.pickup_date.strftime("%d/%m/%Y") if sale.pickup_date else "",
            "total_amount": sale.total_amount,
            "payment_method": sale.payment_method,
            "items": order_items,
            "item_count": item_count,
            "time": sale.time.strftime("%H:%M") if sale.time else "",
        })

    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "total_orders": total_orders,
        "orders": orders,
    }

    return render(request, "pos/view_order.html", context)


@permission_required("noyau.view_pos", raise_exception=True)
def bakery_orders_pending_count(request):
    if request.method != "GET":
        return JsonResponse({"error": "Méthode non autorisée."}, status=405)

    pending_count = BakerySale.objects.filter(is_paid=False).count()
    return JsonResponse({"success": True, "count": pending_count})


@permission_required("noyau.view_pos", raise_exception=True)
def confirmation_pos(request, sale_id):
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    sale = get_object_or_404(BakerySale, id=sale_id)

    items = sale.bakerysaleitem_set.all()
    order_items = []
    item_count = items.count()

    for item in items:
        order_items.append({
            "name": item.product.name if item.product else "",
            "quantity": item.quantity,
            "subtotal": float(item.subtotal),
            "price": float(item.product.price) if item.product else 0,
            "image": item.product.image if item.product else None,
        })

    data = {
        "id": sale.id,
        "client": sale.client,
        "phone": f"Téléphone : {sale.phone}",
        "order_number": f"Commande #{sale.id}",
        "time": sale.time.strftime("%H:%M") if sale.time else "",
        "total_amount": sale.total_amount,
        "payment_method": sale.payment_method,
        "items": order_items,
        "item_count": item_count,
    }

    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "sale": data,
        "sale_id": sale_id
    }

    return render(request, "pos/confirmation.html", context)

@permission_required("noyau.view_pos", raise_exception=True)
def print_bakery(request,sale_id):
    if request.method != "POST":
        return JsonResponse({"error": "Méthode non autorisée."}, status=405)

    try:
        last_transaction = SaleTransaction.objects.order_by("-id").first()
        if not last_transaction:
            return JsonResponse({"error": "Aucune transaction trouvée."}, status=400)

        data = json.loads(request.body)
        sale = get_object_or_404(BakerySale, id=sale_id)
        items = sale.bakerysaleitem_set.all()
        payment_method = data.get("payment_method", "")
        sale.payment_method = payment_method
        sale.is_paid = True
        sale.paid_at = timezone.now()
        sale.paid_by = getattr(request.user, "employer", None)
        sale.save()
        
        
        TICKET_WIDTH = 48

        # ---------------------------
        # RÉGLAGES D'IMPRESSION THERMIQUE
        # ---------------------------
        ticket_text  = chr(27) + chr(64)      

        # ---------------------------
        # EN-TÊTE
        # ---------------------------
        ticket_text += "SALIMAMOUD".center(TICKET_WIDTH) + "\n"
        ticket_text += "Boulangerie".center(TICKET_WIDTH) + "\n"
        ticket_text += "Comores, Moroni".center(TICKET_WIDTH) + "\n"
        ticket_text += "-" * TICKET_WIDTH + "\n"
        ticket_date = sale.paid_at or sale.date
        ticket_text += f"DATE    : {ticket_date.strftime('%d/%m/%Y')}\n"
        ticket_text += f"TICKET  : {sale.id}\n"
        ticket_text += "-" * TICKET_WIDTH + "\n"

        # ---------------------------
        # ARTICLES
        # ---------------------------
        for item in items:
            quantity = item.quantity
            subtotal = float(item.subtotal)
            article = item.product.name.capitalize()

            article_text = f"{article} x{quantity}"
            prix = f"{subtotal} KMF"
            espaces = TICKET_WIDTH - len(article_text) - len(prix)
            ticket_text += article_text + " " * max(1, espaces) + prix + "\n"

        # ---------------------------
        # TOTAL
        # ---------------------------
        ticket_text += "-" * TICKET_WIDTH + "\n"
        total_line = f"TOTAL"
        espaces_total = TICKET_WIDTH - len(total_line) - len(f"{sale.total_amount} KMF")
        ticket_text += total_line + " " * max(1, espaces_total) + f"{sale.total_amount} KMF\n"
        ticket_text += "-" * TICKET_WIDTH + "\n\n"

        # ---------------------------
        # MESSAGE DE FIN
        # ---------------------------
        ticket_text += "MERCI".center(TICKET_WIDTH) + "\n"
        ticket_text += "BONNE JOURNEE".center(TICKET_WIDTH) + "\n"

        # ---------------------------
        # FEED + CUT
        # ---------------------------
        ticket_text += "\n" * 6
        ticket_text += chr(27) + chr(105)  # ESC i = couper le papier

        # ---------------------------
        # SUPPRESSION DES ACCENTS POUR ESC/POS
        # ---------------------------
        ticket_text = remove_accents(ticket_text)

        return JsonResponse({'success': True, 'text': ticket_text})

    except Exception:
        logger.exception("Erreur lors de la generation du ticket boulangerie.")
        return JsonResponse({"error": "Une erreur est survenue lors de la generation du ticket."}, status=400)

@permission_required("noyau.view_bakery", raise_exception=True)
def prep_screen(request):
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    sales = BakerySale.objects.prefetch_related("bakerysaleitem_set__product").filter(is_paid=False).order_by("pickup_date","time")

    # Transformer les données pour le template
    orders = []
    total_orders = sales.count()
    for sale in sales:
        items = sale.bakerysaleitem_set.all()
        order_items = []
        item_count = items.count()
        for item in items:
            order_items.append({
                "name": item.product.name,
                "quantity": item.quantity,
                "subtotal": float(item.subtotal),
                "image": item.product.image if item.product else None,
            })

        orders.append({
            "id": sale.id,
            "client": f"{sale.client}",
            "order_number": f"{sale.id}",
            "pickup_date": sale.pickup_date.strftime("%d/%m/%Y"),
            "total_amount": sale.total_amount,
            "payment_method": sale.payment_method,
            "items": order_items,
            "item_count": item_count, 
            "time": sale.time.strftime("%H:%M"),
        })
    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "total_orders": total_orders,
        "orders": orders,
    }
    return render(request, "prep/prep_screen.html", context)

@permission_required("noyau.view_bakery", raise_exception=True)
def prep_orders_count(request):
    count = BakerySale.objects.filter(is_paid=False).count()
    return JsonResponse({"total_orders": count})

@permission_required("noyau.view_bakery", raise_exception=True)
def prep_orders_today(request):
    today = localdate()
    sales = BakerySale.objects.prefetch_related("bakerysaleitem_set__product").filter(
        is_paid=False, pickup_date=today
    ).order_by("pickup_date","time")

    orders = []
    count = 0
    for sale in sales:
        items = sale.bakerysaleitem_set.all()
        order_items = []
        item_count = items.count()
        for item in items:
            count += 1
            order_items.append({
                "name": item.product.name,
                "price": item.product.price,
                "quantity": item.quantity,
                "subtotal": float(item.subtotal),
                "image": item.product.image if item.product else None,
                "count":count
            })

        orders.append({
            "id": sale.id,
            "client": f"{sale.client}",
            "order_number": f"{sale.id}",
            "pickup_date": sale.pickup_date.strftime("%d/%m/%Y"),
            "total_amount": float(sale.total_amount),
            "payment_method": sale.payment_method,
            "items": order_items,
            "item_count": item_count,
            "time": sale.time.strftime("%H:%M"),
        })

    return JsonResponse({"today_orders": len(orders), "orders": orders})


@requires_csrf_token
def csrf_failure(request, reason=""):
    return render(request, "errors/403_csrf.html", {"reason": reason}, status=403)


def error_400(request, exception=None):
    return render(request, "errors/400.html", status=400)


def error_403(request, exception=None):
    return render(request, "errors/403.html", status=403)


def error_404(request, exception=None):
    return render(request, "errors/404.html", status=404)


def error_500(request):
    return render(request, "errors/500.html", status=500)
