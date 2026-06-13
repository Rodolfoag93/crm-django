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
            'paradas__renta__rentaproductos__producto',
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


# ── API REST ───────────────────────────────────────────────────────────────────

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from core.models import EntregaDetalle, RentaProducto


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_mis_rutas(request):
    """
    Devuelve las rutas del día asignadas al empleado autenticado.
    """
    try:
        empleado = request.user.empleado
    except Exception:
        return Response({'error': 'No tienes un perfil de empleado.'}, status=403)

    hoy = timezone.localdate()
    rutas = Ruta.objects.filter(
        empleados__empleado=empleado,
        fecha=hoy,
    ).prefetch_related(
        'paradas__renta__cliente',
        'paradas__renta__rentaproductos__producto',
        'paradas__recogida_programada',
    ).order_by('fecha')

    data = []
    for ruta in rutas:
        paradas = []
        for parada in ruta.paradas.all():
            renta = parada.renta
            productos = []
            for rp in renta.rentaproductos.all():
                productos.append({
                    'id': rp.id,
                    'producto_id': rp.producto.id,
                    'nombre': rp.producto.nombre,
                    'tipo': rp.producto.tipo,
                    'cantidad': rp.cantidad,
                    'es_brincolin': rp.producto.tipo == 'BR',
                })

            recogida = None
            if hasattr(parada, 'recogida_programada'):
                rp_obj = parada.recogida_programada
                recogida = {
                    'fecha': str(rp_obj.fecha_recogida),
                    'tipo_horario': rp_obj.tipo_horario,
                    'hora_inicio': str(rp_obj.hora_inicio),
                    'hora_fin': str(rp_obj.hora_fin) if rp_obj.hora_fin else None,
                }

            paradas.append({
                'id': parada.id,
                'orden': parada.orden,
                'estado': parada.estado,
                'cliente': renta.cliente.nombre,
                'telefono': renta.cliente.telefono,
                'direccion': f"{renta.calle}, {renta.colonia}, {renta.ciudad}",
                'hora_inicio': str(renta.hora_inicio) if renta.hora_inicio else None,
                'hora_fin': str(renta.hora_fin) if renta.hora_fin else None,
                'folio': renta.folio,
                'productos': productos,
                'recogida_programada': recogida,
                'latitud': float(parada.latitud) if parada.latitud else None,
                'longitud': float(parada.longitud) if parada.longitud else None,
            })

        data.append({
            'id': ruta.id,
            'nombre': ruta.nombre,
            'tipo': ruta.tipo,
            'estado': ruta.estado,
            'fecha': str(ruta.fecha),
            'paradas': paradas,
        })

    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_confirmar_entrega(request, parada_id):
    """
    El repartidor marca una parada como entregada.
    Recibe: productos confirmados, motores, extensiones, fecha/hora recogida.
    """
    try:
        empleado = request.user.empleado
    except Exception:
        return Response({'error': 'No tienes un perfil de empleado.'}, status=403)

    parada = get_object_or_404(
        RutaRenta,
        id=parada_id,
        ruta__empleados__empleado=empleado,
        estado='pendiente'
    )

    data = request.data

    # Guardar detalles de entrega
    productos = data.get('productos', [])
    for p in productos:
        EntregaDetalle.objects.update_or_create(
            ruta_renta=parada,
            producto_renta_id=p['producto_renta_id'],
            defaults={
                'cantidad_confirmada': p.get('cantidad_confirmada', 0),
                'motores_dejados': p.get('motores_dejados', 0),
                'extensiones_dejadas': p.get('extensiones_dejadas', 0),
            }
        )

    # Guardar recogida programada
    fecha_recogida = data.get('fecha_recogida')
    hora_inicio = data.get('hora_inicio')
    hora_fin = data.get('hora_fin')
    tipo_horario = data.get('tipo_horario', 'rango')

    if fecha_recogida and hora_inicio:
        RecogidaProgramada.objects.update_or_create(
            ruta_renta_entrega=parada,
            defaults={
                'fecha_recogida': fecha_recogida,
                'tipo_horario': tipo_horario,
                'hora_inicio': hora_inicio,
                'hora_fin': hora_fin if tipo_horario == 'rango' else None,
                'notas': data.get('notas', ''),
            }
        )

    # Guardar geolocalización
    parada.latitud = data.get('latitud')
    parada.longitud = data.get('longitud')
    parada.estado = 'entregado'
    parada.hora_confirmacion = timezone.now()
    parada.notas_campo = data.get('notas_campo', '')
    parada.save()

    return Response({'ok': True, 'mensaje': 'Entrega confirmada.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_confirmar_recogida(request, parada_id):
    """
    El repartidor marca una parada como recogida.
    """
    try:
        empleado = request.user.empleado
    except Exception:
        return Response({'error': 'No tienes un perfil de empleado.'}, status=403)

    parada = get_object_or_404(
        RutaRenta,
        id=parada_id,
        ruta__empleados__empleado=empleado,
        estado='entregado'
    )

    parada.latitud = request.data.get('latitud')
    parada.longitud = request.data.get('longitud')
    parada.estado = 'recogido'
    parada.hora_confirmacion = timezone.now()
    parada.notas_campo = request.data.get('notas_campo', '')
    parada.save()

    return Response({'ok': True, 'mensaje': 'Recogida confirmada.'})