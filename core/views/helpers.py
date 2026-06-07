from core.models import Cuenta


def get_caja_efectivo():
    return Cuenta.objects.filter(tipo='EFECTIVO', activa=True).first()


def es_admin(user):
    return user.groups.filter(name='Administrador').exists()


def es_cargador(user):
    return user.groups.filter(name='cargador').exists()


def es_encargado_material(user):
    return user.groups.filter(name='Encargado Material').exists()