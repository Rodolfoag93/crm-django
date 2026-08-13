"""Servicio de cotizaciones: totales, PDF y conversión a renta."""

from datetime import date, datetime, time
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from core.models import (
    BASE_RALLY_POR_HORAS,
    NOMBRE_PRODUCTO_PROYECTO,
    TEXTO_TRASLADO_RALLY,
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
MESES_ES = (
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
)
TIPOS_COTIZACION = ('NORMAL', 'PROYECTO', 'RALLY')



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
    if not d:
        return ''
    if fmt in ('largo', '%d de %B de %Y'):
        return f'{d.day} de {MESES_ES[d.month - 1]} de {d.year}'
    return d.strftime(fmt)


def _fmt_hora(value, fmt='%H:%M'):
    t = parse_hora(value)
    return t.strftime(fmt) if t else ''


def _fmt_money(value):
    return f'{_money(value):,.2f}'


def _static_img_uri(filename: str) -> str:
    candidates = [
        Path(settings.BASE_DIR) / 'core' / 'static' / 'img' / filename,
        Path(settings.BASE_DIR) / 'staticfiles' / 'img' / filename,
    ]
    for path in candidates:
        if path.exists():
            return path.resolve().as_uri()
    return ''


def _logo_file_uri() -> str:
    return _static_img_uri('logo1.png')


def _nexoo_file_uri() -> str:
    return _static_img_uri('nexoo.png')


def recalcular_totales(cotizacion: Cotizacion) -> Cotizacion:
    # Las líneas marcadas como sugerencia (p. ej. brincolines en propuesta RALLY)
    # no forman parte del total cobrable.
    subtotal = sum(
        (
            _money(c.monto)
            for c in cotizacion.conceptos.all()
            if not getattr(c, 'es_sugerencia', False)
        ),
        Decimal('0.00'),
    )
    monto_iva = _money(subtotal * IVA_RATE) if cotizacion.aplicar_iva else Decimal('0.00')
    monto_isr = _money(subtotal * ISR_RATE) if cotizacion.aplicar_isr else Decimal('0.00')
    total = _money(subtotal + monto_iva - monto_isr)
    cotizacion.subtotal = subtotal
    cotizacion.monto_iva = monto_iva
    cotizacion.monto_isr = monto_isr
    cotizacion.total = total
    cotizacion.save(update_fields=['subtotal', 'monto_iva', 'monto_isr', 'total', 'updated_at'])
    return cotizacion


def listar_productos_base_rally():
    """Bases por horas del catálogo (excluye brincolines como Rally Pista)."""
    nombres = list(BASE_RALLY_POR_HORAS.values())
    return list(
        Producto.objects.filter(activo=True, nombre__in=nombres).order_by('precio', 'nombre')
    )


def listar_productos_traslado_rally():
    return list(
        Producto.objects.filter(activo=True, nombre__istartswith='Traslado')
        .exclude(nombre__icontains='Rally Pista')
        .order_by('nombre')
    )


def obtener_producto_base_rally(horas: int) -> Producto:
    horas = int(horas)
    nombre = BASE_RALLY_POR_HORAS.get(horas)
    if not nombre:
        raise CotizacionServiceError(
            f'Duración no soportada ({horas} h). Usa 2, 3 o 4 horas (Base Rally).'
        )
    producto = Producto.objects.filter(activo=True, nombre=nombre).first()
    if not producto:
        raise CotizacionServiceError(f'No existe el producto de catálogo "{nombre}".')
    return producto


def productos_catalogo_rally_qs():
    """
    Catálogo para cotización RALLY: todo el activo (bases, traslados, brincolines…).
    Base Rally y Traslados van primero para facilitar el armado.
    """
    from django.db.models import Case, IntegerField, Value, When

    nombres_base = list(BASE_RALLY_POR_HORAS.values())
    return (
        Producto.objects.filter(activo=True)
        .exclude(nombre='Proyecto recreativo')
        .annotate(
            _prio=Case(
                When(nombre__in=nombres_base, then=Value(0)),
                When(nombre__istartswith='Traslado', then=Value(1)),
                default=Value(2),
                output_field=IntegerField(),
            )
        )
        .order_by('_prio', 'nombre')
    )


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
            fecha = _fmt_fecha(cotizacion.fecha_evento, 'largo')
            horario = ''
            if cotizacion.hora_inicio and cotizacion.hora_fin:
                horario = (
                    f' de {_fmt_hora(cotizacion.hora_inicio)}'
                    f' a {_fmt_hora(cotizacion.hora_fin)} horas'
                )
            sede = f' en {cotizacion.sede}' if cotizacion.sede else ''
            partes.append(f'a realizarse{sede} el día {fecha}{horario}')
        return f'{dest}\nPRESENTE\n\n{", ".join(partes)}.'.replace('  ', ' ')
    if cotizacion.tipo == 'RALLY':
        partes = [
            'Por medio del presente le presentamos la propuesta recreativa'
            f'{" " + cotizacion.nombre_evento if cotizacion.nombre_evento else ""}'
            ' por base/grupo. El monto final se confirma al definir cantidad de bases,'
            ' duración y complementos elegidos'
        ]
        if cotizacion.fecha_evento:
            fecha = _fmt_fecha(cotizacion.fecha_evento, 'largo')
            horario = ''
            if cotizacion.hora_inicio and cotizacion.hora_fin:
                horario = (
                    f' de {_fmt_hora(cotizacion.hora_inicio)}'
                    f' a {_fmt_hora(cotizacion.hora_fin)} horas'
                )
            sede = f' en {cotizacion.sede}' if cotizacion.sede else ''
            partes.append(f'a realizarse{sede} el día {fecha}{horario}')
        return f'{dest}\nPRESENTE\n\n{", ".join(partes)}.'.replace('  ', ' ')
    fecha = _fmt_fecha(cotizacion.fecha_evento, 'largo') if cotizacion.fecha_evento else ''
    return (
        f'{dest}\nPRESENTE\n\n'
        f'Por medio del presente le presentamos la cotización de renta'
        f'{f" para el día {fecha}" if fecha else ""}.'
    )


def sincronizar_zonas(cotizacion: Cotizacion, zonas_data):
    """Actualiza zonas por id (conserva imágenes). Crea nuevas y borra las omitidas."""
    keep_ids = []
    for i, z in enumerate(zonas_data or []):
        titulo = (z.get('titulo') or '').strip()
        if not titulo:
            continue
        zona_id = z.get('id')
        descripcion = (z.get('descripcion') or '').strip()
        orden = int(z.get('orden', i))
        zona = None
        if zona_id:
            zona = CotizacionZona.objects.filter(id=zona_id, cotizacion=cotizacion).first()
        if zona:
            zona.orden = orden
            zona.titulo = titulo
            zona.descripcion = descripcion
            zona.save(update_fields=['orden', 'titulo', 'descripcion'])
        else:
            zona = CotizacionZona.objects.create(
                cotizacion=cotizacion,
                orden=orden,
                titulo=titulo,
                descripcion=descripcion,
            )
        keep_ids.append(zona.id)
    cotizacion.zonas.exclude(id__in=keep_ids).delete()


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
            es_sugerencia=bool(c.get('es_sugerencia')),
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


def convertir_a_renta(
    cotizacion: Cotizacion,
    lider_id=None,
    apoyo_ids=None,
    anticipo=0,
    metodo_pago='efectivo',
    cuenta_anticipo_id=None,
):
    if cotizacion.status == 'CONVERTIDA' and cotizacion.renta_id:
        raise CotizacionServiceError('La cotización ya fue convertida a renta.')
    if cotizacion.status == 'RECHAZADA':
        raise CotizacionServiceError('No se puede convertir una cotización rechazada.')
    if not cotizacion.fecha_evento or not cotizacion.hora_inicio or not cotizacion.hora_fin:
        raise CotizacionServiceError('La cotización requiere fecha y horario del evento.')
    if not cotizacion.conceptos.exists() and cotizacion.tipo == 'NORMAL':
        raise CotizacionServiceError('Agrega al menos un concepto/producto.')

    anticipo_dec = _money(anticipo)
    if anticipo_dec < 0:
        raise CotizacionServiceError('El anticipo no puede ser negativo.')
    recalcular_totales(cotizacion)
    if anticipo_dec > cotizacion.total:
        raise CotizacionServiceError('El anticipo no puede ser mayor al total de la cotización.')
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
        # NORMAL y RALLY: líneas ligadas a catálogo.
        # En RALLY solo se convierten líneas confirmadas (no sugerencias).
        conceptos_all = list(cotizacion.conceptos.select_related('producto').all())
        if cotizacion.tipo == 'RALLY':
            conceptos_conv = [c for c in conceptos_all if not c.es_sugerencia]
            sugeridos = [c for c in conceptos_all if c.es_sugerencia]
            tiene_base = any(
                (c.producto and c.producto.nombre in BASE_RALLY_POR_HORAS.values())
                for c in conceptos_conv
            )
            if not tiene_base:
                raise CotizacionServiceError(
                    'Antes de convertir, edita la cotización y confirma al menos un '
                    '"Base Rally N horas" (cantidad = bases/grupos). Los brincolines '
                    'sugeridos no cuentan hasta marcarlos como cobro.'
                )
            if cotizacion.total <= 0:
                raise CotizacionServiceError(
                    'La propuesta aún no tiene cobro confirmado. Edita la cotización '
                    'con las bases/duración y brincolines elegidos antes de convertir.'
                )
            paquetes = list(cotizacion.zonas.values_list('titulo', flat=True))
            if paquetes:
                comentarios_extra.append(
                    'Paquetes / actividades:\n' + '\n'.join(f'- {t}' for t in paquetes)
                )
            if sugeridos:
                comentarios_extra.append(
                    'Sugerencias de la propuesta (no convertidas):\n'
                    + '\n'.join(f'- {c.nombre}' for c in sugeridos)
                )
        else:
            conceptos_conv = conceptos_all

        for c in conceptos_conv:
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
        'anticipo': str(anticipo_dec),
        'metodo_pago': (metodo_pago or 'efectivo').lower(),
        'cuenta_anticipo_id': cuenta_anticipo_id,
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


def _imagen_file_uri(field_file) -> str:
    if not field_file:
        return ''
    try:
        path = Path(field_file.path)
        return path.resolve().as_uri() if path.exists() else ''
    except Exception:
        return ''


def _es_concepto_traslado(nombre: str) -> bool:
    return (nombre or '').strip().lower().startswith('traslado')


def render_pdf_bytes(cotizacion: Cotizacion) -> bytes:
    recalcular_totales(cotizacion)
    if cotizacion.tipo == 'PROYECTO':
        template = 'core/cotizacion_proyecto_pdf.html'
    elif cotizacion.tipo == 'RALLY':
        template = 'core/cotizacion_rally_pdf.html'
    else:
        template = 'core/cotizacion_normal_pdf.html'
    hoy = timezone.localdate()
    conceptos = list(cotizacion.conceptos.all())
    confirmados = [c for c in conceptos if not c.es_sugerencia]
    traslados = [c for c in conceptos if _es_concepto_traslado(c.nombre)]
    sugeridos = [
        c for c in conceptos
        if c.es_sugerencia and not _es_concepto_traslado(c.nombre)
    ]
    tarifas_rally = []
    if cotizacion.tipo == 'RALLY':
        for p in listar_productos_base_rally():
            tarifas_rally.append({
                'nombre': p.nombre,
                'precio': _fmt_money(p.precio),
            })
    zonas_fmt = []
    for z in cotizacion.zonas.prefetch_related('imagenes').all():
        imgs = []
        for img in z.imagenes.all():
            uri = _imagen_file_uri(img.imagen)
            if uri:
                imgs.append({'url': uri, 'pie': img.pie or ''})
        zonas_fmt.append({
            'titulo': z.titulo,
            'descripcion': z.descripcion,
            'imagenes': imgs,
        })

    def _fmt_concepto(c):
        unit = _money(c.monto) / Decimal(c.cantidad or 1)
        return {
            'nombre': c.nombre,
            'descripcion': c.descripcion,
            'cantidad': c.cantidad,
            'monto': _fmt_money(c.monto),
            'precio_unitario': _fmt_money(unit),
            'es_servicio': c.producto_id is None,
            'es_sugerencia': bool(c.es_sugerencia),
        }

    html_string = render_to_string(template, {
        'cotizacion': cotizacion,
        'zonas': zonas_fmt,
        'conceptos': conceptos,
        'tarifas_rally': tarifas_rally,
        'conceptos_confirmados': [
            _fmt_concepto(c) for c in confirmados
            if not _es_concepto_traslado(c.nombre)
        ],
        'conceptos_sugeridos': [_fmt_concepto(c) for c in sugeridos],
        'conceptos_traslado': [_fmt_concepto(c) for c in traslados],
        'texto_traslado': TEXTO_TRASLADO_RALLY,
        'tiene_cobro_confirmado': any(
            not _es_concepto_traslado(c.nombre) for c in confirmados
        ) and cotizacion.total > 0,
        'fecha': hoy,
        'lugar_fecha': f'Colima, Col., a {_fmt_fecha(hoy, "largo")}',
        'logo_url': _logo_file_uri(),
        'nexoo_url': _nexoo_file_uri(),
        'subtotal_fmt': _fmt_money(cotizacion.subtotal),
        'iva_fmt': _fmt_money(cotizacion.monto_iva),
        'isr_fmt': _fmt_money(cotizacion.monto_isr),
        'total_fmt': _fmt_money(cotizacion.total),
        'conceptos_fmt': [_fmt_concepto(c) for c in conceptos],
    })
    try:
        from weasyprint import HTML
        buffer = BytesIO()
        HTML(string=html_string, base_url=Path(settings.BASE_DIR).resolve().as_uri() + '/').write_pdf(buffer)
        return buffer.getvalue()
    except Exception:
        # Fallback: return HTML bytes if WeasyPrint unavailable
        return html_string.encode('utf-8')
