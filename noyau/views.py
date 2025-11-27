from datetime import date, datetime, timedelta
from decimal import Decimal
import os
import re
import unicodedata
from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required, permission_required
from django.utils import timezone
import random
from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
import json
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone
import locale
from django.contrib.auth.models import User, Group, Permission
from noyau.models import Attendance, Employer, Leave, Loyalty, Production, RawMaterial, SaleProduct, SaleTransaction, SaleTransactionItem
from django.core.files.storage import default_storage
# Définit la locale française
locale.setlocale(locale.LC_TIME, "fr_FR.UTF-8")
from django.views.decorators.csrf import csrf_exempt
import uuid
import shutil

def update_stock(request):
    day = date.today()
    date_stock = day - timedelta(days=1)
    productions = Production.objects.filter(date=date_stock).order_by("-id")
    for production in productions:
        if production.product.stock_known and production.product.category == "Durable" and not Production.objects.filter(date=day,product=production.product).exists():
            Production.objects.create(
                product=production.product,
                date=day,
                planned_quantity=production.remaining_quantity,
                sold_quantity=0,
                remaining_quantity=production.remaining_quantity,
            )
            production.remaining_quantity = 0
            production.planned_quantity = production.sold_quantity
            production.save()

def clean_decimal(val):
    if val is None:
        return Decimal(0)
    if isinstance(val, str):
        val = val.replace(" ", "").replace(",", ".").strip()
    try:
        return round(Decimal(val), 2)
    except:
        return Decimal(0)


@login_required
def user_logout(request):
    logout(request)
    return redirect("login")


# Create your views here.
def user_login(request):
    update_stock(request)
    context = {}
    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")
        user = authenticate(request, username=username, password=password)
        if user is not None:
            user.last_login = timezone.now()
            user.save()
            login(request, user)
            if user.is_superuser:
                return redirect("view_dashboard")
            else:
                user_permission_ids = user.user_permissions.values_list("id", flat=True)
                permissions = Permission.objects.filter(
                    id__in=user_permission_ids, codename__startswith="view"
                )
                group_permissions = Permission.objects.filter(
                    group__user=user, codename__startswith="view"
                ).distinct()
                if permissions.exists():
                    perm = random.choice(permissions)
                    return redirect(perm.codename)
                elif group_permissions.exists():
                    perm = random.choice(group_permissions)
                    return redirect(perm.codename)
                else:
                    context["error_message"] = "Aucune permission de vue trouvée."
                    return render(request, "login.html", context)
        else:
            context["error_message"] = "Nom d'utilisateur ou mot de passe incorrect"
            return render(request, "login.html", context)
    return render(request, "login.html", context)


@permission_required("noyau.view_dashboard", raise_exception=True)
def view_dashboard(request):
    update_stock(request)
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


@permission_required("noyau.view_employer", raise_exception=True)
def view_employer(request):
    update_stock(request)
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
                "salary": float(emp.salary),
                "badge_id": emp.badge_id,
                "username": emp.user.username,
            }
        )

    noyau_and_auth_content_types = ContentType.objects.filter(Q(app_label="noyau")).exclude(
        model__in=["shift", "dayoff" , "saletransactionItem", "penalty"]
    )

    permissions = Permission.objects.filter(
        content_type__in=noyau_and_auth_content_types
    ).exclude(
        Q(
            content_type__app_label="noyau",
            content_type__model="dashboard",
            codename__in=["add_dashboard", "change_dashboard", "delete_dashboard"],
        )
        | Q(
            content_type__app_label="noyau",
            content_type__model="pos",
            codename__in=["add_pos", "change_pos", "delete_pos"],
        )
        | Q(
                content_type__app_label="noyau",
                content_type__model="production",
                codename__in=["add_production", "change_production", "delete_production"],
            )
        | Q(
                content_type__app_label="noyau",
                content_type__model="attendance",
                codename__in=["add_attendance", "change_attendance", "delete_attendance"],
            )
        | Q(
                content_type__app_label="noyau",
                content_type__model="saletransaction",
                codename__in=["add_saletransaction", "change_saletransaction", "delete_saletransaction"],
            )
        | Q(
                content_type__app_label="noyau",
                content_type__model="salarie",
                codename__in=["add_salarie", "change_salarie", "delete_salarie"],
            )
    )

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
        "permissions": json.dumps(permissions_data, cls=DjangoJSONEncoder),
    }
    if request.method == "POST":
        first_name = request.POST.get("first_name", "").strip()
        last_name = request.POST.get("last_name", "").strip()
        email = request.POST.get("email", "").strip()
        password = request.POST.get("password", "").strip()
        role = request.POST.get("role", "").strip()
        type = request.POST.get("type", "").strip()
        salary = clean_decimal(request.POST.get("salary", "0").strip())
        if type == "add":
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
                user=add_user, role=role, salary=salary, badge_id=new_badge_id
            )
        elif type == "change":
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
            employer.salary = salary
            employer.save()
            old_user.user_permissions.clear()
            if role != "Employé":
                aut_rem_options = request.POST.getlist("aut_rem")
                for permission_id in aut_rem_options:
                    permission = Permission.objects.get(id=permission_id)
                    old_user.user_permissions.add(permission)

        return redirect("view_employer")
    return render(request, "employer/view_employer.html", context)


