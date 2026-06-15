from rest_framework import serializers
from core.models import (
    Cliente, Producto, Renta, RentaProducto,
    Empleado, Nomina, Gasto, MovimientoContable, Asistencia, SolicitudRegistro, HorasExtra
)
from django.contrib.auth.hashers import make_password


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
        fields = ['id', 'nombre', 'telefono', 'correo', 'tipo_empleado', 'activo', 'sueldo_diario']


class NominaSerializer(serializers.ModelSerializer):
    empleado_nombre = serializers.CharField(source='empleado.nombre', read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)
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

class AsistenciaSerializer(serializers.ModelSerializer):
    empleado_nombre = serializers.CharField(source='empleado.nombre', read_only=True)
    horas_trabajadas = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)

    class Meta:
        model = Asistencia
        fields = [
            'id', 'empleado', 'empleado_nombre', 'fecha',
            'hora_entrada', 'hora_salida', 'ubicacion_entrada',
            'ubicacion_salida', 'tipo_jornada', 'notas', 'horas_trabajadas'
        ]
        read_only_fields = ['horas_trabajadas']

class SolicitudRegistroSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = SolicitudRegistro
        fields = ['id', 'nombre', 'telefono', 'email', 'password', 'tipo_empleado', 'estado', 'fecha_solicitud']
        read_only_fields = ['estado', 'fecha_solicitud']

    def create(self, validated_data):
        password = validated_data.pop('password')
        validated_data['password_hash'] = make_password(password)
        return super().create(validated_data)

class HorasExtraSerializer(serializers.ModelSerializer):
    empleado_nombre = serializers.CharField(source='empleado.nombre', read_only=True)
    es_eventual = serializers.BooleanField(source='empleado.es_eventual', read_only=True)

    class Meta:
        model = HorasExtra
        fields = [
            'id', 'empleado', 'empleado_nombre', 'es_eventual',
            'semana_inicio', 'semana_fin',
            'horas_trabajadas', 'horas_descontadas', 'horas_computables',
            'horas_extra', 'pago_hora', 'total_pago',
            'pagado', 'fecha_pago'
        ]
        read_only_fields = [
            'semana_fin', 'horas_trabajadas', 'horas_descontadas',
            'horas_computables', 'horas_extra', 'total_pago'
        ]