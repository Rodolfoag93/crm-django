from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0036_cotizacion_tipo_rally'),
    ]

    operations = [
        migrations.AddField(
            model_name='cotizacionconcepto',
            name='es_sugerencia',
            field=models.BooleanField(db_index=True, default=False),
        ),
    ]
