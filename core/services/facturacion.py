"""Emisión de CFDI vía FiscalAPI (https://docs.fiscalapi.com/)."""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import uuid
import urllib.error
import urllib.request
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone

from core.models import Cliente, Factura, Renta

logger = logging.getLogger(__name__)

RFC_RE = re.compile(r'^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$', re.I)


class FacturacionError(Exception):
    def __init__(self, message: str, status: int = 400):
        self.message = message
        self.status = status
        super().__init__(message)


def _cfg(key: str, default: str = '') -> str:
    return (os.environ.get(key) or default).strip()


def fiscalapi_configured() -> bool:
    return bool(
        _cfg('FISCALAPI_API_KEY')
        and _cfg('FISCALAPI_TENANT_KEY')
        and _cfg('FISCALAPI_ISSUER_ID')
    )


def _base_url() -> str:
    return _cfg('FISCALAPI_BASE_URL', 'https://test.fiscalapi.com').rstrip('/')


def _headers() -> dict:
    api_key = _cfg('FISCALAPI_API_KEY')
    tenant = _cfg('FISCALAPI_TENANT_KEY')
    if not api_key or not tenant:
        raise FacturacionError(
            'FiscalAPI no configurado. Define FISCALAPI_API_KEY y FISCALAPI_TENANT_KEY.',
            status=503,
        )
    return {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-KEY': api_key,
        'X-TENANT-KEY': tenant,
        'X-TIME-ZONE': _cfg('FISCALAPI_TIMEZONE', 'America/Mexico_City'),
    }


def _format_fiscalapi_error(err_body: str, fallback: str = '') -> str:
    """Extrae mensajes útiles de respuestas de validación FiscalAPI."""
    try:
        parsed = json.loads(err_body)
    except Exception:
        return (err_body or fallback)[:500]

    details: list[str] = []
    data = parsed.get('data')
    if isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            prop = item.get('propertyName') or item.get('PropertyName') or ''
            emsg = item.get('errorMessage') or item.get('ErrorMessage') or ''
            if emsg:
                details.append(f'{prop}: {emsg}' if prop else str(emsg))
    if isinstance(parsed.get('errors'), list):
        for e in parsed['errors']:
            if isinstance(e, str):
                details.append(e)
            elif isinstance(e, dict):
                details.append(str(e.get('message') or e.get('errorMessage') or e))
    elif isinstance(parsed.get('errors'), dict):
        for k, v in parsed['errors'].items():
            details.append(f'{k}: {v}' if not isinstance(v, list) else f'{k}: {"; ".join(map(str, v))}')

    if details:
        # Dedup preservando orden
        seen = set()
        uniq = []
        for d in details:
            if d not in seen:
                seen.add(d)
                uniq.append(d)
        return '; '.join(uniq)[:800]

    msg = (
        parsed.get('message')
        or parsed.get('Message')
        or parsed.get('error')
        or ''
    )
    detail = parsed.get('details') or parsed.get('Details') or ''
    generic = (
        'not me, it\'s you' in str(msg).lower()
        or 'not you, it\'s me' in str(msg).lower()
    )
    if detail and (generic or not msg):
        return str(detail)[:500]
    if msg and not generic:
        if detail:
            return f'{msg} ({detail})'[:500]
        return str(msg)[:500]
    if detail:
        return str(detail)[:500]
    return (err_body or fallback or msg or 'Error desconocido')[:500]


def _request(method: str, path: str, body: dict | None = None) -> dict:
    url = f'{_base_url()}{path}'
    data = None
    headers = _headers()
    if body is not None:
        data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode('utf-8') or '{}'
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode('utf-8', errors='replace')
        logger.error('FiscalAPI HTTP %s %s: %s', exc.code, path, err_body[:800])
        msg = _format_fiscalapi_error(err_body, fallback=str(exc))
        raise FacturacionError(f'FiscalAPI: {msg}', status=400) from exc
    except urllib.error.URLError as exc:
        logger.error('FiscalAPI connection error: %s', exc)
        raise FacturacionError('No se pudo conectar con FiscalAPI.', status=503) from exc


