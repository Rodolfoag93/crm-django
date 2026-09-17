from django.core.management.base import BaseCommand

from core.services import whatsapp_debounce as wa_deb


class Command(BaseCommand):
    help = 'Reenvía a n8n los buffers WhatsApp cuyo debounce ya venció'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limit',
            type=int,
            default=50,
            help='Máximo de buffers a flushear en esta corrida',
        )

    def handle(self, *args, **options):
        n = wa_deb.flush_due(limit=options['limit'])
        if n:
            self.stdout.write(self.style.SUCCESS(f'Flusheados: {n}'))
        else:
            self.stdout.write('Nada pendiente')
