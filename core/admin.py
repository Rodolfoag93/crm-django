from django.contrib import admin
from .models import Cliente, Producto, Renta

admin.site.register(Cliente)
admin.site.register(Producto)
admin.site.register(Renta)

# Register your models here.
