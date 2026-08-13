import uuid
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from django.db.models import Sum, Max, F
from datetime import timedelta
from django.core.exceptions import ValidationError
from decimal import Decimal, ROUND_HALF_UP

# =============================================
# CLIENTES
# =============================================

class Cliente(models.Model):
    nombre = models.CharField(max_length=100)
    telefono = models.CharField(max_length=20, blank=True)
    calle_y_numero = models.CharField(max_length=100, blank=True)
    colonia = models.CharField(max_length=100, blank=True)
    ciudad_o_municipio = models.CharField(max_length=100, blank=True)
    # Datos fiscales (reutilizables al facturar)
    rfc = models.CharField(max_length=13, blank=True, default='')
    razon_social = models.CharField(max_length=255, blank=True, default='')
    regimen_fiscal = models.CharField(max_length=3, blank=True, default='')
    codigo_postal_fiscal = models.CharField(max_length=5, blank=True, default='')
    email_facturacion = models.EmailField(blank=True, null=True)
    uso_cfdi_default = models.CharField(max_length=5, blank=True, default='G03')

    def __str__(self):
        return self.nombre

# =============================================
# PRODUCTOS E INVENTARIO
# =============================================

class Producto(models.Model):

    TIPO_PRODUCTO = [
        ('BR', 'Brincol?n'),
        ('ME', 'Mesa'),
        ('SI', 'Silla'),
        ('AN', 'Animaci?n'),
        ('FL', 'Flete'),
        ('LZ', 'Loza'),
        ('MT', 'Manteleria'),
        ('OT', 'Otro'),
    ]

    CATEGORIA_WEB = [
        ('', 'Sin categoría'),
        ('chicos', 'Chicos'),
        ('medianos', 'Medianos'),
        ('acuaticos', 'Acuáticos'),
        ('extremos', 'Extremos'),
        ('mecanicos', 'Mecánicos'),
    ]

    nombre = models.CharField(max_length=100)
    tipo = models.CharField(max_length=2, choices=TIPO_PRODUCTO)
    precio = models.DecimalField(max_digits=10, decimal_places=2)


    stock_total = models.PositiveIntegerField(default=0)
    stock_disponible = models.PositiveIntegerField(default=0)
    stock = models.IntegerField(default=0)

    # Control administrativo
    activo = models.BooleanField(default=True)
    # Si False, no reserva inventario (ej. "Proyecto recreativo")
    afecta_stock = models.BooleanField(default=True)
    # Campos ya aplicados en prod vía 0033/0034 (deben vivir en el modelo).
    foto = models.ImageField(upload_to='productos/', blank=True, null=True)
    categoria_web = models.CharField(
        max_length=20, choices=CATEGORIA_WEB, blank=True, default='',
        help_text='Categoría del catálogo público (brincolines).',
    )
    # SKU del catálogo Meta/WhatsApp (product_retailer_id). Vacío = no mapeado.
    meta_retailer_id = models.CharField(
        max_length=64,
        blank=True,
        default='',
        db_index=True,
        help_text='product_retailer_id del catálogo Meta/WhatsApp. Debe coincidir exactamente.',
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['meta_retailer_id'],
                condition=~models.Q(meta_retailer_id=''),
                name='producto_meta_retailer_id_unique_nonempty',
            ),
        ]

    # ===== INVENTARIO =====
    def hay_stock(self, cantidad, fecha, hora_inicio, hora_fin):
        if not self.afecta_stock:
            return True
        return self.stock_disponible_en_horario(fecha, hora_inicio, hora_fin) >= cantidad

    def reservar_stock(self, cantidad):
        if not self.afecta_stock:
            return
        Producto.objects.filter(pk=self.pk).update(
            stock_disponible=F('stock_disponible') - cantidad
        )

    def liberar_stock(self, cantidad):
        if not self.afecta_stock:
            return
        Producto.objects.filter(pk=self.pk).update(
            stock_disponible=F('stock_disponible') + cantidad
        )

    @property
    def disponible(self):
        if not self.afecta_stock:
            return self.activo
        return self.activo and self.stock_disponible > 0

    def stock_disponible_en_horario(self, fecha, hora_inicio, hora_fin):
        if not self.afecta_stock:
            return 999999
        rentados = RentaProducto.objects.filter(
            producto=self,
            renta__fecha_renta=fecha,
            renta__hora_inicio__lt=hora_fin,
            renta__hora_fin__gt=hora_inicio,
            renta__status='ACTIVO'
        ).aggregate(total=models.Sum('cantidad'))['total'] or 0

        disponible = self.stock_total - rentados
        return max(disponible, 0)


    def ocupacion_por_dia(self, fecha):
        if not self.activo:
            return "INACTIVO"
        if not self.afecta_stock:
            return "LIBRE"

        usados = RentaProducto.objects.filter(
            producto=self,
            renta__fecha_renta=fecha,
            renta__status="ACTIVO"
        ).aggregate(total=Sum("cantidad"))["total"] or 0

        if usados == 0:
            return "LIBRE"

        if usados < self.stock_total:
            return "PARCIAL"

        return "LLENO"

    def save(self, *args, **kwargs):
        if self.stock_disponible > self.stock_total:
            self.stock_disponible = self.stock_total
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nombre}"

class OcupacionDia(models.Model):
    ESTADOS = [
        ('LIBRE', 'Libre'),
        ('PARCIAL', 'Parcial'),
        ('LLENO', 'Lleno'),
    ]

    producto = models.ForeignKey(Producto, on_delete=models.CASCADE)
    fecha = models.DateField()
    estado = models.CharField(max_length=10, choices=ESTADOS)

    class Meta:
        unique_together = ('producto', 'fecha')
        indexes = [
            models.Index(fields=['fecha']),
            models.Index(fields=['producto', 'fecha']),
        ]


# =============================================
# RENTAS
# =============================================

