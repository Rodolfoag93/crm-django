# Generated manually for temporada alta + validacion logistica

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0026_presupuestocategoria'),
    ]

    operations = [
        migrations.CreateModel(
            name='TemporadaAlta',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=100)),
                ('fecha_inicio', models.DateField()),
                ('fecha_fin', models.DateField()),
                ('activo', models.BooleanField(default=True)),
                ('notas', models.TextField(blank=True)),
            ],
            options={
                'verbose_name': 'Temporada alta',
                'verbose_name_plural': 'Temporadas altas',
                'ordering': ['-fecha_inicio'],
            },
        ),
        migrations.AddField(
            model_name='renta',
            name='validacion_logistica',
            field=models.CharField(
                choices=[
                    ('NO_REQUIERE', 'No requiere'),
                    ('PENDIENTE', 'Pendiente de asesor'),
                    ('APROBADA', 'Aprobada'),
                    ('RECHAZADA', 'Rechazada'),
                ],
                db_index=True,
                default='NO_REQUIERE',
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name='renta',
            name='temporada_alta',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='rentas',
                to='core.temporadaalta',
            ),
        ),
    ]
