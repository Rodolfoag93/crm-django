from datetime import timedelta

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib import messages
from django.utils import timezone
from django.views.decorators.http import require_POST

from core.models import (
    Renta, AsignacionCoordinador, MaterialAnimacion,
    MaterialEvento, ListaMaterialEvento, CoordinadorApoyo, SolicitudCambioMaterial,
)
from core.decorators import solo_coordinador
from core.services.coordinacion import (
    CoordinacionError,
    crear_solicitud_cambio,
    es_lider,
    get_asignacion_equipo,
    qs_asignaciones_usuario,
    revisar_solicitud,
)


@login_required
def asignar_coordinador_animacion(request, renta_id):
    renta = get_object_or_404(Renta, id=renta_id)
    asignacion, _ = AsignacionCoordinador.objects.get_or_create(renta=renta)
    if request.method == 'POST':
        coordinador_id = request.POST.get('coordinador')
        notas = request.POST.get('notas', '')
        apoyo_ids = request.POST.getlist('apoyo_ids')
        coordinador = get_object_or_404(User, id=coordinador_id)
        asignacion.coordinador = coordinador
        asignacion.notas = notas
        asignacion.save()

        CoordinadorApoyo.objects.filter(asignacion=asignacion).exclude(
            usuario_id__in=[int(x) for x in apoyo_ids if x and str(x) != str(coordinador.id)]
        ).delete()
        for apoyo_id in apoyo_ids:
            if not apoyo_id or str(apoyo_id) == str(coordinador.id):
                continue
            apoyo = User.objects.filter(id=apoyo_id).first()
            if apoyo:
                CoordinadorApoyo.objects.get_or_create(asignacion=asignacion, usuario=apoyo)
                try:
                    from core.push_notifications import enviar_notificacion
                    enviar_notificacion(
                        apoyo,
                        'Evento como coordinador de apoyo',
                        f'Fuiste agregado como apoyo: {renta.cliente.nombre} el {renta.fecha_renta}',
                        '/coordinador',
                    )
                except Exception:
                    pass

        try:
            from core.push_notifications import enviar_notificacion
            enviar_notificacion(
                coordinador,
                'Nuevo evento asignado',
                f'Tienes un nuevo evento: {renta.cliente.nombre} el {renta.fecha_renta}',
                '/coordinador'
            )
        except Exception:
            pass

        messages.success(request, 'Equipo de coordinación asignado correctamente')
        return redirect('lista_rentas')
    coordinadores = User.objects.filter(groups__name='Coordinador')
    apoyos_actuales = list(asignacion.apoyos.values_list('usuario_id', flat=True))
    return render(request, 'core/asignar_coordinador_animacion.html', {
        'renta': renta,
        'asignacion': asignacion,
        'coordinadores': coordinadores,
        'apoyos_actuales': apoyos_actuales,
    })


@login_required
@solo_coordinador
def mis_eventos(request):
    asignaciones = qs_asignaciones_usuario(request.user).select_related(
        'renta', 'renta__cliente', 'coordinador'
    ).order_by('renta__fecha_renta')
    return render(request, 'core/mis_eventos.html', {
        'asignaciones': asignaciones,
        'user_id': request.user.id,
    })


@login_required
@solo_coordinador
def catalogo_materiales_coordinador(request):
    materiales = MaterialAnimacion.objects.filter(activo=True)
    tipo = request.GET.get('tipo', '')
    if tipo:
        materiales = materiales.filter(tipo=tipo)
    return render(request, 'core/catalogo_materiales_coordinador.html', {
        'materiales': materiales,
        'tipo_filtro': tipo,
    })


@login_required
@solo_coordinador
def detalle_evento(request, asignacion_id):
    try:
        asignacion = get_asignacion_equipo(asignacion_id, request.user)
    except CoordinacionError as exc:
        messages.error(request, exc.message)
        return redirect('mis_eventos')

    lider = es_lider(asignacion, request.user)
    materiales_agregados = asignacion.materiales.select_related('material')
    catalogo = MaterialAnimacion.objects.filter(activo=True)
    lista = ListaMaterialEvento.objects.filter(asignacion=asignacion).first()
    solicitudes = []
    if lista:
        solicitudes = lista.solicitudes_cambio.select_related(
            'material', 'solicitado_por'
        ).filter(estado='PENDIENTE')
    apoyos = asignacion.apoyos.select_related('usuario')
    return render(request, 'core/detalle_evento.html', {
        'asignacion': asignacion,
        'materiales_agregados': materiales_agregados,
        'catalogo': catalogo,
        'es_lider': lider,
        'solicitudes': solicitudes,
        'apoyos': apoyos,
    })