class Renta(models.Model):
    STATUS = [
        ('ACTIVO', 'Activo'),
        ('CANCELADO', 'Cancelado'),
    ]

    folio = models.CharField(max_length=20, unique=True, blank=True)
    cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE)
    productos = models.ManyToManyField(Producto, through='RentaProducto')
    fecha_renta = models.DateField()
    hora_inicio = models.TimeField()
    hora_fin = models.TimeField()
    calle_y_numero = models.CharField(max_length=100, blank=True)
    colonia = models.CharField(max_length=100, blank=True)
    ciudad_o_municipio = models.CharField(max_length=100, blank=True)
    precio_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    anticipo = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pagado = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=STATUS, default='ACTIVO')
    created_at = models.DateTimeField(auto_now_add=True)
    cargador = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='rentas_asignadas')
    recolectado = models.BooleanField(default=False)
    Fecha_Recoleccion = models.DateField(null=True, blank=True)
    recolectado_por = models.ForeignKey(
        'Empleado',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="recolecciones"
    )
    comentarios = models.TextField(blank=True, null=True)

    ESTADO_ENTREGA = [
        ('PENDIENTE', 'Pendiente'),
        ('ASIGNADO', 'Asignado'),
        ('EN_RUTA', 'En ruta'),
        ('ENTREGADO', 'Entregado'),
        ('RECOGIDO', 'Recogido'),
        ('CANCELADO', 'Cancelado'),
    ]

    estado_entrega = models.CharField(max_length=20, choices=ESTADO_ENTREGA, default='PENDIENTE')

    class Meta:
        indexes = [
            models.Index(fields=['fecha_renta', 'status']),
            models.Index(fields=['status', 'pagado']),
            models.Index(fields=['estado_entrega']),
            models.Index(fields=['cliente']),
        ]
    evento_google_id = models.CharField(max_length=200, blank=True, null=True)
    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lon = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    VALIDACION_LOGISTICA = [
        ('NO_REQUIERE', 'No requiere'),
        ('PENDIENTE', 'Pendiente de asesor'),
        ('APROBADA', 'Aprobada'),
        ('RECHAZADA', 'Rechazada'),
    ]
    validacion_logistica = models.CharField(
        max_length=12,
        choices=VALIDACION_LOGISTICA,
        default='NO_REQUIERE',
        db_index=True,
    )
    temporada_alta = models.ForeignKey(
        'TemporadaAlta',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='rentas',
    )
    
    def save(self, *args, **kwargs):
        if not self.folio:
            ts = int(timezone.now().timestamp())
            suffix = uuid.uuid4().hex[:4].upper()
            self.folio = f"R{ts}{suffix}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.folio} - {self.cliente.nombre}"

    @property
    def tiene_animacion(self):
        return self.rentaproductos.filter(producto__tipo='AN').exists()

# ===== M?DULO DE RUTAS =====

class Ruta(models.Model):
    TIPO = [
        ('entrega', 'Entrega'),
        ('recogida', 'Recogida'),
    ]
    ESTADO = [
        ('pendiente', 'Pendiente'),
        ('en_camino', 'En camino'),
        ('completada', 'Completada'),
    ]
    nombre = models.CharField(max_length=150)
    tipo = models.CharField(max_length=10, choices=TIPO, default='entrega')
    fecha = models.DateField()
    estado = models.CharField(max_length=15, choices=ESTADO, default='pendiente')
    notas = models.TextField(blank=True)
    creada_en = models.DateTimeField(auto_now_add=True)
    actualizada_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Ruta'
        verbose_name_plural = 'Rutas'
        ordering = ['-fecha', 'nombre']
        indexes = [
            models.Index(fields=['fecha', 'estado']),
            models.Index(fields=['tipo', 'estado']),
        ]

    def __str__(self):
        return f"{self.get_tipo_display()} ? {self.nombre} ({self.fecha})"


class RutaEmpleado(models.Model):
    ruta = models.ForeignKey(Ruta, on_delete=models.CASCADE, related_name='empleados')
    empleado = models.ForeignKey('Empleado', on_delete=models.PROTECT, related_name='rutas')
    es_lider = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Empleado en ruta'
        verbose_name_plural = 'Empleados en ruta'
        unique_together = ('ruta', 'empleado')

    def __str__(self):
        return f"{self.empleado} ? {self.ruta}"


class RutaRenta(models.Model):
    ESTADO = [
        ('pendiente', 'Pendiente'),
        ('entregado', 'Entregado'),
        ('recogido', 'Recogido'),
    ]
    ruta = models.ForeignKey(Ruta, on_delete=models.CASCADE, related_name='paradas')
    renta = models.ForeignKey('Renta', on_delete=models.PROTECT, related_name='rutas')
    orden = models.PositiveSmallIntegerField(default=1)
    estado = models.CharField(max_length=15, choices=ESTADO, default='pendiente')
    hora_confirmacion = models.DateTimeField(null=True, blank=True)
    latitud = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitud = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    notas_campo = models.TextField(blank=True)

    class Meta:
        verbose_name = 'Parada de ruta'
        verbose_name_plural = 'Paradas de ruta'
        ordering = ['orden']
        indexes = [
            models.Index(fields=['estado']),
        ]

    def __str__(self):
        return f"Parada {self.orden} ? Renta #{self.renta_id} ({self.get_estado_display()})"


class EntregaDetalle(models.Model):
    ruta_renta = models.ForeignKey(RutaRenta, on_delete=models.CASCADE, related_name='detalles')
    producto_renta = models.ForeignKey('RentaProducto', on_delete=models.PROTECT, related_name='entregas')
    cantidad_confirmada = models.PositiveSmallIntegerField(default=0)
    motores_dejados = models.PositiveSmallIntegerField(default=0)
    extensiones_dejadas = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Detalle de entrega'
        verbose_name_plural = 'Detalles de entrega'
        unique_together = ('ruta_renta', 'producto_renta')

    def __str__(self):
        return f"{self.producto_renta} ? confirmado: {self.cantidad_confirmada}"


class RecogidaProgramada(models.Model):
    TIPO_HORARIO = [
        ('fijo', 'Hora fija'),
        ('rango', 'Rango de horas'),
    ]
    ruta_renta_entrega = models.OneToOneField(
        RutaRenta,
        on_delete=models.CASCADE,
        related_name='recogida_programada',
    )
    fecha_recogida = models.DateField()
    tipo_horario = models.CharField(max_length=5, choices=TIPO_HORARIO, default='rango')
    hora_inicio = models.TimeField()
    hora_fin = models.TimeField(null=True, blank=True)
    notas = models.TextField(blank=True)
    creada_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Recogida programada'
        verbose_name_plural = 'Recogidas programadas'
        indexes = [
            models.Index(fields=['fecha_recogida']),
        ]

    def __str__(self):
        return f"Recogida Renta #{self.ruta_renta_entrega.renta_id} ? {self.fecha_recogida}"



