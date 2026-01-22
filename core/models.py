from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from django.db.models import Sum
from datetime import timedelta
from django.core.exceptions import ValidationError
from decimal import Decimal, ROUND_HALF_UP



class Cliente(models.Model):
    nombre = models.CharField(max_length=100)
    telefono = models.CharField(max_length=20, blank=True)
    calle_y_numero = models.CharField(max_length=100, blank=True)
    colonia = models.CharField(max_length=100, blank=True)
    ciudad_o_municipio = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return self.nombre

class Producto(models.Model):

    TIPO_PRODUCTO = [
        ('BR', 'Brincolín'),
        ('ME', 'Mesa'),
        ('SI', 'Silla'),
        ('AN', 'Animación'),
        ('FL', 'Flete'),
        ('LZ', 'Loza'),
        ('MT', 'Manteleria'),
        ('OT', 'Otro'),
    ]

    nombre = models.CharField(max_length=100)
    tipo = models.CharField(max_length=2, choices=TIPO_PRODUCTO)
    precio = models.DecimalField(max_digits=10, decimal_places=2)


    stock_total = models.PositiveIntegerField(default=0)
    stock_disponible = models.PositiveIntegerField(default=0)
    stock = models.IntegerField(default=0)

    # 🟢 Control administrativo
    activo = models.BooleanField(default=True)

    # ===== INVENTARIO =====
    def hay_stock(self, cantidad, fecha, hora_inicio, hora_fin):
        return self.stock_disponible_en_horario(fecha, hora_inicio, hora_fin) >= cantidad

    def reservar_stock(self, cantidad):
        return

    def liberar_stock(self, cantidad):
        return

    @property
    def disponible(self):
        return self.activo and self.stock_disponible > 0

    def stock_disponible_en_horario(self, fecha, hora_inicio, hora_fin):
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
    ruta = models.ForeignKey(
        'Ruta',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rentas'
    )
    comentarios = models.TextField(blank=True, null=True)

    ESTADO_ENTREGA = [
        ('PENDIENTE', 'Pendiente'),
        ('ASIGNADO', 'Asignado'),
        ('EN_RUTA', 'En ruta'),
        ('ENTREGADO', 'Entregado'),
        ('CANCELADO', 'Cancelado'),
    ]

    estado_entrega = models.CharField(max_length=20, choices=ESTADO_ENTREGA, default='PENDIENTE')

    def save(self, *args, **kwargs):
        # Generar folio automático si no existe
        if not self.folio:
            timestamp = int(timezone.now().timestamp())
            self.folio = f"R{timestamp}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.folio} - {self.cliente.nombre}"

class Ruta(models.Model):
    fecha = models.DateField()
    cargador = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="rutas"
    )
    estado = models.CharField(
        max_length=20,
        choices=[
            ('Creada','Creada'),
            ('EN_RUTA', 'En ruta'),
            ('FINALIZADA', 'Finalizada'),
        ],
        default='Creada'
    )
    created_at =models.DateTimeField(auto_now_add=True)
    def __str__(self):
        return f"Ruta {self.fecha} - {self.cargador}"

from django.db.models import Max

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


class Cuenta(models.Model):
    nombre = models.CharField(max_length=50)
    banco = models.CharField(max_length=50, blank=True, null=True)
    numero = models.CharField(max_length=50, blank=True)
    activa = models.BooleanField(default=True)

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

class Empleado(models.Model):
    nombre = models.CharField(max_length=100)
    telefono = models.CharField(max_length=20, blank=True)
    correo = models.EmailField(blank=True, null=True)
    sueldo_diario = models.DecimalField(max_digits=8, decimal_places=2)
    comentarios = models.TextField(blank=True, null=True)
    activo = models.BooleanField(default=True)
    TIPO_EMPLEADO = [
        ('REPARTIDOR', 'Repartidor'),
        ('SOCIO', 'Socio'),
        ('ENCARGADO', 'Encargado de Material'),
    ]

    nombre = models.CharField(max_length=100)
    # ... tus campos actuales

    tipo_empleado = models.CharField(
        max_length=20,
        choices=TIPO_EMPLEADO,
        default='REPARTIDOR'
    )

    def __str__(self):
        return self.nombre

class Nomina(models.Model):
    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    dias_trabajados = models.PositiveIntegerField(default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)

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
        # ⚠️ SOLO calcular total si ya existe la instancia
        if self.pk:
            self.total = self.calcular_total()
        super().save(*args, **kwargs)


class Gasto(models.Model):

    TIPO = [
        ('GASTO', 'Gasto General'),
        ('COMPRA', 'Compra'),
        ('NOMINA', 'Nómina'),
    ]

    CATEGORIA = [
        ('INSUMOS', 'Insumos'),
        ('GASOLINA', 'Gasolina'),
        ('REFACCIONES', 'Refacciones'),
        ('CONSUMIBLES', 'Consumibles'),
        ('SEGURO', 'Seguro'),
        ('IMPUESTOS', 'Impuestos'),
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

    # 🔹 Relación opcional con Nomina
    nomina = models.ForeignKey(
        'Nomina',                # 👈 referencia por string para evitar errores
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='gastos'
    )

    def __str__(self):
        tipo = self.get_tipo_display()
        categoria = self.get_categoria_display()
        return f"{tipo} | {categoria} - ${self.monto}"






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
    semana_fin = models.DateField(editable=False)  # calculado automáticamente

    horas_trabajadas = models.DecimalField(max_digits=5, decimal_places=2)
    horas_extra = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    pago_hora = models.DecimalField(max_digits=8, decimal_places=2, default=55)
    total_pago = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    pagado = models.BooleanField(default=False)

    def calcular(self):
        JORNADA = Decimal('43.0')  # jornada mínima semanal
        PAGO_HORA = Decimal('55.0')  # pago fijo por hora extra

        # Calcular horas extra (solo si superan las 43)
        extra = Decimal(self.horas_trabajadas) - JORNADA
        self.horas_extra = extra if extra > 0 else Decimal('0.0')

        # Total a pagar = horas_extra * 55
        self.total_pago = (self.horas_extra * PAGO_HORA).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    def save(self, *args, **kwargs):
        # Calcular semana_fin automáticamente
        if not self.semana_fin:
            self.semana_fin = self.semana_inicio + timedelta(days=6)

        # Calcular horas_extra y total_pago
        self.calcular()
        super().save(*args, **kwargs)

class TipoPagoExtra(models.Model):
    nombre = models.CharField(max_length=100)
    monto_default = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

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
