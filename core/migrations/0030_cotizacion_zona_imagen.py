from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0029_cotizador_y_coordinacion'),
    ]

    operations = [
        migrations.CreateModel(
            name='CotizacionZonaImagen',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('imagen', models.ImageField(upload_to='cotizaciones/zonas/')),
                ('pie', models.CharField(blank=True, default='', max_length=200)),
                ('orden', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('zona', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='imagenes',
                    to='core.cotizacionzona',
                )),
            ],
            options={
                'verbose_name': 'Imagen de zona',
                'verbose_name_plural': 'Imágenes de zona',
                'ordering': ['orden', 'id'],
            },
        ),
    ]