class RentaProducto(models.Model):
    renta = models.ForeignKey(
        Renta,
        on_delete=models.CASCADE,
        related_name="rentaproductos"
    )
    producto = models.ForeignKey(
        Producto,
        on_delete=models.CASCADE,
        related_name="rentaproductos"
    )
    cantidad = models.PositiveIntegerField(default=1)

    precio_lista = models.DecimalField(max_digits=10, decimal_places=2)
    precio_unitario = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, editable=False)
    nota = models.CharField(max_length=255, blank=True)

    def save(self, *args, **kwargs):
        if not self.precio_lista:
            self.precio_lista = self.producto.precio

        if self.precio_unitario is None:
            self.precio_unitario = self.precio_lista

        self.subtotal = self.cantidad * self.precio_unitario
        super().save(*args, **kwargs)

    @staticmethod
    def obtener_fecha_ultima_renta(producto):
        hoy = timezone.localdate()

        ultima_renta = (
            RentaProducto.objects.filter(
                producto=producto,
                renta__fecha_renta__lte=hoy,
                renta__status='ACTIVO'
            )
            .order_by('-renta__fecha_renta')
            .first()
        )

        if ultima_renta:
            return ultima_renta.renta.fecha_renta
        return None

    def __str__(self):
        return f"{self.producto.nombre} x{self.cantidad} - {self.renta.folio}"

# ===== NOTIFICACIONES PUSH =====

class PushSuscripcion(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='push_suscripciones')
    endpoint = models.TextField(unique=True)
    p256dh = models.TextField()
    auth = models.TextField()
    creada_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Suscripci?n Push'
        verbose_name_plural = 'Suscripciones Push'

    def __str__(self):
        return f"Push {self.user.username} ? {self.endpoint[:50]}"

# =============================================
# CONTABILIDAD
# =============================================

class Cuenta(models.Model):
    nombre = models.CharField(max_length=50)
    banco = models.CharField(max_length=50, blank=True, null=True)
    numero = models.CharField(max_length=50, blank=True)
    activa = models.BooleanField(default=True)
    tipo = models.CharField(max_length=10, choices=
                            [('Banco', 'Cuenta bancaria'),
                             ('Efectivo', 'Efectivo / Caja'),
                             ],
                            default='Banco'
                            )

    def __str__(self):
        return f"{self.banco or ''} - {self.nombre}"

    def saldo_actual(self):
        ingresos = self.movimientocontable_set.filter(
            tipo='INGRESO'
        ).aggregate(total=Sum('monto'))['total'] or 0

        egresos = self.movimientocontable_set.filter(
            tipo='EGRESO'
        ).aggregate(total=Sum('monto'))['total'] or 0

        return ingresos - egresos

class Pedido(models.Model):
    cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    pagado = models.BooleanField(default=False)
    metodo_pago = models.CharField(max_length=20, blank=True, null=True)
    cuenta_destino = models.ForeignKey(Cuenta, null=True, blank=True, on_delete=models.SET_NULL)

