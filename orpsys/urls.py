
from django.urls import include, path

urlpatterns = [
    path('', include('noyau.urls')),
]

handler400 = "noyau.views.error_400"
handler403 = "noyau.views.error_403"
handler404 = "noyau.views.error_404"
handler500 = "noyau.views.error_500"