@csrf_exempt
def get_employer(request, employer_id):
    update_stock(request)
    try:
        employer = Employer.objects.get(id=employer_id)
        permissions_employer = []
        permissions_data = []
        old_user = get_object_or_404(User, id=employer.user_id)

        noyau_and_auth_content_types = ContentType.objects.filter(Q(app_label="noyau")).exclude(
            model__in=["shift", "dayoff", "saletransactionItem", "penalty"]
        )

        user_permissions = old_user.user_permissions.filter(
            content_type__in=noyau_and_auth_content_types
        ).exclude(
            Q(
                content_type__app_label="noyau",
                content_type__model="dashboard",
                codename__in=["add_dashboard", "change_dashboard", "delete_dashboard"],
            )
            | Q(
                content_type__app_label="noyau",
                content_type__model="pos",
                codename__in=["add_pos", "change_pos", "delete_pos"],
            )
            | Q(
                content_type__app_label="noyau",
                content_type__model="production",
                codename__in=["add_production", "change_production", "delete_production"],
            )
            | Q(
                content_type__app_label="noyau",
                content_type__model="attendance",
                codename__in=["add_attendance", "change_attendance", "delete_attendance"],
            )
            | Q(
                content_type__app_label="noyau",
                content_type__model="saletransaction",
                codename__in=["add_saletransaction", "change_saletransaction", "delete_saletransaction"],
            )
            | Q(
                content_type__app_label="noyau",
                content_type__model="salarie",
                codename__in=["add_salarie", "change_salarie", "delete_salarie"],
            )
        )
        for permission in user_permissions:
            permissions_employer.append(
                {
                    "id": permission.id,
                    "name": permission.name,
                }
            )
        unassigned_permissions = (
            Permission.objects.filter(content_type__in=noyau_and_auth_content_types)
            .exclude(id__in=user_permissions.values_list("id", flat=True))
            .exclude(
                Q(
                    content_type__app_label="noyau",
                    content_type__model="dashboard",
                    codename__in=[
                        "add_dashboard",
                        "change_dashboard",
                        "delete_dashboard",
                    ],
                )
                | Q(
                    content_type__app_label="noyau",
                    content_type__model="pos",
                    codename__in=["add_pos", "change_pos", "delete_pos"],
                )
            )
        )

        for permission in unassigned_permissions:
            permissions_data.append(
                {
                    "id": permission.id,
                    "name": permission.name,
                }
            )

        data = {
            "role": employer.role,
            "salary": float(employer.salary),
            "first_name": old_user.first_name,
            "last_name": old_user.last_name,
            "email": old_user.email,
            "permissions": permissions_data,
            "user_permissions": permissions_employer,
            "setting": employer.setting,
        }
        return JsonResponse({"success": True, "employer": data})
    except Employer.DoesNotExist:
        return JsonResponse({"error": "Employé introuvable."}, status=404)


@permission_required("noyau.delete_employer", raise_exception=True)
def delete_employer(request, employer_id):
    update_stock(request)
    employer = get_object_or_404(Employer, id=employer_id)
    employer.delete()
    return redirect("view_employer")


