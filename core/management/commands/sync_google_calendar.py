from datetime import date, datetime

from django.core.management.base import BaseCommand
from django.db.models import Q

from core.google_calendar import crear_evento_renta
from core.models import Renta


class Command(BaseCommand):
    help = (
        'Sincroniza rentas activas con Google Calendar '
        '(por defecto: desde hoy, sin evento_google_id).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--desde',
            type=str,
            default=None,
            help='Fecha mínima YYYY-MM-DD (default: hoy)',
        )
        parser.add_argument(
            '--hasta',
            type=str,
            default=None,
            help='Fecha máxima YYYY-MM-DD (opcional)',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='También actualiza rentas que ya tienen evento_google_id',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Solo muestra qué se sincronizaría, sin escribir',
        )

    def handle(self, *args, **options):
        desde = (
            datetime.strptime(options['desde'], '%Y-%m-%d').date()
            if options['desde']
            else date.today()
        )
        hasta = (
            datetime.strptime(options['hasta'], '%Y-%m-%d').date()
            if options['hasta']
            else None
        )

        qs = (
            Renta.objects.filter(fecha_renta__gte=desde, status='ACTIVO')
            .exclude(estado_entrega='CANCELADO')
            .select_related('cliente')
            .prefetch_related('rentaproductos__producto')
            .order_by('fecha_renta', 'id')
        )
        if hasta:
            qs = qs.filter(fecha_renta__lte=hasta)
        if not options['force']:
            qs = qs.filter(Q(evento_google_id__isnull=True) | Q(evento_google_id=''))

        total = qs.count()
        self.stdout.write(
            f'Rentas a sincronizar: {total} '
            f'(desde={desde}' + (f', hasta={hasta}' if hasta else '') +
            (', force' if options['force'] else '') + ')'
        )

        if options['dry_run']:
            for renta in qs[:50]:
                self.stdout.write(
                    f'  [dry-run] {renta.folio} {renta.fecha_renta} {renta.cliente.nombre}'
                )
            if total > 50:
                self.stdout.write(f'  ... y {total - 50} más')
            return

        ok = 0
        fail = 0
        for renta in qs:
            evento_id = crear_evento_renta(renta)
            if evento_id:
                if renta.evento_google_id != evento_id:
                    renta.evento_google_id = evento_id
                    renta.save(update_fields=['evento_google_id'])
                ok += 1
                self.stdout.write(self.style.SUCCESS(
                    f'  OK {renta.folio} {renta.fecha_renta} -> {evento_id}'
                ))
            else:
                fail += 1
                self.stdout.write(self.style.ERROR(
                    f'  FAIL {renta.folio} {renta.fecha_renta}'
                ))

        self.stdout.write(self.style.SUCCESS(f'Listo: {ok} ok, {fail} fail, {total} total'))
