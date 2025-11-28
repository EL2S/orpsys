from django.db import models

class Employer(models.Model):
    user = models.OneToOneField('auth.User', on_delete=models.CASCADE)
    role = models.CharField(max_length=100)
    salary = models.DecimalField(max_digits=10, decimal_places=2)
    badge_id = models.CharField(max_length=50, unique=True)
    setting = models.CharField(max_length=50, default="Salimamoud")

class Salarie(models.Model):
    pass

class Dashboard(models.Model):
    pass

class Pos(models.Model):
    pass

class Leave(models.Model):
    employer = models.ForeignKey(Employer, on_delete=models.CASCADE)
    reason = models.CharField(max_length=255)  
    start_date = models.DateField()            
    end_date = models.DateField()              
    leave_type = models.CharField(max_length=50)  
    status = models.CharField(max_length=50)

class Loyalty(models.Model):
    client = models.CharField(max_length=255)
    phone = models.CharField(max_length=255,default="")
    date = models.DateField()
    solde = models.DecimalField(max_digits=10, decimal_places=2)
    card_id = models.CharField(max_length=50, unique=True)
    setting = models.CharField(max_length=50, default="Salimamoud")

class SaleProduct(models.Model):
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=20)
    product_type = models.CharField(max_length=20)
    stock_known = models.BooleanField(default=False)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    image = models.CharField(max_length=255, null=True, blank=True)

class RawMaterial(models.Model):
    name = models.CharField(max_length=255)
    unit = models.CharField(max_length=50)
    current_stock = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    min_stock = models.DecimalField(max_digits=10, decimal_places=2, default=0)

class Production(models.Model):
    product = models.ForeignKey(SaleProduct, on_delete=models.CASCADE)
    date = models.DateField()
    planned_quantity = models.PositiveIntegerField(default=0)
    sold_quantity = models.PositiveIntegerField(default=0)
    remaining_quantity = models.PositiveIntegerField(default=0)

class SaleTransaction(models.Model):
    employer = models.ForeignKey(Employer, on_delete=models.SET_NULL, null=True, blank=True)
    loyalty = models.ForeignKey(Loyalty, on_delete=models.SET_NULL, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    date = models.DateTimeField()

class SaleTransactionItem(models.Model):
    transaction = models.ForeignKey(SaleTransaction, on_delete=models.CASCADE)
    product = models.ForeignKey(SaleProduct, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)

class Attendance(models.Model):
    date = models.DateField()
    employer = models.ForeignKey(Employer, on_delete=models.SET_NULL, null=True, blank=True)
    clock_in = models.TimeField(blank=True, null=True)
    clock_out = models.TimeField(blank=True, null=True)
    status = models.CharField(max_length=50)

class Shift(models.Model):
    start_time = models.TimeField(blank=True, null=True)
    end_time = models.TimeField(blank=True, null=True)

class DayOff(models.Model):
    employer = models.ForeignKey(Employer, on_delete=models.SET_NULL, null=True, blank=True)
    day = models.CharField(max_length=10)
    
class Penalty(models.Model):
    employer = models.ForeignKey(Employer, on_delete=models.SET_NULL, null=True, blank=True)
    date = models.DateField()
    reason = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=10, decimal_places=2)

class EmployerShift(models.Model):
    employer = models.ForeignKey(Employer, on_delete=models.SET_NULL, null=True, blank=True)
    shift = models.ForeignKey(Shift, on_delete=models.SET_NULL, null=True, blank=True)