@permission_required("noyau.view_leave", raise_exception=True)
def view_leave(request):
    update_stock(request)
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    leaves = Leave.objects.select_related("employer__user").all().order_by("-id")
    employees_data = list(
        Employer.objects.select_related("user")
        .all()
        .order_by("user__username")
        .values("id", "user__username")
    )
    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "leaves": leaves,
        "employees": json.dumps(employees_data),
    }
    if request.method == "POST":
        employer_id = request.POST.get("employer", "").strip()
        reason = request.POST.get("reason", "").strip()
        start_date = request.POST.get("start_date", "").strip()
        end_date = request.POST.get("end_date", "").strip()
        leave_type = request.POST.get("leave_type", "").strip()
        type = request.POST.get("type", "").strip()
        if type == "add":
            employer = get_object_or_404(Employer, id=employer_id)
            Leave.objects.create(
                employer=employer,
                reason=reason,
                start_date=start_date,
                end_date=end_date,
                leave_type=leave_type,
                status="En attente",
            )
        elif type == "change":
            leave_id = request.POST.get("leave_id", "").strip()
            leave = get_object_or_404(Leave, id=leave_id)
            employer = get_object_or_404(Employer, id=employer_id)
            leave.employer = employer
            leave.reason = reason
            leave.start_date = start_date
            leave.end_date = end_date
            leave.leave_type = leave_type
            leave.save()
        return redirect("view_leave")
    return render(request, "leave/view_leave.html", context)


@csrf_exempt
def get_leave(request, leave_id):
    update_stock(request)
    try:
        leave = Leave.objects.select_related("employer__user").get(id=leave_id)

        data = {
            "start_date": leave.start_date.strftime("%Y-%m-%d"),
            "end_date": leave.end_date.strftime("%Y-%m-%d"),
            "employer": leave.employer.id,
            "reason": leave.reason,
            "leave_type": leave.leave_type,
        }
        return JsonResponse({"success": True, "leave": data})
    except Leave.DoesNotExist:
        return JsonResponse({"error": "Congé introuvable."}, status=404)


@permission_required("noyau.delete_leave", raise_exception=True)
def delete_leave(request, leave_id):
    update_stock(request)
    leave = get_object_or_404(Leave, id=leave_id)
    leave.delete()
    return redirect("view_leave")


@permission_required("noyau.add_leave", raise_exception=True)
def add_leave(request, leave_id, type):
    update_stock(request)
    if request.method == "POST":
        try:
            leave = get_object_or_404(Leave, id=leave_id)
            if type == "approved":
                leave.status = "Approuvé"
            elif type == "rejected":
                leave.status = "Refusé"
            leave.save()
            return JsonResponse({"success": True})
        except json.JSONDecodeError:
            return JsonResponse({"error": "Données JSON invalides."}, status=400)
    return JsonResponse({"error": "Méthode non autorisée."}, status=405)


