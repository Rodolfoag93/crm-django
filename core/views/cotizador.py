import json
from decimal import Decimal, InvalidOperation

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.core.paginator import Paginator
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from core.decorators import no_coordinador, solo_admin
from core.models import (
    CONDICIONES_PAGO_RALLY,
    PAQUETES_RALLY,
    Cliente,
    Cotizacion,
    Producto,
)
from core.services.cotizaciones import (
    CotizacionServiceError,
    TIPOS_COTIZACION,
    convertir_a_renta,
    generar_intro,
    productos_catalogo_rally_qs,
    recalcular_totales,
    render_pdf_bytes,
    sincronizar_conceptos,
    sincronizar_zonas,
)


def _parse_decimal(value, default='0'):
    try:
        return Decimal(str(value if value not in (None, '') else default))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def _parse_json_list(raw, field_name='datos'):
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise CotizacionServiceError(f'{field_name} JSON inválido.') from exc
    if not isinstance(data, list):
        raise CotizacionServiceError(f'{field_name} debe ser una lista.')
    return data


def _clientes_productos_context(tipo='NORMAL'):
    clientes = list(Cliente.objects.all().order_by('nombre').values(
        'id', 'nombre', 'telefono', 'calle_y_numero', 'colonia', 'ciudad_o_municipio'
    ))
    if tipo == 'RALLY':
        productos = list(
            productos_catalogo_rally_qs().values('id', 'nombre', 'precio', 'tipo', 'afecta_stock')
        )
    else:
        productos = list(
            Producto.objects.filter(activo=True)
            .exclude(nombre='Proyecto recreativo')
            .order_by('nombre')
            .values('id', 'nombre', 'precio', 'tipo', 'afecta_stock')
        )
    return clientes, productos


def _aplicar_cabecera(cotizacion, post, user=None):
    cliente_id = post.get('cliente_id')
    if not cliente_id:
        raise CotizacionServiceError('Selecciona un cliente.')
    cliente = get_object_or_404(Cliente, id=cliente_id)
    cotizacion.cliente = cliente
    cotizacion.destinatario = (post.get('destinatario') or cliente.nombre).strip()
    cotizacion.nombre_evento = (post.get('nombre_evento') or '').strip()
    asistentes = post.get('asistentes')
    cotizacion.asistentes = int(asistentes) if asistentes else None
    cotizacion.sede = (post.get('sede') or '').strip()
    cotizacion.fecha_evento = post.get('fecha_evento') or None
    cotizacion.hora_inicio = post.get('hora_inicio') or None
    cotizacion.hora_fin = post.get('hora_fin') or None
    cotizacion.intro = (post.get('intro') or '').strip()
    cotizacion.aplicar_iva = post.get('aplicar_iva') == 'on'
    cotizacion.aplicar_isr = post.get('aplicar_isr') == 'on'
    condiciones = (post.get('condiciones_pago') or '').strip()
    if condiciones:
        cotizacion.condiciones_pago = condiciones
    elif cotizacion.tipo == 'RALLY' and not cotizacion.condiciones_pago:
        cotizacion.condiciones_pago = CONDICIONES_PAGO_RALLY
    cotizacion.notas = (post.get('notas') or '').strip()
    if user and not cotizacion.creada_por_id:
        cotizacion.creada_por = user
    if not cotizacion.intro:
        cotizacion.intro = generar_intro(cotizacion)


@login_required
@solo_admin
@no_coordinador
def lista_cotizaciones(request):
    q = (request.GET.get('q') or '').strip()
    tipo = (request.GET.get('tipo') or '').strip()
    status = (request.GET.get('status') or '').strip()
    qs = Cotizacion.objects.select_related('cliente', 'renta').all()
    if q:
        qs = qs.filter(
            Q(folio__icontains=q)
            | Q(cliente__nombre__icontains=q)
            | Q(nombre_evento__icontains=q)
            | Q(destinatario__icontains=q)
        )
    if tipo in TIPOS_COTIZACION:
        qs = qs.filter(tipo=tipo)
    if status:
        qs = qs.filter(status=status)
    page_obj = Paginator(qs, 25).get_page(request.GET.get('page'))
    return render(request, 'core/lista_cotizaciones.html', {
        'page_obj': page_obj,
        'query': q,
        'tipo': tipo,
        'status': status,
        'module': 'ventas',
    })


