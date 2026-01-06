from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission
from django.apps import apps

class Command(BaseCommand):
    help = 'Crear grupos y asignar permisos básicos'

    def handle(self, *args, **options):
        config = {
            'Administrador': {
                'models': ['cliente', 'producto', 'renta', 'gasto', 'compra'],
                'perms' : ['add', 'change', 'delete', 'view'],
            },
            'Cargador': {
                'models': ['renta'],
                'perms' : ['view'],
            },
        }
        for group_name, info in config.items():
            g, created = Group.objects.get_or_create(name=group_name)
            for model_name in info['models']:
                for perm_action in info['perms']:
                    codename = f"{perm_action}_{model_name}"
                    try:
                        perm = Permission.objects.get(codename=codename)
                        g.permissions.add(perm)
                    except Permission.DoesNotExist:
                        self.stdout.write(self.style.WARNING(
                            f"Permiso {codename} no existe (por favor ejecutar makemigrations/migrate primero)"))
            self.stdout.write(self.style.SUCCESS(f"Grupo {group_name} procesado."))