@permission_required("noyau.view_loyalty", raise_exception=True)
def view_loyalty(request):
    update_stock(request)
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    loyalties = Loyalty.objects.all().order_by("-id")
    loyalties_json = loyalties.values(
        "id",
        "card_id",
        "setting",
        "phone",
        "solde",
        "client",
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
        if type == "change":
            loyalty_id = request.POST.get("loyalty_id", "").strip()
            loyalty = get_object_or_404(Loyalty, id=loyalty_id)
            loyalty.client = client
            loyalty.phone = phone
            loyalty.save()
        if type == "solde":
            loyalty_id = request.POST.get("loyalty_id", "").strip()
            loyalty = get_object_or_404(Loyalty, id=loyalty_id)
            loyalty.solde = clean_decimal(loyalty.solde) + solde
            loyalty.save()
        if type == "scan":
            loyalty_id = request.POST.get("loyalty_id", "").strip()
            loyalty = get_object_or_404(Loyalty, id=loyalty_id)
            loyalty.client = client
            loyalty.phone = phone
            loyalty.solde = clean_decimal(loyalty.solde) + solde
            loyalty.save()
        return redirect("view_loyalty")
    return render(request, "loyalty/view_loyalty.html", context)


@csrf_exempt
def get_loyalty(request, loyalty_id):
    update_stock(request)
    try:
        loyalty = Loyalty.objects.get(id=loyalty_id)

        data = {
            "client": loyalty.client,
            "phone": loyalty.phone,
            "solde": float(loyalty.solde),
            "card_id": loyalty.card_id,
            "setting": loyalty.setting,
        }
        return JsonResponse({"success": True, "loyalty": data})
    except Loyalty.DoesNotExist:
        return JsonResponse({"error": "Congé introuvable."}, status=404)


@permission_required("noyau.add_loyalty", raise_exception=True)
def add_loyalty(request):
    update_stock(request)
    if request.method == "POST":
        try:
            today = date.today()
            solde = 0
            client = "Nouveau Client"

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

            Loyalty.objects.create(
                card_id=new_card_id, solde=solde, client=client, date=today, phone="-"
            )
            return JsonResponse({"success": True})
        except json.JSONDecodeError:
            return JsonResponse({"error": "Données JSON invalides."}, status=400)
    return JsonResponse({"error": "Méthode non autorisée."}, status=405)


@permission_required("noyau.delete_loyalty", raise_exception=True)
def delete_loyalty(request, loyalty_id):
    update_stock(request)
    loyalty = get_object_or_404(Loyalty, id=loyalty_id)
    loyalty.delete()
    return redirect("view_loyalty")


def save_product(file, name):
    allowed_extensions = [".png", ".jpg", ".jpeg", ".gif"]
    ext = os.path.splitext(file.name)[1].lower()

    if ext not in allowed_extensions:
        raise ValueError("Format de fichier non autorisé.")

    clean_name = name.replace(" ", "_")
    unique_name = f"{clean_name}{ext}"

    folder = os.path.join(settings.MEDIA_ROOT, "products")
    os.makedirs(folder, exist_ok=True)

    path = os.path.join(folder, unique_name)

    with default_storage.open(path, "wb+") as destination:
        for chunk in file.chunks():
            destination.write(chunk)

    return os.path.join("products", unique_name)

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
    update_stock(request)
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
    }
    if request.method == "POST":
        name = request.POST.get("name", "").strip()
        category = request.POST.get("category", "").strip()
        product_type = request.POST.get("product_type", "").strip()
        stock_known = request.POST.get("stock_known", "").strip()
        unit_price = clean_decimal(request.POST.get("unit_price", "").strip())
        image = request.FILES.get("image")
        type = request.POST.get("type", "").strip()
        if type == "add":
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
                image=image_path
            )
        if type == "change":
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
            product.save()
        return redirect("view_saleproduct")
    return render(request, "product/view_product.html", context)

@csrf_exempt
def get_saleproduct(request, product_id):
    update_stock(request)
    try:
        product = SaleProduct.objects.get(id=product_id)

        data = {
            "name": product.name,
            "category": product.category,
            "unit_price": float(product.unit_price),
            "product_type": product.product_type,
            "stock_known": product.stock_known,
            "image": product.image,
        }
        return JsonResponse({"success": True, "product": data})
    except SaleProduct.DoesNotExist:
        return JsonResponse({"error": "Produit introuvable."}, status=404)

@permission_required("noyau.delete_saleproduct", raise_exception=True)
def delete_saleproduct(request, product_id):
    update_stock(request)
    product = get_object_or_404(SaleProduct, id=product_id)
    if product and product.image:
        old_image_path = os.path.join(settings.MEDIA_ROOT, product.image)
        if os.path.exists(old_image_path):
            os.remove(old_image_path)
    product.delete()
    return redirect("view_saleproduct")