@login_required
@solo_admin
@no_coordinador
def nueva_cotizacion(request, tipo='NORMAL'):
    tipo = tipo.upper()
    if tipo not in TIPOS_COTIZACION:
        tipo = 'NORMAL'
    clientes, productos = _clientes_productos_context(tipo=tipo)
    if request.method == 'POST':
        try:
            cotizacion = Cotizacion(tipo=tipo, status='BORRADOR')
            if tipo == 'RALLY':
                cotizacion.condiciones_pago = CONDICIONES_PAGO_RALLY
            _aplicar_cabecera(cotizacion, request.POST, user=request.user)
            cotizacion.save()
            sincronizar_conceptos(cotizacion, _parse_json_list(request.POST.get('conceptos_data'), 'conceptos'))
            if tipo in ('PROYECTO', 'RALLY'):
                sincronizar_zonas(cotizacion, _parse_json_list(request.POST.get('zonas_data'), 'zonas'))
            if not cotizacion.intro:
                cotizacion.intro = generar_intro(cotizacion)
                cotizacion.save(update_fields=['intro'])
            messages.success(request, f'Cotización {cotizacion.folio} creada.')
            return redirect('detalle_cotizacion', cotizacion_id=cotizacion.id)
        except CotizacionServiceError as exc:
            messages.error(request, exc.message)
        except Exception as exc:
            messages.error(request, str(exc))
    return render(request, 'core/form_cotizacion.html', {
        'tipo': tipo,
        'cotizacion': None,
        'editando': False,
        'clientes_json': json.dumps(clientes, default=str),
        'productos_json': json.dumps(productos, default=str),
        'paquetes_rally_json': json.dumps(PAQUETES_RALLY, default=str),
        'zonas_json': '[]',
        'conceptos_json': '[]',
        'condiciones_default': CONDICIONES_PAGO_RALLY if tipo == 'RALLY' else None,
        'module': 'ventas',
    })


@login_required
@solo_admin
@no_coordinador
def editar_cotizacion(request, cotizacion_id):
    cotizacion = get_object_or_404(
        Cotizacion.objects.prefetch_related('zonas', 'conceptos'),
        id=cotizacion_id,
    )
    if cotizacion.status == 'CONVERTIDA':
        messages.warning(request, 'La cotización ya fue convertida; solo lectura.')
        return redirect('detalle_cotizacion', cotizacion_id=cotizacion.id)

    clientes, productos = _clientes_productos_context(tipo=cotizacion.tipo)
    if request.method == 'POST':
        try:
            _aplicar_cabecera(cotizacion, request.POST, user=request.user)
            cotizacion.save()
            sincronizar_conceptos(cotizacion, _parse_json_list(request.POST.get('conceptos_data'), 'conceptos'))
            if cotizacion.tipo in ('PROYECTO', 'RALLY'):
                sincronizar_zonas(cotizacion, _parse_json_list(request.POST.get('zonas_data'), 'zonas'))
            messages.success(request, 'Cotización actualizada.')
            return redirect('detalle_cotizacion', cotizacion_id=cotizacion.id)
        except CotizacionServiceError as exc:
            messages.error(request, exc.message)
        except Exception as exc:
            messages.error(request, str(exc))

    zonas = [
        {'orden': z.orden, 'titulo': z.titulo, 'descripcion': z.descripcion}
        for z in cotizacion.zonas.all()
    ]
    conceptos = [
        {
            'orden': c.orden,
            'nombre': c.nombre,
            'descripcion': c.descripcion,
            'cantidad': c.cantidad,
            'monto': str(c.monto),
            'producto_id': c.producto_id,
        }
        for c in cotizacion.conceptos.all()
    ]
    return render(request, 'core/form_cotizacion.html', {
        'tipo': cotizacion.tipo,
        'cotizacion': cotizacion,
        'editando': True,
        'clientes_json': json.dumps(clientes, default=str),
        'productos_json': json.dumps(productos, default=str),
        'paquetes_rally_json': json.dumps(PAQUETES_RALLY, default=str),
        'zonas_json': json.dumps(zonas, default=str),
        'conceptos_json': json.dumps(conceptos, default=str),
        'condiciones_default': None,
        'module': 'ventas',
    })


