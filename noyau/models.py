from django.db import models
from decimal import Decimal
class Employer(models.Model):
    user = models.OneToOneField('auth.User', on_delete=models.CASCADE)
    role = models.CharField(max_length=100)
    badge_id = models.CharField(max_length=50, unique=True)
    setting = models.CharField(max_length=50, default="Salimamoud")

class Dashboard(models.Model):
    pass

class AiAssistant(models.Model):
    class Meta:
        verbose_name = "AI Assistant"
        verbose_name_plural = "AI Assistant"

class Pos(models.Model):
    pass

class Loyalty(models.Model):
    client = models.CharField(max_length=255)
    phone = models.CharField(max_length=255,default="")
    date = models.DateField()
    solde = models.DecimalField(max_digits=10, decimal_places=2)
    card_id = models.CharField(max_length=50, unique=True)
    setting = models.CharField(max_length=50, default="Salimamoud")
    points_balance = models.PositiveIntegerField(default=0)
    points_remainder = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    

class SaleProduct(models.Model):
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=20)
    product_type = models.CharField(max_length=20)
    stock_known = models.BooleanField(default=False)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    image = models.CharField(max_length=255, null=True, blank=True)
    base_product = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="derived_products",
    )
    conversion_factor = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1.00"))

class RawMaterial(models.Model):
    name = models.CharField(max_length=255)
    unit = models.CharField(max_length=50)
    current_stock = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    min_stock = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    STOCK_MODE_CHOICES = [
        ("NORMAL", "Normal"),
        ("FEFO", "FEFO (expiration)"),
    ]
    stock_mode = models.CharField(max_length=10, choices=STOCK_MODE_CHOICES, default="NORMAL")
    linked_product = models.ForeignKey(
        "SaleProduct",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="linked_raw_materials",
    )

class StockMovement(models.Model):
    raw_material = models.ForeignKey(RawMaterial, on_delete=models.CASCADE)
    movement_type = models.CharField(max_length=10)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    date = models.DateTimeField(db_index=True)
    assigned_to = models.CharField(max_length=255)
    destination = models.CharField(max_length=20, blank=True, default="")


class RawMaterialLot(models.Model):
    raw_material = models.ForeignKey(RawMaterial, on_delete=models.CASCADE, related_name="lots")
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    expiration_date = models.DateField(null=True, blank=True, db_index=True)
    received_at = models.DateTimeField(auto_now_add=True, db_index=True)


class ResaleDelivery(models.Model):
    product = models.ForeignKey(SaleProduct, on_delete=models.CASCADE)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    delivered_at = models.DateTimeField(auto_now_add=True, db_index=True)
    delivered_by = models.ForeignKey(Employer, on_delete=models.SET_NULL, null=True, blank=True)

class SaleTransaction(models.Model):
    employer = models.ForeignKey(Employer, on_delete=models.SET_NULL, null=True, blank=True)
    loyalty = models.ForeignKey(Loyalty, on_delete=models.SET_NULL, null=True, blank=True)
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    date = models.DateTimeField(db_index=True)
    points_earned = models.PositiveIntegerField(default=0)
    points_redeemed = models.PositiveIntegerField(default=0)

class PyromaneOrder(models.Model):
    STATUS_CHOICES = [
        ("PENDING", "En attente de paiement"),
        ("PAID", "Payee"),
        ("CANCELED", "Annulee"),
    ]
    order_number = models.CharField(max_length=20, unique=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="PENDING")
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(
        Employer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pyromane_orders_paid",
    )
    transaction = models.ForeignKey(
        SaleTransaction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pyromane_orders",
    )

