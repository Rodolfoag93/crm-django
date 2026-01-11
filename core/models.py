from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from django.db.models import Sum
from datetime import timedelta


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
    def hay_stock(self, cantidad):
        return self.stock_disponible >= cantidad

    def reservar_stock(self, cantidad):
        if not self.hay_stock(cantidad):
            raise ValueError("Stock insuficiente")
        self.stock_disponible -= cantidad
        self.save(update_fields=['stock_disponible'])

    def liberar_stock(self, cantidad):
        self.stock_disponible = min(
            self.stock_disponible + cantidad,
            self.stock_total
        )
        self.save(update_fields=['stock_disponible'])

    @property
    def disponible(self):
        return self.activo and self.stock_disponible > 0

    def stock_disponible_en_horario(self, fecha, hora_inicio, hora_fin):
        # aquí ya puedes usar self
        rentas_en_horario = RentaProducto.objects.filter(
            producto=self,
            renta__fecha_renta=fecha,
            renta__hora_inicio__lt=hora_fin,
            renta__hora_fin__gt=hora_inicio,
            renta__status='ACTIVO'
        ).aggregate(total=models.Sum('cantidad'))['total'] or 0

        disponible = self.stock_total - rentas_en_horario
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

    # 💰 precios
    precio_lista = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    precio_unitario = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    subtotal = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        editable=False
    )

    # 📝 opcional pero MUY útil
    nota = models.CharField(max_length=255, blank=True)

    def save(self, *args, **kwargs):

        # 🔹 precio de lista SIEMPRE viene del producto
        if not self.precio_lista:
            self.precio_lista = self.producto.precio

        # 🔹 si no se especifica precio_unitario → usar lista
        if self.precio_unitario is None:
            self.precio_unitario = self.precio_lista

        self.subtotal = self.cantidad * self.precio_unitario
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.producto.nombre} x{self.cantidad} - {self.renta.folio}"

class PedidoFinanzas(models.Model):
    renta = models.OneToOneField(Renta, on_delete=models.CASCADE, related_name='finanza')
    total = models.DecimalField(max_digits=10, decimal_places=2)
    pagado = models.BooleanField(default=False)
    fecha_registro = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Pedido #{self.renta.id} - {'Pagado' if self.pagado else 'Pendiente'}"


class Gasto(models.Model):
    TIPO = [
        ('GASTO', 'Gasto General'),
        ('COMPRA', 'Compra'),
        ('NOMINA', 'Nómina'),
    ]

    tipo = models.CharField(max_length=10, choices=TIPO)
    descripcion = models.CharField(max_length=255)
    monto = models.DecimalField(max_digits=10, decimal_places=2)
    fecha = models.DateField()
    referencia = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        return f"{self.get_tipo_display()} - ${self.monto}"


class Compra(models.Model):
    proveedor = models.CharField(max_length=200)
    concepto = models.CharField(max_length=200)
    monto = models.DecimalField(max_digits=10, decimal_places=2)
    fecha = models.DateField()

    def __str__(self):
        return f"{self.proveedor} - ${self.monto}"



def calcular_total(renta):
    """
    Calcula el total de la renta usando el precio ajustado de cada producto en esa renta.
    """
    return sum(rp.cantidad * rp.precio_unitario for rp in renta.rentaproductos.all())


class Empleado(models.Model):
    nombre = models.CharField(max_length=100)
    telefono = models.CharField(max_length=20, blank=True)
    correo = models.EmailField(blank=True, null=True)
    sueldo_diario = models.DecimalField(max_digits=8, decimal_places=2)
    comentarios = models.TextField(blank=True, null=True)
    activo = models.BooleanField(default=True)

    def __str__(self):
        return self.nombre

class Nomina(models.Model):
    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    dias_trabajados = models.PositiveIntegerField(default=0)
    pago_evento_extra = models.DecimalField(
        max_digits=10, decimal_places=2, default=0
    )
    total = models.DecimalField(
        max_digits=10, decimal_places=2, default=0
    )

    def calcular_total(self):
        sueldo_base = self.empleado.sueldo_diario * self.dias_trabajados
        return sueldo_base + self.pago_evento_extra

    def save(self, *args, **kwargs):
        self.total = self.calcular_total()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Nómina {self.empleado} ({self.fecha_inicio} - {self.fecha_fin})"