@permission_required("noyau.view_rawmaterial", raise_exception=True)
def view_rawmaterial(request):
    update_stock(request)
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    inventories = RawMaterial.objects.all().order_by("-id")
    inventories_json = inventories.values(
        "id",
        "name",
        "current_stock",
        "unit",
        "min_stock",
    ).order_by("name")
    inventories_json = json.dumps(list(inventories_json), cls=DjangoJSONEncoder)
    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "inventories": inventories,
        "inventories_json":inventories_json
    }
    if request.method == "POST":
        name = request.POST.get("name", "").strip()
        unit = request.POST.get("unit", "").strip()
        current_stock = clean_decimal(request.POST.get("current_stock", "").strip())
        min_stock = clean_decimal(request.POST.get("min_stock", "").strip())
        type = request.POST.get("type", "").strip()
        if type == "add":
            RawMaterial.objects.create(
                name=name,
                unit=unit,
                current_stock=current_stock,
                min_stock=min_stock
            )
        if type == "change":
            inventory_id = request.POST.get("inventory_id", "").strip()
            inventory = get_object_or_404(RawMaterial, id=inventory_id)
            inventory.name=name
            inventory.unit=unit
            inventory.min_stock=min_stock
            inventory.save()
        if type == "in":
            aut_ch_options = request.POST.getlist("aut_ch")
            quantities = request.POST.getlist('quantity[]')
            for i, inventory_id in enumerate(aut_ch_options):
                inventory = get_object_or_404(RawMaterial, id=inventory_id)
                quantity = clean_decimal(quantities[i])
                inventory.current_stock = clean_decimal(inventory.current_stock) + quantity
                inventory.save()
        if type == "out":
            aut_ch_options = request.POST.getlist("aut_ch")
            quantities = request.POST.getlist('quantity[]')
            for i, inventory_id in enumerate(aut_ch_options):
                inventory = get_object_or_404(RawMaterial, id=inventory_id)
                quantity = clean_decimal(quantities[i])
                inventory.current_stock = clean_decimal(inventory.current_stock) - quantity
                inventory.save()
        return redirect("view_rawmaterial")
    return render(request, "inventory/view_inventory.html", context)

@csrf_exempt
def get_rawmaterial(request, inventory_id):
    update_stock(request)
    try:
        inventory = RawMaterial.objects.get(id=inventory_id)

        data = {
            "name": inventory.name,
            "unit": inventory.unit,
            "current_stock": inventory.current_stock,
            "min_stock": inventory.min_stock,
        }
        return JsonResponse({"success": True, "inventory": data})
    except RawMaterial.DoesNotExist:
        return JsonResponse({"error": "Ingrédient introuvable."}, status=404)

@permission_required("noyau.delete_rawmaterial", raise_exception=True)
def delete_rawmaterial(request, inventory_id):
    update_stock(request)
    inventory = get_object_or_404(RawMaterial, id=inventory_id)
    inventory.delete()
    return redirect("view_rawmaterial")

@permission_required("noyau.view_production", raise_exception=True)
def view_production(request):
    update_stock(request)
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    today = timezone.localdate()
    productions_today = Production.objects.filter(date=today).order_by("-id")
    productions = Production.objects.all().order_by("-id")
    produced_today_ids = productions_today.values_list("product_id", flat=True)
    products_qs = (
        SaleProduct.objects
        .filter(stock_known=True)
        .exclude(id__in=produced_today_ids)
        .values("id", "name", "category", "product_type", "unit_price")
        .order_by("name")
    )

    products_json = json.dumps(list(products_qs), cls=DjangoJSONEncoder)
    
    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "productions_today": productions_today,
        "productions": productions,
        "products_json":products_json
    }
    if request.method == "POST":
        aut_ch_options = request.POST.getlist("aut_ch")
        quantities = request.POST.getlist('quantity[]')
        type = request.POST.get("type", "").strip()
        if type == "add":
            for i, product_id in enumerate(aut_ch_options):
                product = get_object_or_404(SaleProduct, id=product_id)
                quantity = clean_decimal(quantities[i])
                Production.objects.create(
                    product=product,
                    planned_quantity=quantity,
                    date=today,
                    sold_quantity=0,
                    remaining_quantity=quantity
                )
        if type == "increase":
            production_id = request.POST.get("production_id", "").strip()
            production = get_object_or_404(Production, id=production_id)
            additional_quantity = clean_decimal(request.POST.get("additional_quantity", "").strip())
            production.planned_quantity = clean_decimal(production.planned_quantity) + additional_quantity
            production.remaining_quantity = clean_decimal(production.remaining_quantity) + additional_quantity
            production.save()
        if type == "decrease":
            production_id = request.POST.get("production_id", "").strip()
            production = get_object_or_404(Production, id=production_id)
            reduction_quantity = clean_decimal(request.POST.get("reduction_quantity", "").strip())
            if reduction_quantity <= clean_decimal(production.remaining_quantity):
                production.planned_quantity = clean_decimal(production.planned_quantity) - reduction_quantity
                production.remaining_quantity = clean_decimal(production.remaining_quantity) - reduction_quantity
                production.save()
        return redirect("view_production")
    return render(request, "production/view_production.html", context)