@login_required
@require_POST
@solo_coordinador
def agregar_material_evento(request, asignacion_id):
    try:
        asignacion = get_asignacion_equipo(asignacion_id, request.user)
    except CoordinacionError as exc:
        messages.error(request, exc.message)
        return redirect('mis_eventos')

    material_id = request.POST.get('material_id')
    cantidad = int(request.POST.get('cantidad', 1))
    material = get_object_or_404(MaterialAnimacion, id=material_id)

    if es_lider(asignacion, request.user):
        if cantidad > material.stock_disponible:
            messages.error(
                request,
                f'Solo hay {material.stock_disponible} disponibles de {material.nombre}.'
            )
            return redirect('detalle_evento', asignacion_id=asignacion_id)
        material_evento, created = MaterialEvento.objects.get_or_create(
            asignacion=asignacion,
            material=material,
            defaults={'cantidad': cantidad}
        )
        if not created:
            material_evento.cantidad += cantidad
            material_evento.save()
        if material.tipo == 'CONSUMIBLE':
            material.stock_disponible -= cantidad
            material.save()
        ListaMaterialEvento.objects.get_or_create(asignacion=asignacion)
        messages.success(request, f'{material.nombre} agregado correctamente.')
    else:
        try:
            crear_solicitud_cambio(
                asignacion, request.user, 'AGREGAR', material_id, cantidad
            )
            messages.success(request, 'Solicitud enviada al coordinador líder.')
        except CoordinacionError as exc:
            messages.error(request, exc.message)
    return redirect('detalle_evento', asignacion_id=asignacion_id)


@login_required
@require_POST
@solo_coordinador
def eliminar_material_evento(request, material_evento_id):
    material_evento = get_object_or_404(
        MaterialEvento.objects.select_related('asignacion', 'material'),
        id=material_evento_id,
    )
    asignacion = material_evento.asignacion
    if not (es_lider(asignacion, request.user) or asignacion.apoyos.filter(usuario=request.user).exists()):
        messages.error(request, 'No tienes acceso a este evento.')
        return redirect('mis_eventos')

    asignacion_id = asignacion.id
    if es_lider(asignacion, request.user):
        if material_evento.material.tipo == 'CONSUMIBLE':
            material_evento.material.stock_disponible += material_evento.cantidad
            material_evento.material.save()
        material_evento.delete()
        messages.success(request, 'Material eliminado.')
    else:
        try:
            crear_solicitud_cambio(
                asignacion,
                request.user,
                'QUITAR',
                material_evento.material_id,
                material_evento.cantidad,
            )
            messages.success(request, 'Solicitud de quitar material enviada al líder.')
        except CoordinacionError as exc:
            messages.error(request, exc.message)
    return redirect('detalle_evento', asignacion_id=asignacion_id)


@login_required
@require_POST
@solo_coordinador
def revisar_solicitud_material(request, solicitud_id):
    accion = request.POST.get('accion')
    comentario = request.POST.get('comentario', '')
    try:
        solicitud = revisar_solicitud(
            solicitud_id,
            request.user,
            aprobar=(accion == 'aprobar'),
            comentario=comentario,
        )
        messages.success(
            request,
            f'Solicitud {solicitud.get_estado_display().lower()}.',
        )
        return redirect('detalle_evento', asignacion_id=solicitud.lista.asignacion_id)
    except CoordinacionError as exc:
        messages.error(request, exc.message)
        return redirect('mis_eventos')


def alertas_coordinador(request):
    hoy = timezone.localdate()
    limite = hoy + timedelta(days=7)
    rentas_sin_coordinador = Renta.objects.filter(
        fecha_renta__range=[hoy, limite],
        status='ACTIVO',
        rentaproductos__producto__tipo='AN'
    ).exclude(
        asignacion_coordinador__coordinador__isnull=False
    ).distinct()
    return rentas_sin_coordinador