def _norm_rfc(rfc: str) -> str:
    return re.sub(r'[^A-Z0-9&Ñ]', '', (rfc or '').upper().replace(' ', ''))


def _validate_receptor(data: dict) -> dict:
    rfc = _norm_rfc(data.get('rfc') or '')
    razon = (data.get('razon_social') or '').strip()
    regimen = (data.get('regimen_fiscal') or '').strip()
    cp = re.sub(r'\D', '', str(data.get('codigo_postal') or ''))
    email = (data.get('email') or '').strip()
    uso = (data.get('uso_cfdi') or 'G03').strip().upper()

    if not RFC_RE.match(rfc):
        raise FacturacionError('RFC inválido.')
    if len(razon) < 3:
        raise FacturacionError('Razón social requerida.')
    if not regimen.isdigit() or len(regimen) != 3:
        raise FacturacionError('Régimen fiscal inválido (3 dígitos).')
    if len(cp) != 5:
        raise FacturacionError('Código postal fiscal debe ser 5 dígitos.')
    if email and '@' not in email:
        raise FacturacionError('Correo de facturación inválido.')
    if len(uso) < 3:
        raise FacturacionError('Uso de CFDI inválido.')

    return {
        'rfc': rfc,
        'razon_social': razon,
        'regimen_fiscal': regimen,
        'codigo_postal': cp,
        'email': email,
        'uso_cfdi': uso,
    }


