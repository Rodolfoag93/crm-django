# Generated manually for facturación FiscalAPI

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0027_temporada_alta_validacion_logistica'),
    ]

    operations = [
        migrations.AddField(
            model_name='cliente',
            name='rfc',
            field=models.CharField(blank=True, default='', max_length=13),
        ),
        migrations.AddField(
            model_name='cliente',
            name='razon_social',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='cliente',
            name='regimen_fiscal',
            field=models.CharField(blank=True, default='', max_length=3),
        ),
        migrations.AddField(
            model_name='cliente',
            name='codigo_postal_fiscal',
            field=models.CharField(blank=True, default='', max_length=5),
        ),
        migrations.AddField(
            model_name='cliente',
            name='email_facturacion',
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),
        migrations.AddField(
            model_name='cliente',
            name='uso_cfdi_default',
            field=models.CharField(blank=True, default='G03', max_length=5),
        ),
        migrations.CreateModel(
            name='Factura',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('estatus', models.CharField(choices=[('BORRADOR', 'Borrador'), ('TIMBRADA', 'Timbrada'), ('CANCELADA', 'Cancelada'), ('ERROR', 'Error')], db_index=True, default='BORRADOR', max_length=12)),
                ('rfc', models.CharField(max_length=13)),
                ('razon_social', models.CharField(max_length=255)),
                ('regimen_fiscal', models.CharField(max_length=3)),
                ('codigo_postal', models.CharField(max_length=5)),
                ('email', models.EmailField(blank=True, default='', max_length=254)),
                ('uso_cfdi', models.CharField(default='G03', max_length=5)),
                ('total', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('serie', models.CharField(blank=True, default='', max_length=25)),
                ('folio', models.CharField(blank=True, default='', max_length=40)),
                ('uuid', models.CharField(blank=True, db_index=True, default='', max_length=64)),
                ('provider', models.CharField(default='fiscalapi', max_length=32)),
                ('provider_id', models.CharField(blank=True, default='', max_length=64)),
                ('pdf_url', models.URLField(blank=True, default='', max_length=500)),
                ('xml_url', models.URLField(blank=True, default='', max_length=500)),
                ('error_mensaje', models.TextField(blank=True, default='')),
                ('timbrada_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('cliente', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='facturas', to='core.cliente')),
                ('creada_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='facturas_creadas', to=settings.AUTH_USER_MODEL)),
                ('renta', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='facturas', to='core.renta')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='factura',
            index=models.Index(fields=['renta', 'estatus'], name='core_factur_renta_i_idx'),
        ),
    ]
