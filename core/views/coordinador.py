from datetime import timedelta

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib import messages
from django.utils import timezone
from django.views.decorators.http import require_POST

from core.models import (
    Renta, AsignacionCoordinador, MaterialAnimacion,
    MaterialEvento, ListaMaterialEvento
)
from core.decorators import solo_coordinador


@login_required
def asignar_coordinador_animacion(request, renta_id):
    renta = get_object_or_404(Renta, id=renta_id)
    asignacion, _ = AsignacionCoordinador.objects.get_or_create(renta=renta)
    if request.method == 'POST':
        coordinador_id = request.POST.get('coordinador')
        notas = request.POST.get('notas', '')
        coordinador = get_object_or_404(User, id=coordinador_id)
        asignacion.coordinador = coordinador
        asignacion.notas = notas
        asignacion.save()
        try:
            from core.push_notifications import enviar_notificacion
            enviar_notificacion(
                coordinador,
                '🎉 Nuevo evento asignado',
                f'Tienes un nuevo evento: {renta.cliente.nombre} el {renta.fecha_renta}',
                '/coordinador'
            )
        except Exception:
            pass
        
        messages.success(request, 'Coordinador asignado correctamente')
        return redirect('lista_rentas')
    coordinadores = User.objects.filter(groups__name='Coordinador')
    return render(request, 'core/asignar_coordinador_animacion.html', {
        'renta': renta,
        'asignacion': asignacion,
        'coordinadores': coordinadores,
    })


@login_required
@solo_coordinador
def mis_eventos(request):
    asignaciones = AsignacionCoordinador.objects.filter(
        coordinador=request.user
    ).select_related('renta', 'renta__cliente').order_by('renta__fecha_renta')
    return render(request, 'core/mis_eventos.html', {'asignaciones': asignaciones})


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
    asignacion = get_object_or_404(
        AsignacionCoordinador,
        id=asignacion_id,
        coordinador=request.user
    )
    materiales_agregados = asignacion.materiales.select_related('material')
    catalogo = MaterialAnimacion.objects.filter(activo=True)
    return render(request, 'core/detalle_evento.html', {
        'asignacion': asignacion,
        'materiales_agregados': materiales_agregados,
        'catalogo': catalogo,
    })


@login_required
@require_POST
@solo_coordinador
def agregar_material_evento(request, asignacion_id):
    asignacion = get_object_or_404(
        AsignacionCoordinador,
        id=asignacion_id,
        coordinador=request.user
    )
    material_id = request.POST.get('material_id')
    cantidad = int(request.POST.get('cantidad', 1))
    material = get_object_or_404(MaterialAnimacion, id=material_id)
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
    return redirect('detalle_evento', asignacion_id=asignacion_id)


@login_required
@require_POST
@solo_coordinador
def eliminar_material_evento(request, material_evento_id):
    material_evento = get_object_or_404(MaterialEvento, id=material_evento_id)
    asignacion_id = material_evento.asignacion.id
    if material_evento.material.tipo == 'CONSUMIBLE':
        material_evento.material.stock_disponible += material_evento.cantidad
        material_evento.material.save()
    material_evento.delete()
    messages.success(request, 'Material eliminado.')
    return redirect('detalle_evento', asignacion_id=asignacion_id)


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