@login_required
@solo_admin
@no_coordinador
def detalle_cotizacion(request, cotizacion_id):
    cotizacion = get_object_or_404(
        Cotizacion.objects.select_related('cliente', 'renta', 'creada_por')
        .prefetch_related('zonas', 'conceptos__producto'),
        id=cotizacion_id,
    )
    recalcular_totales(cotizacion)
    coordinadores = User.objects.filter(groups__name='Coordinador').order_by('first_name', 'username')
    return render(request, 'core/detalle_cotizacion.html', {
        'cotizacion': cotizacion,
        'coordinadores': coordinadores,
        'module': 'ventas',
    })


@login_required
@solo_admin
@no_coordinador
def cotizacion_pdf(request, cotizacion_id):
    cotizacion = get_object_or_404(
        Cotizacion.objects.select_related('cliente').prefetch_related('zonas', 'conceptos'),
        id=cotizacion_id,
    )
    content = render_pdf_bytes(cotizacion)
    is_pdf = content[:4] == b'%PDF'
    response = HttpResponse(content, content_type='application/pdf' if is_pdf else 'text/html')
    filename = f'cotizacion_{cotizacion.folio}.{"pdf" if is_pdf else "html"}'
    response['Content-Disposition'] = f'inline; filename="{filename}"'
    return response


@login_required
@solo_admin
@no_coordinador
@require_POST
def cambiar_status_cotizacion(request, cotizacion_id):
    cotizacion = get_object_or_404(Cotizacion, id=cotizacion_id)
    nuevo = request.POST.get('status')
    permitidos = {
        'BORRADOR': {'ENVIADA', 'RECHAZADA'},
        'ENVIADA': {'ACEPTADA', 'RECHAZADA', 'BORRADOR'},
        'ACEPTADA': {'RECHAZADA', 'ENVIADA'},
        'RECHAZADA': {'BORRADOR'},
    }
    if cotizacion.status == 'CONVERTIDA':
        messages.error(request, 'No se puede cambiar el estado de una cotización convertida.')
        return redirect('detalle_cotizacion', cotizacion_id=cotizacion.id)
    if nuevo not in permitidos.get(cotizacion.status, set()):
        messages.error(request, 'Transición de estado no permitida.')
        return redirect('detalle_cotizacion', cotizacion_id=cotizacion.id)
    cotizacion.status = nuevo
    cotizacion.save(update_fields=['status', 'updated_at'])
    messages.success(request, f'Estado actualizado a {cotizacion.get_status_display()}.')
    return redirect('detalle_cotizacion', cotizacion_id=cotizacion.id)


@login_required
@solo_admin
@no_coordinador
@require_POST
def convertir_cotizacion(request, cotizacion_id):
    cotizacion = get_object_or_404(Cotizacion, id=cotizacion_id)
    if cotizacion.status not in ('ACEPTADA', 'ENVIADA', 'BORRADOR'):
        messages.error(request, 'Solo se pueden convertir cotizaciones activas.')
        return redirect('detalle_cotizacion', cotizacion_id=cotizacion.id)
    lider_id = request.POST.get('lider_id') or None
    apoyo_ids = request.POST.getlist('apoyo_ids')
    anticipo = _parse_decimal(request.POST.get('anticipo'), '0')
    try:
        resultado = convertir_a_renta(
            cotizacion,
            lider_id=int(lider_id) if lider_id else None,
            apoyo_ids=[int(x) for x in apoyo_ids if x],
            anticipo=anticipo,
        )
        messages.success(
            request,
            f'Cotización convertida a renta {resultado.get("folio")}.',
        )
        return redirect('editar_renta', renta_id=resultado['renta_id'])
    except CotizacionServiceError as exc:
        messages.error(request, exc.message)
        return redirect('detalle_cotizacion', cotizacion_id=cotizacion.id)
