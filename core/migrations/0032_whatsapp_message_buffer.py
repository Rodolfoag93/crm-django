from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0031_whatsapp_bot_pause'),
    ]

    operations = [
        migrations.CreateModel(
            name='WhatsAppMessageBuffer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('telefono', models.CharField(db_index=True, max_length=20, unique=True)),
                ('textos', models.JSONField(blank=True, default=list)),
                ('profile_name', models.CharField(blank=True, default='', max_length=120)),
                ('last_message_id', models.CharField(blank=True, default='', max_length=120)),
                ('process_after', models.DateTimeField(db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Buffer mensaje WhatsApp',
                'verbose_name_plural': 'Buffers mensaje WhatsApp',
            },
        ),
    ]
