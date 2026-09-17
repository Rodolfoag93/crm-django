import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0037_cotizacionconcepto_es_sugerencia'),
    ]

    operations = [
        migrations.CreateModel(
            name='EncuestaClienteAnimacion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('comunicacion_previo', models.PositiveSmallIntegerField(help_text='Coordinador se comunicó a tiempo y resolvió dudas', validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
                ('atencion_coordinador', models.PositiveSmallIntegerField(help_text='Atento al staff e invitados', validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
                ('juegos_aceptacion', models.PositiveSmallIntegerField(help_text='Juegos con buena aceptación / opciones para todos', validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
                ('staff_servicio', models.PositiveSmallIntegerField(help_text='Staff puntual, amable y al pendiente', validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
                ('material_estado', models.PositiveSmallIntegerField(help_text='Material en buen estado y listo', validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
                ('comentario', models.TextField(blank=True)),
                ('fecha', models.DateTimeField(auto_now=True)),
                ('asignacion', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='encuesta_cliente', to='core.asignacioncoordinador')),
                ('capturada_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='encuestas_cliente_capturadas', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Encuesta cliente animación',
            },
        ),
    ]
