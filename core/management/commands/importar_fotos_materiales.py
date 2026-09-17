import csv
from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError

from core.models import MaterialAnimacion


class Command(BaseCommand):
    help = (
        'Asigna fotos al catálogo de materiales desde una carpeta, '
        'usando un CSV con columnas material_id (o nombre) y archivo_foto.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dir',
            required=True,
            type=str,
            help='Carpeta con las imágenes (en el servidor)',
        )
        parser.add_argument(
            '--csv',
            required=True,
            type=str,
            help='CSV: material_id, nombre, archivo_foto (ver exportar_materiales_fotos_csv)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Mostrar emparejamientos sin guardar',
        )
        parser.add_argument(
            '--sobrescribir',
            action='store_true',
            help='Reemplazar foto principal si el material ya tiene una',
        )

    def handle(self, *args, **options):
        base = Path(options['dir']).expanduser().resolve()
        csv_path = Path(options['csv']).expanduser().resolve()
        dry_run = options['dry_run']
        sobrescribir = options['sobrescribir']

        if not base.is_dir():
            raise CommandError(f'No existe la carpeta: {base}')
        if not csv_path.is_file():
            raise CommandError(f'No existe el CSV: {csv_path}')

        archivos = {
            p.name.lower(): p
            for p in base.iterdir()
            if p.is_file() and p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
        }

        ok = 0
        omitidos = 0
        errores = 0

        with csv_path.open(newline='', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            if not reader.fieldnames:
                raise CommandError('CSV vacío o sin encabezados')

            for i, row in enumerate(reader, start=2):
                archivo = (row.get('archivo_foto') or row.get('archivo') or '').strip()
                if not archivo:
                    continue

                material = self._resolver_material(row)
                if not material:
                    self.stdout.write(
                        self.style.WARNING(f'Línea {i}: material no encontrado → {row}')
                    )
                    errores += 1
                    continue

                path = archivos.get(archivo.lower()) or archivos.get(Path(archivo).name.lower())
                if not path:
                    self.stdout.write(
                        self.style.WARNING(
                            f'Línea {i}: archivo no en {base.name} → {archivo!r}'
                        )
                    )
                    errores += 1
                    continue

                if material.foto and not sobrescribir:
                    self.stdout.write(
                        f'Línea {i}: #{material.id} {material.nombre} ya tiene foto (usa --sobrescribir)'
                    )
                    omitidos += 1
                    continue

                self.stdout.write(
                    f'{"[dry-run] " if dry_run else ""}#{material.id} {material.nombre} ← {path.name}'
                )
                if not dry_run:
                    with path.open('rb') as img:
                        material.foto.save(path.name, File(img), save=True)
                ok += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Listo: {ok} asignadas, {omitidos} omitidas, {errores} errores'
                + (' (dry-run)' if dry_run else '')
            )
        )

    def _resolver_material(self, row: dict) -> MaterialAnimacion | None:
        mid = (row.get('material_id') or row.get('id') or '').strip()
        if mid.isdigit():
            return MaterialAnimacion.objects.filter(id=int(mid)).first()

        nombre = (row.get('nombre') or row.get('material') or '').strip()
        if nombre:
            return MaterialAnimacion.objects.filter(nombre__iexact=nombre).first()
        return None