class PedidoFinanzas(models.Model):
    renta = models.OneToOneField(Renta, on_delete=models.CASCADE, related_name='finanza')
    total = models.DecimalField(max_digits=10, decimal_places=2)
    pagado = models.BooleanField(default=False)
    fecha_registro = models.DateTimeField(auto_now_add=True)

    METODOS_PAGO = (
        ('efectivo', 'Efectivo'),
        ('transferencia', 'Transferencia'),
    )

    metodo_pago = models.CharField(
        max_length=20,
        choices=METODOS_PAGO,
        null=True,
        blank=True
    )

    cuenta_destino = models.ForeignKey(
        Cuenta,
        null=True,
        blank=True,
        on_delete=models.SET_NULL
    )

    fecha_pago = models.DateTimeField(null=True, blank=True)

    def clean(self):
        if self.metodo_pago == 'transferencia' and not self.cuenta_destino:
            raise ValidationError("Debe seleccionar una cuenta para pagos por transferencia.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Renta {self.renta.id} - {'Pagado' if self.pagado else 'Pendiente'}"


# =============================================
# EMPLEADOS Y N?MINA
# =============================================
class Empleado(models.Model):
    TIPO_EMPLEADO = [
        ('REPARTIDOR', 'Repartidor'),
        ('COORDINADOR', 'Coordinador'),
        ('ENCARGADO', 'Encargado de Material'),
        ('ANIMADOR', 'Animador'),
    ]
    nombre = models.CharField(max_length=100)
    telefono = models.CharField(max_length=20, blank=True)
    correo = models.EmailField(blank=True, null=True)
    sueldo_diario = models.DecimalField(max_digits=8, decimal_places=2)
    comentarios = models.TextField(blank=True, null=True)
    activo = models.BooleanField(default=True)
    tipo_empleado = models.CharField(
        max_length=20,
        choices=TIPO_EMPLEADO,
        default='REPARTIDOR'
    )
    es_eventual = models.BooleanField(default=False, verbose_name='Empleado eventual')
    user = models.OneToOneField(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='empleado'
    )
    lat_actual = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lon_actual = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    ultima_ubicacion = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.nombre


class Nomina(models.Model):
    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    dias_trabajados = models.PositiveIntegerField(default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        indexes = [
            models.Index(fields=['empleado', 'fecha_inicio']),
            models.Index(fields=['fecha_fin']),
        ]

    def pago_eventos_extra(self):
        if not self.pk:
            return 0
        return self.pagos_extras.aggregate(
            total=Sum('monto')
        )['total'] or 0

    def calcular_total(self):
        sueldo_base = self.empleado.sueldo_diario * self.dias_trabajados
        return sueldo_base + self.pago_eventos_extra()

    def save(self, *args, **kwargs):
        # ?? SOLO calcular total si ya existe la instancia
        if self.pk:
            self.total = self.calcular_total()
        super().save(*args, **kwargs)


class Gasto(models.Model):

    TIPO = [
        ('GASTO', 'Gasto General'),
        ('COMPRA', 'Compra'),
        ('NOMINA', 'N?mina'),
    ]

    CATEGORIA = [
        ('INSUMOS', 'Insumos'),
        ('GASOLINA', 'Gasolina'),
        ('REFACCIONES', 'Refacciones'),
        ('CONSUMIBLES', 'Consumibles'),
        ('SEGURO', 'Seguro'),
        ('IMPUESTOS', 'Impuestos'),
        ('NOMINA', 'N?mina'),
        ('DEVOLUCION', 'Devoluci?n dep?sito'),
    ]

    tipo = models.CharField(
        max_length=10,
        choices=TIPO
    )

    categoria = models.CharField(
        max_length=20,
        choices=CATEGORIA,
        default='INSUMOS'
    )

    cuenta = models.ForeignKey(
        Cuenta,
        null=True,
        blank=True,
        on_delete=models.SET_NULL
    )

    descripcion = models.CharField(max_length=255)
    monto = models.DecimalField(max_digits=10, decimal_places=2)
    fecha = models.DateField()
    referencia = models.CharField(max_length=100, blank=True, null=True)
    comprobante = models.FileField(
        upload_to='gastos/comprobantes/',
        blank=True,
        null=True,
    )

    # ?? Relaci?n opcional con Nomina
    nomina = models.ForeignKey(
        'Nomina',                # ?? referencia por string para evitar errores
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='gastos'
    )

    def __str__(self):
        tipo = self.get_tipo_display()
        categoria = self.get_categoria_display()
        return f"{tipo} | {categoria} - ${self.monto}"


class PresupuestoCategoria(models.Model):
    """Presupuesto mensual editable desde Django Admin por categor?a de gasto."""

    categoria = models.CharField(
        max_length=20,
        choices=Gasto.CATEGORIA,
        unique=True,
    )
    monto_mensual = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text='L?mite de gasto permitido en el mes calendario.',
    )
    activo = models.BooleanField(
        default=True,
        help_text='Si est? inactivo, no se valida presupuesto para esta categor?a.',
    )
    notas = models.CharField(max_length=255, blank=True)

    class Meta:
        verbose_name = 'Presupuesto por categor?a'
        verbose_name_plural = 'Presupuestos por categor?a'
        ordering = ['categoria']

    def __str__(self):
        estado = 'activo' if self.activo else 'inactivo'
        return f"{self.get_categoria_display()} ? ${self.monto_mensual}/mes ({estado})"






class Compra(models.Model):
    proveedor = models.CharField(max_length=200)
    concepto = models.CharField(max_length=200)
    monto = models.DecimalField(max_digits=10, decimal_places=2)
    fecha = models.DateField()
    cuenta = models.ForeignKey(
        Cuenta,
        null=True,
        blank=True,
        on_delete=models.SET_NULL
    )

    def __str__(self):
        return f"{self.proveedor} - ${self.monto}"



def calcular_total(renta):
    """
    Calcula el total de la renta usando el precio ajustado de cada producto en esa renta.
    """
    return sum(rp.cantidad * rp.precio_unitario for rp in renta.rentaproductos.all())







class HorasExtra(models.Model):
    empleado = models.ForeignKey('Empleado', on_delete=models.CASCADE)
    semana_inicio = models.DateField()
    semana_fin = models.DateField(editable=False)
    horas_trabajadas = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    horas_descontadas = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    horas_computables = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    horas_extra = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    pago_hora = models.DecimalField(max_digits=8, decimal_places=2, default=55)
    total_pago = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pagado = models.BooleanField(default=False)
    fecha_pago = models.DateField(null=True, blank=True)

    def calcular_horas_semana(self):
        """Suma horas trabajadas de Asistencia en el rango de la semana."""
        from django.db.models import Sum
        resultado = Asistencia.objects.filter(
            empleado=self.empleado,
            fecha__range=(self.semana_inicio, self.semana_fin)
        ).aggregate(total=Sum('horas_trabajadas'))
        return Decimal(str(resultado['total'] or 0))

    def calcular_descuentos_semana(self):
        """Suma horas a descontar por eventos especiales en la semana."""
        from django.db.models import Sum
        resultado = PagoExtraNomina.objects.filter(
            nomina__empleado=self.empleado,
            nomina__fecha_inicio__range=(self.semana_inicio, self.semana_fin),
            tipo__descuenta_horas=True
        ).aggregate(total=Sum('tipo__horas_a_descontar'))
        return Decimal(str(resultado['total'] or 0))

    def calcular(self):
        PAGO_HORA = Decimal('55.0')

        # Sumar horas reales de asistencia
        self.horas_trabajadas = self.calcular_horas_semana()

        # Calcular descuentos por eventos especiales
        self.horas_descontadas = self.calcular_descuentos_semana()

        # Horas computables = reales - descuentos
        self.horas_computables = max(
            Decimal('0.0'),
            self.horas_trabajadas - self.horas_descontadas
        )

        # Jornada seg?n tipo de empleado
        if self.empleado.es_eventual:
            dias_trabajados = Asistencia.objects.filter(
                empleado=self.empleado,
                fecha__range=(self.semana_inicio, self.semana_fin),
                hora_entrada__isnull=False
            ).count()
            jornada = Decimal(str(dias_trabajados * 8))
        else:
            jornada = Decimal('43.0')

        # Horas extra = lo que supera la jornada
        extra = self.horas_computables - jornada
        self.horas_extra = extra if extra > 0 else Decimal('0.0')

        # Total a pagar
        self.total_pago = (self.horas_extra * PAGO_HORA).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )

    def save(self, *args, **kwargs):
        if not self.semana_fin:
            self.semana_fin = self.semana_inicio + timedelta(days=6)
        self.calcular()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.empleado} | {self.semana_inicio} - {self.semana_fin}"


class TipoPagoExtra(models.Model):
    nombre = models.CharField(max_length=100)
    monto_default = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )
    descuenta_horas = models.BooleanField(default=False, verbose_name='Descuenta horas del empleado')
    horas_a_descontar = models.DecimalField(max_digits=4, decimal_places=1, default=4.0, verbose_name='Horas a descontar')

    def __str__(self):
        return self.nombre



class PagoExtraNomina(models.Model):
    nomina = models.ForeignKey(Nomina, on_delete=models.CASCADE, related_name='pagos_extras')
    tipo = models.ForeignKey(TipoPagoExtra, on_delete=models.CASCADE)
    monto = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.tipo} - ${self.monto}"

class MovimientoContable(models.Model):
    TIPO_MOVIMIENTO = (
        ('INGRESO', 'Ingreso'),
        ('EGRESO', 'Egreso'),
    )

    pedido = models.ForeignKey(
        PedidoFinanzas,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='movimientos'
    )

    gasto = models.ForeignKey(
        'Gasto',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='movimientos',
    )

    tipo = models.CharField(max_length=10, choices=TIPO_MOVIMIENTO)
    monto = models.DecimalField(max_digits=10, decimal_places=2)

    metodo_pago = models.CharField(
        max_length=20,
        choices=PedidoFinanzas.METODOS_PAGO
    )

    cuenta = models.ForeignKey(
        Cuenta,
        null=True,
        blank=True,
        on_delete=models.SET_NULL
    )

    fecha = models.DateTimeField()
    descripcion = models.CharField(max_length=255, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['fecha', 'tipo']),
            models.Index(fields=['cuenta', 'tipo']),
        ]

    def __str__(self):
        return f"{self.tipo} - {self.monto} ({self.metodo_pago})"

