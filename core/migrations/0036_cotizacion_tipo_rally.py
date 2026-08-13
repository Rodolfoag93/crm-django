from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0035_producto_meta_retailer_id'),
    ]

    operations = [
        migrations.AlterField(
            model_name='cotizacion',
            name='tipo',
            field=models.CharField(
                choices=[
                    ('NORMAL', 'Normal'),
                    ('PROYECTO', 'Proyecto'),
                    ('RALLY', 'Rally'),
                ],
                default='NORMAL',
                max_length=10,
            ),
        ),
    ]
