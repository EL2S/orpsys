
from django.urls import include, path

urlpatterns = [
    path('', include('noyau.urls')),
]