class BitacoraMantenimiento(models.Model):
    producto = models.ForeignKey(
        Producto,
        on_delete=models.CASCADE
    )

    fecha_ultima_renta = models.DateField(
        null=True,
        blank=True
    )

    fecha_ultimo_mantenimiento = models.DateField(
        null=True,
        blank=True
    )

    notas = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.producto.nombre} - Mantto"


# =============================================
# ANIMACI?N Y MATERIALES
# =============================================

class MaterialAnimacion(models.Model):
    TIPO = [
        ('REUTILIZABLE', 'Reutilizable'),
        ('CONSUMIBLE', 'Consumible'),
    ]
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True, null=True)
    tipo = models.CharField(max_length=20, choices=TIPO, default='REUTILIZABLE')
    stock_total = models.PositiveIntegerField(default=0)
    stock_disponible = models.PositiveIntegerField(default=0)
    foto = models.ImageField(upload_to='materiales/', blank=True, null=True)
    activo = models.BooleanField(default=True)

    def __str__(self):
        return self.nombre

    class Meta:
        verbose_name = "Material de Animaci?n"
        verbose_name_plural = "Materiales de Animaci?n"
        ordering = ('nombre',)

class FotoMaterial (models.Model):
    material = models.ForeignKey(
        MaterialAnimacion,
        on_delete=models.CASCADE,
        related_name='fotos'
    )
    foto = models.ImageField(upload_to='materiales/')
    orden = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ('orden',)

    def __str__(self):
        return f"Foto de {self.material.nombre}"


class AsignacionCoordinador(models.Model):
    renta = models.OneToOneField(
        Renta,
        on_delete=models.CASCADE,
        related_name='asignacion_coordinador'
    )
    coordinador = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='eventos_asignados'
    )
    notas = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.renta.folio} ? {self.coordinador}"
    class Meta:
        verbose_name = "Asignacion Coordinador"

class MaterialEvento(models.Model):
    asignacion = models.ForeignKey(
        AsignacionCoordinador,
        on_delete=models.CASCADE,
        related_name='materiales'
    )
    material = models.ForeignKey(
        MaterialAnimacion,
        on_delete=models.CASCADE,
        related_name='usos'
    )
    cantidad = models.PositiveIntegerField(default=1)
    nota = models.CharField(max_length=255, blank=True)

    # Checklist despacho
    despachado = models.BooleanField(default=False)

    # Checklist recepci?n
    recibido = models.BooleanField(default=False)
    observacion = models.CharField(max_length=255, blank=True, null=True)

    # Control de stock
    stock_restaurado = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.material.nombre} x{self.cantidad}"

    class Meta:
        verbose_name = "Material del Evento"
        unique_together = ('asignacion', 'material')

class ListaMaterialEvento(models.Model):
    ESTADO = [
        ('BORRADOR', 'Borrador'),
        ('ENVIADA', 'Enviada a encargado'),
        ('SURTIDA', 'Surtida por encargado'),
        ('EN_EVENTO', 'En evento'),
        ('REGRESADA', 'Regresada a bodega'),
        ('REVISADA', 'Revisada'),
        ('PENDIENTE', 'Pendiente revisi?n'),  # legacy
        ('PREPARADA', 'Preparada'),            # legacy
        ('RECIBIDA', 'Recibida'),              # legacy
    ]

    asignacion = models.OneToOneField(
        AsignacionCoordinador,
        on_delete=models.CASCADE,
        related_name='lista_material'
    )
    estado = models.CharField(max_length=20, choices=ESTADO, default='BORRADOR')

    # Revisi?n encargado
    revisada_por = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='listas_revisadas'
    )
    fecha_revision = models.DateTimeField(null=True, blank=True)

    # Surtido encargado
    surtida_por = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='listas_surtidas'
    )
    fecha_surtido = models.DateTimeField(null=True, blank=True)

    # Confirmaci?n coordinador en evento
    confirmada_por = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='listas_confirmadas'
    )
    fecha_confirmacion = models.DateTimeField(null=True, blank=True)
    llego_completa = models.BooleanField(null=True, blank=True)
    observaciones_llegada = models.TextField(blank=True, null=True)

    # Recepci?n bodega
    recibida_por = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='listas_recibidas'
    )
    fecha_recepcion = models.DateTimeField(null=True, blank=True)
    observaciones_recepcion = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Lista {self.asignacion.renta.folio} - {self.estado}"

class EvidenciaMaterial(models.Model):
    TIPO = [
        ('SALIDA', 'Salida a evento'),
        ('LLEGADA', 'Llegada a evento'),
        ('REGRESO', 'Regreso a bodega'),
        ('DANO', 'Da?o o faltante'),
    ]

    lista = models.ForeignKey(
        ListaMaterialEvento,
        on_delete=models.CASCADE,
        related_name='evidencias'
    )
    tipo = models.CharField(max_length=20, choices=TIPO)
    foto = models.ImageField(upload_to='evidencias_material/')
    descripcion = models.TextField(blank=True)
    subida_por = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True
    )
    fecha = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Evidencia {self.tipo} - {self.lista}"

# ==================================
# ASISTENCIA
# ==================================

class Asistencia(models.Model):
    TIPO_JORNADA = [
        ('COMPLETA', 'Jornada completa'),
        ('MEDIO_TIEMPO', 'Medio tiempo'),
        ('EVENTO', 'Por evento'),
    ]

    empleado = models.ForeignKey(
        Empleado,
        on_delete=models.CASCADE,
        related_name='asistencias'
    )

    fecha = models.DateField()
    hora_entrada = models.DateTimeField(null=True, blank=True)
    hora_salida = models.DateTimeField(null=True, blank=True)
    ubicacion_entrada = models.CharField(max_length=255, blank=True, null=True)
    ubicacion_salida = models.CharField(max_length=255, blank=True, null=True)
    tipo_jornada = models.CharField(
        max_length=20,
        choices=TIPO_JORNADA,
        default='COMPLETA'
    )
    notas = models.TextField(blank=True, null=True)
    horas_trabajadas = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True
    )

    class Meta:
        unique_together = ('empleado', 'fecha')
        ordering = ['-fecha']
        indexes = [
            models.Index(fields=['empleado', 'fecha']),
            models.Index(fields=['fecha']),
        ]

    def calcular_horas(self):
        if self.hora_entrada and self.hora_salida:
            diferencia = self.hora_salida - self.hora_entrada
            self.horas_trabajadas = Decimal(str(round(diferencia.total_seconds() / 3600, 2)))

    def save(self, *args, **kwargs):
        self.calcular_horas()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.empleado.nombre} - {self.fecha}"

