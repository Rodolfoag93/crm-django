"""Servicio de cotizaciones: totales, PDF y conversión a renta."""

from datetime import date, datetime, time
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO

from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from core.models import (
    NOMBRE_PRODUCTO_PROYECTO,
    AsignacionCoordinador,
    CoordinadorApoyo,
    Cotizacion,
    CotizacionConcepto,
    CotizacionZona,
    Producto,
)
from core.services.rentas import RentaServiceError, crear_renta

IVA_RATE = Decimal('0.16')
ISR_RATE = Decimal('0.0125')


class CotizacionServiceError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def _money(value):
    return Decimal(str(value or 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def parse_fecha(value):
    """Acepta date, datetime o string ISO (YYYY-MM-DD)."""
    if value in (None, ''):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raw = str(value).strip()[:10]
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise CotizacionServiceError(f'Fecha inválida: {value}') from exc


def parse_hora(value):
    """Acepta time o string HH:MM / HH:MM:SS."""
    if value in (None, ''):
        return None
    if isinstance(value, time):
        return value
    raw = str(value).strip()
    for fmt in ('%H:%M:%S', '%H:%M'):
        try:
            return datetime.strptime(raw, fmt).time()
        except ValueError:
            continue
    raise CotizacionServiceError(f'Hora inválida: {value}')


def _fmt_fecha(value, fmt='%d/%m/%Y'):
    d = parse_fecha(value)
    return d.strftime(fmt) if d else ''


def _fmt_hora(value, fmt='%H:%M'):
    t = parse_hora(value)
    return t.strftime(fmt) if t else ''


def recalcular_totales(cotizacion: Cotizacion) -> Cotizacion:
    subtotal = sum((_money(c.monto) for c in cotizacion.conceptos.all()), Decimal('0.00'))
    monto_iva = _money(subtotal * IVA_RATE) if cotizacion.aplicar_iva else Decimal('0.00')
    monto_isr = _money(subtotal * ISR_RATE) if cotizacion.aplicar_isr else Decimal('0.00')
    total = _money(subtotal + monto_iva - monto_isr)
    cotizacion.subtotal = subtotal
    cotizacion.monto_iva = monto_iva
    cotizacion.monto_isr = monto_isr
    cotizacion.total = total
    cotizacion.save(update_fields=['subtotal', 'monto_iva', 'monto_isr', 'total', 'updated_at'])
    return cotizacion


def generar_intro(cotizacion: Cotizacion) -> str:
    cliente = cotizacion.cliente.nombre
    dest = cotizacion.destinatario or cliente
    if cotizacion.tipo == 'PROYECTO':
        partes = [
            f'Por medio del presente le presentamos la cotización del proyecto'
            f'{" " + cotizacion.nombre_evento if cotizacion.nombre_evento else ""}'
        ]
        if cotizacion.asistentes:
            partes.append(f'para {cotizacion.asistentes} asistentes')
        if cotizacion.fecha_evento:
            fecha = _fmt_fecha(cotizacion.fecha_evento, '%d de %B de %Y')
            horario = ''
            if cotizacion.hora_inicio and cotizacion.hora_fin:
                horario = (
                    f' de {_fmt_hora(cotizacion.hora_inicio)}'
                    f' a {_fmt_hora(cotizacion.hora_fin)} horas'
                )
            sede = f' en {cotizacion.sede}' if cotizacion.sede else ''
            partes.append(f'a realizarse{sede} el día {fecha}{horario}')
        return f'{dest}\nPRESENTE\n\n{", ".join(partes)}.'.replace('  ', ' ')
    fecha = _fmt_fecha(cotizacion.fecha_evento)
    return (
        f'{dest}\nPRESENTE\n\n'
        f'Por medio del presente le presentamos la cotización de renta'
        f'{f" para el día {fecha}" if fecha else ""}.'
    )


def sincronizar_zonas(cotizacion: Cotizacion, zonas_data):
    cotizacion.zonas.all().delete()
    for i, z in enumerate(zonas_data or []):
        titulo = (z.get('titulo') or '').strip()
        if not titulo:
            continue
        CotizacionZona.objects.create(
            cotizacion=cotizacion,
            orden=int(z.get('orden', i)),
            titulo=titulo,
            descripcion=(z.get('descripcion') or '').strip(),
        )


def sincronizar_conceptos(cotizacion: Cotizacion, conceptos_data):
    cotizacion.conceptos.all().delete()
    for i, c in enumerate(conceptos_data or []):
        nombre = (c.get('nombre') or '').strip()
        if not nombre:
            continue
        producto = None
        producto_id = c.get('producto_id') or c.get('producto')
        if producto_id:
            producto = Producto.objects.filter(id=producto_id).first()
            if producto and not nombre:
                nombre = producto.nombre
        CotizacionConcepto.objects.create(
            cotizacion=cotizacion,
            orden=int(c.get('orden', i)),
            nombre=nombre,
            descripcion=(c.get('descripcion') or '').strip(),
            cantidad=max(int(c.get('cantidad') or 1), 1),
            monto=_money(c.get('monto') or 0),
            producto=producto,
        )
    recalcular_totales(cotizacion)


def obtener_producto_proyecto() -> Producto:
    producto, _ = Producto.objects.get_or_create(
        nombre=NOMBRE_PRODUCTO_PROYECTO,
        defaults={
            'tipo': 'AN',
            'precio': Decimal('0'),
            'stock_total': 0,
            'stock_disponible': 0,
            'stock': 0,
            'activo': True,
            'afecta_stock': False,
        },
    )
    if producto.afecta_stock or producto.tipo != 'AN':
        producto.afecta_stock = False
        producto.tipo = 'AN'
        producto.activo = True
        producto.save(update_fields=['afecta_stock', 'tipo', 'activo'])
    return producto


def _comentarios_servicios_libres(cotizacion: Cotizacion) -> str:
    libres = [
        f"- {c.nombre}: ${_money(c.monto)}"
        for c in cotizacion.conceptos.all()
        if not c.producto_id
    ]
    if not libres:
        return ''
    return 'Servicios de cotización (no inventariables):\n' + '\n'.join(libres)


def convertir_a_renta(cotizacion: Cotizacion, lider_id=None, apoyo_ids=None, anticipo=0):
    if cotizacion.status == 'CONVERTIDA' and cotizacion.renta_id:
        raise CotizacionServiceError('La cotización ya fue convertida a renta.')
    if cotizacion.status == 'RECHAZADA':
        raise CotizacionServiceError('No se puede convertir una cotización rechazada.')
    if not cotizacion.fecha_evento or not cotizacion.hora_inicio or not cotizacion.hora_fin:
        raise CotizacionServiceError('La cotización requiere fecha y horario del evento.')
    if not cotizacion.conceptos.exists() and cotizacion.tipo == 'NORMAL':
        raise CotizacionServiceError('Agrega al menos un concepto/producto.')

    recalcular_totales(cotizacion)
    productos = []
    comentarios_extra = []

    if cotizacion.tipo == 'PROYECTO':
        proyecto = obtener_producto_proyecto()
        productos.append({
            'id': proyecto.id,
            'cantidad': 1,
            'precio_unitario': str(cotizacion.total),
            'nota': cotizacion.nombre_evento or 'Proyecto recreativo',
        })
        for c in cotizacion.conceptos.select_related('producto').all():
            if c.producto_id and c.producto.afecta_stock:
                productos.append({
                    'id': c.producto_id,
                    'cantidad': c.cantidad,
                    'precio_unitario': '0',
                    'nota': f'Inventario cotización {cotizacion.folio}',
                })
        libres = _comentarios_servicios_libres(cotizacion)
        if libres:
            comentarios_extra.append(libres)
    else:
        for c in cotizacion.conceptos.select_related('producto').all():
            if not c.producto_id:
                raise CotizacionServiceError(
                    f'El concepto "{c.nombre}" debe estar ligado a un producto del catálogo.'
                )
            productos.append({
                'id': c.producto_id,
                'cantidad': c.cantidad,
                'precio_unitario': str(_money(c.monto) / Decimal(c.cantidad or 1)),
                'nota': c.descripcion or '',
            })

    if not productos:
        raise CotizacionServiceError('No hay líneas convertibles a renta.')

    sede = (cotizacion.sede or '').strip()
    data = {
        'cliente_id': cotizacion.cliente_id,
        'fecha_renta': cotizacion.fecha_evento,
        'hora_inicio': cotizacion.hora_inicio,
        'hora_fin': cotizacion.hora_fin,
        'calle_y_numero': sede or cotizacion.cliente.calle_y_numero,
        'colonia': cotizacion.cliente.colonia,
        'ciudad_o_municipio': cotizacion.cliente.ciudad_o_municipio,
        'productos': productos,
        'anticipo': anticipo or 0,
        'comentarios': '\n\n'.join(
            x for x in [
                f'Origen: cotización {cotizacion.folio}',
                cotizacion.notas,
                *comentarios_extra,
            ] if x
        ),
        'precio_total': str(cotizacion.total) if cotizacion.tipo == 'PROYECTO' else None,
    }

    try:
        resultado = crear_renta(data)
    except RentaServiceError as exc:
        raise CotizacionServiceError(exc.message, status=exc.status) from exc

    from core.models import Renta
    renta = Renta.objects.get(id=resultado['renta_id'])

    with transaction.atomic():
        cotizacion.renta = renta
        cotizacion.status = 'CONVERTIDA'
        cotizacion.save(update_fields=['renta', 'status', 'updated_at'])

        if renta.tiene_animacion:
            asignacion, _ = AsignacionCoordinador.objects.get_or_create(renta=renta)
            if lider_id:
                from django.contrib.auth.models import User
                lider = User.objects.filter(id=lider_id).first()
                if lider:
                    asignacion.coordinador = lider
                    asignacion.save(update_fields=['coordinador'])
                    try:
                        from core.push_notifications import enviar_notificacion
                        enviar_notificacion(
                            lider,
                            'Nuevo evento asignado',
                            f'Tienes un nuevo evento: {renta.cliente.nombre} el {renta.fecha_renta}',
                            '/coordinador',
                        )
                    except Exception:
                        pass
            for apoyo_id in apoyo_ids or []:
                from django.contrib.auth.models import User
                apoyo = User.objects.filter(id=apoyo_id).first()
                if not apoyo:
                    continue
                if asignacion.coordinador_id and apoyo.id == asignacion.coordinador_id:
                    continue
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

    resultado['cotizacion_id'] = cotizacion.id
    resultado['cotizacion_folio'] = cotizacion.folio
    return resultado


def render_pdf_bytes(cotizacion: Cotizacion) -> bytes:
    recalcular_totales(cotizacion)
    template = (
        'core/cotizacion_proyecto_pdf.html'
        if cotizacion.tipo == 'PROYECTO'
        else 'core/cotizacion_normal_pdf.html'
    )
    html_string = render_to_string(template, {
        'cotizacion': cotizacion,
        'zonas': cotizacion.zonas.all(),
        'conceptos': cotizacion.conceptos.all(),
        'fecha': timezone.localdate(),
        'lugar_fecha': f'Colima, Col., a {timezone.localdate().strftime("%d de %B de %Y")}',
    })
    try:
        from weasyprint import HTML
        buffer = BytesIO()
        HTML(string=html_string).write_pdf(buffer)
        return buffer.getvalue()
    except Exception:
        # Fallback: return HTML bytes if WeasyPrint unavailable
        return html_string.encode('utf-8')