def _money(val) -> Decimal:
    return Decimal(str(val or 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _truthy(val, default: bool = False) -> bool:
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    return str(val).strip().lower() in ('1', 'true', 'yes', 'si', 'sí', 'on')


def _tax_rate_sat(rate: Decimal | str) -> str:
    """SAT c_TasaOCuota exige 6 decimales (p. ej. 0.160000, no 0.16)."""
    q = Decimal(str(rate)).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
    return f'{q:.6f}'


def _build_item_taxes(*, cobrar_iva: bool, retener_isr: bool) -> list[dict]:
    taxes = []
    iva_rate = Decimal(_cfg('FISCALAPI_TAX_RATE', '0.160000'))
    isr_rate = Decimal(_cfg('FISCALAPI_ISR_RETENTION_RATE', '0.012500'))
    if cobrar_iva and iva_rate > 0:
        taxes.append({
            'taxCode': '002',  # IVA
            'taxTypeCode': 'Tasa',
            'taxRate': _tax_rate_sat(iva_rate),
            'taxFlagCode': 'T',  # Traslado
        })
    if retener_isr and isr_rate > 0:
        taxes.append({
            'taxCode': '001',  # ISR
            'taxTypeCode': 'Tasa',
            'taxRate': _tax_rate_sat(isr_rate),
            'taxFlagCode': 'R',  # Retención
        })
    return taxes


def _crm_includes_tax() -> bool:
    return _cfg('FISCALAPI_TOTAL_INCLUDES_TAX', 'false').lower() in ('1', 'true', 'yes')


def _tax_rates(*, cobrar_iva: bool, retener_isr: bool) -> tuple[Decimal, Decimal]:
    iva = Decimal(_cfg('FISCALAPI_TAX_RATE', '0.160000')) if cobrar_iva else Decimal('0')
    isr = Decimal(_cfg('FISCALAPI_ISR_RETENTION_RATE', '0.012500')) if retener_isr else Decimal('0')
    return iva, isr


def _to_base(importe: Decimal, iva_rate: Decimal) -> Decimal:
    """Convierte importe CRM a base gravable. Si el CRM ya trae IVA, lo desglosa."""
    if importe <= 0:
        return Decimal('0.00')
    if _crm_includes_tax() and iva_rate > 0:
        return (importe / (Decimal('1') + iva_rate)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return importe


def _lineas_renta(renta: Renta) -> list:
    return list(renta.rentaproductos.select_related('producto').all())


def calcular_desglose_factura(
    renta: Renta,
    *,
    cobrar_iva: bool = True,
    retener_isr: bool = True,
) -> dict:
    """
    Desglose para UI/timbrado.
    Por defecto el precio_total del CRM es subtotal ANTES de impuestos.
    Productos con subtotal <= 0 se excluyen del CFDI (no afectan el monto).
    """
    total_crm = _money(renta.precio_total)
    iva_rate, isr_rate = _tax_rates(cobrar_iva=cobrar_iva, retener_isr=retener_isr)
    lineas = _lineas_renta(renta)
    excluidos = []
    positivos = []
    subtotal_sum = Decimal('0.00')

    for rp in lineas:
        bruto = _money(rp.subtotal)
        subtotal_sum += bruto
        nombre = (rp.producto.nombre if rp.producto_id else 'Producto')
        if bruto <= 0:
            excluidos.append({'id': rp.id, 'nombre': nombre, 'subtotal': str(bruto)})
        else:
            positivos.append(rp)

    # Si las líneas cuadran con el total, la base es la suma de positivos;
    # si no, un solo concepto por el total de la renta.
    usar_lineas = bool(positivos) and subtotal_sum > 0 and abs(subtotal_sum - total_crm) <= Decimal('1.00')
    if usar_lineas:
        importe_crm = sum((_money(rp.subtotal) for rp in positivos), Decimal('0'))
    else:
        importe_crm = total_crm
        excluidos = []  # concepto único: no listamos exclusiones parciales

    base = _to_base(importe_crm, iva_rate if cobrar_iva else Decimal('0'))
    iva = (base * iva_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) if iva_rate else Decimal('0.00')
    isr = (base * isr_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) if isr_rate else Decimal('0.00')
    total_cfdi = (base + iva - isr).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    return {
        'subtotal_crm': str(total_crm),
        'base': str(base),
        'iva_rate': float(iva_rate),
        'isr_rate': float(isr_rate),
        'iva': str(iva),
        'isr_retenido': str(isr),
        'total_cfdi': str(total_cfdi),
        'crm_incluye_iva': _crm_includes_tax(),
        'items_excluidos': excluidos,
        'items_excluidos_count': len(excluidos),
        'usar_lineas': usar_lineas,
    }


def _build_items(
    renta: Renta,
    total: Decimal,
    *,
    cobrar_iva: bool = True,
    retener_isr: bool = False,
    modo_conceptos: str = 'renta',
    concepto_descripcion: str = '',
) -> list[dict]:
    """Conceptos: líneas de renta, o un solo concepto personalizado (instituciones)."""
    item_code = '90101602'  # Catálogo SAT — fijo para rentas Trotamundos
    unit_code = 'E48'  # Unidad de servicio (SAT)
    unit_name = 'Servicio'
    iva_rate, _ = _tax_rates(cobrar_iva=cobrar_iva, retener_isr=retener_isr)
    taxes = _build_item_taxes(cobrar_iva=cobrar_iva, retener_isr=retener_isr)
    tax_object = '02' if taxes else '01'
    # FiscalAPI exige ItemSku único en el catálogo del tenant; si se reintenta
    # el mismo SKU tras un fallo, responde "unique values already exists".
    stamp = uuid.uuid4().hex[:8]

    modo = (modo_conceptos or 'renta').strip().lower()
    if modo in ('personalizado', 'custom', 'unico', 'único'):
        desc = (concepto_descripcion or '').strip()
        if len(desc) < 3:
            raise FacturacionError(
                'Indica la descripción del concepto personalizado (mín. 3 caracteres).',
            )
        base = _to_base(total, iva_rate)
        if base <= 0:
            raise FacturacionError('No hay importe mayor a 0 para facturar.')
        return [{
            'itemCode': item_code,
            'itemSku': f'R-{renta.id}-C-{stamp}',
            'quantity': 1,
            'unitOfMeasurementCode': unit_code,
            'unitOfMeasurement': unit_name,
            'description': desc[:1000],
            'unitPrice': float(base),
            'taxObjectCode': tax_object,
            'itemTaxes': taxes,
        }]

    lineas = _lineas_renta(renta)
    items = []

    if lineas:
        subtotal_sum = sum((_money(rp.subtotal) for rp in lineas), Decimal('0'))
        for rp in lineas:
            bruto = _money(rp.subtotal)
            if bruto <= 0:
                continue  # Excluir precio 0 — FiscalAPI exige UnitPrice > 0
            base = _to_base(bruto, iva_rate)
            qty = Decimal(str(rp.cantidad or 1)) or Decimal('1')
            unit_price = (base / qty).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            if unit_price <= 0:
                continue
            items.append({
                'itemCode': item_code,
                'itemSku': f'R-{renta.id}-{rp.id}-{stamp}',
                'quantity': float(qty),
                'unitOfMeasurementCode': unit_code,
                'unitOfMeasurement': unit_name,
                'description': (rp.producto.nombre if rp.producto_id else 'Producto')[:1000],
                'unitPrice': float(unit_price),
                'taxObjectCode': tax_object,
                'itemTaxes': taxes,
            })
        if not items or subtotal_sum <= 0 or abs(subtotal_sum - total) > Decimal('1.00'):
            items = []

    if not items:
        base = _to_base(total, iva_rate)
        if base <= 0:
            raise FacturacionError('No hay conceptos con precio mayor a 0 para facturar.')
        items.append({
            'itemCode': item_code,
            'itemSku': f'R-{renta.id}-{stamp}',
            'quantity': 1,
            'unitOfMeasurementCode': unit_code,
            'unitOfMeasurement': unit_name,
            'description': f'Renta {renta.folio} — evento {renta.fecha_renta}',
            'unitPrice': float(base),
            'taxObjectCode': tax_object,
            'itemTaxes': taxes,
        })
    return items


def _extract_invoice_fields(resp: dict) -> dict:
    """Normaliza respuesta FiscalAPI (puede venir envuelta en data)."""
    data = resp.get('data') if isinstance(resp.get('data'), dict) else resp
    if not isinstance(data, dict):
        data = resp

    uuid = (
        data.get('uuid')
        or data.get('Uuid')
        or data.get('folioFiscal')
        or ''
    )
    # nested invoice / stamp info
    for key in ('invoice', 'cfdi', 'stamp', 'result'):
        nested = data.get(key)
        if isinstance(nested, dict):
            uuid = uuid or nested.get('uuid') or nested.get('Uuid') or ''

    return {
        'provider_id': str(data.get('id') or data.get('Id') or ''),
        'uuid': str(uuid or ''),
        'serie': str(data.get('series') or data.get('serie') or data.get('Series') or ''),
        'folio': str(data.get('folioNumber') or data.get('folio') or data.get('Folio') or ''),
        'pdf_url': str(data.get('pdfUrl') or data.get('pdf_url') or data.get('PdfUrl') or ''),
        'xml_url': str(data.get('xmlUrl') or data.get('xml_url') or data.get('XmlUrl') or ''),
        'raw': data,
    }


def guardar_datos_fiscales_cliente(cliente: Cliente, receptor: dict) -> None:
    update = {
        'rfc': receptor['rfc'],
        'razon_social': receptor['razon_social'],
        'regimen_fiscal': receptor['regimen_fiscal'],
        'codigo_postal_fiscal': receptor['codigo_postal'],
        'uso_cfdi_default': receptor['uso_cfdi'],
    }
    if receptor.get('email'):
        update['email_facturacion'] = receptor['email']
    for k, v in update.items():
        setattr(cliente, k, v)
    cliente.save(update_fields=list(update.keys()))


@transaction.atomic
def facturar_renta(renta: Renta, datos: dict, user=None) -> Factura:
    if renta.status == 'CANCELADO' or renta.estado_entrega == 'CANCELADO':
        raise FacturacionError('No se puede facturar una renta cancelada.')

    existente = Factura.objects.filter(renta=renta, estatus='TIMBRADA').first()
    if existente:
        raise FacturacionError('Esta renta ya tiene una factura timbrada.', status=409)

    issuer_id = _cfg('FISCALAPI_ISSUER_ID')
    if not issuer_id:
        raise FacturacionError(
            'Falta FISCALAPI_ISSUER_ID (ID del emisor en FiscalAPI).',
            status=503,
        )
    expedition_zip = _cfg('FISCALAPI_EXPEDITION_ZIP')
    if not expedition_zip or len(re.sub(r'\D', '', expedition_zip)) != 5:
        raise FacturacionError(
            'Falta FISCALAPI_EXPEDITION_ZIP (CP de expedición del emisor, 5 dígitos).',
            status=503,
        )
    expedition_zip = re.sub(r'\D', '', expedition_zip)[:5]

    receptor = _validate_receptor(datos)
    total_crm = _money(renta.precio_total)
    if total_crm <= 0:
        raise FacturacionError('El total de la renta debe ser mayor a 0.')

    cobrar_iva = _truthy(datos.get('cobrar_iva'), default=True)
    retener_isr = _truthy(datos.get('retener_isr'), default=True)
    modo_conceptos = (datos.get('modo_conceptos') or 'renta').strip().lower()
    concepto_descripcion = (datos.get('concepto_descripcion') or '').strip()
    desglose = calcular_desglose_factura(renta, cobrar_iva=cobrar_iva, retener_isr=retener_isr)
    total_cfdi = _money(desglose['total_cfdi'])

    guardar_datos_fiscales_cliente(renta.cliente, receptor)

    factura = Factura.objects.create(
        renta=renta,
        cliente=renta.cliente,
        estatus='BORRADOR',
        rfc=receptor['rfc'],
        razon_social=receptor['razon_social'],
        regimen_fiscal=receptor['regimen_fiscal'],
        codigo_postal=receptor['codigo_postal'],
        email=receptor['email'],
        uso_cfdi=receptor['uso_cfdi'],
        total=total_cfdi,
        serie=_cfg('FISCALAPI_SERIES', 'R'),
        creada_por=user if getattr(user, 'is_authenticated', False) else None,
    )

    now_mx = datetime.now(ZoneInfo(_cfg('FISCALAPI_TIMEZONE', 'America/Mexico_City')))
    payment_form = (datos.get('forma_pago') or _cfg('FISCALAPI_PAYMENT_FORM', '03')).strip()
    # 03 = transferencia, 01 = efectivo, 04 = tarjeta
    metodo_pago = (datos.get('metodo_pago') or datos.get('payment_method') or 'PUE').strip().upper()
    if metodo_pago not in ('PUE', 'PPD'):
        raise FacturacionError('Método de pago inválido. Usa PUE o PPD.')

    payload = {
        'versionCode': '4.0',
        'series': factura.serie or 'R',
        'date': now_mx.strftime('%Y-%m-%dT%H:%M:%S'),
        'paymentFormCode': payment_form,
        'paymentMethodCode': metodo_pago,
        'currencyCode': 'MXN',
        'typeCode': 'I',
        'expeditionZipCode': expedition_zip,
        'exchangeRate': 1,
        'exportCode': '01',
        'issuer': {
            'id': issuer_id,
        },
        'recipient': {
            'tin': receptor['rfc'],
            'legalName': receptor['razon_social'],
            'zipCode': receptor['codigo_postal'],
            'taxRegimeCode': receptor['regimen_fiscal'],
            'cfdiUseCode': receptor['uso_cfdi'],
            'email': receptor['email'] or None,
        },
        'items': _build_items(
            renta,
            total_crm,
            cobrar_iva=cobrar_iva,
            retener_isr=retener_isr,
            modo_conceptos=modo_conceptos,
            concepto_descripcion=concepto_descripcion,
        ),
    }
    # quitar email None
    if not payload['recipient'].get('email'):
        payload['recipient'].pop('email', None)

    try:
        resp = _request('POST', '/api/v4/invoices', payload)
        fields = _extract_invoice_fields(resp)
        if not fields['uuid'] and not fields['provider_id']:
            raise FacturacionError(
                'FiscalAPI no devolvió UUID/id de factura. Revisa la respuesta del sandbox.',
            )

        factura.provider_id = fields['provider_id']
        factura.uuid = fields['uuid']
        if fields['serie']:
            factura.serie = fields['serie']
        if fields['folio']:
            factura.folio = fields['folio']
        factura.pdf_url = fields['pdf_url']
        factura.xml_url = fields['xml_url']
        factura.estatus = 'TIMBRADA'
        factura.timbrada_at = timezone.now()
        factura.error_mensaje = ''
        factura.save()

        # El create a veces no trae pdfUrl; el endpoint correcto es POST /invoices/pdf (base64).
        # No persistimos data-URLs; "Ver factura" obtiene el PDF on-demand.

        # Enviar al cliente (si hay) + copia interna (FISCALAPI_COPY_EMAIL)
        email_meta = _enviar_factura_a_destinos(factura, receptor.get('email') or '')
        factura._email_enviado_a = email_meta['email_enviado_a']  # type: ignore[attr-defined]
        factura._email_errores = email_meta['email_errores']  # type: ignore[attr-defined]

        return factura

    except FacturacionError as exc:
        factura.estatus = 'ERROR'
        factura.error_mensaje = exc.message[:2000]
        factura.save(update_fields=['estatus', 'error_mensaje'])
        raise


def enviar_factura_email(factura: Factura, to_email: str) -> None:
    """
    Envía PDF+XML de una factura timbrada vía FiscalAPI.
    Contrato oficial (SDK): POST /api/v4/invoices/send con invoiceId + toEmail.
    """
    to_email = (to_email or '').strip()
    if not to_email or '@' not in to_email:
        raise FacturacionError('Correo de destino inválido.')
    if not factura.provider_id:
        raise FacturacionError('La factura no tiene ID de FiscalAPI para enviar correo.')
    if factura.estatus != 'TIMBRADA':
        raise FacturacionError(
            f'Solo se puede enviar por correo una factura timbrada (estatus: {factura.estatus}).',
        )
    _request('POST', '/api/v4/invoices/send', {
        'invoiceId': factura.provider_id,
        'toEmail': to_email,
    })


def _destinos_factura_email(email_cliente: str = '') -> list[str]:
    destinos: list[str] = []
    email_cliente = (email_cliente or '').strip()
    if email_cliente and '@' in email_cliente:
        destinos.append(email_cliente)
    copy_email = (_cfg('FISCALAPI_COPY_EMAIL') or '').strip()
    if copy_email and '@' in copy_email:
        destinos.append(copy_email)
    seen: set[str] = set()
    return [e for e in destinos if e.lower() not in seen and not seen.add(e.lower())]


def _enviar_factura_a_destinos(factura: Factura, email_cliente: str = '') -> dict:
    """Best-effort: no tumba el timbrado si el mail falla."""
    enviados: list[str] = []
    errores: list[str] = []
    destinos = _destinos_factura_email(email_cliente or factura.email or '')
    if not factura.provider_id:
        if destinos:
            errores.append('Sin provider_id de FiscalAPI; no se pudo enviar correo.')
        return {'email_enviado_a': enviados, 'email_errores': errores}
    if not destinos:
        return {'email_enviado_a': enviados, 'email_errores': errores}

    for to in destinos:
        try:
            enviar_factura_email(factura, to)
            enviados.append(to)
        except FacturacionError as exc:
            logger.warning('No se pudo enviar factura a %s: %s', to, exc.message)
            errores.append(f'{to}: {exc.message}')
    return {'email_enviado_a': enviados, 'email_errores': errores}


def email_meta_factura(factura: Factura) -> dict:
    return {
        'email_enviado_a': list(getattr(factura, '_email_enviado_a', []) or []),
        'email_errores': list(getattr(factura, '_email_errores', []) or []),
    }


def _extract_base64_file(resp: dict) -> tuple[bytes, str]:
    """Extrae bytes y nombre de una FileResponse FiscalAPI."""
    data = resp.get('data') if isinstance(resp.get('data'), dict) else resp
    if not isinstance(data, dict):
        data = resp
    b64 = (
        data.get('base64File')
        or data.get('base64_file')
        or data.get('Base64File')
        or ''
    )
    if not b64 and isinstance(resp.get('data'), str):
        b64 = resp['data']
    if not b64:
        raise FacturacionError('FiscalAPI no devolvió el PDF en base64.')
    try:
        raw = base64.b64decode(b64, validate=False)
    except Exception as exc:
        raise FacturacionError('PDF de FiscalAPI inválido (base64).') from exc
    if not raw:
        raise FacturacionError('PDF de FiscalAPI vacío.')
    name = (
        data.get('fileName')
        or data.get('file_name')
        or data.get('FileName')
        or 'factura.pdf'
    )
    if not str(name).lower().endswith('.pdf'):
        name = f'{name}.pdf'
    return raw, str(name)


def obtener_pdf_factura(factura: Factura) -> tuple[bytes, str]:
    """
    Descarga el PDF de una factura timbrada.
    Contrato oficial: POST /api/v4/invoices/pdf con { invoiceId }.
    """
    if factura.estatus != 'TIMBRADA':
        raise FacturacionError(
            f'Solo hay PDF para facturas timbradas (estatus: {factura.estatus}).',
        )
    if not factura.provider_id:
        raise FacturacionError('La factura no tiene ID de FiscalAPI para obtener el PDF.')
    resp = _request('POST', '/api/v4/invoices/pdf', {
        'invoiceId': factura.provider_id,
    })
    return _extract_base64_file(resp)


def reenviar_factura(
    factura: Factura,
    *,
    email: str | None = None,
    incluir_copia: bool = True,
) -> dict:
    """
    Reenvía el CFDI por correo.
    Si email viene vacío, usa el email guardado en la factura.
    incluir_copia añade FISCALAPI_COPY_EMAIL (si está configurado).
    """
    if factura.estatus != 'TIMBRADA':
        raise FacturacionError(
            f'Solo se puede reenviar una factura timbrada (estatus: {factura.estatus}).',
        )
    destino = (email if email is not None else factura.email or '').strip()
    if destino and '@' not in destino:
        raise FacturacionError('Correo de destino inválido.')

    enviados: list[str] = []
    errores: list[str] = []
    destinos: list[str] = []
    if destino:
        destinos.append(destino)
    if incluir_copia:
        copy_email = (_cfg('FISCALAPI_COPY_EMAIL') or '').strip()
        if copy_email and '@' in copy_email:
            destinos.append(copy_email)
    seen: set[str] = set()
    destinos = [e for e in destinos if e.lower() not in seen and not seen.add(e.lower())]
    if not destinos:
        raise FacturacionError(
            'Indica un correo o configura FISCALAPI_COPY_EMAIL para reenviar.',
        )

    for to in destinos:
        try:
            enviar_factura_email(factura, to)
            enviados.append(to)
        except FacturacionError as exc:
            logger.warning('No se pudo reenviar factura a %s: %s', to, exc.message)
            errores.append(f'{to}: {exc.message}')

    if not enviados:
        raise FacturacionError(
            'No se pudo reenviar la factura. ' + ('; '.join(errores) if errores else ''),
        )
    return {'email_enviado_a': enviados, 'email_errores': errores}

MOTIVOS_CANCELACION = {
    '01': 'Comprobante emitido con errores con relación',
    '02': 'Comprobante emitido con errores sin relación',
    '03': 'No se llevó a cabo la operación',
    '04': 'Operación nominativa relacionada en una factura global',
}

# Códigos SAT en respuesta de cancelación que consideramos solicitud aceptada
_SAT_CANCEL_OK = {'201', '202'}


def cancelar_factura(factura: Factura, datos: dict | None = None) -> Factura:
    """
    Cancela un CFDI timbrado vía FiscalAPI (DELETE /api/v4/invoices).

    Motivos SAT: 01–04. El 01 requiere UUID de la factura de reemplazo.
    """
    datos = datos or {}
    if factura.estatus != 'TIMBRADA':
        raise FacturacionError(
            f'Solo se pueden cancelar facturas timbradas (estatus actual: {factura.estatus}).',
        )
    if not factura.provider_id and not factura.uuid:
        raise FacturacionError('La factura no tiene ID/UUID de FiscalAPI para cancelar.')

    motivo = str(datos.get('motivo') or datos.get('cancellation_reason_code') or '').strip()
    if motivo not in MOTIVOS_CANCELACION:
        raise FacturacionError(
            'Motivo inválido. Usa 01, 02, 03 o 04 (catálogo SAT de cancelación).',
        )

    replacement = (
        str(datos.get('replacement_uuid') or datos.get('uuid_sustitucion') or '').strip()
    )
    if motivo == '01':
        if not replacement or len(replacement) < 32:
            raise FacturacionError(
                'Motivo 01 requiere el UUID de la factura que sustituye a esta.',
            )
    else:
        replacement = ''

    payload: dict = {
        'cancellationReasonCode': motivo,
    }
    if factura.provider_id:
        # Cancelación por referencias (emisor + CSD ya están en FiscalAPI)
        payload['id'] = factura.provider_id
    else:
        issuer_rfc = _norm_rfc(_cfg('FISCALAPI_ISSUER_RFC'))
        if not issuer_rfc:
            raise FacturacionError(
                'Sin provider_id: define FISCALAPI_ISSUER_RFC para cancelar por UUID.',
                status=503,
            )
        payload['invoiceUuid'] = factura.uuid
        payload['tin'] = issuer_rfc

    if replacement:
        payload['replacementUuid'] = replacement

    resp = _request('DELETE', '/api/v4/invoices', payload)
    data = resp.get('data') if isinstance(resp.get('data'), dict) else resp
    if not isinstance(data, dict):
        data = {}

    uuids_status = data.get('invoiceUuids') or data.get('invoice_uuids') or {}
    sat_code = ''
    if isinstance(uuids_status, dict) and factura.uuid:
        sat_code = str(uuids_status.get(factura.uuid) or uuids_status.get(factura.uuid.upper()) or '')
    if not sat_code and isinstance(uuids_status, dict) and uuids_status:
        sat_code = str(next(iter(uuids_status.values())))

    if sat_code and sat_code not in _SAT_CANCEL_OK:
        raise FacturacionError(
            f'El SAT/FiscalAPI no aceptó la cancelación (código {sat_code}). '
            'Revisa el estatus del CFDI o cancélalo desde el portal FiscalAPI.',
        )

    nota = MOTIVOS_CANCELACION[motivo]
    if sat_code == '202':
        nota += ' · Solicitud en proceso (pendiente de aceptación del receptor).'
    elif sat_code == '201':
        nota += ' · Cancelada ante el SAT.'
    if replacement:
        nota += f' · Sustituye: {replacement}'

    factura.estatus = 'CANCELADA'
    factura.error_mensaje = nota[:2000]
    factura.save(update_fields=['estatus', 'error_mensaje'])
    return factura


def factura_resumen(factura: Factura | None) -> dict | None:
    if not factura:
        return None
    return {
        'id': factura.id,
        'estatus': factura.estatus,
        'uuid': factura.uuid,
        'serie': factura.serie,
        'folio': factura.folio,
        'total': str(factura.total),
        'rfc': factura.rfc,
        'razon_social': factura.razon_social,
        'email': factura.email or '',
        'pdf_url': factura.pdf_url,
        'xml_url': factura.xml_url,
        'error_mensaje': factura.error_mensaje,
        'timbrada_at': factura.timbrada_at.isoformat() if factura.timbrada_at else None,
    }


def ultima_factura_renta(renta: Renta) -> Factura | None:
    return (
        renta.facturas.filter(estatus='TIMBRADA').order_by('-timbrada_at', '-id').first()
        or renta.facturas.order_by('-created_at', '-id').first()
    )