class TurnoAsistencia(models.Model):
    asistencia = models.ForeignKey(
        Asistencia,
        on_delete=models.CASCADE,
        related_name='turnos'
    )
    numero_turno = models.PositiveSmallIntegerField(default=1)
    hora_entrada = models.DateTimeField(null=True, blank=True)
    hora_salida = models.DateTimeField(null=True, blank=True)
    ubicacion_entrada = models.CharField(max_length=255, blank=True, null=True)
    ubicacion_salida = models.CharField(max_length=255, blank=True, null=True)
    horas_trabajadas = models.DecimalField(
        max_digits=4, decimal_places=2, null=True, blank=True
    )

    class Meta:
        verbose_name = 'Turno de asistencia'
        verbose_name_plural = 'Turnos de asistencia'
        ordering = ['numero_turno']
        unique_together = ('asistencia', 'numero_turno')

    def __str__(self):
        return f"{self.asistencia.empleado.nombre} - Turno {self.numero_turno} - {self.asistencia.fecha}"

    def calcular_horas(self):
        if self.hora_entrada and self.hora_salida:
            delta = self.hora_salida - self.hora_entrada
            return round(delta.total_seconds() / 3600, 2)
        return None


# =============================================
# REGISTRO DE EMPLEADOS
# =============================================
class SolicitudRegistro(models.Model):
    ESTADO = [
        ('PENDIENTE', 'Pendiente'),
        ('APROBADA', 'Aprobada'),
        ('RECHAZADA', 'Rechazada'),
    ]

    nombre = models.CharField(max_length=100)
    telefono = models.CharField(max_length=20)
    email = models.EmailField(blank=True, null=True)
    password_hash = models.CharField(max_length=255)
    tipo_empleado = models.CharField(
        max_length=20,
        choices=Empleado.TIPO_EMPLEADO,
        default='REPARTIDOR'
    )
    estado = models.CharField(max_length=10, choices=ESTADO, default='PENDIENTE')
    fecha_solicitud = models.DateTimeField(auto_now_add=True)
    revisada_por = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='solicitudes_revisadas'
    )
    fecha_revision = models.DateTimeField(null=True, blank=True)
    notas_admin = models.TextField(blank=True, null=True)
    user_creado = models.OneToOneField(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='solicitud_origen'
    )

    def __str__(self):
        return f"{self.nombre} - {self.estado}"

    class Meta:
        ordering = ['-fecha_solicitud']
        verbose_name = "Solicitud de Registro"
        verbose_name_plural = "Solicitudes de Registro"

# ?? Animadores ?????????????????????????????????????????????????????????????????

class AnimadorEvento(models.Model):
    ESTADO = [
        ('PENDIENTE', 'Pendiente confirmaci?n'),
        ('ACEPTADO', 'Aceptado'),
        ('RECHAZADO', 'Rechazado'),
    ]
    LLEGADA = [
        ('BODEGA', 'Llego a bodega'),
        ('LOCAL', 'Llego al local'),
    ]

    asignacion = models.ForeignKey(
        AsignacionCoordinador,
        on_delete=models.CASCADE,
        related_name='animadores'
    )
    animador = models.ForeignKey(
        Empleado,
        on_delete=models.CASCADE,
        related_name='eventos_animador'
    )
    estado = models.CharField(max_length=20, choices=ESTADO, default='PENDIENTE')
    hora_cita = models.TimeField(null=True, blank=True)
    tipo_llegada = models.CharField(max_length=10, choices=LLEGADA, null=True, blank=True)
    notificado = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['asignacion', 'animador']

    def __str__(self):
        return f"{self.animador.nombre} ? {self.asignacion.renta.folio}"


class CalificacionCoordinador(models.Model):
    animador_evento = models.OneToOneField(
        AnimadorEvento,
        on_delete=models.CASCADE,
        related_name='calificacion'
    )
    comunicacion = models.DecimalField(max_digits=3, decimal_places=1)
    organizacion = models.DecimalField(max_digits=3, decimal_places=1)
    trato = models.DecimalField(max_digits=3, decimal_places=1)
    respeto = models.DecimalField(max_digits=3, decimal_places=1)
    puntualidad = models.DecimalField(max_digits=3, decimal_places=1)
    innovacion = models.DecimalField(max_digits=3, decimal_places=1)
    comentario = models.TextField(blank=True)
    fecha = models.DateTimeField(auto_now_add=True)

    @property
    def promedio(self):
        campos = [self.comunicacion, self.organizacion, self.trato,
                  self.respeto, self.puntualidad, self.innovacion]
        return round(sum(campos) / len(campos), 2)

    def __str__(self):
        return f"Calificaci?n de {self.animador_evento.animador.nombre} a {self.animador_evento.asignacion.coordinador.username}"

class CalificacionAnimador(models.Model):
    animador_evento = models.OneToOneField(
        AnimadorEvento,
        on_delete=models.CASCADE,
        related_name='calificacion_coordinador'
    )
    proactividad = models.DecimalField(max_digits=3, decimal_places=1)
    disposicion = models.DecimalField(max_digits=3, decimal_places=1)
    puntualidad = models.DecimalField(max_digits=3, decimal_places=1)
    compromiso = models.DecimalField(max_digits=3, decimal_places=1)
    respeto = models.DecimalField(max_digits=3, decimal_places=1)
    atencion_clientes = models.DecimalField(max_digits=3, decimal_places=1)
    comentario = models.TextField(blank=True)
    fecha = models.DateTimeField(auto_now_add=True)

    @property
    def promedio(self):
        campos = [
            self.proactividad, self.disposicion, self.puntualidad,
            self.compromiso, self.respeto, self.atencion_clientes
        ]
        return round(sum(campos) / len(campos), 2)

    def __str__(self):
        return f"Calificaci?n de {self.animador_evento.asignacion.coordinador.username} a {self.animador_evento.animador.nombre}"


