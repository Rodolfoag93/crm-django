from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0030_cotizacion_zona_imagen'),
    ]

    operations = [
        migrations.CreateModel(
            name='WhatsAppBotPause',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('telefono', models.CharField(db_index=True, max_length=20, unique=True)),
                ('reason', models.CharField(default='smb_echo', max_length=40)),
                ('paused_at', models.DateTimeField(auto_now=True)),
                ('expires_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={
                'verbose_name': 'Pausa bot WhatsApp',
                'verbose_name_plural': 'Pausas bot WhatsApp',
            },
        ),
    ]
