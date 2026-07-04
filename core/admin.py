from django.contrib import admin

from .models import Cliente, Producto, Renta, PresupuestoCategoria


@admin.register(PresupuestoCategoria)
class PresupuestoCategoriaAdmin(admin.ModelAdmin):
    list_display = ('categoria', 'monto_mensual', 'activo', 'notas')
    list_editable = ('monto_mensual', 'activo')
    list_filter = ('activo',)
    search_fields = ('categoria', 'notas')
    ordering = ('categoria',)


admin.site.register(Cliente)
admin.site.register(Producto)
admin.site.register(Renta)
