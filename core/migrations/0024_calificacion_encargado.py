from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0023_empleado_ubicacion'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CalificacionEncargado',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('puntualidad',  models.DecimalField(decimal_places=1, max_digits=3)),
                ('orden',        models.DecimalField(decimal_places=1, max_digits=3)),
                ('comunicacion', models.DecimalField(decimal_places=1, max_digits=3)),
                ('disposicion',  models.DecimalField(decimal_places=1, max_digits=3)),
                ('comentario',   models.TextField(blank=True)),
                ('fecha',        models.DateTimeField(auto_now_add=True)),
                ('lista', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='calificacion_al_encargado',
                    to='core.listamaterialevento',
                )),
                ('calificador', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='calificaciones_dadas_a_encargados',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
        migrations.CreateModel(
            name='CalificacionCoordinadorPorEncargado',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('puntualidad',  models.DecimalField(decimal_places=1, max_digits=3)),
                ('orden',        models.DecimalField(decimal_places=1, max_digits=3)),
                ('comunicacion', models.DecimalField(decimal_places=1, max_digits=3)),
                ('disposicion',  models.DecimalField(decimal_places=1, max_digits=3)),
                ('comentario',   models.TextField(blank=True)),
                ('fecha',        models.DateTimeField(auto_now_add=True)),
                ('lista', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='calificacion_al_coordinador',
                    to='core.listamaterialevento',
                )),
                ('calificador', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='calificaciones_dadas_a_coordinadores',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
    ]
