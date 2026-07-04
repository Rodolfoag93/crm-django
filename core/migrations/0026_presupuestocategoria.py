# Generated manually — PresupuestoCategoria model + seed data

from decimal import Decimal

from django.db import migrations, models


PRESUPUESTOS_INICIALES = {
    'INSUMOS': Decimal('5000'),
    'GASOLINA': Decimal('8000'),
    'REFACCIONES': Decimal('3000'),
    'CONSUMIBLES': Decimal('2000'),
    'SEGURO': Decimal('1500'),
    'IMPUESTOS': Decimal('4000'),
    'NOMINA': Decimal('50000'),
    'DEVOLUCION': Decimal('2000'),
}


def seed_presupuestos(apps, schema_editor):
    PresupuestoCategoria = apps.get_model('core', 'PresupuestoCategoria')
    for categoria, monto in PRESUPUESTOS_INICIALES.items():
        PresupuestoCategoria.objects.get_or_create(
            categoria=categoria,
            defaults={'monto_mensual': monto, 'activo': True},
        )


def unseed_presupuestos(apps, schema_editor):
    PresupuestoCategoria = apps.get_model('core', 'PresupuestoCategoria')
    PresupuestoCategoria.objects.filter(
        categoria__in=PRESUPUESTOS_INICIALES.keys(),
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0025_gasto_comprobante_movimiento_gasto_fk'),
    ]

    operations = [
        migrations.CreateModel(
            name='PresupuestoCategoria',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('categoria', models.CharField(
                    choices=[
                        ('INSUMOS', 'Insumos'),
                        ('GASOLINA', 'Gasolina'),
                        ('REFACCIONES', 'Refacciones'),
                        ('CONSUMIBLES', 'Consumibles'),
                        ('SEGURO', 'Seguro'),
                        ('IMPUESTOS', 'Impuestos'),
                        ('NOMINA', 'Nómina'),
                        ('DEVOLUCION', 'Devolución depósito'),
                    ],
                    max_length=20,
                    unique=True,
                )),
                ('monto_mensual', models.DecimalField(
                    decimal_places=2,
                    help_text='Límite de gasto permitido en el mes calendario.',
                    max_digits=10,
                )),
                ('activo', models.BooleanField(
                    default=True,
                    help_text='Si está inactivo, no se valida presupuesto para esta categoría.',
                )),
                ('notas', models.CharField(blank=True, max_length=255)),
            ],
            options={
                'verbose_name': 'Presupuesto por categoría',
                'verbose_name_plural': 'Presupuestos por categoría',
                'ordering': ['categoria'],
            },
        ),
        migrations.RunPython(seed_presupuestos, unseed_presupuestos),
    ]