class CalificacionEncargado(models.Model):
    """Coordinador califica al encargado de material despu?s del evento"""
    lista = models.OneToOneField(
        'ListaMaterialEvento',
        on_delete=models.CASCADE,
        related_name='calificacion_al_encargado',
    )
    calificador = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='calificaciones_dadas_a_encargados',
    )
    puntualidad  = models.DecimalField(max_digits=3, decimal_places=1)
    orden        = models.DecimalField(max_digits=3, decimal_places=1)
    comunicacion = models.DecimalField(max_digits=3, decimal_places=1)
    disposicion  = models.DecimalField(max_digits=3, decimal_places=1)
    comentario   = models.TextField(blank=True)
    fecha        = models.DateTimeField(auto_now_add=True)

    @property
    def promedio(self):
        campos = [self.puntualidad, self.orden, self.comunicacion, self.disposicion]
        return round(sum(campos) / len(campos), 2)

    def __str__(self):
        return f"Cal. encargado ? {self.lista_id}"


class CalificacionCoordinadorPorEncargado(models.Model):
    """Encargado de material califica al coordinador despu?s del evento"""
    lista = models.OneToOneField(
        'ListaMaterialEvento',
        on_delete=models.CASCADE,
        related_name='calificacion_al_coordinador',
    )
    calificador = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='calificaciones_dadas_a_coordinadores',
    )
    puntualidad  = models.DecimalField(max_digits=3, decimal_places=1)
    orden        = models.DecimalField(max_digits=3, decimal_places=1)
    comunicacion = models.DecimalField(max_digits=3, decimal_places=1)
    disposicion  = models.DecimalField(max_digits=3, decimal_places=1)
    comentario   = models.TextField(blank=True)
    fecha        = models.DateTimeField(auto_now_add=True)

    @property
    def promedio(self):
        campos = [self.puntualidad, self.orden, self.comunicacion, self.disposicion]
        return round(sum(campos) / len(campos), 2)

    def __str__(self):
        return f"Cal. coordinador ? {self.lista_id}"


class TemporadaAlta(models.Model):
    """Rangos donde el bot crea la renta pero requiere visto bueno de logistica."""
    nombre = models.CharField(max_length=100)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    activo = models.BooleanField(default=True)
    notas = models.TextField(blank=True)

    class Meta:
        ordering = ['-fecha_inicio']
        verbose_name = 'Temporada alta'
        verbose_name_plural = 'Temporadas altas'

    def __str__(self):
        return f"{self.nombre} ({self.fecha_inicio} -> {self.fecha_fin})"

    def contiene(self, fecha) -> bool:
        return self.activo and self.fecha_inicio <= fecha <= self.fecha_fin


class Factura(models.Model):
    """CFDI emitido (FiscalAPI) ligado a una renta."""

    ESTATUS = [
        ('BORRADOR', 'Borrador'),
        ('TIMBRADA', 'Timbrada'),
        ('CANCELADA', 'Cancelada'),
        ('ERROR', 'Error'),
    ]

    renta = models.ForeignKey(Renta, on_delete=models.CASCADE, related_name='facturas')
    cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE, related_name='facturas')
    estatus = models.CharField(max_length=12, choices=ESTATUS, default='BORRADOR', db_index=True)

    # Snapshot receptor
    rfc = models.CharField(max_length=13)
    razon_social = models.CharField(max_length=255)
    regimen_fiscal = models.CharField(max_length=3)
    codigo_postal = models.CharField(max_length=5)
    email = models.EmailField(blank=True, default='')
    uso_cfdi = models.CharField(max_length=5, default='G03')

    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    serie = models.CharField(max_length=25, blank=True, default='')
    folio = models.CharField(max_length=40, blank=True, default='')
    uuid = models.CharField(max_length=64, blank=True, default='', db_index=True)

    provider = models.CharField(max_length=32, default='fiscalapi')
    provider_id = models.CharField(max_length=64, blank=True, default='')
    pdf_url = models.URLField(blank=True, default='', max_length=500)
    xml_url = models.URLField(blank=True, default='', max_length=500)
    error_mensaje = models.TextField(blank=True, default='')

    timbrada_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    creada_por = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='facturas_creadas'
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['renta', 'estatus']),
        ]

    def __str__(self):
        return f"Factura {self.uuid or self.id} ({self.estatus}) ? {self.renta.folio}"


# =============================================
# COTIZACIONES
# =============================================

NOMBRE_PRODUCTO_PROYECTO = 'Proyecto recreativo'

# Productos de catálogo para cotización RALLY (no incluir "Rally Pista": es brincolín).
BASE_RALLY_POR_HORAS = {
    2: 'Base Rally 2 horas',
    3: 'Base Rally 3 horas',
    4: 'Base Rally 4 horas',
}

PAQUETES_RALLY = [
    {
        'titulo': 'Trotavesura acuática',
        'descripcion': (
            'Evento acuático con o sobre agua: fiesta de espuma, gladiadores acuáticos, '
            'volei splash, beis splash, meseros locos, cascos acuáticos, resbalón, '
            'patos al agua, jaulas y llaves, espónjate, guerra de globinos, pies al agua, '
            'entre otros. Incluye animador por estación y coordinador general.'
        ),
    },
    {
        'titulo': 'Feria de destreza',
        'descripcion': (
            'Día de destreza y habilidades tipo juegos y módulos de feria. Incluye premios '
            'solo para ganadores: canicas, tiro al blanco, futbol, tira latas, fuerza, '
            'lotería, canasta, pesca de botellas, botes, bolita, aros, ruleta, pesca de '
            'peces, boliche, traga bolas, entre otros.'
        ),
    },
    {
        'titulo': 'Rally de retos e integración',
        'descripcion': (
            'Retos y trabajo en equipo para integración de grupos. Puede incluir trofeo a '
            'los 3 mejores puntajes: Roller Ball, Rally de colores, Dale la vuelta, '
            'A que no se atreven, Reloj, Cazadores, Pollos adentro, Payaso de Rodeo, '
            'Canaletas, Como Perros y Gatos, Manotazo, Papa caliente, Basta mecánica, '
            'catapultas, Código secreto, entre otros.'
        ),
    },
    {
        'titulo': 'Evento de sensaciones',
        'descripcion': (
            'Actividades con harina, tierra, lodo, espuma, gelatina, agua, plumas, etc.: '
            'guerra de harina, baraja empolvada, pastelazo, una aguja en un pajar, '
            'rally de 5 estaciones de sensaciones, chiquero, carrera descalzos por campo '
            'minado, desplumados, pista ciega, texturas, adivina qué tocas, entre otros.'
        ),
    },
    {
        'titulo': 'Olimpiadas recreativas',
        'descripcion': (
            'Actividades olímpicas modificadas por equipos/bases: carrera de costales, '
            'obstáculos, carrera de caballos, salto de jenga, tiro al blanco, lanzamiento '
            'de zapato, quemados, luz verde luz roja, futbol modificado, encestando, '
            'entre otros.'
        ),
    },
]

