# Generated manually for categoria_web on Producto

from django.db import migrations, models


def seed_categoria_web(apps, schema_editor):
    Producto = apps.get_model('core', 'Producto')
    for p in Producto.objects.filter(tipo='BR'):
        n = (p.nombre or '').lower()
        cat = ''
        if any(k in n for k in ('acuatic', 'agua', 'piscina', 'splash', 'alberca')):
            cat = 'acuaticos'
        elif any(k in n for k in ('chico', 'mini', 'infantil', 'peque')):
            cat = 'chicos'
        elif any(k in n for k in (
            'extrem', 'bungee', 'gladiador', 'demoledor', 'rally', 'wipe',
            'vipe', 'everest', 'xelerator', 'feria',
        )):
            cat = 'extremos'
        elif any(k in n for k in ('mecanic', 'toro', 'bull', 'sumo', 'bumper', 'bumber')):
            cat = 'mecanicos'
        elif 'combo' in n:
            cat = 'medianos'
        else:
            cat = 'medianos'
        Producto.objects.filter(pk=p.pk).update(categoria_web=cat)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0033_sitio_web_y_producto_foto'),
    ]

    operations = [
        migrations.AddField(
            model_name='producto',
            name='categoria_web',
            field=models.CharField(
                blank=True,
                choices=[
                    ('', 'Sin categoría'),
                    ('chicos', 'Chicos'),
                    ('medianos', 'Medianos'),
                    ('acuaticos', 'Acuáticos'),
                    ('extremos', 'Extremos'),
                    ('mecanicos', 'Mecánicos'),
                ],
                default='',
                help_text='Categoría del catálogo público (brincolines).',
                max_length=20,
            ),
        ),
        migrations.RunPython(seed_categoria_web, noop_reverse),
    ]
