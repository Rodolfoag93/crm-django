from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0021_add_recogido_estado_entrega'),
    ]

    operations = [
        migrations.AddField(
            model_name='renta',
            name='lat',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
        ),
        migrations.AddField(
            model_name='renta',
            name='lon',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
        ),
    ]