CONDICIONES_PAGO_RALLY = (
    'Se reserva la fecha con $1,000 pesos por transferencia o depósito. '
    'El pago del evento se realiza al llegar y antes de instalar, o vía transferencia. '
    'Los precios son por base/grupo y sin IVA; si requiere factura, notificar.'
)


class Cotizacion(models.Model):
    TIPO = [
        ('NORMAL', 'Normal'),
        ('PROYECTO', 'Proyecto'),
        ('RALLY', 'Rally'),
    ]
    STATUS = [
        ('BORRADOR', 'Borrador'),
        ('ENVIADA', 'Enviada'),
        ('ACEPTADA', 'Aceptada'),
        ('RECHAZADA', 'Rechazada'),
        ('CONVERTIDA', 'Convertida'),
    ]

    folio = models.CharField(max_length=20, unique=True, blank=True)
    tipo = models.CharField(max_length=10, choices=TIPO, default='NORMAL')
    status = models.CharField(max_length=12, choices=STATUS, default='BORRADOR', db_index=True)
    cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE, related_name='cotizaciones')
    destinatario = models.CharField(max_length=200, blank=True, default='')
    nombre_evento = models.CharField(max_length=200, blank=True, default='')
    asistentes = models.PositiveIntegerField(null=True, blank=True)
    sede = models.CharField(max_length=255, blank=True, default='')
    fecha_evento = models.DateField(null=True, blank=True)
    hora_inicio = models.TimeField(null=True, blank=True)
    hora_fin = models.TimeField(null=True, blank=True)
    intro = models.TextField(blank=True, default='')
    aplicar_iva = models.BooleanField(default=False)
    aplicar_isr = models.BooleanField(default=False)
    condiciones_pago = models.TextField(
        blank=True,
        default=(
            'Se requiere el 50% de anticipo para confirmar la reservación del evento. '
            'El 50% restante se liquida el día del evento.'
        ),
    )
    firmado_por = models.CharField(
        max_length=200,
        blank=True,
        default='Dra. Rossana Tamara Medina Valencia\nDirectora General',
    )
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    monto_iva = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    monto_isr = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notas = models.TextField(blank=True, default='')
    renta = models.OneToOneField(
        Renta,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='cotizacion_origen',
    )
    creada_por = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='cotizaciones_creadas'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Cotización'
        verbose_name_plural = 'Cotizaciones'
        indexes = [
            models.Index(fields=['tipo', 'status']),
            models.Index(fields=['fecha_evento']),
        ]

    def save(self, *args, **kwargs):
        if not self.folio:
            ts = int(timezone.now().timestamp())
            suffix = uuid.uuid4().hex[:4].upper()
            self.folio = f"C{ts}{suffix}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.folio} - {self.cliente.nombre} ({self.get_tipo_display()})"


class CotizacionZona(models.Model):
    cotizacion = models.ForeignKey(Cotizacion, on_delete=models.CASCADE, related_name='zonas')
    orden = models.PositiveIntegerField(default=0)
    titulo = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['orden', 'id']
        verbose_name = 'Zona de cotización'
        verbose_name_plural = 'Zonas de cotización'

    def __str__(self):
        return f"{self.orden}. {self.titulo}"


class CotizacionZonaImagen(models.Model):
    zona = models.ForeignKey(CotizacionZona, on_delete=models.CASCADE, related_name='imagenes')
    imagen = models.ImageField(upload_to='cotizaciones/zonas/')
    pie = models.CharField(max_length=200, blank=True, default='')
    orden = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['orden', 'id']
        verbose_name = 'Imagen de zona'
        verbose_name_plural = 'Imágenes de zona'

    def __str__(self):
        return f"Img zona {self.zona_id} ({self.orden})"


class CotizacionConcepto(models.Model):
    cotizacion = models.ForeignKey(Cotizacion, on_delete=models.CASCADE, related_name='conceptos')
    orden = models.PositiveIntegerField(default=0)
    nombre = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True, default='')
    cantidad = models.PositiveIntegerField(default=1)
    monto = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    producto = models.ForeignKey(
        Producto,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='conceptos_cotizacion',
    )

    class Meta:
        ordering = ['orden', 'id']
        verbose_name = 'Concepto de cotización'
        verbose_name_plural = 'Conceptos de cotización'

    def __str__(self):
        return f"{self.nombre} (${self.monto})"


# =============================================
# COORDINACIÓN MULTI-EQUIPO
# =============================================

class CoordinadorApoyo(models.Model):
    asignacion = models.ForeignKey(
        AsignacionCoordinador,
        on_delete=models.CASCADE,
        related_name='apoyos',
    )
    usuario = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='eventos_como_apoyo',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('asignacion', 'usuario')
        verbose_name = 'Coordinador de apoyo'
        verbose_name_plural = 'Coordinadores de apoyo'

    def __str__(self):
        return f"Apoyo {self.usuario} @ {self.asignacion_id}"


class SolicitudCambioMaterial(models.Model):
    TIPO = [
        ('AGREGAR', 'Agregar'),
        ('QUITAR', 'Quitar'),
        ('CAMBIAR_CANTIDAD', 'Cambiar cantidad'),
    ]
    ESTADO = [
        ('PENDIENTE', 'Pendiente'),
        ('APROBADA', 'Aprobada'),
        ('RECHAZADA', 'Rechazada'),
    ]

    lista = models.ForeignKey(
        ListaMaterialEvento,
        on_delete=models.CASCADE,
        related_name='solicitudes_cambio',
    )
    tipo = models.CharField(max_length=20, choices=TIPO)
    material = models.ForeignKey(
        MaterialAnimacion,
        on_delete=models.CASCADE,
        related_name='solicitudes_cambio',
    )
    cantidad = models.PositiveIntegerField(default=1)
    nota = models.CharField(max_length=255, blank=True, default='')
    solicitado_por = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='solicitudes_material_enviadas',
    )
    estado = models.CharField(max_length=12, choices=ESTADO, default='PENDIENTE', db_index=True)
    revisado_por = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='solicitudes_material_revisadas',
    )
    comentario_revision = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    revisado_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Solicitud de cambio de material'
        verbose_name_plural = 'Solicitudes de cambio de material'

    def __str__(self):
        return f"{self.get_tipo_display()} {self.material} ({self.estado})"
