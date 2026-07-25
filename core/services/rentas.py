"""Creación centralizada de rentas (CRM, PWA, bot WhatsApp)."""

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from core.models import Cliente, Cuenta, MovimientoContable, PedidoFinanzas, Producto, Renta, RentaProducto
from core.services.promociones_renta import (
    NOTA_REGALO,
    lineas_mantel_regalo,
    validar_manteles_regalo,
)


class RentaServiceError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def _resolver_cliente(data):
    cliente_id = data.get('cliente_id')
    if cliente_id:
        return Cliente.objects.get(id=cliente_id)

    telefono = (data.get('cliente_telefono') or data.get('telefono') or '').strip()
    nombre = (data.get('cliente_nombre') or data.get('nombre') or '').strip()
    if not nombre and not telefono:
        raise RentaServiceError('Se requiere cliente_id o datos de cliente nuevo.')

    if telefono:
        existente = Cliente.objects.filter(telefono=telefono).first()
        if existente:
            return existente

    return Cliente.objects.create(
        nombre=nombre,
        telefono=telefono,
        calle_y_numero=data.get('cliente_direccion') or data.get('calle_y_numero') or '',
        colonia=data.get('cliente_colonia') or data.get('colonia') or '',
        ciudad_o_municipio=data.get('cliente_ciudad') or data.get('ciudad_o_municipio') or '',
    )


def _resolver_direccion(data, cliente):
    mismo = data.get('mismo_domicilio')
    if mismo is True or str(mismo).lower() == 'true':
        return (
            cliente.calle_y_numero,
            cliente.colonia,
            cliente.ciudad_o_municipio,
        )
    return (
        data.get('calle_y_numero') or cliente.calle_y_numero,
        data.get('colonia') or cliente.colonia,
        data.get('ciudad_o_municipio') or cliente.ciudad_o_municipio,
    )


def _construir_lineas_producto(data):
    productos_data = data.get('productos') or []
    if not productos_data:
        raise RentaServiceError('Debes agregar al menos un producto.')

    lineas = []
    for item in productos_data:
        producto = Producto.objects.get(id=item['id'])
        cantidad = int(item.get('cantidad', 1))
        precio_unitario = Decimal(str(item.get('precio_unitario', producto.precio)))
        lineas.append({
            'producto': producto,
            'cantidad': cantidad,
            'precio_unitario': precio_unitario,
            'precio_lista': producto.precio,
            'nota': item.get('nota', ''),
            'es_regalo': False,
        })

    manteles_regalo = data.get('manteles_regalo') or []
    if manteles_regalo:
        validados = validar_manteles_regalo(productos_data, manteles_regalo)
        lineas.extend(lineas_mantel_regalo(validados))

    return lineas


def _validar_stock(lineas, fecha, hora_inicio, hora_fin):
    for linea in lineas:
        producto = linea['producto']
        cantidad = linea['cantidad']
        if not producto.hay_stock(cantidad, fecha, hora_inicio, hora_fin):
            libres = producto.stock_disponible_en_horario(fecha, hora_inicio, hora_fin)
            raise RentaServiceError(
                f"Solo hay {libres} disponible(s) de '{producto.nombre}' en ese horario."
            )


def _registrar_anticipo(renta, data):
    anticipo = Decimal(str(data.get('anticipo') or 0))
    if anticipo <= 0:
        return

    metodo_pago = (data.get('metodo_pago') or 'efectivo').lower()
    cuenta_anticipo = None
    if metodo_pago == 'efectivo':
        cuenta_anticipo = Cuenta.objects.filter(tipo__iexact='efectivo').first()
    elif data.get('cuenta_anticipo_id'):
        cuenta_anticipo = Cuenta.objects.filter(id=data['cuenta_anticipo_id']).first()

    finanza_obj = PedidoFinanzas.objects.filter(renta=renta).first()
    MovimientoContable.objects.create(
        pedido=finanza_obj,
        tipo='INGRESO',
        monto=anticipo,
        metodo_pago=metodo_pago,
        cuenta=cuenta_anticipo,
        fecha=timezone.now(),
        descripcion=f'Anticipo renta #{renta.folio}',
    )


