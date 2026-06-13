from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.utils import timezone
from core.decorators import solo_admin
from core.models import (
    Ruta, RutaEmpleado, RutaRenta, RecogidaProgramada,
    Renta, Empleado
)


# ── Lista de rutas ─────────────────────────────────────────────────────────────

@login_required
@solo_admin
def lista_rutas(request):
    rutas = Ruta.objects.prefetch_related('empleados__empleado', 'paradas').order_by('-fecha')
    return render(request, 'core/rutas/lista_rutas.html', {'rutas': rutas})


# ── Crear ruta ─────────────────────────────────────────────────────────────────

@login_required
@solo_admin
def crear_ruta(request):
    if request.method == 'POST':
        nombre = request.POST.get('nombre')
        tipo = request.POST.get('tipo')
        fecha = request.POST.get('fecha')
        notas = request.POST.get('notas', '')
        empleados_ids = request.POST.getlist('empleados')
        lider_id = request.POST.get('lider')

        ruta = Ruta.objects.create(
            nombre=nombre,
            tipo=tipo,
            fecha=fecha,
            notas=notas,
        )

        for emp_id in empleados_ids:
            RutaEmpleado.objects.create(
                ruta=ruta,
                empleado_id=emp_id,
                es_lider=(str(emp_id) == str(lider_id))
            )

        return redirect('detalle_ruta', ruta_id=ruta.id)

    empleados = Empleado.objects.filter(activo=True).order_by('nombre')
    return render(request, 'core/rutas/crear_ruta.html', {
        'empleados': empleados,
        'today': timezone.localdate(),
    })


# ── Detalle de ruta ────────────────────────────────────────────────────────────

@login_required
@solo_admin
def detalle_ruta(request, ruta_id):
    ruta = get_object_or_404(
        Ruta.objects.prefetch_related(
            'empleados__empleado',
            'paradas__renta__cliente',
            'paradas__renta__rentaproducto_set__producto',
            'paradas__recogida_programada',
        ),
        id=ruta_id
    )
    # Rentas disponibles para agregar (mismo día, sin parada en esta ruta)
    rentas_disponibles = Renta.objects.filter(
        fecha_renta=ruta.fecha,
    ).exclude(
        rutas__ruta=ruta
    ).select_related('cliente').order_by('cliente__nombre')

    return render(request, 'core/rutas/detalle_ruta.html', {
        'ruta': ruta,
        'rentas_disponibles': rentas_disponibles,
    })


# ── Agregar parada a ruta ──────────────────────────────────────────────────────

@login_required
@solo_admin
def agregar_parada(request, ruta_id):
    ruta = get_object_or_404(Ruta, id=ruta_id)
    if request.method == 'POST':
        renta_id = request.POST.get('renta')
        orden = ruta.paradas.count() + 1
        RutaRenta.objects.create(
            ruta=ruta,
            renta_id=renta_id,
            orden=orden,
        )
    return redirect('detalle_ruta', ruta_id=ruta_id)


# ── Cambiar estado de ruta ─────────────────────────────────────────────────────

@login_required
@solo_admin
def cambiar_estado_ruta(request, ruta_id):
    ruta = get_object_or_404(Ruta, id=ruta_id)
    if request.method == 'POST':
        nuevo_estado = request.POST.get('estado')
        if nuevo_estado in dict(Ruta.ESTADO):
            ruta.estado = nuevo_estado
            ruta.save()
    return redirect('detalle_ruta', ruta_id=ruta_id)


# ── Ver recogidas programadas ──────────────────────────────────────────────────

@login_required
@solo_admin
def lista_recogidas(request):
    recogidas = RecogidaProgramada.objects.select_related(
        'ruta_renta_entrega__renta__cliente',
        'ruta_renta_entrega__ruta',
    ).order_by('fecha_recogida')

    # Filtro por fecha si se pasa por GET
    fecha = request.GET.get('fecha')
    if fecha:
        recogidas = recogidas.filter(fecha_recogida=fecha)

    return render(request, 'core/rutas/lista_recogidas.html', {
        'recogidas': recogidas,
        'fecha_filtro': fecha,
        'today': timezone.localdate(),
    })