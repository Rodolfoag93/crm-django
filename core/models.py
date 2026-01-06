from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User


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
        ('OT', 'Otro'),
    ]

    nombre = models.CharField(max_length=100)
    tipo = models.CharField(max_length=2, choices=TIPO_PRODUCTO)
    precio = models.DecimalField(max_digits=10, decimal_places=2)

    stock_total = models.PositiveIntegerField(default=0)
    stock_disponible = models.PositiveIntegerField(default=0)

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

    def __str__(self):
        return f"{self.nombre}"

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

    cantidad = models.IntegerField(default=1)

    precio_unitario = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )

    subtotal = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )

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
    categoria = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True, null=True)
    monto = models.DecimalField(max_digits=10, decimal_places=2)
    fecha = models.DateField()

    def __str__(self):
        return f"{self.categoria} - ${self.monto}"


class Compra(models.Model):
    proveedor = models.CharField(max_length=200)
    concepto = models.CharField(max_length=200)
    monto = models.DecimalField(max_digits=10, decimal_places=2)
    fecha = models.DateField()

    def __str__(self):
        return f"{self.proveedor} - ${self.monto}"