@csrf_exempt
def get_production(request, production_id):
    update_stock(request)
    try:
        production = Production.objects.get(id=production_id)

        data = {
            "product": production.product.id,
            "name": production.product.name,
            "unit_price": float(production.product.unit_price),
            "planned_quantity": production.planned_quantity,
            "sold_quantity": production.sold_quantity,
            "remaining_quantity": production.remaining_quantity,
        }
        return JsonResponse({"success": True, "production": data})
    except Production.DoesNotExist:
        return JsonResponse({"error": "Production introuvable."}, status=404)
    
@permission_required("noyau.delete_production", raise_exception=True)
def delete_production(request, production_id):
    update_stock(request)
    production = get_object_or_404(Production, id=production_id)
    production.delete()
    return redirect("view_production")

@permission_required("noyau.view_pos", raise_exception=True)
def view_pos(request):
    update_stock(request)
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    today = timezone.localdate()
    data = []
    products = SaleProduct.objects.order_by('name').all()
    for product in products:
        production = Production.objects.filter(date=today,product=product).first()
        if product.stock_known:
            if production and clean_decimal(production.remaining_quantity) > clean_decimal(0):
                data.append({
                    'id': product.id,
                    'image': product.image,
                    'unit_price': float(product.unit_price),
                    'name': product.name,
                    'stock': production.remaining_quantity,
                })
        else:
            data.append({
                'id': product.id,
                'image': product.image,
                'unit_price': float(product.unit_price),
                'name': product.name,
                'stock': "∞",
            })
            
    loyalties_json = Loyalty.objects.all().order_by("-id").values(
        "id",
        "card_id",
        "setting",
        "phone",
        "solde",
        "client",
    ).order_by("client")
    loyalties_json = json.dumps(list(loyalties_json), cls=DjangoJSONEncoder)
    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
        "products" : data,
        "loyalties_json": loyalties_json,
    }
    return render(request, "pos/view_pos.html", context)

@permission_required("noyau.view_pos", raise_exception=True)
def add_transaction(request):
    if request.method != "POST":
        return JsonResponse({"error": "Méthode non autorisée."}, status=405)

    try:
        data = json.loads(request.body)

        method = data.get("method")         # "cash" ou "card"
        total = data.get("total")
        items = data.get("items", [])
        loyalty_id = data.get("loyalty_id")  # peut être "" ou null
        new_balance = data.get("new_balance")

        # Employee associé à la transaction
        employee = Employer.objects.filter(user=request.user).first()

        # -------------------------------------
        # 🔥 Gestion de la carte selon le method
        # -------------------------------------
        loyalty = None
        if method == "card" and loyalty_id:
            # On ne récupère la carte que si c'est un paiement carte
            loyalty = Loyalty.objects.filter(id=int(loyalty_id)).first()

        # -------------------------------------
        # 🔥 Création de la transaction
        # -------------------------------------
        transaction = SaleTransaction.objects.create(
            employee = employee,
            loyalty = loyalty,        # None si cash, objet Loyalty si card
            total_amount = clean_decimal(total),
            date = timezone.now(),
        )

        # -------------------------------------
        # 🔥 Enregistrer les articles vendus
        # -------------------------------------
        for item in items:
            product_id = item.get("id")
            quantity = item.get("quantity")
            subtotal = item.get("subtotal")

            product = SaleProduct.objects.get(id=product_id)

            SaleTransactionItem.objects.create(
                transaction = transaction,
                product = product,
                quantity = quantity,
                subtotal = subtotal,
            )
            decrease_production_stock(product,quantity)
        # -------------------------------------
        # 🔥 Mise à jour solde fidélité
        # UNIQUEMENT si payment = card !
        # -------------------------------------
        if method == "card" and loyalty:
            loyalty.solde = clean_decimal(new_balance)
            loyalty.save()

        return JsonResponse({"success": True})

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)

