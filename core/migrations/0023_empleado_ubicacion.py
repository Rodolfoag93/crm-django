from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0022_renta_lat_lon'),
    ]

    operations = [
        migrations.AddField(
            model_name='empleado',
            name='lat_actual',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
        ),
        migrations.AddField(
            model_name='empleado',
            name='lon_actual',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
        ),
        migrations.AddField(
            model_name='empleado',
            name='ultima_ubicacion',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
