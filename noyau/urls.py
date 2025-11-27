from django.urls import path
from . import views
from django.conf import settings
from django.conf.urls.static import static
# from .views import hx, user_login
urlpatterns = [
    path("", views.user_login, name='login'),
    path("dashboard/", views.view_dashboard, name='view_dashboard'),
    path("employer/", views.view_employer, name='view_employer'),
    path("employer/<int:employer_id>/get/", views.get_employer, name='get_employer'),
    path("employer/<int:employer_id>/delete/", views.delete_employer, name='delete_employer'),
    path("logout/", views.user_logout, name='logout'),
    path("leave/", views.view_leave, name='view_leave'),
    path("leave/<int:leave_id>/<str:type>/add/", views.add_leave, name='add_leave'),
    path("leave/<int:leave_id>/get/", views.get_leave, name='get_leave'),
    path("leave/<int:leave_id>/delete/", views.delete_leave, name='delete_leave'),
    path("loyalty/", views.view_loyalty, name='view_loyalty'),
    path("loyalty/add/", views.add_loyalty, name='add_loyalty'),
    path("loyalty/<int:loyalty_id>/delete/", views.delete_loyalty, name='delete_loyalty'),
    path("loyalty/<int:loyalty_id>/get/", views.get_loyalty, name='get_loyalty'),
    path("product/", views.view_saleproduct, name='view_saleproduct'),
    path("product/<int:product_id>/get/", views.get_saleproduct, name='get_saleproduct'),
    path("product/<int:product_id>/delete/", views.delete_saleproduct, name='delete_saleproduct'),
    path("inventory/", views.view_rawmaterial, name='view_rawmaterial'),
    path("inventory/<int:inventory_id>/get/", views.get_rawmaterial, name='get_rawmaterial'),
    path("inventory/<int:inventory_id>/delete/", views.delete_rawmaterial, name='delete_rawmaterial'),
    path("production/", views.view_production, name='view_production'),
    path("production/<int:production_id>/get/", views.get_production, name='get_production'),
    path("production/<int:production_id>/delete/", views.delete_production, name='delete_production'),
    path("pos/", views.view_pos, name='view_pos'),
    path("pos/transaction/add/", views.add_transaction, name='add_transaction'),
    path("pos/ticket/print/", views.print_ticket, name='print_ticket'),
    path("attendance/", views.view_attendance, name='view_attendance'),
]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)