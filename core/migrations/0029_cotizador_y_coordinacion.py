from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def crear_producto_proyecto(apps, schema_editor):
    Producto = apps.get_model('core', 'Producto')
    Producto.objects.get_or_create(
        nombre='Proyecto recreativo',
        defaults={
            'tipo': 'AN',
            'precio': 0,
            'stock_total': 0,
            'stock_disponible': 0,
            'stock': 0,
            'activo': True,
            'afecta_stock': False,
        },
    )


def revertir_producto_proyecto(apps, schema_editor):
    Producto = apps.get_model('core', 'Producto')
    Producto.objects.filter(nombre='Proyecto recreativo', afecta_stock=False).delete()


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0028_factura_datos_fiscales'),
    ]

    operations = [
        migrations.AddField(
            model_name='producto',
            name='afecta_stock',
            field=models.BooleanField(default=True),
        ),
        migrations.CreateModel(
            name='Cotizacion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('folio', models.CharField(blank=True, max_length=20, unique=True)),
                ('tipo', models.CharField(choices=[('NORMAL', 'Normal'), ('PROYECTO', 'Proyecto')], default='NORMAL', max_length=10)),
                ('status', models.CharField(choices=[('BORRADOR', 'Borrador'), ('ENVIADA', 'Enviada'), ('ACEPTADA', 'Aceptada'), ('RECHAZADA', 'Rechazada'), ('CONVERTIDA', 'Convertida')], db_index=True, default='BORRADOR', max_length=12)),
                ('destinatario', models.CharField(blank=True, default='', max_length=200)),
                ('nombre_evento', models.CharField(blank=True, default='', max_length=200)),
                ('asistentes', models.PositiveIntegerField(blank=True, null=True)),
                ('sede', models.CharField(blank=True, default='', max_length=255)),
                ('fecha_evento', models.DateField(blank=True, null=True)),
                ('hora_inicio', models.TimeField(blank=True, null=True)),
                ('hora_fin', models.TimeField(blank=True, null=True)),
                ('intro', models.TextField(blank=True, default='')),
                ('aplicar_iva', models.BooleanField(default=False)),
                ('aplicar_isr', models.BooleanField(default=False)),
                ('condiciones_pago', models.TextField(blank=True, default='Se requiere el 50% de anticipo para confirmar la reservación del evento. El 50% restante se liquida el día del evento.')),
                ('firmado_por', models.CharField(blank=True, default='Dra. Rossana Tamara Medina Valencia\nDirectora General', max_length=200)),
                ('subtotal', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('monto_iva', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('monto_isr', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('total', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('notas', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('cliente', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cotizaciones', to='core.cliente')),
                ('creada_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='cotizaciones_creadas', to=settings.AUTH_USER_MODEL)),
                ('renta', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='cotizacion_origen', to='core.renta')),
            ],
            options={
                'verbose_name': 'Cotización',
                'verbose_name_plural': 'Cotizaciones',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='CotizacionZona',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('orden', models.PositiveIntegerField(default=0)),
                ('titulo', models.CharField(max_length=200)),
                ('descripcion', models.TextField(blank=True, default='')),
                ('cotizacion', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='zonas', to='core.cotizacion')),
            ],
            options={
                'verbose_name': 'Zona de cotización',
                'verbose_name_plural': 'Zonas de cotización',
                'ordering': ['orden', 'id'],
            },
        ),
        migrations.CreateModel(
            name='CotizacionConcepto',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('orden', models.PositiveIntegerField(default=0)),
                ('nombre', models.CharField(max_length=255)),
                ('descripcion', models.TextField(blank=True, default='')),
                ('cantidad', models.PositiveIntegerField(default=1)),
                ('monto', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('cotizacion', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='conceptos', to='core.cotizacion')),
                ('producto', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='conceptos_cotizacion', to='core.producto')),
            ],
            options={
                'verbose_name': 'Concepto de cotización',
                'verbose_name_plural': 'Conceptos de cotización',
                'ordering': ['orden', 'id'],
            },
        ),
        migrations.CreateModel(
            name='CoordinadorApoyo',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('asignacion', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='apoyos', to='core.asignacioncoordinador')),
                ('usuario', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='eventos_como_apoyo', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Coordinador de apoyo',
                'verbose_name_plural': 'Coordinadores de apoyo',
                'unique_together': {('asignacion', 'usuario')},
            },
        ),
        migrations.CreateModel(
            name='SolicitudCambioMaterial',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tipo', models.CharField(choices=[('AGREGAR', 'Agregar'), ('QUITAR', 'Quitar'), ('CAMBIAR_CANTIDAD', 'Cambiar cantidad')], max_length=20)),
                ('cantidad', models.PositiveIntegerField(default=1)),
                ('nota', models.CharField(blank=True, default='', max_length=255)),
                ('estado', models.CharField(choices=[('PENDIENTE', 'Pendiente'), ('APROBADA', 'Aprobada'), ('RECHAZADA', 'Rechazada')], db_index=True, default='PENDIENTE', max_length=12)),
                ('comentario_revision', models.CharField(blank=True, default='', max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('revisado_at', models.DateTimeField(blank=True, null=True)),
                ('lista', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='solicitudes_cambio', to='core.listamaterialevento')),
                ('material', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='solicitudes_cambio', to='core.materialanimacion')),
                ('revisado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='solicitudes_material_revisadas', to=settings.AUTH_USER_MODEL)),
                ('solicitado_por', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='solicitudes_material_enviadas', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Solicitud de cambio de material',
                'verbose_name_plural': 'Solicitudes de cambio de material',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='cotizacion',
            index=models.Index(fields=['tipo', 'status'], name='core_cotiza_tipo_st_idx'),
        ),
        migrations.AddIndex(
            model_name='cotizacion',
            index=models.Index(fields=['fecha_evento'], name='core_cotiza_fecha_e_idx'),
        ),
        migrations.RunPython(crear_producto_proyecto, revertir_producto_proyecto),
    ]
