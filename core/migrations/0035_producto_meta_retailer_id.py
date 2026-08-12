# Generated manually for WhatsApp catalog cart mapping

from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0034_producto_categoria_web'),
    ]

    operations = [
        migrations.AddField(
            model_name='producto',
            name='meta_retailer_id',
            field=models.CharField(
                blank=True,
                db_index=True,
                default='',
                help_text='product_retailer_id del catálogo Meta/WhatsApp. Debe coincidir exactamente.',
                max_length=64,
            ),
        ),
        migrations.AddConstraint(
            model_name='producto',
            constraint=models.UniqueConstraint(
                condition=~Q(meta_retailer_id=''),
                fields=('meta_retailer_id',),
                name='producto_meta_retailer_id_unique_nonempty',
            ),
        ),
    ]
