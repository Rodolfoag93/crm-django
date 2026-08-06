from rest_framework import viewsets, filters, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny, BasePermission, SAFE_METHODS
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.db.models import Q
from core.push_notifications import VAPID_PUBLIC_KEY
from datetime import timedelta, date
from decimal import Decimal

from django.db.models import Count, Sum, Max, Min, Avg, Subquery, OuterRef
from core.models import (
    Cliente, Producto, Renta, RentaProducto, Empleado,
    Nomina, Gasto, MovimientoContable, Asistencia, SolicitudRegistro, HorasExtra, PushSuscripcion,
    AsignacionCoordinador, ListaMaterialEvento, MaterialEvento, MaterialAnimacion,
    EvidenciaMaterial, TipoPagoExtra, PagoExtraNomina, AnimadorEvento,
    Ruta, RutaEmpleado, RutaRenta,
    BitacoraMantenimiento, TurnoAsistencia,
    Cuenta, PedidoFinanzas, TemporadaAlta,
    CoordinadorApoyo, SolicitudCambioMaterial,
)
from core.services.coordinacion import (
    CoordinacionError,
    crear_solicitud_cambio,
    es_lider,
    get_asignacion_equipo,
    qs_asignaciones_usuario,
    revisar_solicitud,
)
from core.utils import saldo_efectivo
from core.services import gastos as gastos_service
from core.services import cuentas as cuentas_service
from core.api.serializers import (
    ClienteSerializer, ProductoSerializer, RentaSerializer,
    EmpleadoSerializer, NominaSerializer, GastoSerializer,
    MovimientoContableSerializer, AsistenciaSerializer, SolicitudRegistroSerializer, HorasExtraSerializer,
    TemporadaAltaSerializer,
)


