from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from core.models import FotoMaterial, MaterialAnimacion


class Command(BaseCommand):
    help = 'Limpia referencias a fotos cuyo archivo ya no existe en disco'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Mostrar cambios sin aplicarlos',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        media_root = Path(settings.MEDIA_ROOT)

        materiales_limpiados = 0
        fotos_extra_limpiadas = 0

        for material in MaterialAnimacion.objects.exclude(foto='').exclude(foto__isnull=True):
            if self._archivo_existe(media_root, material.foto.name):
                continue
            self.stdout.write(f'Material #{material.id} {material.nombre}: {material.foto.name}')
            if not dry_run:
                material.foto = None
                material.save(update_fields=['foto'])
            materiales_limpiados += 1

        for foto in FotoMaterial.objects.all():
            if self._archivo_existe(media_root, foto.foto.name):
                continue
            self.stdout.write(
                f'FotoMaterial #{foto.id} ({foto.material.nombre}): {foto.foto.name}'
            )
            if not dry_run:
                foto.delete()
            fotos_extra_limpiadas += 1

        prefix = 'Se limpiarían' if dry_run else 'Limpiados'
        self.stdout.write(
            self.style.SUCCESS(
                f'{prefix}: {materiales_limpiados} materiales, '
                f'{fotos_extra_limpiadas} fotos extra'
            )
        )

    def _archivo_existe(self, media_root, nombre):
        return (media_root / nombre).exists()
