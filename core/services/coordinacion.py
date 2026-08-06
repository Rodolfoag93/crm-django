"""Helpers de acceso líder/apoyo y solicitudes de cambio de material."""

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone

from core.models import (
    AsignacionCoordinador,
    CoordinadorApoyo,
    ListaMaterialEvento,
    MaterialAnimacion,
    MaterialEvento,
    SolicitudCambioMaterial,
)


class CoordinacionError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def qs_asignaciones_usuario(user):
    return AsignacionCoordinador.objects.filter(
        Q(coordinador=user) | Q(apoyos__usuario=user)
    ).distinct()


def es_lider(asignacion, user) -> bool:
    return asignacion.coordinador_id == user.id


def es_apoyo(asignacion, user) -> bool:
    return CoordinadorApoyo.objects.filter(asignacion=asignacion, usuario=user).exists()


def es_equipo(asignacion, user) -> bool:
    return es_lider(asignacion, user) or es_apoyo(asignacion, user)


def get_asignacion_equipo(asignacion_id, user):
    asignacion = get_object_or_404(
        AsignacionCoordinador.objects.select_related('renta', 'renta__cliente', 'coordinador'),
        id=asignacion_id,
    )
    if not es_equipo(asignacion, user):
        raise CoordinacionError('No tienes acceso a este evento.', status=403)
    return asignacion


def obtener_o_crear_lista(asignacion):
    lista, _ = ListaMaterialEvento.objects.get_or_create(
        asignacion=asignacion,
        defaults={'estado': 'BORRADOR'},
    )
    return lista


def crear_solicitud_cambio(asignacion, user, tipo, material_id, cantidad=1, nota=''):
    if not es_apoyo(asignacion, user):
        raise CoordinacionError('Solo coordinadores de apoyo pueden solicitar cambios.')
    if es_lider(asignacion, user):
        raise CoordinacionError('El líder debe editar la lista directamente.')
    lista = obtener_o_crear_lista(asignacion)
    if lista.estado not in ('BORRADOR', 'PENDIENTE'):
        raise CoordinacionError('La lista ya no admite cambios (solo en borrador).')
    material = get_object_or_404(MaterialAnimacion, id=material_id, activo=True)
    cantidad = max(int(cantidad or 1), 1)
    solicitud = SolicitudCambioMaterial.objects.create(
        lista=lista,
        tipo=tipo,
        material=material,
        cantidad=cantidad,
        nota=nota or '',
        solicitado_por=user,
        estado='PENDIENTE',
    )
    if asignacion.coordinador_id:
        try:
            from core.push_notifications import enviar_notificacion
            enviar_notificacion(
                asignacion.coordinador,
                'Solicitud de material pendiente',
                f'{user.get_full_name() or user.username} solicita {tipo.lower()} {material.nombre}',
                f'/mis-eventos/{asignacion.id}/',
            )
        except Exception:
            pass
    return solicitud


def _aplicar_cambio(asignacion, tipo, material, cantidad, nota=''):
    if tipo == 'AGREGAR':
        item, created = MaterialEvento.objects.get_or_create(
            asignacion=asignacion,
            material=material,
            defaults={'cantidad': cantidad, 'nota': nota},
        )
        if not created:
            item.cantidad = cantidad
            if nota:
                item.nota = nota
            item.save()
        return item
    if tipo == 'CAMBIAR_CANTIDAD':
        item = MaterialEvento.objects.filter(asignacion=asignacion, material=material).first()
        if not item:
            raise CoordinacionError('El material no está en la lista.')
        item.cantidad = cantidad
        if nota:
            item.nota = nota
        item.save()
        return item
    if tipo == 'QUITAR':
        deleted, _ = MaterialEvento.objects.filter(
            asignacion=asignacion, material=material
        ).delete()
        if not deleted:
            raise CoordinacionError('El material no está en la lista.')
        return None
    raise CoordinacionError('Tipo de cambio inválido.')


def revisar_solicitud(solicitud_id, lider, aprobar=True, comentario=''):
    solicitud = get_object_or_404(
        SolicitudCambioMaterial.objects.select_related(
            'lista', 'lista__asignacion', 'material'
        ),
        id=solicitud_id,
    )
    asignacion = solicitud.lista.asignacion
    if not es_lider(asignacion, lider):
        raise CoordinacionError('Solo el coordinador líder puede revisar solicitudes.', status=403)
    if solicitud.estado != 'PENDIENTE':
        raise CoordinacionError('La solicitud ya fue revisada.')

    with transaction.atomic():
        if aprobar:
            _aplicar_cambio(
                asignacion,
                solicitud.tipo,
                solicitud.material,
                solicitud.cantidad,
                solicitud.nota,
            )
            solicitud.estado = 'APROBADA'
        else:
            solicitud.estado = 'RECHAZADA'
        solicitud.revisado_por = lider
        solicitud.comentario_revision = comentario or ''
        solicitud.revisado_at = timezone.now()
        solicitud.save()

    try:
        from core.push_notifications import enviar_notificacion
        enviar_notificacion(
            solicitud.solicitado_por,
            f'Solicitud de material {solicitud.estado.lower()}',
            f'{solicitud.material.nombre}: {solicitud.get_estado_display()}',
            f'/mis-eventos/{asignacion.id}/',
        )
    except Exception:
        pass
    return solicitud
