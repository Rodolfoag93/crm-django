from django.contrib import admin

from .models import (
    Cliente, Producto, Renta, PresupuestoCategoria, TemporadaAlta, Factura,
    Cotizacion, CotizacionZona, CotizacionConcepto, CoordinadorApoyo, SolicitudCambioMaterial,
)


@admin.register(PresupuestoCategoria)
class PresupuestoCategoriaAdmin(admin.ModelAdmin):
    list_display = ('categoria', 'monto_mensual', 'activo', 'notas')
    list_editable = ('monto_mensual', 'activo')
    list_filter = ('activo',)
    search_fields = ('categoria', 'notas')
    ordering = ('categoria',)


@admin.register(TemporadaAlta)
class TemporadaAltaAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'fecha_inicio', 'fecha_fin', 'activo', 'notas')
    list_editable = ('activo',)
    list_filter = ('activo',)
    search_fields = ('nombre', 'notas')
    ordering = ('-fecha_inicio',)
    date_hierarchy = 'fecha_inicio'


@admin.register(Factura)
class FacturaAdmin(admin.ModelAdmin):
    list_display = ('id', 'renta', 'rfc', 'estatus', 'uuid', 'total', 'timbrada_at')
    list_filter = ('estatus', 'provider')
    search_fields = ('uuid', 'rfc', 'razon_social', 'renta__folio')
    readonly_fields = ('created_at', 'timbrada_at', 'provider_id', 'uuid')


@admin.register(Producto)
class ProductoAdmin(admin.ModelAdmin):
    list_display = ('id', 'nombre', 'tipo', 'precio', 'activo', 'meta_retailer_id')
    list_filter = ('tipo', 'activo')
    search_fields = ('nombre', 'meta_retailer_id')
    list_editable = ('meta_retailer_id', 'activo')
    ordering = ('nombre',)


admin.site.register(Cliente)
admin.site.register(Renta)
admin.site.register(Cotizacion)
admin.site.register(CotizacionZona)
admin.site.register(CotizacionConcepto)
admin.site.register(CoordinadorApoyo)
admin.site.register(SolicitudCambioMaterial)
