from rest_framework import serializers
from core.models import (
    Cliente, Producto, Renta, RentaProducto,
    Empleado, Nomina, Gasto, MovimientoContable
)


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = '__all__'


class ProductoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Producto
        fields = '__all__'


class RentaProductoSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.CharField(source='producto.nombre', read_only=True)

    class Meta:
        model = RentaProducto
        fields = ['id', 'producto', 'producto_nombre', 'cantidad', 'precio_unitario', 'subtotal']


class RentaSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True)
    cliente_telefono = serializers.CharField(source='cliente.telefono', read_only=True)
    productos = RentaProductoSerializer(source='rentaproductos', many=True, read_only=True)

    class Meta:
        model = Renta
        fields = [
            'id', 'folio', 'cliente', 'cliente_nombre', 'cliente_telefono',
            'fecha_renta', 'hora_inicio', 'hora_fin',
            'calle_y_numero', 'colonia', 'ciudad_o_municipio',
            'precio_total', 'anticipo', 'pagado', 'status',
            'estado_entrega', 'comentarios', 'productos'
        ]


class EmpleadoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empleado
        fields = ['id', 'nombre', 'telefono', 'correo', 'tipo_empleado', 'activo']


class NominaSerializer(serializers.ModelSerializer):
    empleado_nombre = serializers.CharField(source='empleado.nombre', read_only=True)

    class Meta:
        model = Nomina
        fields = ['id', 'empleado', 'empleado_nombre', 'fecha_inicio', 'fecha_fin', 'dias_trabajados', 'total']


class GastoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Gasto
        fields = '__all__'


class MovimientoContableSerializer(serializers.ModelSerializer):
    class Meta:
        model = MovimientoContable
        fields = '__all__'