class EsAdmin(BasePermission):
    """Solo staff o superusuario tiene acceso."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and (request.user.is_staff or request.user.is_superuser))


class TemporadaAltaViewSet(viewsets.ModelViewSet):
    """CRUD de rangos de temporada alta (solo administradores)."""
    queryset = TemporadaAlta.objects.all().order_by('-fecha_inicio')
    serializer_class = TemporadaAltaSerializer
    permission_classes = [EsAdmin]
    pagination_class = None
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['fecha_inicio', 'fecha_fin', 'nombre']


class EsAdminOSoloLectura(BasePermission):
    """Cualquier empleado autenticado puede leer; solo admin puede escribir."""
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_staff or request.user.is_superuser


class ClienteViewSet(viewsets.ModelViewSet):
    queryset = Cliente.objects.all()  # requerido por el router para el basename
    serializer_class = ClienteSerializer
    permission_classes = [EsAdminOSoloLectura]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nombre', 'telefono']
    ordering_fields = ['nombre']

    def _base_qs(self):
        colonia_reciente = Renta.objects.filter(
            cliente=OuterRef('pk'), status='ACTIVO'
        ).order_by('-fecha_renta').values('colonia')[:1]
        return Cliente.objects.annotate(
            rentas_count=Count('renta', filter=Q(renta__status='ACTIVO')),
            total_gastado=Sum('renta__precio_total', filter=Q(renta__status='ACTIVO')),
            ultima_renta=Max('renta__fecha_renta', filter=Q(renta__status='ACTIVO')),
            colonia_frecuente=Subquery(colonia_reciente),
        ).order_by('nombre')

    def get_queryset(self):
        return self._base_qs()

    @action(detail=False, methods=['get'])
    def stats(self, request):
        hoy = date.today()
        mes_inicio = hoy.replace(day=1)

        total = Cliente.objects.count()

        # Recurrentes: más de 1 renta activa
        recurrentes = Cliente.objects.annotate(
            rc=Count('renta', filter=Q(renta__status='ACTIVO'))
        ).filter(rc__gt=1).count()

        # Nuevos este mes: primera renta fue este mes
        nuevos_mes = Cliente.objects.annotate(
            primera=Min('renta__fecha_renta', filter=Q(renta__status='ACTIVO'))
        ).filter(primera__gte=mes_inicio).count()

        # Ticket promedio: promedio de precio_total por renta activa
        ticket_promedio = Renta.objects.filter(
            status='ACTIVO'
        ).aggregate(avg=Avg('precio_total'))['avg'] or 0

        return Response({
            'total': total,
            'recurrentes': recurrentes,
            'nuevos_mes': nuevos_mes,
            'ticket_promedio': float(ticket_promedio),
        })


class ProductoViewSet(viewsets.ModelViewSet):
    queryset = Producto.objects.all()  # requerido por el router
    serializer_class = ProductoSerializer
    permission_classes = [EsAdminOSoloLectura]
    filter_backends = [filters.SearchFilter]
    search_fields = ['nombre', 'tipo']

    def get_queryset(self):
        qs = Producto.objects.annotate(
            veces_rentado=Count('rentaproductos__renta', distinct=True, filter=Q(rentaproductos__renta__status='ACTIVO')),
            ultima_renta=Max('rentaproductos__renta__fecha_renta', filter=Q(rentaproductos__renta__status='ACTIVO')),
        )
        solo_activos = self.request.query_params.get('activo')
        if solo_activos == 'true':
            qs = qs.filter(activo=True)
        elif solo_activos == 'false':
            qs = qs.filter(activo=False)
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(nombre__icontains=search) | Q(tipo__icontains=search))
        tipo = self.request.query_params.get('tipo', '').strip()
        if tipo:
            qs = qs.filter(tipo=tipo)
        return qs.order_by('nombre')

    @action(detail=False, methods=['get'])
    def stats(self, request):
        total_activos = Producto.objects.filter(activo=True).count()
        brincolines   = Producto.objects.filter(activo=True, tipo='BR').count()
        precio_prom   = Producto.objects.filter(activo=True).aggregate(avg=Avg('precio'))['avg'] or 0

        mas_rentado_qs = (
            Producto.objects.filter(activo=True, tipo='BR')
            .annotate(
                vr=Count('rentaproductos__renta', distinct=True, filter=Q(rentaproductos__renta__status='ACTIVO')),
                total_generado=Sum('rentaproductos__subtotal', filter=Q(rentaproductos__renta__status='ACTIVO')),
            )
            .order_by('-vr')
            .values('nombre', 'vr', 'total_generado')
            .first()
        )
        mas_rentado = {
            'nombre': mas_rentado_qs['nombre'],
            'vr': mas_rentado_qs['vr'],
            'total_generado': float(mas_rentado_qs['total_generado'] or 0),
        } if mas_rentado_qs else None

        conteo_por_tipo = list(
            Producto.objects.filter(activo=True)
            .values('tipo')
            .annotate(total=Count('id'))
            .order_by('-total')
        )

        return Response({
            'total_activos': total_activos,
            'brincolines': brincolines,
            'precio_promedio': float(precio_prom),
            'mas_rentado': mas_rentado,
            'por_tipo': conteo_por_tipo,
        })


class RentaViewSet(viewsets.ModelViewSet):
    queryset = Renta.objects.select_related('cliente').prefetch_related(
        'rentaproductos__producto', 'facturas'
    ).order_by('-fecha_renta')
    serializer_class = RentaSerializer
    permission_classes = [EsAdminOSoloLectura]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['folio', 'cliente__nombre', 'cliente__telefono']
    ordering_fields = ['fecha_renta', 'precio_total']

    def get_queryset(self):
        qs = Renta.objects.select_related('cliente').prefetch_related(
            'rentaproductos__producto', 'facturas'
        ).filter(status='ACTIVO')
        params = self.request.query_params
        fecha_inicio = params.get('fecha_inicio')
        fecha_fin = params.get('fecha_fin')
        estado = params.get('estado_entrega')
        pagado = params.get('pagado')
        if fecha_inicio:
            qs = qs.filter(fecha_renta__gte=fecha_inicio)
        if fecha_fin:
            qs = qs.filter(fecha_renta__lte=fecha_fin)
        if estado:
            qs = qs.filter(estado_entrega=estado)
        if pagado is not None and pagado != '':
            qs = qs.filter(pagado=pagado.lower() == 'true')
        return qs.order_by('-fecha_renta', 'hora_inicio')

    def _resolver_cuenta(self, metodo, cuenta_id):
        """Retorna (cuenta, error_str). efectivo → caja automática."""
        from core.services.pagos_renta import PagoRentaError, resolver_cuenta
        try:
            return resolver_cuenta(metodo, cuenta_id), None
        except PagoRentaError as exc:
            return None, exc.message

    def _saldo_pendiente(self, renta):
        """Saldo = precio_total - anticipo - pagos parciales ya registrados."""
        from core.services.pagos_renta import saldo_pendiente
        return float(saldo_pendiente(renta))

    @action(detail=True, methods=['get'])
    def saldo(self, request, pk=None):
        from core.services.pagos_renta import pagos_registrados, saldo_pendiente
        if not request.user.is_staff:
            return Response({'error': 'No autorizado.'}, status=403)
        renta = self.get_object()
        anticipo = float(renta.anticipo or 0)
        pagos = float(pagos_registrados(renta))
        saldo = float(saldo_pendiente(renta))
        return Response({
            'precio_total': float(renta.precio_total),
            'anticipo': anticipo,
            'pagos_registrados': pagos,
            'saldo_pendiente': max(0.0, saldo),
            'pagado': renta.pagado,
        })

    @action(detail=True, methods=['post'])
    def registrar_pago(self, request, pk=None):
        from core.services.pagos_renta import PagoRentaError, registrar_pago_renta
        if not request.user.is_staff:
            return Response({'error': 'No autorizado.'}, status=403)
        renta = self.get_object()
        metodo = request.data.get('metodo_pago')
        if metodo not in ('efectivo', 'transferencia'):
            return Response({'error': 'metodo_pago inválido.'}, status=400)
        # PWA exige cuenta_id en transferencia (no auto-elige banco)
        if metodo == 'transferencia' and not request.data.get('cuenta_id'):
            return Response({'error': 'Debes seleccionar una cuenta destino.'}, status=400)
        try:
            result = registrar_pago_renta(
                renta,
                monto=request.data.get('monto'),
                metodo_pago=metodo,
                cuenta_id=request.data.get('cuenta_id'),
            )
            return Response({
                'ok': True,
                'liquidado': result['liquidado'],
                'saldo_pendiente': float(result['saldo_pendiente']),
            })
        except PagoRentaError as exc:
            return Response({'error': exc.message}, status=exc.status)

    # Kept for backwards compat — delegates to registrar_pago logic
    @action(detail=True, methods=['post'])
    def marcar_pagado(self, request, pk=None):
        saldo = self._saldo_pendiente(self.get_object())
        request.data._mutable = True if hasattr(request.data, '_mutable') else None
        try:
            request.data['monto'] = str(saldo)
        except Exception:
            pass
        return self.registrar_pago(request, pk=pk)

    @action(detail=True, methods=['post'])
    def cancelar(self, request, pk=None):
        from django.db import transaction as db_transaction
        if not request.user.is_staff:
            return Response({'error': 'No autorizado.'}, status=403)
        renta = self.get_object()
        if renta.status == 'CANCELADO':
            return Response({'error': 'La renta ya está cancelada.'}, status=400)
        motivo = request.data.get('motivo', '').strip()
        if not motivo:
            return Response({'error': 'El motivo de cancelación es requerido.'}, status=400)
        with db_transaction.atomic():
            renta.status = 'CANCELADO'
            renta.estado_entrega = 'CANCELADO'
            renta.comentarios = motivo
            renta.save(update_fields=['status', 'estado_entrega', 'comentarios'])
        return Response({'ok': True})

    @action(detail=True, methods=['post'])
    def validacion_logistica(self, request, pk=None):
        """Aprobar o rechazar logística (temporada alta). Rechazo cancela y libera stock."""
        from core.services.temporada_alta import (
            aprobar_validacion_logistica,
            rechazar_validacion_logistica,
        )
        from core.services.rentas import RentaServiceError
        if not request.user.is_staff:
            return Response({'error': 'No autorizado.'}, status=403)
        renta = self.get_object()
        accion = (request.data.get('accion') or '').lower().strip()
        motivo = (request.data.get('motivo') or '').strip()
        actor = request.user.get_username()
        try:
            if accion in ('aprobar', 'ok'):
                return Response(aprobar_validacion_logistica(renta, actor=actor))
            if accion in ('rechazar', 'no'):
                return Response(rechazar_validacion_logistica(renta, motivo=motivo, actor=actor))
            return Response({'error': 'accion debe ser aprobar o rechazar.'}, status=400)
        except RentaServiceError as exc:
            return Response({'error': exc.message}, status=exc.status)

    @action(detail=True, methods=['get', 'post'])
    def facturar(self, request, pk=None):
        """GET: última factura / datos fiscales. POST: emitir CFDI vía FiscalAPI."""
        from core.services.facturacion import (
            FacturacionError,
            calcular_desglose_factura,
            facturar_renta,
            factura_resumen,
            ultima_factura_renta,
        )
        if not request.user.is_staff:
            return Response({'error': 'No autorizado.'}, status=403)
        renta = self.get_object()
        if request.method == 'GET':
            factura = ultima_factura_renta(renta)
            c = renta.cliente

            def _qbool(key, default=True):
                raw = request.query_params.get(key)
                if raw is None:
                    return default
                return str(raw).strip().lower() in ('1', 'true', 'yes', 'si', 'sí', 'on')

            return Response({
                'factura': factura_resumen(factura),
                'datos_fiscales_cliente': {
                    'rfc': c.rfc or '',
                    'razon_social': c.razon_social or c.nombre or '',
                    'regimen_fiscal': c.regimen_fiscal or '',
                    'codigo_postal': c.codigo_postal_fiscal or '',
                    'email': c.email_facturacion or '',
                    'uso_cfdi': c.uso_cfdi_default or 'G03',
                },
                'desglose': calcular_desglose_factura(
                    renta,
                    cobrar_iva=_qbool('cobrar_iva', True),
                    retener_isr=_qbool('retener_isr', True),
                ),
            })
        try:
            factura = facturar_renta(renta, request.data, user=request.user)
            return Response({'ok': True, 'factura': factura_resumen(factura)}, status=201)
        except FacturacionError as exc:
            return Response({'error': exc.message}, status=exc.status)

    @action(detail=True, methods=['post'], url_path='cancelar-factura')
    def cancelar_factura(self, request, pk=None):
        """Cancela el CFDI timbrado de la renta ante el SAT vía FiscalAPI."""
        from core.services.facturacion import (
            FacturacionError,
            MOTIVOS_CANCELACION,
            cancelar_factura as cancelar_cfdi,
            factura_resumen,
            ultima_factura_renta,
        )
        if not request.user.is_staff:
            return Response({'error': 'No autorizado.'}, status=403)
        renta = self.get_object()
        factura = ultima_factura_renta(renta)
        if not factura or factura.estatus != 'TIMBRADA':
            return Response(
                {'error': 'No hay una factura timbrada para cancelar en esta renta.'},
                status=400,
            )
        try:
            factura = cancelar_cfdi(factura, request.data)
            return Response({
                'ok': True,
                'factura': factura_resumen(factura),
                'motivos': [
                    {'value': k, 'label': f'{k} — {v}'} for k, v in MOTIVOS_CANCELACION.items()
                ],
            })
        except FacturacionError as exc:
            return Response({'error': exc.message}, status=exc.status)

    @action(detail=True, methods=['post'])
    def cambiar_estado(self, request, pk=None):
        if not request.user.is_staff:
            return Response({'error': 'No autorizado.'}, status=403)
        renta = self.get_object()
        nuevo_estado = request.data.get('estado_entrega')
        if nuevo_estado not in ('PENDIENTE', 'ENTREGADO', 'RECOGIDO'):
            return Response({'error': 'Estado inválido.'}, status=400)
        estado_anterior = renta.estado_entrega
        renta.estado_entrega = nuevo_estado
        renta.save(update_fields=['estado_entrega'])
        deposito = None
        if nuevo_estado == 'RECOGIDO' and estado_anterior != 'RECOGIDO':
            for rp in renta.rentaproductos.select_related('producto').all():
                rp.producto.liberar_stock(rp.cantidad)
            dep = renta.rentaproductos.select_related('producto').filter(
                producto__nombre__icontains='deposito'
            ).first()
            if dep:
                deposito = {
                    'monto': float(dep.subtotal or 0),
                    'folio': renta.folio,
                }
        return Response({'ok': True, 'estado_entrega': nuevo_estado, 'deposito': deposito})

    @action(detail=True, methods=['post'])
    def devolver_deposito(self, request, pk=None):
        if not request.user.is_staff:
            return Response({'error': 'No autorizado.'}, status=403)
        renta = self.get_object()
        monto = request.data.get('monto')
        if not monto:
            return Response({'error': 'Monto requerido.'}, status=400)
        from core.models import Gasto, Cuenta
        from django.utils import timezone as tz
        caja = Cuenta.objects.filter(tipo__iexact='efectivo').first()
        Gasto.objects.create(
            tipo='GASTO',
            categoria='DEVOLUCION',
            cuenta=caja,
            descripcion=f'Devolución depósito — Renta {renta.folio}',
            monto=monto,
            fecha=tz.localdate(),
            referencia=renta.folio,
        )
        return Response({'ok': True})

    @action(detail=True, methods=['patch'])
    def editar(self, request, pk=None):
        from django.db import transaction as db_transaction
        from decimal import Decimal, InvalidOperation
        if not request.user.is_staff:
            return Response({'error': 'No autorizado.'}, status=403)
        renta = self.get_object()
        data = request.data

        campos = ['fecha_renta', 'hora_inicio', 'hora_fin',
                  'calle_y_numero', 'colonia', 'ciudad_o_municipio', 'comentarios']
        with db_transaction.atomic():
            for campo in campos:
                if campo in data:
                    setattr(renta, campo, data[campo])

            productos_raw = data.get('productos')
            if productos_raw is not None:
                renta.rentaproductos.all().delete()
                total = Decimal('0')
                for p in productos_raw:
                    try:
                        prod = Producto.objects.get(id=p['id'])
                    except Producto.DoesNotExist:
                        return Response({'error': f"Producto {p['id']} no encontrado."}, status=400)
                    try:
                        cantidad = int(p['cantidad'])
                        precio = Decimal(str(p['precio_unitario']))
                    except (ValueError, InvalidOperation):
                        return Response({'error': 'Cantidad o precio inválido.'}, status=400)
                    RentaProducto.objects.create(
                        renta=renta, producto=prod,
                        cantidad=cantidad, precio_unitario=precio,
                    )
                    total += precio * cantidad

                precio_manual = data.get('precio_total')
                if precio_manual:
                    try:
                        renta.precio_total = Decimal(str(precio_manual))
                    except InvalidOperation:
                        pass
                else:
                    renta.precio_total = total

            renta.save()

            # Sincronizar con Google Calendar (crea o actualiza)
            try:
                from core.google_calendar import crear_evento_renta
                evento_id = crear_evento_renta(renta)
                if evento_id:
                    renta.evento_google_id = evento_id
                    renta.save(update_fields=['evento_google_id'])
            except Exception:
                pass

        serializer = self.get_serializer(renta)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def ticket(self, request, pk=None):
        from django.template.loader import render_to_string
        from django.templatetags.static import static
        from django.http import HttpResponse
        if not request.user.is_staff:
            return HttpResponse('No autorizado.', status=403, content_type='text/plain')
        renta = self.get_object()
        productos = []
        for rp in renta.rentaproductos.select_related('producto').all():
            subtotal = float(rp.precio_unitario) * rp.cantidad
            productos.append({
                'nombre': rp.producto.nombre,
                'cantidad': rp.cantidad,
                'precio': float(rp.precio_unitario),
                'subtotal': subtotal,
            })
        total = float(renta.precio_total or 0)
        anticipo = float(renta.anticipo or 0)
        logo_url = request.build_absolute_uri(static('img/logo1.png'))
        html = render_to_string('core/ticket_renta.html', {
            'renta': renta,
            'productos': productos,
            'total': total,
            'anticipo': anticipo,
            'restante': total - anticipo,
            'logo_url': logo_url,
        })
        return HttpResponse(html, content_type='text/html; charset=utf-8')

    @action(detail=False, methods=['get'])
    def semana_actual(self, request):
        hoy = timezone.localdate()
        lunes = hoy - timedelta(days=hoy.weekday())
        domingo = lunes + timedelta(days=6)
        rentas = self.get_queryset().filter(fecha_renta__range=[lunes, domingo])
        serializer = self.get_serializer(rentas, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def sin_pago(self, request):
        rentas = self.get_queryset().filter(
            pagado=False, fecha_renta__lt=timezone.localdate()
        )
        serializer = self.get_serializer(rentas, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        fecha_inicio_str = request.query_params.get('fecha_inicio')
        fecha_fin_str = request.query_params.get('fecha_fin')
        try:
            fecha_inicio = date.fromisoformat(fecha_inicio_str) if fecha_inicio_str else date.today()
            fecha_fin = date.fromisoformat(fecha_fin_str) if fecha_fin_str else date.today()
        except ValueError:
            return Response({'error': 'Fecha inválida.'}, status=400)

        qs = Renta.objects.filter(
            fecha_renta__gte=fecha_inicio,
            fecha_renta__lte=fecha_fin,
            status='ACTIVO',
        )
        total = qs.count()
        pendientes = qs.filter(estado_entrega='PENDIENTE').count()
        ingreso = qs.aggregate(t=Sum('precio_total'))['t'] or 0
        sin_cobrar = qs.filter(pagado=False).aggregate(t=Sum('precio_total'))['t'] or 0

        # Periodo anterior (misma duración)
        duracion = (fecha_fin - fecha_inicio).days + 1
        prev_fin = fecha_inicio - timedelta(days=1)
        prev_inicio = prev_fin - timedelta(days=duracion - 1)
        qs_prev = Renta.objects.filter(
            fecha_renta__gte=prev_inicio,
            fecha_renta__lte=prev_fin,
            status='ACTIVO',
        )
        prev_total = qs_prev.count()
        prev_ingreso = qs_prev.aggregate(t=Sum('precio_total'))['t'] or 0

        return Response({
            'total': total,
            'pendientes': pendientes,
            'ingreso': float(ingreso),
            'sin_cobrar': float(sin_cobrar),
            'anterior': {
                'total': prev_total,
                'ingreso': float(prev_ingreso),
            },
        })


class EmpleadoViewSet(viewsets.ModelViewSet):
    queryset = Empleado.objects.filter(activo=True).order_by('nombre')
    serializer_class = EmpleadoSerializer
    permission_classes = [EsAdminOSoloLectura]
    filter_backends = [filters.SearchFilter]
    search_fields = ['nombre', 'tipo_empleado']

    def get_queryset(self):
        qs = super().get_queryset()
        tipo = self.request.query_params.get('tipo_empleado')
        if tipo:
            qs = qs.filter(tipo_empleado=tipo)
        return qs


class NominaViewSet(viewsets.ModelViewSet):
    serializer_class = NominaSerializer
    permission_classes = [EsAdminOSoloLectura]

    def _sync(self, nomina):
        from core.utils import sincronizar_gasto_nomina
        nomina.total = nomina.calcular_total()
        nomina.save()
        sincronizar_gasto_nomina(nomina)

    def perform_create(self, serializer):
        nomina = serializer.save()
        self._sync(nomina)

    def perform_update(self, serializer):
        nomina = serializer.save()
        self._sync(nomina)

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            qs = Nomina.objects.select_related('empleado').order_by('-fecha_inicio')
        else:
            try:
                empleado = user.empleado
                qs = Nomina.objects.filter(empleado=empleado).order_by('-fecha_inicio')
            except Exception:
                return Nomina.objects.none()

        # Filtro por empleado (solo admin)
        empleado_id = self.request.query_params.get('empleado_id')
        if empleado_id and user.is_staff:
            qs = qs.filter(empleado_id=empleado_id)

        # Filtro por semana — todas las nóminas que caigan dentro del rango lunes-domingo
        fecha_inicio = self.request.query_params.get('fecha_inicio')
        if fecha_inicio:
            from datetime import date, timedelta
            lunes = date.fromisoformat(fecha_inicio)
            domingo = lunes + timedelta(days=6)
            qs = qs.filter(fecha_inicio__gte=lunes, fecha_fin__lte=domingo)

        return qs


class GastoViewSet(viewsets.ModelViewSet):
    queryset = Gasto.objects.select_related('cuenta').order_by('-fecha', '-id')
    serializer_class = GastoSerializer
    permission_classes = [EsAdmin]
    filter_backends = [filters.SearchFilter]
    search_fields = ['descripcion', 'referencia', 'tipo', 'categoria']

    def get_queryset(self):
        qs = Gasto.objects.select_related('cuenta').order_by('-fecha', '-id')
        semana = self.request.query_params.get('semana_inicio', '').strip()
        if semana:
            try:
                lunes = date.fromisoformat(semana)
                domingo = lunes + timedelta(days=6)
                qs = qs.filter(fecha__range=[lunes, domingo])
            except ValueError:
                pass
        tipo = self.request.query_params.get('tipo', '').strip()
        if tipo:
            qs = qs.filter(tipo=tipo)
        categoria = self.request.query_params.get('categoria', '').strip()
        if categoria:
            qs = qs.filter(categoria=categoria)
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def create(self, request, *args, **kwargs):
        try:
            comprobante = request.FILES.get('comprobante')
            data = self._parse_gasto_data(request.data)
            gasto = gastos_service.crear_gasto(data, comprobante=comprobante)
            serializer = self.get_serializer(gasto)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        gasto = self.get_object()
        if gasto.nomina_id:
            return Response(
                {'error': 'No puedes editar gastos generados automáticamente por nómina.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            comprobante = request.FILES.get('comprobante')
            data = self._parse_gasto_data(request.data)
            gasto = gastos_service.actualizar_gasto(gasto, data, comprobante=comprobante)
            serializer = self.get_serializer(gasto)
            return Response(serializer.data)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, *args, **kwargs):
        gasto = self.get_object()
        if gasto.nomina_id:
            return Response(
                {'error': 'No puedes eliminar gastos generados automáticamente por nómina.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        gastos_service.eliminar_gasto(gasto)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _parse_gasto_data(self, data):
        parsed = {}
        for key in ('tipo', 'categoria', 'descripcion', 'referencia', 'fecha'):
            if key in data:
                parsed[key] = data.get(key)
        if 'monto' in data:
            parsed['monto'] = data.get('monto')
        cuenta = data.get('cuenta') or data.get('cuenta_id')
        if cuenta not in (None, ''):
            parsed['cuenta'] = cuenta
        elif 'cuenta' in data or 'cuenta_id' in data:
            parsed['cuenta'] = None
        return parsed

    @action(detail=False, methods=['get'])
    def stats(self, request):
        semana = request.query_params.get('semana_inicio', '').strip()
        semana_inicio = None
        if semana:
            try:
                semana_inicio = date.fromisoformat(semana)
            except ValueError:
                pass
        return Response(gastos_service.stats_gastos(semana_inicio))

    @action(detail=False, methods=['get'])
    def catalogo(self, request):
        cuentas = Cuenta.objects.filter(activa=True).order_by('nombre')
        return Response({
            'tipos': [{'value': v, 'label': l} for v, l in Gasto.TIPO],
            'categorias': [{'value': v, 'label': l} for v, l in Gasto.CATEGORIA],
            'cuentas': [
                {
                    'id': c.id,
                    'nombre': c.nombre,
                    'tipo': c.tipo,
                    'banco': c.banco,
                    'saldo': str(c.saldo_actual()),
                }
                for c in cuentas
            ],
            'saldo_efectivo': str(saldo_efectivo()),
            'presupuestos': gastos_service.listar_presupuestos(),
        })

    @action(detail=False, methods=['get'], url_path='presupuesto')
    def presupuesto(self, request):
        categoria = request.query_params.get('categoria', '').strip()
        excluir = request.query_params.get('excluir_id')
        excluir_id = int(excluir) if excluir else None
        if categoria not in dict(Gasto.CATEGORIA):
            return Response({'error': 'Categoría no válida.'}, status=400)
        return Response(gastos_service.presupuesto_disponible(categoria, excluir_id=excluir_id))

    @action(detail=False, methods=['get'])
    def duplicados(self, request):
        descripcion = request.query_params.get('descripcion', '').strip()
        monto = request.query_params.get('monto', '').strip()
        categoria = request.query_params.get('categoria', '').strip()
        excluir = request.query_params.get('excluir_id')
        if not descripcion or not monto or not categoria:
            return Response({'error': 'Parámetros requeridos: descripcion, monto, categoria.'}, status=400)
        try:
            monto_dec = Decimal(monto)
        except Exception:
            return Response({'error': 'Monto inválido.'}, status=400)
        excluir_id = int(excluir) if excluir else None
        dupes = gastos_service.buscar_duplicados(descripcion, monto_dec, categoria, excluir_id=excluir_id)
        return Response({'duplicados': dupes, 'tiene_duplicados': len(dupes) > 0})


class MovimientoContableViewSet(viewsets.ModelViewSet):
    queryset = MovimientoContable.objects.all().order_by('-fecha')
    serializer_class = MovimientoContableSerializer
    permission_classes = [EsAdmin]


class CuentaViewSet(viewsets.ViewSet):
    """CRUD de cuentas + movimientos, transferencias y traspasos (staff)."""
    permission_classes = [EsAdmin]
    lookup_value_regex = r'\d+'

    def list(self, request):
        incluir = request.query_params.get('incluir_inactivas', '').lower() in ('1', 'true', 'yes')
        data = cuentas_service.listar_cuentas(
            activas_only=not incluir,
            incluir_inactivas=incluir,
        )
        return Response(data)

    def create(self, request):
        try:
            return Response(cuentas_service.crear_cuenta(request.data), status=status.HTTP_201_CREATED)
        except cuentas_service.CuentasError as e:
            return Response({'error': e.message}, status=e.status)

    def partial_update(self, request, pk=None):
        try:
            return Response(cuentas_service.actualizar_cuenta(int(pk), request.data))
        except cuentas_service.CuentasError as e:
            return Response({'error': e.message}, status=e.status)
        except (TypeError, ValueError):
            return Response({'error': 'ID inválido.'}, status=400)

    def retrieve(self, request, pk=None):
        try:
            cuenta = get_object_or_404(Cuenta, pk=int(pk))
            return Response(cuentas_service._serialize_cuenta(cuenta))
        except (TypeError, ValueError):
            return Response({'error': 'ID inválido.'}, status=400)

    @action(detail=False, methods=['get'])
    def resumen(self, request):
        return Response(cuentas_service.resumen_balances())

    @action(detail=True, methods=['get'])
    def movimientos(self, request, pk=None):
        try:
            limit = int(request.query_params.get('limit') or 100)
        except (TypeError, ValueError):
            limit = 100
        try:
            return Response(cuentas_service.movimientos_cuenta(int(pk), limit=limit))
        except (TypeError, ValueError):
            return Response({'error': 'ID inválido.'}, status=400)

    @action(detail=False, methods=['post'])
    def movimiento(self, request):
        try:
            return Response(cuentas_service.registrar_movimiento(request.data), status=status.HTTP_201_CREATED)
        except cuentas_service.CuentasError as e:
            return Response({'error': e.message}, status=e.status)

    @action(detail=False, methods=['post'])
    def transferir(self, request):
        try:
            return Response(cuentas_service.transferir(request.data), status=status.HTTP_201_CREATED)
        except cuentas_service.CuentasError as e:
            return Response({'error': e.message}, status=e.status)

    @action(detail=False, methods=['post'])
    def traspasar(self, request):
        try:
            return Response(
                cuentas_service.traspasar_efectivo_banco(request.data),
                status=status.HTTP_201_CREATED,
            )
        except cuentas_service.CuentasError as e:
            return Response({'error': e.message}, status=e.status)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    grupos = list(user.groups.values_list('name', flat=True))

    empleado_data = {}
    try:
        empleado = user.empleado
        empleado_data = {
            'empleado_id': empleado.id,
            'tipo_empleado': empleado.tipo_empleado,
            'es_eventual': empleado.es_eventual,
            'sueldo_diario': str(empleado.sueldo_diario),
        }
    except Exception:
        pass

    return Response({
        'id': user.id,
        'username': user.username,
        'nombre': f"{user.first_name} {user.last_name}".strip() or user.username,
        'email': user.email,
        'es_admin': user.is_superuser or user.is_staff,
        'grupos': grupos,
        'es_coordinador': 'Coordinador' in grupos or empleado_data.get('tipo_empleado') == 'COORDINADOR',
        'es_cargador': 'cargador' in grupos or 'Cargador' in grupos or empleado_data.get('tipo_empleado') == 'REPARTIDOR',
        'es_encargado_material': 'Encargado Material' in grupos or empleado_data.get('tipo_empleado') == 'ENCARGADO',
        **empleado_data,
    })

class AsistenciaViewSet(viewsets.ModelViewSet):
    serializer_class = AsistenciaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        params = self.request.query_params

        if user.is_staff or user.is_superuser:
            qs = Asistencia.objects.select_related('empleado').all()
            empleado_id = params.get('empleado')
            if empleado_id:
                qs = qs.filter(empleado_id=empleado_id)
        else:
            try:
                qs = Asistencia.objects.filter(empleado=user.empleado)
            except Exception:
                return Asistencia.objects.none()

        fecha_inicio = params.get('fecha_inicio')
        fecha_fin = params.get('fecha_fin')
        if fecha_inicio:
            qs = qs.filter(fecha__gte=fecha_inicio)
        if fecha_fin:
            qs = qs.filter(fecha__lte=fecha_fin)

        return qs
    @action(detail=False, methods=['post'])
    def checkin(self, request):
        ubicacion = request.data.get('ubicacion', '')
        try:
            empleado = request.user.empleado
        except Exception:
            empleado_id = request.data.get('empleado_id')
            if not empleado_id:
                return Response({'error': 'Empleado no encontrado'}, status=status.HTTP_404_NOT_FOUND)
            try:
                empleado = Empleado.objects.get(id=empleado_id)
            except Empleado.DoesNotExist:
                return Response({'error': 'Empleado no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        hoy = timezone.localdate()
        asistencia, _ = Asistencia.objects.get_or_create(
            empleado=empleado,
            fecha=hoy,
        )

        # Verificar si hay un turno abierto (sin checkout)
        turno_abierto = asistencia.turnos.filter(hora_salida__isnull=True).first()
        if turno_abierto:
            return Response({'error': 'Ya tienes un turno activo. Registra tu salida primero.'}, status=status.HTTP_400_BAD_REQUEST)

        # Crear nuevo turno
        numero = asistencia.turnos.count() + 1
        turno = TurnoAsistencia.objects.create(
            asistencia=asistencia,
            numero_turno=numero,
            hora_entrada=timezone.now(),
            ubicacion_entrada=ubicacion,
        )

        # Actualizar hora_entrada del registro principal si es el primer turno
        if numero == 1:
            asistencia.hora_entrada = turno.hora_entrada
            asistencia.ubicacion_entrada = ubicacion
            asistencia.save()

        serializer = self.get_serializer(asistencia)
        return Response({
            **serializer.data,
            'turno': numero,
            'mensaje': f'Entrada registrada (turno {numero})'
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def checkout(self, request):
        ubicacion = request.data.get('ubicacion', '')
        try:
            empleado = request.user.empleado
        except Exception:
            empleado_id = request.data.get('empleado_id')
            if not empleado_id:
                return Response({'error': 'Empleado no encontrado'}, status=status.HTTP_404_NOT_FOUND)
            try:
                empleado = Empleado.objects.get(id=empleado_id)
            except Empleado.DoesNotExist:
                return Response({'error': 'Empleado no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        hoy = timezone.localdate()
        try:
            asistencia = Asistencia.objects.get(empleado=empleado, fecha=hoy)
        except Asistencia.DoesNotExist:
            return Response({'error': 'No has registrado tu entrada hoy'}, status=status.HTTP_400_BAD_REQUEST)

        # Buscar turno abierto
        turno_abierto = asistencia.turnos.filter(hora_salida__isnull=True).first()
        if not turno_abierto:
            return Response({'error': 'No tienes un turno activo para cerrar'}, status=status.HTTP_400_BAD_REQUEST)

        turno_abierto.hora_salida = timezone.now()
        turno_abierto.ubicacion_salida = ubicacion
        # Calcular horas del turno
        delta = turno_abierto.hora_salida - turno_abierto.hora_entrada
        turno_abierto.horas_trabajadas = round(delta.total_seconds() / 3600, 2)
        turno_abierto.save()

        # Actualizar hora_salida del registro principal
        asistencia.hora_salida = turno_abierto.hora_salida
        asistencia.ubicacion_salida = ubicacion
        # Sumar horas de todos los turnos
        total_horas = sum(
            t.horas_trabajadas for t in asistencia.turnos.all() if t.horas_trabajadas
        )
        asistencia.horas_trabajadas = total_horas
        asistencia.save()

        serializer = self.get_serializer(asistencia)
        return Response({
            **serializer.data,
            'turno': turno_abierto.numero_turno,
            'horas_turno': float(turno_abierto.horas_trabajadas),
            'horas_total': float(total_horas),
            'mensaje': f'Salida registrada (turno {turno_abierto.numero_turno})'
        })

    @action(detail=False, methods=['get'])
    def hoy(self, request):
        hoy = timezone.localdate()
        asistencias = self.get_queryset().filter(fecha=hoy)
        serializer = self.get_serializer(asistencias, many=True)
        data = serializer.data

        try:
            empleado = request.user.empleado
            asistencia = asistencias.first()

            turno_activo = False
            if asistencia:
                turno_activo = asistencia.turnos.filter(hora_salida__isnull=True).exists()

            tiene_recogida_pendiente = RutaRenta.objects.filter(
                ruta__fecha=hoy,
                ruta__tipo='recogida',
                ruta__empleados__empleado=empleado,
                estado='pendiente'
            ).exists()

            if data and len(data) > 0:
                data[0]['turno_activo'] = turno_activo
                data[0]['tiene_recogida_pendiente'] = tiene_recogida_pendiente
            elif not data:
                return Response([{
                    'turno_activo': False,
                    'tiene_recogida_pendiente': tiene_recogida_pendiente
                }])
        except Exception:
            pass

        return Response(data)

class HorasExtraViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = HorasExtraSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return HorasExtra.objects.select_related('empleado').order_by('-semana_inicio')
        try:
            empleado = user.empleado
            return HorasExtra.objects.filter(empleado=empleado).order_by('-semana_inicio')
        except Exception:
            return HorasExtra.objects.none()

    @action(detail=False, methods=['get'])
    def semana_actual(self, request):
        """Devuelve el resumen de horas de la semana actual sin guardar."""
        try:
            empleado = request.user.empleado
        except Exception:
            return Response({'error': 'Empleado no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        hoy = date.today()
        lunes = hoy - timedelta(days=hoy.weekday())
        domingo = lunes + timedelta(days=6)

        preview = HorasExtra(
            empleado=empleado,
            semana_inicio=lunes,
            semana_fin=domingo
        )
        preview.calcular()

        return Response({
            'semana_inicio': lunes,
            'semana_fin': domingo,
            'horas_trabajadas': preview.horas_trabajadas,
            'horas_descontadas': preview.horas_descontadas,
            'horas_computables': preview.horas_computables,
            'horas_extra': preview.horas_extra,
            'total_pago': preview.total_pago,
            'es_eventual': empleado.es_eventual,
        })

class SolicitudRegistroViewSet(viewsets.GenericViewSet):
    serializer_class = SolicitudRegistroSerializer
    permission_classes = [AllowAny]

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def registro(self, request):
        serializer = SolicitudRegistroSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(
                {'mensaje': 'Solicitud enviada correctamente. El administrador revisará tu solicitud.'},
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def aprobar(self, request, pk=None):
        if not (request.user.is_staff or request.user.is_superuser):
            return Response({'error': 'No tienes permiso'}, status=status.HTTP_403_FORBIDDEN)

        solicitud = get_object_or_404(SolicitudRegistro, pk=pk)

        if solicitud.estado != 'PENDIENTE':
            return Response({'error': 'Esta solicitud ya fue procesada'}, status=status.HTTP_400_BAD_REQUEST)

        from django.contrib.auth.models import User
        from django.utils import timezone as tz

        # Crear usuario
        username = solicitud.telefono
        if User.objects.filter(username=username).exists():
            username = f"{solicitud.telefono}_{solicitud.id}"

        user = User(
            username=username,
            first_name=solicitud.nombre.split()[0],
            last_name=' '.join(solicitud.nombre.split()[1:]),
            email=solicitud.email or '',
        )
        user.password = solicitud.password_hash
        user.save()

        # Buscar empleado existente por teléfono
        empleado = Empleado.objects.filter(telefono=solicitud.telefono).first()

        if empleado:
        # Vincular usuario al empleado existente
            empleado.user = user
            empleado.save()
        else:
         # Crear empleado nuevo
            empleado = Empleado.objects.create(
                nombre=solicitud.nombre,
                telefono=solicitud.telefono,
                correo=solicitud.email or '',
                tipo_empleado=solicitud.tipo_empleado,
                sueldo_diario=0,
                activo=True,
                user=user
        )

        # Actualizar solicitud
        solicitud.estado = 'APROBADA'
        solicitud.revisada_por = request.user
        solicitud.fecha_revision = tz.now()
        solicitud.user_creado = user
        solicitud.save()

        return Response({
            'mensaje': f'Solicitud aprobada. Usuario {username} creado correctamente.',
            'user_id': user.id,
            'empleado_id': empleado.id
        })

#---------push notificacions---------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def push_suscribir(request):
    """Guarda la suscripción push del dispositivo del usuario."""
    data = request.data
    endpoint = data.get('endpoint')
    p256dh = data.get('keys', {}).get('p256dh')
    auth = data.get('keys', {}).get('auth')

    if not all([endpoint, p256dh, auth]):
        return Response({'error': 'Datos incompletos.'}, status=400)

    PushSuscripcion.objects.update_or_create(
        endpoint=endpoint,
        defaults={
            'user': request.user,
            'p256dh': p256dh,
            'auth': auth,
        }
    )
    return Response({'ok': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def push_desuscribir(request):
    """Elimina la suscripción push del dispositivo."""
    endpoint = request.data.get('endpoint')
    if endpoint:
        PushSuscripcion.objects.filter(user=request.user, endpoint=endpoint).delete()
    return Response({'ok': True})


@api_view(['GET'])
@permission_classes([AllowAny])
def push_vapid_key(request):
    """Devuelve la clave pública VAPID para el cliente."""
    return Response({'vapid_public_key': VAPID_PUBLIC_KEY})

# ── Mantenimiento ──────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_mantenimiento(request):
    """
    Devuelve todos los brincolines con su estado de mantenimiento,
    ordenados por próxima renta más cercana.
    """
    hoy = date.today()

    brincolines = Producto.objects.filter(tipo='BR', activo=True)
    for p in brincolines:
        BitacoraMantenimiento.objects.get_or_create(producto=p)

    bitacoras = BitacoraMantenimiento.objects.select_related('producto').filter(
        producto__tipo='BR',
        producto__activo=True
    )

    resultado = []
    for b in bitacoras:
        proxima = RentaProducto.objects.filter(
            producto=b.producto,
            renta__fecha_renta__gte=hoy,
            renta__status='ACTIVO'
        ).order_by('renta__fecha_renta').first()

        proxima_renta = str(proxima.renta.fecha_renta) if proxima else None
        ultima_renta_fecha = RentaProducto.obtener_fecha_ultima_renta(b.producto)
        ultima_renta = str(ultima_renta_fecha) if ultima_renta_fecha else None
        ultima_limpieza = str(b.fecha_ultimo_mantenimiento) if b.fecha_ultimo_mantenimiento else None

        necesita_limpieza = (
            ultima_renta_fecha and (
                not b.fecha_ultimo_mantenimiento or
                b.fecha_ultimo_mantenimiento < ultima_renta_fecha
            )
        )

        resultado.append({
            'id': b.producto.id,
            'nombre': b.producto.nombre,
            'proxima_renta': proxima_renta,
            'ultima_renta': ultima_renta,
            'ultima_limpieza': ultima_limpieza,
            'necesita_limpieza': necesita_limpieza,
            'notas': b.notas or '',
        })

    resultado.sort(key=lambda x: (
        x['proxima_renta'] is None,
        x['proxima_renta'] or '9999-99-99'
    ))

    return Response(resultado)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_marcar_limpieza(request, producto_id):
    """
    El repartidor marca un brincolin como limpio.
    """
    producto = get_object_or_404(Producto, id=producto_id, tipo='BR')
    notas = request.data.get('notas', '')
    fecha_ultima_renta = RentaProducto.obtener_fecha_ultima_renta(producto)

    mant, _ = BitacoraMantenimiento.objects.update_or_create(
        producto=producto,
        defaults={
            'fecha_ultima_renta': fecha_ultima_renta,
            'fecha_ultimo_mantenimiento': timezone.now().date(),
            'notas': notas,
        }
    )

    return Response({
        'ok': True,
        'fecha_ultimo_mantenimiento': str(mant.fecha_ultimo_mantenimiento),
    })

# ── Dashboard Admin ────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_dashboard_admin(request):
    """Resumen del día para el admin en la PWA."""
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    hoy = date.today()

    # Pedidos del día
    rentas_hoy = Renta.objects.filter(fecha_renta=hoy, status='ACTIVO')
    pedidos_por_enviar = rentas_hoy.filter(estado_entrega='PENDIENTE').count()
    pedidos_enviados = rentas_hoy.filter(estado_entrega='ENTREGADO').count()
    pedidos_total = rentas_hoy.count()

    # Rutas del día
    rutas_hoy = Ruta.objects.filter(fecha=hoy)
    rutas_pendientes = rutas_hoy.filter(estado='pendiente').count()
    rutas_en_camino = rutas_hoy.filter(estado='en_camino').count()

    # Asistencia
    asistencias_hoy = Asistencia.objects.filter(fecha=hoy).select_related('empleado')
    con_entrada = asistencias_hoy.filter(hora_entrada__isnull=False).count()
    con_salida = asistencias_hoy.filter(hora_salida__isnull=False).count()

    # Ingreso del mes actual
    mes_inicio = hoy.replace(day=1)
    ingreso_mes = Renta.objects.filter(
        fecha_renta__gte=mes_inicio,
        fecha_renta__lte=hoy,
        status='ACTIVO',
    ).aggregate(total=Sum('precio_total'))['total'] or 0

    # Ingreso del mes anterior (mes completo)
    mes_anterior_fin = mes_inicio - timedelta(days=1)
    mes_anterior_inicio = mes_anterior_fin.replace(day=1)
    ingreso_mes_anterior = Renta.objects.filter(
        fecha_renta__gte=mes_anterior_inicio,
        fecha_renta__lte=mes_anterior_fin,
        status='ACTIVO',
    ).aggregate(total=Sum('precio_total'))['total'] or 0

    # Sin cobrar hoy (suma de totales de rentas de hoy sin pago)
    sin_cobrar_monto = rentas_hoy.filter(pagado=False).aggregate(
        total=Sum('precio_total')
    )['total'] or 0

    # Solicitudes pendientes
    solicitudes_pendientes = SolicitudRegistro.objects.filter(estado='PENDIENTE').count()

    # Lista de empleados activos con su asistencia de hoy
    registros_hoy = {a.empleado_id: a for a in asistencias_hoy}
    empleados_activos_qs = Empleado.objects.filter(
        activo=True, tipo_empleado__in=['REPARTIDOR', 'ENCARGADO']
    ).order_by('nombre')[:8]
    asistencia_lista = [
        {
            'id': emp.id,
            'nombre': emp.nombre,
            'tipo': emp.get_tipo_empleado_display(),
            'hora_entrada': (
                registros_hoy[emp.id].hora_entrada.strftime('%H:%M')
                if emp.id in registros_hoy and registros_hoy[emp.id].hora_entrada
                else None
            ),
        }
        for emp in empleados_activos_qs
    ]

    return Response({
        'pedidos': {
            'total': pedidos_total,
            'por_enviar': pedidos_por_enviar,
            'enviados': pedidos_enviados,
        },
        'rutas': {
            'total': rutas_hoy.count(),
            'pendientes': rutas_pendientes,
            'en_camino': rutas_en_camino,
        },
        'asistencia': {
            'con_entrada': con_entrada,
            'con_salida': con_salida,
        },
        'ingreso_mes': float(ingreso_mes),
        'ingreso_mes_anterior': float(ingreso_mes_anterior),
        'sin_cobrar_monto': float(sin_cobrar_monto),
        'asistencia_lista': asistencia_lista,
        'solicitudes_pendientes': solicitudes_pendientes,
    })

# ── Rentas del día (admin) ─────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_rentas_hoy(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    fecha_param = request.query_params.get('fecha')
    try:
        fecha = date.fromisoformat(fecha_param) if fecha_param else date.today()
    except ValueError:
        return Response({'error': 'Fecha inválida. Usa formato YYYY-MM-DD.'}, status=400)

    busqueda = request.query_params.get('busqueda', '').strip()

    qs = Renta.objects.filter(
        fecha_renta=fecha,
        status='ACTIVO'
    ).select_related('cliente').prefetch_related('rentaproductos__producto')

    if busqueda:
        qs = qs.filter(
            Q(cliente__nombre__icontains=busqueda) | Q(folio__icontains=busqueda)
        )

    rentas = qs.order_by('hora_inicio')

    data = []
    for r in rentas:
        productos = [
            f"{rp.cantidad}× {rp.producto.nombre}"
            for rp in r.rentaproductos.all()
        ]
        data.append({
            'id': r.id,
            'folio': r.folio,
            'cliente': r.cliente.nombre,
            'telefono': r.cliente.telefono,
            'direccion': f"{r.calle_y_numero}, {r.colonia}, {r.ciudad_o_municipio}",
            'hora_inicio': str(r.hora_inicio) if r.hora_inicio else None,
            'hora_fin': str(r.hora_fin) if r.hora_fin else None,
            'estado_entrega': r.estado_entrega,
            'pagado': r.pagado,
            'total': str(r.precio_total) if r.precio_total else '0',
            'productos': productos,
        })

    return Response(data)

# ── Asistencia del día (admin) ─────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_asistencia_hoy(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    fecha_param = request.GET.get('fecha')
    try:
        fecha = date.fromisoformat(fecha_param) if fecha_param else date.today()
    except ValueError:
        fecha = date.today()

    empleados = Empleado.objects.filter(
        activo=True,
        tipo_empleado__in=['REPARTIDOR', 'ENCARGADO']
    ).select_related('user').order_by('nombre')

    asistencias = Asistencia.objects.filter(fecha=fecha).select_related('empleado')
    asistencias_dict = {a.empleado_id: a for a in asistencias}

    data = []
    for emp in empleados:
        asistencia = asistencias_dict.get(emp.id)
        data.append({
            'empleado_id': emp.id,
            'nombre': emp.nombre,
            'tipo': emp.get_tipo_empleado_display(),
            'tiene_entrada': asistencia is not None and asistencia.hora_entrada is not None,
            'tiene_salida': asistencia is not None and asistencia.hora_salida is not None,
            'hora_entrada': asistencia.hora_entrada.isoformat() if asistencia and asistencia.hora_entrada else None,
            'hora_salida': asistencia.hora_salida.isoformat() if asistencia and asistencia.hora_salida else None,
            'horas_trabajadas': str(asistencia.horas_trabajadas) if asistencia and asistencia.horas_trabajadas else None,
        })

    data.sort(key=lambda x: (not x['tiene_entrada'], x['nombre']))

    return Response({
        'fecha': str(fecha),
        'total': len(data),
        'con_entrada': sum(1 for d in data if d['tiene_entrada']),
        'con_salida': sum(1 for d in data if d['tiene_salida']),
        'empleados': data,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_editar_asistencia_admin(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    from datetime import datetime, timezone as dt_timezone, timedelta
    data = request.data
    empleado_id = data.get('empleado_id')
    fecha_str = data.get('fecha')
    hora_entrada = data.get('hora_entrada')
    hora_salida = data.get('hora_salida')

    try:
        empleado = Empleado.objects.get(id=empleado_id)
    except Empleado.DoesNotExist:
        return Response({'error': 'Empleado no encontrado.'}, status=404)

    utc_offset = dt_timezone(timedelta(hours=-6))

    def hora_a_datetime(fecha_s, hora_s):
        if not hora_s:
            return None
        dt = datetime.strptime(f"{fecha_s} {hora_s}", "%Y-%m-%d %H:%M")
        return dt.replace(tzinfo=utc_offset)

    entrada_dt = hora_a_datetime(fecha_str, hora_entrada)
    salida_dt = hora_a_datetime(fecha_str, hora_salida) if hora_salida else None

    asistencia, _ = Asistencia.objects.get_or_create(empleado=empleado, fecha=fecha_str)
    entrada_anterior = asistencia.hora_entrada
    salida_anterior = asistencia.hora_salida

    asistencia.hora_entrada = entrada_dt
    asistencia.hora_salida = salida_dt
    asistencia.save()

    from core.models import TurnoAsistencia
    TurnoAsistencia.objects.update_or_create(
        asistencia=asistencia,
        numero_turno=1,
        defaults={
            'hora_entrada': entrada_dt,
            'hora_salida': salida_dt,
            'horas_trabajadas': asistencia.horas_trabajadas,
        }
    )

    # Notificar al empleado si se registró entrada o salida por primera vez
    from core.push_notifications import enviar_notificacion
    hora_fmt = lambda dt: dt.strftime('%H:%M') if dt else ''
    if entrada_dt and not entrada_anterior:
        enviar_notificacion(
            empleado.user,
            '✅ Entrada registrada',
            f'Tu entrada de hoy quedó registrada a las {hora_fmt(entrada_dt)}.',
            url='/home',
        )
    if salida_dt and not salida_anterior:
        enviar_notificacion(
            empleado.user,
            '👋 Salida registrada',
            f'Tu salida de hoy quedó registrada a las {hora_fmt(salida_dt)}.',
            url='/home',
        )

    return Response({'ok': True, 'horas_trabajadas': str(asistencia.horas_trabajadas) if asistencia.horas_trabajadas else None})

# ── Rutas Admin PWA ────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_rutas_admin(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    fecha_param = request.GET.get('fecha', str(date.today()))

    rutas = Ruta.objects.filter(fecha=fecha_param).prefetch_related(
        'empleados__empleado', 'paradas__renta__cliente'
    ).order_by('nombre')

    data = []
    for ruta in rutas:
        empleados = [
            {'nombre': re.empleado.nombre, 'es_lider': re.es_lider}
            for re in ruta.empleados.all()
        ]
        paradas = [
            {
                'id': p.id,
                'orden': p.orden,
                'cliente': p.renta.cliente.nombre,
                'folio': p.renta.folio,
                'estado': p.estado,
                'direccion': f"{p.renta.calle_y_numero}, {p.renta.colonia}, {p.renta.ciudad_o_municipio}",
            }
            for p in ruta.paradas.all()
        ]
        data.append({
            'id': ruta.id,
            'nombre': ruta.nombre,
            'tipo': ruta.tipo,
            'estado': ruta.estado,
            'fecha': str(ruta.fecha),
            'empleados': empleados,
            'paradas': paradas,
            'total_paradas': len(paradas),
            'pendientes': sum(1 for p in paradas if p['estado'] == 'pendiente'),
        })

    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_crear_ruta(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    data = request.data

    ruta = Ruta.objects.create(
        nombre=data.get('nombre'),
        tipo=data.get('tipo', 'entrega'),
        fecha=data.get('fecha'),
        notas=data.get('notas', ''),
    )

    lider_id = data.get('lider_id')
    emp_ids = data.get('empleados', [])
    for emp_id in emp_ids:
        RutaEmpleado.objects.create(
            ruta=ruta,
            empleado_id=emp_id,
            es_lider=(str(emp_id) == str(lider_id))
        )

    # Notificar a los repartidores asignados
    if emp_ids:
        from core.push_notifications import enviar_notificacion
        tipo_label = 'entrega' if ruta.tipo == 'entrega' else 'recogida'
        for emp in Empleado.objects.filter(id__in=emp_ids).select_related('user'):
            enviar_notificacion(
                emp.user,
                f'🚚 Ruta de {tipo_label} asignada',
                f'Tienes una ruta "{ruta.nombre}" para hoy. Revisa tu app.',
                url='/home',
            )

    return Response({'ok': True, 'ruta_id': ruta.id})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_agregar_parada_admin(request, ruta_id):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    ruta = get_object_or_404(Ruta, id=ruta_id)
    renta_id = request.data.get('renta_id')

    orden = ruta.paradas.count() + 1
    RutaRenta.objects.create(
        ruta=ruta,
        renta_id=renta_id,
        orden=orden,
    )

    return Response({'ok': True})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_rentas_disponibles(request):
    """Rentas sin ruta asignada para una fecha dada."""
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)
    fecha = request.GET.get('fecha', str(date.today()))
    ruta_id = request.GET.get('ruta_id')
    tipo = request.GET.get('tipo')  # 'entrega', 'recogida' o vacío (ambos)

    if tipo in ('recoleccion', 'recogida'):
        # Solo pedidos ya entregados, pendientes de recolectar
        rentas = Renta.objects.filter(
            status='ACTIVO',
            estado_entrega='ENTREGADO',
        )
    elif tipo == 'entrega':
        # Solo pedidos a entregar en la fecha seleccionada
        rentas = Renta.objects.filter(
            fecha_renta=fecha,
            status='ACTIVO',
            estado_entrega='PENDIENTE',
        )
    else:
        # Mixto: pedidos pendientes de esa fecha + pedidos entregados pendientes de recoger
        from django.db.models import Q
        rentas = Renta.objects.filter(status='ACTIVO').filter(
            Q(estado_entrega='PENDIENTE', fecha_renta=fecha) |
            Q(estado_entrega='ENTREGADO')
        )

    if ruta_id:
        rentas = rentas.exclude(rutas__ruta_id=ruta_id)

    rentas = rentas.select_related('cliente').order_by('hora_inicio')

    data = [
        {
            'id': r.id,
            'folio': r.folio,
            'cliente': r.cliente.nombre,
            'fecha_renta': str(r.fecha_renta),
            'hora_inicio': str(r.hora_inicio) if r.hora_inicio else None,
            'direccion': f"{r.calle_y_numero}, {r.colonia}, {r.ciudad_o_municipio}",
            'estado_entrega': r.estado_entrega,
        }
        for r in rentas
    ]
    return Response(data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def api_editar_ruta(request, ruta_id):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    ruta = get_object_or_404(Ruta, id=ruta_id)
    data = request.data

    ruta.nombre = data.get('nombre', ruta.nombre)
    ruta.tipo = data.get('tipo', ruta.tipo)
    ruta.fecha = data.get('fecha', ruta.fecha)
    ruta.notas = data.get('notas', ruta.notas)
    ruta.estado = data.get('estado', ruta.estado)
    ruta.save()

    empleados_previos = set(ruta.empleados.values_list('empleado_id', flat=True))
    ruta.empleados.all().delete()
    lider_id = data.get('lider_id')
    nuevos_ids = data.get('empleados', [])
    for emp_id in nuevos_ids:
        RutaEmpleado.objects.create(
            ruta=ruta,
            empleado_id=emp_id,
            es_lider=(str(emp_id) == str(lider_id))
        )

    # Notificar solo a repartidores recién agregados
    recien_agregados = [eid for eid in nuevos_ids if int(eid) not in empleados_previos]
    if recien_agregados:
        from core.push_notifications import enviar_notificacion
        tipo_label = 'entrega' if ruta.tipo == 'entrega' else 'recogida'
        for emp in Empleado.objects.filter(id__in=recien_agregados).select_related('user'):
            enviar_notificacion(
                emp.user,
                f'🚚 Ruta de {tipo_label} asignada',
                f'Tienes una ruta "{ruta.nombre}" para hoy. Revisa tu app.',
                url='/home',
            )

    return Response({'ok': True})


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def api_eliminar_parada_admin(request, parada_id):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    parada = get_object_or_404(RutaRenta, id=parada_id)
    if parada.estado != 'pendiente':
        return Response({'error': 'Solo se pueden eliminar paradas pendientes.'}, status=400)

    parada.delete()
    return Response({'ok': True})


# ── Nueva Renta (admin PWA) ────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_nueva_renta(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    from core.services.rentas import RentaServiceError, crear_renta

    try:
        result = crear_renta(request.data)
        return Response(result, status=201)
    except RentaServiceError as exc:
        return Response({'error': exc.message}, status=exc.status)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_buscar_clientes(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    q = request.GET.get('q', '')
    clientes = Cliente.objects.filter(
        Q(nombre__icontains=q) | Q(telefono__icontains=q)
    ).values('id', 'nombre', 'telefono', 'calle_y_numero', 'colonia', 'ciudad_o_municipio')[:10]
    return Response(list(clientes))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_buscar_productos(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    from core.services.bot_productos import aplicar_busqueda_nombre

    q = request.GET.get('q', '').strip()
    tipo = request.GET.get('tipo', '').strip().upper()
    try:
        limit = max(1, min(int(request.GET.get('limit', 20)), 50))
    except (TypeError, ValueError):
        return Response({'error': 'limit debe ser un entero.'}, status=400)

    qs = Producto.objects.filter(activo=True)
    if tipo:
        qs = qs.filter(tipo=tipo)
    if q:
        qs = aplicar_busqueda_nombre(qs, q)
    productos = qs.order_by('tipo', 'nombre').values('id', 'nombre', 'precio', 'tipo')[:limit]
    # Lista plana: contrato usado por PWA (NuevaRenta, Cotizador, etc.)
    return Response(list(productos))

# ── Gastos Admin PWA ───────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_crear_gasto(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)
    try:
        # multipart/FormData → MultiValueDict; dict() deja listas (['1000']).
        # Usar .get() para obtener el valor escalar.
        data = {
            'tipo': request.data.get('tipo'),
            'categoria': request.data.get('categoria'),
            'descripcion': request.data.get('descripcion'),
            'monto': request.data.get('monto'),
            'fecha': request.data.get('fecha'),
            'referencia': request.data.get('referencia') or '',
            'cuenta': request.data.get('cuenta') or request.data.get('cuenta_id'),
        }
        comprobante = request.FILES.get('comprobante')
        gasto = gastos_service.crear_gasto(data, comprobante=comprobante)
        return Response({'ok': True, 'gasto_id': gasto.id})
    except ValueError as e:
        return Response({'error': str(e)}, status=400)

# ── Nómina: Pagos Extra ────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_catalogo_pagos_extra(request):
    """Lista los tipos de pago extra disponibles."""
    tipos = TipoPagoExtra.objects.all().order_by('nombre')
    data = [
        {
            'id': t.id,
            'nombre': t.nombre,
            'monto': str(t.monto_default),
            'descuenta_horas': t.descuenta_horas,
            'horas_a_descontar': str(t.horas_a_descontar) if t.horas_a_descontar else '0',
        }
        for t in tipos
    ]
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_crear_pago_extra_nomina(request, nomina_id):
    """Agrega un pago extra a una nómina existente."""
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    nomina = get_object_or_404(Nomina, id=nomina_id)
    tipo_id = request.data.get('tipo_id')
    monto_override = request.data.get('monto')  # opcional

    tipo = get_object_or_404(TipoPagoExtra, id=tipo_id)

    pago = PagoExtraNomina.objects.create(
        nomina=nomina,
        tipo=tipo,
        monto=monto_override if monto_override else tipo.monto_default,
    )

    # Recalcular total de la nómina
    nomina.save()

    return Response({
        'ok': True,
        'pago_id': pago.id,
        'tipo': tipo.nombre,
        'monto': str(pago.monto),
        'nuevo_total': str(nomina.total),
    }, status=201)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def api_eliminar_pago_extra(request, pago_id):
    """Elimina un pago extra de una nómina."""
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    pago = get_object_or_404(PagoExtraNomina, id=pago_id)
    nomina = pago.nomina
    pago.delete()

    # Recalcular total
    nomina.save()

    return Response({'ok': True, 'nuevo_total': str(nomina.total)})

# ── Coordinador PWA ────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_mis_eventos(request):
    """Eventos del coordinador (líder o apoyo)."""

    asignaciones = qs_asignaciones_usuario(request.user).select_related(
        'renta', 'renta__cliente', 'coordinador'
    ).prefetch_related(
        'renta__rentaproductos__producto', 'apoyos'
    ).order_by('-renta__fecha_renta')

    data = []
    for a in asignaciones:
        productos_animacion = [
            rp.producto.nombre
            for rp in a.renta.rentaproductos.all()
            if rp.producto.tipo == 'AN'
        ]
        data.append({
            'asignacion_id': a.id,
            'renta_id': a.renta.id,
            'folio': a.renta.folio,
            'cliente': a.renta.cliente.nombre,
            'telefono': a.renta.cliente.telefono,
            'fecha': str(a.renta.fecha_renta),
            'hora_inicio': str(a.renta.hora_inicio) if a.renta.hora_inicio else None,
            'hora_fin': str(a.renta.hora_fin) if a.renta.hora_fin else None,
            'direccion': f"{a.renta.calle_y_numero}, {a.renta.colonia}, {a.renta.ciudad_o_municipio}",
            'servicios': productos_animacion,
            'notas': a.notas or '',
            'tiene_lista': ListaMaterialEvento.objects.filter(asignacion=a).exists(),
            'es_lider': a.coordinador_id == request.user.id,
            'rol': 'LIDER' if a.coordinador_id == request.user.id else 'APOYO',
        })

    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_evento_detalle(request, asignacion_id):
    """Detalle completo de un evento (líder o apoyo)."""

    try:
        asignacion = get_asignacion_equipo(asignacion_id, request.user)
    except CoordinacionError as exc:
        return Response({'error': exc.message}, status=exc.status)

    r = asignacion.renta
    productos = [
        {
            'nombre': rp.producto.nombre,
            'tipo': rp.producto.tipo,
            'cantidad': rp.cantidad,
            'precio_unitario': str(rp.precio_unitario),
        }
        for rp in r.rentaproductos.select_related('producto').all()
    ]
    apoyos = [
        {
            'id': ap.usuario_id,
            'nombre': ap.usuario.get_full_name() or ap.usuario.username,
        }
        for ap in asignacion.apoyos.select_related('usuario')
    ]

    return Response({
        'asignacion_id': asignacion.id,
        'renta_id': r.id,
        'folio': r.folio,
        'cliente': r.cliente.nombre,
        'telefono': r.cliente.telefono,
        'direccion': f"{r.calle_y_numero}, {r.colonia}, {r.ciudad_o_municipio}",
        'fecha': str(r.fecha_renta),
        'hora_inicio': str(r.hora_inicio) if r.hora_inicio else None,
        'hora_fin': str(r.hora_fin) if r.hora_fin else None,
        'precio_total': str(r.precio_total),
        'anticipo': str(r.anticipo),
        'pagado': r.pagado,
        'comentarios': r.comentarios or '',
        'productos': productos,
        'notas_coordinador': asignacion.notas or '',
        'es_lider': es_lider(asignacion, request.user),
        'lider': (
            asignacion.coordinador.get_full_name() or asignacion.coordinador.username
        ) if asignacion.coordinador else None,
        'apoyos': apoyos,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_lista_material_evento(request, asignacion_id):
    """Lista de material visible para todo el equipo."""

    try:
        asignacion = get_asignacion_equipo(asignacion_id, request.user)
    except CoordinacionError as exc:
        return Response({'error': exc.message}, status=exc.status)

    try:
        lista = ListaMaterialEvento.objects.get(asignacion=asignacion)
    except ListaMaterialEvento.DoesNotExist:
        return Response({
            'existe': False,
            'items': [],
            'es_lider': es_lider(asignacion, request.user),
            'solicitudes_pendientes': [],
        })

    items = MaterialEvento.objects.filter(
        asignacion=asignacion
    ).select_related('material')

    data = [
        {
            'id': item.id,
            'material_id': item.material.id,
            'material_nombre': item.material.nombre,
            'material_foto': request.build_absolute_uri(item.material.foto.url) if item.material.foto else None,
            'cantidad': item.cantidad,
            'nota': item.nota or '',
            'despachado': item.despachado,
            'recibido': item.recibido,
        }
        for item in items
    ]
    solicitudes = [
        {
            'id': s.id,
            'tipo': s.tipo,
            'material_id': s.material_id,
            'material_nombre': s.material.nombre,
            'cantidad': s.cantidad,
            'solicitado_por': s.solicitado_por.get_full_name() or s.solicitado_por.username,
            'estado': s.estado,
        }
        for s in lista.solicitudes_cambio.filter(estado='PENDIENTE').select_related('material', 'solicitado_por')
    ]

    return Response({
        'existe': True,
        'lista_id': lista.id,
        'estado': lista.estado,
        'items': data,
        'es_lider': es_lider(asignacion, request.user),
        'solicitudes_pendientes': solicitudes,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_agregar_material_evento(request, asignacion_id):
    """Líder agrega directo; apoyo crea solicitud."""

    try:
        asignacion = get_asignacion_equipo(asignacion_id, request.user)
    except CoordinacionError as exc:
        return Response({'error': exc.message}, status=exc.status)

    material_id = request.data.get('material_id')
    cantidad = request.data.get('cantidad', 1)
    nota = request.data.get('nota', '')

    if es_lider(asignacion, request.user):
        lista, _ = ListaMaterialEvento.objects.get_or_create(
            asignacion=asignacion,
            defaults={'estado': 'BORRADOR'}
        )
        material = get_object_or_404(MaterialAnimacion, id=material_id)
        item, created = MaterialEvento.objects.get_or_create(
            asignacion=asignacion,
            material=material,
            defaults={'cantidad': cantidad, 'nota': nota}
        )
        if not created:
            item.cantidad = cantidad
            item.nota = nota
            item.save()
        return Response({
            'ok': True,
            'item_id': item.id,
            'created': created,
            'via': 'directo',
            'lista_id': lista.id,
        }, status=201 if created else 200)

    try:
        solicitud = crear_solicitud_cambio(
            asignacion, request.user, 'AGREGAR', material_id, cantidad, nota
        )
        return Response({
            'ok': True,
            'via': 'solicitud',
            'solicitud_id': solicitud.id,
            'estado': solicitud.estado,
        }, status=201)
    except CoordinacionError as exc:
        return Response({'error': exc.message}, status=exc.status)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def api_quitar_material_evento(request, item_id):
    """Líder quita directo; apoyo solicita quitar."""

    item = get_object_or_404(MaterialEvento.objects.select_related('asignacion', 'material'), id=item_id)
    try:
        asignacion = get_asignacion_equipo(item.asignacion_id, request.user)
    except CoordinacionError as exc:
        return Response({'error': exc.message}, status=exc.status)

    if es_lider(asignacion, request.user):
        item.delete()
        return Response({'ok': True, 'via': 'directo'})

    try:
        solicitud = crear_solicitud_cambio(
            asignacion, request.user, 'QUITAR', item.material_id, item.cantidad
        )
        return Response({
            'ok': True,
            'via': 'solicitud',
            'solicitud_id': solicitud.id,
        }, status=201)
    except CoordinacionError as exc:
        return Response({'error': exc.message}, status=exc.status)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_revisar_solicitud_material(request, solicitud_id):
    """Líder aprueba o rechaza una solicitud de cambio de material."""
    aprobar = str(request.data.get('aprobar', 'true')).lower() in ('1', 'true', 'si', 'yes')
    comentario = request.data.get('comentario', '')
    try:
        solicitud = revisar_solicitud(solicitud_id, request.user, aprobar=aprobar, comentario=comentario)
        return Response({
            'ok': True,
            'solicitud_id': solicitud.id,
            'estado': solicitud.estado,
        })
    except CoordinacionError as exc:
        return Response({'error': exc.message}, status=exc.status)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_catalogo_materiales(request):
    """Catálogo de materiales de animación."""

    q = request.GET.get('q', '')
    materiales = MaterialAnimacion.objects.filter(activo=True)
    if q:
        materiales = materiales.filter(nombre__icontains=q)

    data = [
        {
            'id': m.id,
            'nombre': m.nombre,
            'descripcion': m.descripcion or '',
            'tipo': m.tipo,
            'stock_disponible': m.stock_disponible,
            'foto': request.build_absolute_uri(m.foto.url) if m.foto else None,
        }
        for m in materiales.order_by('nombre')
    ]
    return Response(data)

# ── Encargado de Material PWA ──────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_listas_material_encargado(request):
    """Lista todas las listas de material para el encargado."""
    
    estado = request.GET.get('estado', '')
    listas = ListaMaterialEvento.objects.select_related(
        'asignacion__renta__cliente',
        'asignacion__coordinador'
    ).order_by('-asignacion__renta__fecha_renta')

    if estado:
        listas = listas.filter(estado=estado)

    data = []
    for l in listas:
        data.append({
            'id': l.id,
            'estado': l.estado,
            'folio': l.asignacion.renta.folio,
            'cliente': l.asignacion.renta.cliente.nombre,
            'fecha': str(l.asignacion.renta.fecha_renta),
            'hora_inicio': str(l.asignacion.renta.hora_inicio) if l.asignacion.renta.hora_inicio else None,
            'coordinador': (l.asignacion.coordinador.get_full_name() or l.asignacion.coordinador.username) if l.asignacion.coordinador else 'Sin asignar',
            'total_items': l.asignacion.materiales.count() if hasattr(l.asignacion, 'materiales') else 0,
        })

    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_lista_material_detalle_encargado(request, lista_id):
    """Detalle de una lista de material para el encargado."""

    lista = get_object_or_404(ListaMaterialEvento, id=lista_id)
    items = MaterialEvento.objects.filter(
        asignacion=lista.asignacion
    ).select_related('material')

    items_data = [
        {
            'id': item.id,
            'material_id': item.material.id,
            'material_nombre': item.material.nombre,
            'material_foto': request.build_absolute_uri(item.material.foto.url) if item.material.foto else None,
            'cantidad': item.cantidad,
            'nota': item.nota or '',
            'despachado': item.despachado,
            'recibido': item.recibido,
            'observacion': item.observacion or '',
        }
        for item in items
    ]

    return Response({
        'id': lista.id,
        'estado': lista.estado,
        'folio': lista.asignacion.renta.folio,
        'cliente': lista.asignacion.renta.cliente.nombre,
        'fecha': str(lista.asignacion.renta.fecha_renta),
        'hora_inicio': str(lista.asignacion.renta.hora_inicio) if lista.asignacion.renta.hora_inicio else None,
        'direccion': f"{lista.asignacion.renta.calle_y_numero}, {lista.asignacion.renta.colonia}, {lista.asignacion.renta.ciudad_o_municipio}",
        'coordinador': lista.asignacion.coordinador.get_full_name() or lista.asignacion.coordinador.username,
        'observaciones_recepcion': lista.observaciones_recepcion or '',
        'items': items_data,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_surtir_lista(request, lista_id):
    """Encargado surte la lista y descuenta stock."""

    lista = get_object_or_404(ListaMaterialEvento, id=lista_id)

    if lista.estado not in ('BORRADOR', 'ENVIADA', 'PENDIENTE', 'REVISADA', 'PREPARADA'):
        return Response({'error': f'La lista ya está en estado {lista.estado}'}, status=400)

    items = MaterialEvento.objects.filter(
        asignacion=lista.asignacion
    ).select_related('material')

    # Descontar stock
    for item in items:
        material = item.material
        material.stock_disponible = max(0, material.stock_disponible - item.cantidad)
        material.save(update_fields=['stock_disponible'])
        item.despachado = True
        item.save(update_fields=['despachado'])

    lista.estado = 'SURTIDA'
    lista.surtida_por = request.user
    lista.fecha_surtido = timezone.now()
    lista.save()

    return Response({'ok': True, 'estado': lista.estado})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_confirmar_llegada_coordinador(request, lista_id):
    """Coordinador confirma que el material llegó al evento."""

    lista = get_object_or_404(ListaMaterialEvento, id=lista_id)

    lista.estado = 'EN_EVENTO'
    lista.confirmada_por = request.user
    lista.fecha_confirmacion = timezone.now()
    lista.llego_completa = request.data.get('llego_completa', True)
    lista.observaciones_llegada = request.data.get('observaciones', '')
    lista.save()

    return Response({'ok': True, 'estado': lista.estado})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_recibir_lista_bodega(request, lista_id):
    """Encargado recibe el material de vuelta en bodega."""

    lista = get_object_or_404(ListaMaterialEvento, id=lista_id)

    items_data = request.data.get('items', [])
    observaciones = request.data.get('observaciones', '')

    # Restaurar stock según lo recibido
    for item_data in items_data:
        try:
            item = MaterialEvento.objects.get(id=item_data['id'])
            cantidad_recibida = int(item_data.get('cantidad_recibida', item.cantidad))
            item.recibido = True
            item.observacion = item_data.get('observacion', '')
            item.save(update_fields=['recibido', 'observacion'])

            # Restaurar stock con lo que llegó
            material = item.material
            material.stock_disponible = material.stock_disponible + cantidad_recibida
            material.save(update_fields=['stock_disponible'])
            item.stock_restaurado = True
            item.save(update_fields=['stock_restaurado'])
        except MaterialEvento.DoesNotExist:
            continue

    lista.estado = 'REGRESADA'
    lista.recibida_por = request.user
    lista.fecha_recepcion = timezone.now()
    lista.observaciones_recepcion = observaciones
    lista.save()

    # Notificar a ambos para calificarse mutuamente
    try:
        asignacion = lista.asignacion
        folio = asignacion.renta.folio
        if asignacion.coordinador:
            enviar_notificacion(
                asignacion.coordinador,
                '⭐ Califica al encargado',
                f'El material de {folio} fue recibido. ¿Cómo estuvo el encargado?',
                f'/coordinador/eventos/{asignacion.id}',
            )
        if lista.surtida_por:
            enviar_notificacion(
                lista.surtida_por,
                '⭐ Califica al coordinador',
                f'Material de {folio} recibido. ¿Cómo estuvo el coordinador?',
                f'/encargado/listas/{lista.id}',
            )
    except Exception:
        pass

    return Response({'ok': True, 'estado': lista.estado})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_subir_evidencia(request, lista_id):
    """Sube una foto de evidencia para una lista."""

    lista = get_object_or_404(ListaMaterialEvento, id=lista_id)
    foto = request.FILES.get('foto')
    tipo = request.data.get('tipo', 'SALIDA')
    descripcion = request.data.get('descripcion', '')

    if not foto:
        return Response({'error': 'No se proporcionó foto'}, status=400)

    evidencia = EvidenciaMaterial.objects.create(
        lista=lista,
        tipo=tipo,
        foto=foto,
        descripcion=descripcion,
        subida_por=request.user,
    )

    return Response({
        'ok': True,
        'evidencia_id': evidencia.id,
        'foto_url': request.build_absolute_uri(evidencia.foto.url),
    }, status=201)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_evidencias_lista(request, lista_id):
    """Obtiene las evidencias de una lista."""

    lista = get_object_or_404(ListaMaterialEvento, id=lista_id)
    evidencias = EvidenciaMaterial.objects.filter(lista=lista).order_by('fecha')

    data = [
        {
            'id': e.id,
            'tipo': e.tipo,
            'foto_url': request.build_absolute_uri(e.foto.url),
            'descripcion': e.descripcion,
            'fecha': str(e.fecha),
            'subida_por': e.subida_por.get_full_name() or e.subida_por.username if e.subida_por else '',
        }
        for e in evidencias
    ]

    return Response(data)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_enviar_lista_coordinador(request, asignacion_id):
    """Coordinador envía la lista al encargado de material."""

    asignacion = get_object_or_404(
        AsignacionCoordinador,
        id=asignacion_id,
        coordinador=request.user
    )

    try:
        lista = ListaMaterialEvento.objects.get(asignacion=asignacion)
    except ListaMaterialEvento.DoesNotExist:
        return Response({'error': 'No hay lista de material para este evento'}, status=400)

    if MaterialEvento.objects.filter(asignacion=lista.asignacion).count() == 0:
        return Response({'error': 'La lista está vacía'}, status=400)

    if lista.estado != 'BORRADOR':
        return Response({'error': f'La lista ya está en estado {lista.estado}'}, status=400)

    lista.estado = 'ENVIADA'
    lista.save()

    try:
        from core.push_notifications import enviar_notificacion
        from django.contrib.auth.models import User
        encargados = User.objects.filter(empleado__tipo_empleado='ENCARGADO', empleado__activo=True)
        for encargado in encargados:
            enviar_notificacion(
                encargado,
                '📦 Nueva lista de material',
                f'El coordinador {request.user.get_full_name() or request.user.username} envió una lista para {asignacion.renta.cliente.nombre}',
                '/encargado'
            )
    except Exception:
        pass

    return Response({'ok': True, 'estado': lista.estado})

    return Response({'ok': True, 'estado': lista.estado})

# ── Animadores PWA ─────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_mis_eventos_animador(request):
    """Eventos asignados al animador logueado."""
    from core.models import AnimadorEvento
    try:
        empleado = request.user.empleado
    except Exception:
        return Response({'error': 'Empleado no encontrado'}, status=400)

    asignaciones = AnimadorEvento.objects.filter(
        animador=empleado
    ).select_related(
        'asignacion__renta__cliente',
        'asignacion__coordinador'
    ).order_by('-asignacion__renta__fecha_renta')

    data = []
    for ae in asignaciones:
        r = ae.asignacion.renta
        data.append({
            'animador_evento_id': ae.id,
            'asignacion_id': ae.asignacion.id,
            'estado': ae.estado,
            'fecha': str(r.fecha_renta),
            'hora_cita': str(ae.hora_cita) if ae.hora_cita else None,
            'tipo_llegada': ae.tipo_llegada,
            'coordinador': ae.asignacion.coordinador.get_full_name() or ae.asignacion.coordinador.username,
            'direccion': f"{r.calle_y_numero}, {r.colonia}, {r.ciudad_o_municipio}",
            'hora_inicio': str(r.hora_inicio) if r.hora_inicio else None,
            'hora_fin': str(r.hora_fin) if r.hora_fin else None,
            'tiene_calificacion': hasattr(ae, 'calificacion'),
        })

    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_responder_evento_animador(request, animador_evento_id):
    """Animador acepta o rechaza un evento."""
    from core.models import AnimadorEvento
    try:
        empleado = request.user.empleado
    except Exception:
        return Response({'error': 'Empleado no encontrado'}, status=400)

    ae = get_object_or_404(AnimadorEvento, id=animador_evento_id, animador=empleado)
    estado = request.data.get('estado')
    tipo_llegada = request.data.get('tipo_llegada')

    if estado not in ('ACEPTADO', 'RECHAZADO'):
        return Response({'error': 'Estado inválido'}, status=400)

    ae.estado = estado
    if tipo_llegada:
        ae.tipo_llegada = tipo_llegada
    ae.save()

    return Response({'ok': True, 'estado': ae.estado})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_calificar_coordinador(request, animador_evento_id):
    """Animador califica al coordinador después del evento."""
    from core.models import AnimadorEvento, CalificacionCoordinador
    try:
        empleado = request.user.empleado
    except Exception:
        return Response({'error': 'Empleado no encontrado'}, status=400)

    ae = get_object_or_404(AnimadorEvento, id=animador_evento_id, animador=empleado)

    if hasattr(ae, 'calificacion'):
        return Response({'error': 'Ya calificaste este evento'}, status=400)

    data = request.data
    campos = ['comunicacion', 'organizacion', 'trato', 'respeto', 'puntualidad', 'innovacion']
    for campo in campos:
        val = float(data.get(campo, 0))
        if not 0 <= val <= 5:
            return Response({'error': f'{campo} debe ser entre 0 y 5'}, status=400)

    cal = CalificacionCoordinador.objects.create(
        animador_evento=ae,
        comunicacion=data.get('comunicacion', 0),
        organizacion=data.get('organizacion', 0),
        trato=data.get('trato', 0),
        respeto=data.get('respeto', 0),
        puntualidad=data.get('puntualidad', 0),
        innovacion=data.get('innovacion', 0),
        comentario=data.get('comentario', ''),
    )

    return Response({
        'ok': True,
        'promedio': str(cal.promedio),
    }, status=201)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_ranking_coordinadores(request):
    """Ranking top 10 de coordinadores por calificación."""
    from core.models import CalificacionCoordinador, AnimadorEvento
    from django.db.models import Avg, Count
    from django.contrib.auth.models import User

    ranking = CalificacionCoordinador.objects.values(
        'animador_evento__asignacion__coordinador'
    ).annotate(
        promedio=Avg('comunicacion') + Avg('organizacion') + Avg('trato') +
                 Avg('respeto') + Avg('puntualidad') + Avg('innovacion'),
        total_eventos=Count('id')
    ).order_by('-promedio')[:10]

    data = []
    for r in ranking:
        user_id = r['animador_evento__asignacion__coordinador']
        try:
            user = User.objects.get(id=user_id)
            nombre = user.get_full_name() or user.username
            try:
                nombre = user.empleado.nombre
            except Exception:
                pass
        except User.DoesNotExist:
            continue

        data.append({
            'coordinador': nombre,
            'promedio': round(r['promedio'] / 6, 2),
            'total_eventos': r['total_eventos'],
        })

    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_mi_calificacion_coordinador(request):
    """El coordinador ve su propia calificación promedio."""
    from core.models import CalificacionCoordinador
    from django.db.models import Avg

    promedios = CalificacionCoordinador.objects.filter(
        animador_evento__asignacion__coordinador=request.user
    ).aggregate(
        comunicacion=Avg('comunicacion'),
        organizacion=Avg('organizacion'),
        trato=Avg('trato'),
        respeto=Avg('respeto'),
        puntualidad=Avg('puntualidad'),
        innovacion=Avg('innovacion'),
        total=Count('id'),
    )

    if not promedios['total']:
        return Response({'sin_calificaciones': True})

    from django.db.models import Count
    campos = ['comunicacion', 'organizacion', 'trato', 'respeto', 'puntualidad', 'innovacion']
    promedio_general = sum(promedios[c] or 0 for c in campos) / 6

    return Response({
        'sin_calificaciones': False,
        'promedio_general': round(promedio_general, 2),
        'detalle': {c: round(promedios[c] or 0, 2) for c in campos},
        'total_evaluaciones': promedios['total'],
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_animadores_disponibles(request):
    """Lista animadores disponibles para asignar a un evento."""
    from core.models import Empleado
    animadores = Empleado.objects.filter(
        tipo_empleado='ANIMADOR',
        activo=True
    ).order_by('nombre')

    data = [
        {
            'id': a.id,
            'nombre': a.nombre,
            'telefono': a.telefono,
        }
        for a in animadores
    ]
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_asignar_animador(request, asignacion_id):
    """Coordinador asigna un animador a su evento."""
    from core.models import AnimadorEvento, AsignacionCoordinador, Empleado
    asignacion = get_object_or_404(
        AsignacionCoordinador,
        id=asignacion_id,
        coordinador=request.user
    )
    animador_id = request.data.get('animador_id')
    hora_cita = request.data.get('hora_cita')

    animador = get_object_or_404(Empleado, id=animador_id, tipo_empleado='ANIMADOR')

    ae, created = AnimadorEvento.objects.get_or_create(
        asignacion=asignacion,
        animador=animador,
        defaults={'hora_cita': hora_cita}
    )

    if not created:
        return Response({'error': 'Este animador ya está asignado'}, status=400)

    # Notificar al animador
    try:
        if animador.user:
            r = asignacion.renta
            enviar_notificacion(
                animador.user,
                '🎉 Fuiste asignado a un evento',
                f'El {r.fecha_renta} a las {hora_cita or r.hora_inicio} en {r.ciudad_o_municipio}. ¡Confirma tu asistencia!',
                '/animador'
            )
    except Exception:
        pass

    return Response({'ok': True, 'animador_evento_id': ae.id}, status=201)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def api_quitar_animador(request, animador_evento_id):
    """Coordinador quita un animador de su evento."""
    from core.models import AnimadorEvento, AsignacionCoordinador
    ae = get_object_or_404(AnimadorEvento, id=animador_evento_id)
    get_object_or_404(AsignacionCoordinador, id=ae.asignacion_id, coordinador=request.user)
    ae.delete()
    return Response({'ok': True})

# ── Calificación Animadores ────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_calificar_animador(request, animador_evento_id):
    """Coordinador califica a un animador después del evento."""
    from core.models import AnimadorEvento, CalificacionAnimador, AsignacionCoordinador

    ae = get_object_or_404(AnimadorEvento, id=animador_evento_id)

    # Verificar que el coordinador es el dueño del evento
    get_object_or_404(AsignacionCoordinador, id=ae.asignacion_id, coordinador=request.user)

    if hasattr(ae, 'calificacion_coordinador'):
        return Response({'error': 'Ya calificaste a este animador'}, status=400)

    data = request.data
    campos = ['proactividad', 'disposicion', 'puntualidad', 'compromiso', 'respeto', 'atencion_clientes']
    for campo in campos:
        val = float(data.get(campo, 0))
        if not 0 <= val <= 5:
            return Response({'error': f'{campo} debe ser entre 0 y 5'}, status=400)

    cal = CalificacionAnimador.objects.create(
        animador_evento=ae,
        proactividad=data.get('proactividad', 0),
        disposicion=data.get('disposicion', 0),
        puntualidad=data.get('puntualidad', 0),
        compromiso=data.get('compromiso', 0),
        respeto=data.get('respeto', 0),
        atencion_clientes=data.get('atencion_clientes', 0),
        comentario=data.get('comentario', ''),
    )

    return Response({'ok': True, 'promedio': str(cal.promedio)}, status=201)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_ranking_animadores(request):
    """Ranking top 10 de animadores por calificación."""
    from core.models import CalificacionAnimador
    from django.db.models import Avg, Count

    ranking = CalificacionAnimador.objects.values(
        'animador_evento__animador'
    ).annotate(
        promedio=(
            Avg('proactividad') + Avg('disposicion') + Avg('puntualidad') +
            Avg('compromiso') + Avg('respeto') + Avg('atencion_clientes')
        ),
        total_eventos=Count('id')
    ).order_by('-promedio')[:10]

    data = []
    for r in ranking:
        empleado_id = r['animador_evento__animador']
        try:
            emp = Empleado.objects.get(id=empleado_id)
            data.append({
                'animador': emp.nombre,
                'promedio': round(r['promedio'] / 6, 2),
                'total_eventos': r['total_eventos'],
            })
        except Empleado.DoesNotExist:
            continue

    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_animadores_por_calificar(request, asignacion_id):
    """Lista animadores de un evento."""
    from core.models import AnimadorEvento, AsignacionCoordinador

    get_object_or_404(AsignacionCoordinador, id=asignacion_id, coordinador=request.user)

    animadores = AnimadorEvento.objects.filter(
        asignacion_id=asignacion_id,
    ).select_related('animador')

    data = [
        {
            'animador_evento_id': ae.id,
            'animador_id': ae.animador.id,
            'nombre': ae.animador.nombre,
            'estado': ae.estado,
            'ya_calificado': hasattr(ae, 'calificacion_coordinador'),
        }
        for ae in animadores
    ]

    return Response(data)

@api_view(['POST'])
@permission_classes([AllowAny])
def api_registro_solicitud(request):
    """Registro de nueva solicitud sin autenticación."""
    from core.api.serializers import SolicitudRegistroSerializer
    serializer = SolicitudRegistroSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(
            {'mensaje': 'Solicitud enviada correctamente. El administrador revisará tu solicitud.'},
            status=status.HTTP_201_CREATED
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# ── Rankings por eventos extra (CRM) ──────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_rankings_eventos(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    rol = request.query_params.get('rol', 'coordinadores')
    año = request.query_params.get('anio') or request.query_params.get('año')
    mes = request.query_params.get('mes')

    if rol == 'coordinadores':
        filtros = {}
        if año:
            filtros['renta__fecha_renta__year'] = int(año)
        if mes:
            filtros['renta__fecha_renta__month'] = int(mes)

        qs = (AsignacionCoordinador.objects
              .filter(**filtros, coordinador__isnull=False)
              .values('coordinador__id', 'coordinador__first_name', 'coordinador__last_name')
              .annotate(total_eventos=Count('id'))
              .order_by('-total_eventos'))

        data = [{'id': r['coordinador__id'],
                 'nombre': f"{r['coordinador__first_name']} {r['coordinador__last_name']}".strip(),
                 'total_eventos': r['total_eventos'],
                 'total_monto': None} for r in qs]

    elif rol == 'animadores':
        filtros = {'estado': 'ACEPTADO'}
        if año:
            filtros['asignacion__renta__fecha_renta__year'] = int(año)
        if mes:
            filtros['asignacion__renta__fecha_renta__month'] = int(mes)

        qs = (AnimadorEvento.objects
              .filter(**filtros)
              .values('animador__id', 'animador__nombre')
              .annotate(total_eventos=Count('id'))
              .order_by('-total_eventos'))

        data = [{'id': r['animador__id'],
                 'nombre': r['animador__nombre'],
                 'total_eventos': r['total_eventos'],
                 'total_monto': None} for r in qs]

    elif rol == 'repartidores':
        filtros = {'tipo__descuenta_horas': True}
        if año:
            filtros['nomina__fecha_inicio__year'] = int(año)
        if mes:
            filtros['nomina__fecha_inicio__month'] = int(mes)

        qs = (PagoExtraNomina.objects
              .filter(**filtros)
              .values('nomina__empleado__id', 'nomina__empleado__nombre')
              .annotate(total_eventos=Count('id'), total_monto=Sum('monto'))
              .order_by('-total_eventos'))

        data = [{'id': r['nomina__empleado__id'],
                 'nombre': r['nomina__empleado__nombre'],
                 'total_eventos': r['total_eventos'],
                 'total_monto': str(r['total_monto'] or 0)} for r in qs]

    else:
        return Response({'error': 'Rol inválido. Usa: coordinadores, animadores, repartidores'}, status=400)

    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_recibo_nomina(request, nomina_id):
    from django.template.loader import render_to_string
    from django.http import HttpResponse
    from weasyprint import HTML

    nomina = get_object_or_404(Nomina, id=nomina_id)
    sueldo_base = nomina.dias_trabajados * nomina.empleado.sueldo_diario
    total_extra = nomina.pago_eventos_extra()
    html_string = render_to_string('nomina/recibo_nomina_pdf.html', {
        'nomina': nomina,
        'sueldo_base': sueldo_base,
        'total_pagado': sueldo_base + total_extra,
        'fecha': date.today(),
    })
    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="recibo_nomina_{nomina_id}.pdf"'
    HTML(string=html_string).write_pdf(response)
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_mapa_entregas(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    import requests as http_req
    from concurrent.futures import ThreadPoolExecutor
    from core.models import Ruta

    hoy = date.today()
    rutas = Ruta.objects.filter(fecha=hoy).prefetch_related(
        'paradas__renta__cliente',
        'empleados__empleado',
    )

    paradas_todas = []
    for ruta in rutas:
        repartidores = [re.empleado.nombre for re in ruta.empleados.all()]
        for parada in ruta.paradas.all():
            paradas_todas.append((parada, repartidores))

    # Geocodificar rentas sin coordenadas secuencialmente (Nominatim: 1 req/s)
    refrescar = request.query_params.get('refrescar') == '1'
    if refrescar:
        for parada, _ in paradas_todas:
            parada.renta.lat = None
            parada.renta.lon = None
            parada.renta.save(update_fields=['lat', 'lon'])
    sin_coords = [p for p, _ in paradas_todas if not p.renta.lat or not p.renta.lon]

    def _nominatim(params):
        try:
            resp = http_req.get(
                'https://nominatim.openstreetmap.org/search',
                params={**params, 'format': 'json', 'limit': 1, 'countrycodes': 'mx'},
                headers={'User-Agent': 'TrotaCRM/1.0 rodolfo.aguiar@codeablelabs.com'},
                timeout=4,
            )
            results = resp.json()
            return results[0] if results else None
        except Exception:
            return None

    def geocodificar(parada):
        import time
        renta = parada.renta
        ciudad = renta.ciudad_o_municipio or 'Colima'
        estado = 'Colima'  # todas las rentas son en Colima

        # Estrategias de fallback: de más específico a menos
        # Usamos query estructurada primero para evitar que Nominatim confunda
        # nombres de calles con municipios homónimos (ej. Av Venustiano Carranza)
        intentos = []
        if renta.calle_y_numero and renta.colonia:
            intentos.append({'street': renta.calle_y_numero, 'city': ciudad, 'state': estado})
        if renta.calle_y_numero:
            intentos.append({'street': renta.calle_y_numero, 'city': ciudad, 'state': estado})
        if renta.colonia:
            intentos.append({'q': f"{renta.colonia}, {ciudad}, {estado}"})
        intentos.append({'q': f"{ciudad}, {estado}, Mexico"})

        for params in intentos:
            time.sleep(1)  # respetar rate limit de Nominatim
            resultado = _nominatim(params)
            if resultado:
                renta.lat = resultado['lat']
                renta.lon = resultado['lon']
                renta.save(update_fields=['lat', 'lon'])
                return

    for parada in sin_coords:
        geocodificar(parada)

    data = []
    for parada, repartidores in paradas_todas:
        renta = parada.renta
        data.append({
            'parada_id': parada.id,
            'renta_id': renta.id,
            'folio': renta.folio,
            'cliente': renta.cliente.nombre,
            'telefono': renta.cliente.telefono,
            'direccion': f"{renta.calle_y_numero}, {renta.colonia}",
            'hora_inicio': str(renta.hora_inicio) if renta.hora_inicio else None,
            'estado': parada.estado,
            'lat': float(renta.lat) if renta.lat else None,
            'lon': float(renta.lon) if renta.lon else None,
            'repartidores': repartidores,
        })

    # Posiciones de repartidores activos (última ubicación en la última hora)
    from django.utils import timezone as tz
    from datetime import timedelta
    hace_una_hora = tz.now() - timedelta(hours=1)
    repartidores_ids = set()
    for ruta in rutas:
        for re_emp in ruta.empleados.all():
            repartidores_ids.add(re_emp.empleado.id)

    from core.models import Empleado
    repartidores_activos = []
    if repartidores_ids:
        for emp in Empleado.objects.filter(id__in=repartidores_ids, ultima_ubicacion__gte=hace_una_hora):
            repartidores_activos.append({
                'id': emp.id,
                'nombre': emp.nombre,
                'lat': float(emp.lat_actual) if emp.lat_actual else None,
                'lon': float(emp.lon_actual) if emp.lon_actual else None,
                'ultima_ubicacion': emp.ultima_ubicacion.isoformat() if emp.ultima_ubicacion else None,
            })

    return Response({'entregas': data, 'repartidores': repartidores_activos})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_actualizar_ubicacion(request):
    try:
        empleado = request.user.empleado
    except Exception:
        return Response({'error': 'Sin perfil de empleado.'}, status=403)

    lat = request.data.get('lat')
    lon = request.data.get('lon')
    if lat is None or lon is None:
        return Response({'error': 'lat y lon requeridos.'}, status=400)

    empleado.lat_actual = lat
    empleado.lon_actual = lon
    empleado.ultima_ubicacion = timezone.now()
    empleado.save(update_fields=['lat_actual', 'lon_actual', 'ultima_ubicacion'])
    return Response({'ok': True})


# ── CRM Animación ──────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_eventos_animacion(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    año = request.query_params.get('año')
    mes = request.query_params.get('mes')
    filtros = {'rentaproductos__producto__tipo': 'AN', 'status': 'ACTIVO'}
    if año:
        filtros['fecha_renta__year'] = int(año)
    if mes:
        filtros['fecha_renta__month'] = int(mes)

    rentas = (Renta.objects
              .filter(**filtros)
              .select_related('cliente', 'asignacion_coordinador__coordinador')
              .prefetch_related('asignacion_coordinador__lista_material',
                                'asignacion_coordinador__animadores',
                                'rentaproductos__producto')
              .distinct()
              .order_by('fecha_renta'))

    data = []
    for renta in rentas:
        asignacion = getattr(renta, 'asignacion_coordinador', None)
        lista = getattr(asignacion, 'lista_material', None) if asignacion else None
        animadores_count = asignacion.animadores.filter(estado='ACEPTADO').count() if asignacion else 0

        servicios = list(
            renta.rentaproductos
            .select_related('producto')
            .values_list('producto__nombre', flat=True)
            .distinct()
        )

        data.append({
            'id': renta.id,
            'folio': renta.folio,
            'fecha_renta': renta.fecha_renta.isoformat(),
            'cliente_nombre': renta.cliente.nombre,
            'servicios': servicios,
            'asignacion_id': asignacion.id if asignacion else None,
            'coordinador': {
                'id': asignacion.coordinador.id,
                'nombre': f"{asignacion.coordinador.first_name} {asignacion.coordinador.last_name}".strip(),
            } if asignacion and asignacion.coordinador else None,
            'lista_estado': lista.estado if lista else None,
            'animadores_count': animadores_count,
        })

    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_coordinadores_crm(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    from django.contrib.auth.models import User as DjangoUser
    coordinadores = DjangoUser.objects.filter(
        Q(empleado__tipo_empleado='COORDINADOR') | Q(groups__name='Coordinador')
    ).distinct()

    data = [{'id': u.id, 'nombre': f"{u.first_name} {u.last_name}".strip() or u.username} for u in coordinadores]
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_asignar_coordinador_crm(request):
    if not request.user.is_staff:
        return Response({'error': 'No autorizado.'}, status=403)

    renta_id = request.data.get('renta_id')
    coordinador_id = request.data.get('coordinador_id')
    apoyo_ids = request.data.get('apoyo_ids') or []

    if not renta_id:
        return Response({'error': 'renta_id requerido.'}, status=400)

    renta = get_object_or_404(Renta, id=renta_id)
    asignacion, _ = AsignacionCoordinador.objects.get_or_create(renta=renta)

    if coordinador_id:
        from django.contrib.auth.models import User as DjangoUser
        coordinador = get_object_or_404(DjangoUser, id=coordinador_id)
        asignacion.coordinador = coordinador
        asignacion.save(update_fields=['coordinador'])
    else:
        asignacion.coordinador = None
        asignacion.save(update_fields=['coordinador'])

    if isinstance(apoyo_ids, list):
        keep = []
        for apoyo_id in apoyo_ids:
            if not apoyo_id or (coordinador_id and int(apoyo_id) == int(coordinador_id)):
                continue
            from django.contrib.auth.models import User as DjangoUser
            apoyo = DjangoUser.objects.filter(id=apoyo_id).first()
            if not apoyo:
                continue
            CoordinadorApoyo.objects.get_or_create(asignacion=asignacion, usuario=apoyo)
            keep.append(apoyo.id)
        CoordinadorApoyo.objects.filter(asignacion=asignacion).exclude(usuario_id__in=keep).delete()

    return Response({
        'ok': True,
        'asignacion_id': asignacion.id,
        'coordinador_id': asignacion.coordinador_id,
        'apoyo_ids': list(asignacion.apoyos.values_list('usuario_id', flat=True)),
    })


# ── Calificaciones Encargado ↔ Coordinador ────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_estado_calificaciones_lista(request, lista_id):
    from core.models import ListaMaterialEvento
    lista = get_object_or_404(ListaMaterialEvento, id=lista_id)
    ya_encargado = hasattr(lista, 'calificacion_al_encargado')
    ya_coordinador = hasattr(lista, 'calificacion_al_coordinador')
    return Response({
        'ya_califico_coordinador': ya_encargado,
        'promedio_al_encargado': str(lista.calificacion_al_encargado.promedio) if ya_encargado else None,
        'ya_califico_encargado': ya_coordinador,
        'promedio_al_coordinador': str(lista.calificacion_al_coordinador.promedio) if ya_coordinador else None,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_calificar_encargado(request, lista_id):
    from core.models import CalificacionEncargado, ListaMaterialEvento
    lista = get_object_or_404(ListaMaterialEvento, id=lista_id)

    if lista.asignacion.coordinador != request.user:
        return Response({'error': 'No autorizado'}, status=403)
    if hasattr(lista, 'calificacion_al_encargado'):
        return Response({'error': 'Ya calificaste al encargado de este evento'}, status=400)

    campos = ['puntualidad', 'orden', 'comunicacion', 'disposicion']
    vals = {}
    for campo in campos:
        val = request.data.get(campo)
        if val is None:
            return Response({'error': f'Falta el campo {campo}'}, status=400)
        try:
            v = float(val)
        except (TypeError, ValueError):
            return Response({'error': f'Campo {campo} inválido'}, status=400)
        if not (1 <= v <= 5):
            return Response({'error': f'{campo} debe estar entre 1 y 5'}, status=400)
        vals[campo] = val

    cal = CalificacionEncargado.objects.create(
        lista=lista,
        calificador=request.user,
        comentario=request.data.get('comentario', ''),
        **vals,
    )
    return Response({'ok': True, 'promedio': str(cal.promedio)})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def api_calificar_coordinador_encargado(request, lista_id):
    from core.models import CalificacionCoordinadorPorEncargado, ListaMaterialEvento
    lista = get_object_or_404(ListaMaterialEvento, id=lista_id)

    if lista.surtida_por != request.user and not request.user.is_staff:
        return Response({'error': 'No autorizado'}, status=403)
    if hasattr(lista, 'calificacion_al_coordinador'):
        return Response({'error': 'Ya calificaste al coordinador de este evento'}, status=400)

    campos = ['puntualidad', 'orden', 'comunicacion', 'disposicion']
    vals = {}
    for campo in campos:
        val = request.data.get(campo)
        if val is None:
            return Response({'error': f'Falta el campo {campo}'}, status=400)
        try:
            v = float(val)
        except (TypeError, ValueError):
            return Response({'error': f'Campo {campo} inválido'}, status=400)
        if not (1 <= v <= 5):
            return Response({'error': f'{campo} debe estar entre 1 y 5'}, status=400)
        vals[campo] = val

    cal = CalificacionCoordinadorPorEncargado.objects.create(
        lista=lista,
        calificador=request.user,
        comentario=request.data.get('comentario', ''),
        **vals,
    )
    return Response({'ok': True, 'promedio': str(cal.promedio)})

    return Response({'ok': True})
