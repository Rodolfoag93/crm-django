import csv
from pathlib import Path

from django.db.models import Q
from django.core.management.base import BaseCommand

from core.models import MaterialAnimacion


class Command(BaseCommand):
    help = (
        'Genera CSV plantilla para emparejar archivos de foto con materiales '
        '(columnas: material_id, nombre, archivo_foto).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            'salida',
            type=str,
            help='Ruta del CSV a crear (ej. materiales_fotos.csv)',
        )
        parser.add_argument(
            '--solo-sin-foto',
            action='store_true',
            help='Solo materiales activos que aún no tienen foto principal',
        )

    def handle(self, *args, **options):
        out = Path(options['salida'])
        qs = MaterialAnimacion.objects.filter(activo=True).order_by('nombre')
        if options['solo_sin_foto']:
            qs = qs.filter(Q(foto='') | Q(foto__isnull=True))

        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open('w', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f)
            w.writerow(['material_id', 'nombre', 'archivo_foto'])
            for m in qs:
                w.writerow([m.id, m.nombre, ''])

        self.stdout.write(
            self.style.SUCCESS(f'Plantilla con {qs.count()} filas → {out}')
        )
        self.stdout.write(
            'Completa archivo_foto con el nombre del archivo (ej. IMG_001.jpg) '
            'y usa: python manage.py importar_fotos_materiales --dir ... --csv ...'
        )