def decrease_production_stock(product, quantity_sold):
    # Vérifier si le produit utilise réellement un stock
    if not product.stock_known:
        return  # rien à faire

    try:
        # récupérer la production d'aujourd'hui seulement
        production = Production.objects.get(
            product=product,
            date=date.today()
        )
    except Production.DoesNotExist:
        return  # aucune production pour aujourd'hui → rien à diminuer

    # augmenter la quantité vendue
    production.sold_quantity += quantity_sold

    # diminuer le reste en stock
    if production.remaining_quantity >= quantity_sold:
        production.remaining_quantity -= quantity_sold
    else:
        production.remaining_quantity = 0  # pas de stock négatif

    production.save()

def remove_accents(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')

@csrf_exempt
def print_ticket(request):
    if request.method != "POST":
        return JsonResponse({"error": "Méthode non autorisée."}, status=405)
    
    last_transaction = SaleTransaction.objects.order_by("-id").first()

    try:
        data = json.loads(request.body)
        items = data.get("items", [])
        total = data.get("total")
        TICKET_WIDTH = 45

        ticket_text = "SALIMAMOUD".center(TICKET_WIDTH) + "\n"
        ticket_text += "Salon de the".center(TICKET_WIDTH) + "\n"
        ticket_text += "Comores, Moroni".center(TICKET_WIDTH) + "\n"

        ticket_text += "-" * TICKET_WIDTH + "\n"
        ticket_text += "Tel : +269 3354113\n"
        ticket_text += f"DATE    : {timezone.localdate().strftime('%d/%m/%Y')}\n"
        ticket_text += f"TICKET  : {last_transaction.id}\n"
        ticket_text += "-" * TICKET_WIDTH + "\n"
        
        # --- AFFICHAGE DES ARTICLES AVEC QUANTITÉ ---
        for item in items:
            product_id = item.get("id")
            quantity = item.get("quantity")
            subtotal = item.get("subtotal")

            product = SaleProduct.objects.get(id=product_id)
            article = product.name.capitalize()

            # Exemple affichage : "Café x2"
            article_text = f"{article} x{quantity}"

            prix = f"{subtotal} KMF"

            espaces = TICKET_WIDTH - len(article_text) - len(prix)
            ticket_text += article_text + " " * max(espaces, 1) + prix + "\n"
        
        # ---------------------------------------------------

        ticket_text += "-" * TICKET_WIDTH + "\n"
        ticket_text += f"TOTAL{' ' * (TICKET_WIDTH - len('TOTAL') - len(str(total)) - 4)}{total} KMF\n"
        ticket_text += "-" * TICKET_WIDTH + "\n"
        ticket_text += "PAYE EN ESPECES".center(TICKET_WIDTH) + "\n\n"
        ticket_text += "MERCI".center(TICKET_WIDTH) + "\n"
        ticket_text += "BONNE JOURNEE".center(TICKET_WIDTH) + "\n"
        ticket_text += "\n" * 5
        ticket_text += chr(27) + chr(105)

        ticket_text = remove_accents(ticket_text)

        return JsonResponse({'success': True, 'text': ticket_text})

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)

@permission_required("noyau.view_attendance", raise_exception=True)
def view_attendance(request):
    update_stock(request)
    current_user = request.user
    first_name = current_user.first_name.capitalize()
    last_name = current_user.last_name.capitalize()
    first_letter = first_name[0].upper() if first_name else ""
    attendances = Attendance.objects.order_by('-date').all()
    data = []
    for attendance in attendances:
        employer = Employer.objects.filter(employer=attendance.employer).first()
        user = User.objects.filter(employer=employer.user).first()
        data.append({
            'id': attendance.id,
            'username': user.username,
            'date': attendance.date.strftime('%d/%m/%Y'),
            'clock_in': attendance.clock_in,
            'clock_out': attendance.clock_out,
            'status': attendance.status,
        })
    context = {
        "first_name": first_name,
        "last_name": last_name,
        "first_letter": first_letter,
        "role": getattr(getattr(current_user, "employer", None), "role", None),
    }
    return render(request, "attendance/view_attendance.html", context)

