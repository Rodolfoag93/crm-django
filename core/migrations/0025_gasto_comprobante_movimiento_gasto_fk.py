# Generated manually for gastos CRM module

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0024_calificacion_encargado'),
    ]

    operations = [
        migrations.AddField(
            model_name='gasto',
            name='comprobante',
            field=models.FileField(blank=True, null=True, upload_to='gastos/comprobantes/'),
        ),
        migrations.AddField(
            model_name='movimientocontable',
            name='gasto',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='movimientos',
                to='core.gasto',
            ),
        ),
    ]
