from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0020_calificacionanimador'),
    ]

    operations = [
        migrations.AlterField(
            model_name='renta',
            name='estado_entrega',
            field=models.CharField(
                choices=[
                    ('PENDIENTE', 'Pendiente'),
                    ('ASIGNADO', 'Asignado'),
                    ('EN_RUTA', 'En ruta'),
                    ('ENTREGADO', 'Entregado'),
                    ('RECOGIDO', 'Recogido'),
                    ('CANCELADO', 'Cancelado'),
                ],
                default='PENDIENTE',
                max_length=20,
            ),
        ),
    ]