class PyromaneOrderItem(models.Model):
    order = models.ForeignKey(PyromaneOrder, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(SaleProduct, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)


class PyromaneOrderLog(models.Model):
    ACTION_CHOICES = [
        ("CREATE", "Création"),
        ("UPDATE", "Modification"),
        ("CANCEL", "Annulation"),
    ]
    order = models.ForeignKey(PyromaneOrder, on_delete=models.CASCADE, related_name="logs")
    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(Employer, on_delete=models.SET_NULL, null=True, blank=True)

class CashChangeVoucher(models.Model):
    STATUS_CHOICES = [
        ("ISSUED", "Émis"),
        ("REDEEMED", "Utilisé"),
        ("EXPIRED", "Expiré"),
        ("VOID", "Annulé"),
    ]
    code = models.CharField(max_length=20, unique=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    issued_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="ISSUED")
    issued_by = models.ForeignKey(
        Employer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="change_vouchers_issued",
    )
    issued_transaction = models.ForeignKey(
        SaleTransaction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="change_vouchers_issued",
    )
    redeemed_transaction = models.ForeignKey(
        SaleTransaction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="change_vouchers_redeemed",
    )
    redeemed_at = models.DateTimeField(null=True, blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(
        Employer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="change_vouchers_voided",
    )
    void_reason = models.CharField(max_length=255, blank=True, default="")

class SaleTransactionItem(models.Model):
    transaction = models.ForeignKey(SaleTransaction, on_delete=models.CASCADE)
    product = models.ForeignKey(SaleProduct, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)

class LoyaltyPointLedger(models.Model):
    loyalty = models.ForeignKey(Loyalty, on_delete=models.CASCADE)
    transaction = models.ForeignKey(SaleTransaction, on_delete=models.SET_NULL, null=True, blank=True)
    move_type = models.CharField(max_length=20)
    points = models.IntegerField()
    balance_after = models.PositiveIntegerField(default=0)
    date = models.DateTimeField()
    note = models.CharField(max_length=255, blank=True, default="")

class Bakery(models.Model):
    pass

class Sale(models.Model):
    pass

class BakeryProduct(models.Model):
    name = models.CharField(max_length=255)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    image = models.CharField(max_length=255, null=True, blank=True)
    category = models.CharField(max_length=20,default="")

class BakerySale(models.Model):
    date = models.DateTimeField(db_index=True)
    pickup_date = models.DateField(null=True, blank=True)
    employer = models.ForeignKey(Employer, on_delete=models.SET_NULL, null=True, blank=True)
    client = models.CharField(max_length=255)
    phone = models.CharField(max_length=255,default="")
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(max_length=10)
    is_paid = models.BooleanField(default=False)
    time = models.TimeField(blank=True, null=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(
        Employer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bakery_sales_paid",
    )


class BakerySaleItem(models.Model):
    bakery = models.ForeignKey(BakerySale, on_delete=models.CASCADE)
    product = models.ForeignKey(BakeryProduct, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)


class SaleRecipe(models.Model):
    product = models.OneToOneField(SaleProduct, on_delete=models.CASCADE, related_name="recipe")
    yield_quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1.00"))
    yield_unit = models.CharField(max_length=50, default="unité")
    note = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class SaleRecipeItem(models.Model):
    recipe = models.ForeignKey(SaleRecipe, on_delete=models.CASCADE, related_name="items")
    raw_material = models.ForeignKey(RawMaterial, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)


class SaleProduction(models.Model):
    SHIFT_CHOICES = [
        ("MATIN", "Matin"),
        ("SOIR", "Soir"),
    ]
    product = models.ForeignKey(SaleProduct, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    production_date = models.DateField(db_index=True)
    shift = models.CharField(max_length=10, choices=SHIFT_CHOICES, default="MATIN")
    note = models.CharField(max_length=255, blank=True, default="")
    recorded_at = models.DateTimeField(auto_now_add=True)
    recorded_by = models.ForeignKey(Employer, on_delete=models.SET_NULL, null=True, blank=True)


class BakeryRecipe(models.Model):
    product = models.OneToOneField(BakeryProduct, on_delete=models.CASCADE, related_name="recipe")
    yield_quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1.00"))
    yield_unit = models.CharField(max_length=50, default="unité")
    note = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class BakeryRecipeItem(models.Model):
    recipe = models.ForeignKey(BakeryRecipe, on_delete=models.CASCADE, related_name="items")
    raw_material = models.ForeignKey(RawMaterial, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)


class BakeryProduction(models.Model):
    product = models.ForeignKey(BakeryProduct, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    production_date = models.DateField(db_index=True)
    note = models.CharField(max_length=255, blank=True, default="")
    recorded_at = models.DateTimeField(auto_now_add=True)
    recorded_by = models.ForeignKey(Employer, on_delete=models.SET_NULL, null=True, blank=True)


class PosShiftReport(models.Model):
    SHIFT_CHOICES = [
        ("MATIN", "Matin"),
        ("SOIR", "Soir"),
    ]
    shift_date = models.DateField()
    shift = models.CharField(max_length=10, choices=SHIFT_CHOICES)
    cashier = models.ForeignKey(Employer, on_delete=models.SET_NULL, null=True, blank=True)
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    note = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["shift_date", "shift"], name="uniq_pos_shift_date"),
        ]


class PosShiftRemise(models.Model):
    report = models.ForeignKey(PosShiftReport, on_delete=models.CASCADE, related_name="remises")
    product = models.ForeignKey(SaleProduct, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))


class PosShiftAbime(models.Model):
    report = models.ForeignKey(PosShiftReport, on_delete=models.CASCADE, related_name="abimes")
    product = models.ForeignKey(SaleProduct, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    created_at = models.DateTimeField(auto_now_add=True)


class PosShiftExpense(models.Model):
    report = models.ForeignKey(PosShiftReport, on_delete=models.CASCADE, related_name="expenses")
    label = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    created_at = models.DateTimeField(auto_now_add=True)


class PosShiftConsumption(models.Model):
    report = models.ForeignKey(PosShiftReport, on_delete=models.CASCADE, related_name="consumptions")
    person_name = models.CharField(max_length=255)
    product = models.ForeignKey(SaleProduct, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