def crear_renta(data, generar_folio=True):
    """
    Crea una renta con productos, manteles regalo opcionales y anticipo.
    data: dict compatible con api_nueva_renta / bot/renta
    """
    try:
        fecha = data.get('fecha_renta')
        hora_inicio = data.get('hora_inicio')
        hora_fin = data.get('hora_fin')
        if not fecha or not hora_inicio or not hora_fin:
            raise RentaServiceError('fecha_renta, hora_inicio y hora_fin son requeridos.')

        cliente = _resolver_cliente(data)
        calle, colonia, ciudad = _resolver_direccion(data, cliente)
        lineas = _construir_lineas_producto(data)
        _validar_stock(lineas, fecha, hora_inicio, hora_fin)

        with transaction.atomic():
            folio = data.get('folio')
            if generar_folio and not folio:
                folio = 'R' + str(int(timezone.now().timestamp()))

            renta = Renta.objects.create(
                folio=folio,
                cliente=cliente,
                fecha_renta=fecha,
                hora_inicio=hora_inicio,
                hora_fin=hora_fin,
                calle_y_numero=calle,
                colonia=colonia,
                ciudad_o_municipio=ciudad,
                comentarios=data.get('notas') or data.get('comentarios') or '',
                precio_total=Decimal('0'),
                anticipo=Decimal(str(data.get('anticipo') or 0)),
                pagado=bool(data.get('pagado', False)),
                status='ACTIVO',
                estado_entrega='PENDIENTE',
            )

            total = Decimal('0')
            for linea in lineas:
                producto = linea['producto']
                cantidad = linea['cantidad']
                precio_unitario = Decimal(str(linea['precio_unitario']))
                precio_lista = Decimal(str(linea.get('precio_lista', producto.precio)))
                nota = linea.get('nota') or (NOTA_REGALO if linea.get('es_regalo') else '')
                rp = RentaProducto.objects.create(
                    renta=renta,
                    producto=producto,
                    cantidad=cantidad,
                    precio_lista=precio_lista,
                    precio_unitario=precio_unitario,
                    nota=nota,
                )
                total += rp.subtotal

            precio_manual = data.get('precio_total')
            if precio_manual not in (None, '', 0, '0'):
                renta.precio_total = Decimal(str(precio_manual))
            else:
                renta.precio_total = total
            renta.save()

            _registrar_anticipo(renta, data)
            PedidoFinanzas.objects.get_or_create(
                renta=renta,
                defaults={'total': renta.precio_total - renta.anticipo},
            )

        try:
            from core.google_calendar import crear_evento_renta
            evento_id = crear_evento_renta(renta)
            if evento_id:
                renta.evento_google_id = evento_id
                renta.save(update_fields=['evento_google_id'])
        except Exception:
            pass

        saldo = float(renta.precio_total) - float(renta.anticipo or 0)
        return {
            'ok': True,
            'renta_id': renta.id,
            'folio': renta.folio,
            'total': str(renta.precio_total),
            'anticipo': str(renta.anticipo),
            'saldo_pendiente': str(max(Decimal('0'), renta.precio_total - renta.anticipo)),
            'cliente': {
                'id': cliente.id,
                'nombre': cliente.nombre,
                'telefono': cliente.telefono,
            },
        }
    except Producto.DoesNotExist:
        raise RentaServiceError('Producto no encontrado.')
    except Cliente.DoesNotExist:
        raise RentaServiceError('Cliente no encontrado.')
    except Exception as exc:
        if isinstance(exc, RentaServiceError):
            raise
        from django.core.exceptions import ValidationError
        if isinstance(exc, ValidationError):
            raise RentaServiceError(str(exc))
        raise RentaServiceError(str(exc))
