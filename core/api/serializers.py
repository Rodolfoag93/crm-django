from rest_framework import serializers
from core.models import (
    Cliente, Producto, Renta, RentaProducto,
    Empleado, Nomina, Gasto, MovimientoContable, Asistencia, SolicitudRegistro, HorasExtra, PagoExtraNomina, TipoPagoExtra
)
from django.contrib.auth.hashers import make_password


class ClienteSerializer(serializers.ModelSerializer):
    rentas_count    = serializers.SerializerMethodField()
    total_gastado   = serializers.SerializerMethodField()
    ultima_renta    = serializers.SerializerMethodField()
    colonia_frecuente = serializers.SerializerMethodField()

    class Meta:
        model = Cliente
        fields = ['id', 'nombre', 'telefono', 'calle_y_numero', 'colonia', 'ciudad_o_municipio',
                  'rentas_count', 'total_gastado', 'ultima_renta', 'colonia_frecuente']

    def get_rentas_count(self, obj):
        return getattr(obj, 'rentas_count', None) or 0

    def get_total_gastado(self, obj):
        v = getattr(obj, 'total_gastado', None)
        return float(v) if v else 0.0

    def get_ultima_renta(self, obj):
        d = getattr(obj, 'ultima_renta', None)
        return str(d) if d else None

    def get_colonia_frecuente(self, obj):
        return getattr(obj, 'colonia_frecuente', None) or obj.colonia or None


class ProductoSerializer(serializers.ModelSerializer):
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    veces_rentado = serializers.SerializerMethodField()
    ultima_renta   = serializers.SerializerMethodField()

    class Meta:
        model = Producto
        fields = ['id', 'nombre', 'tipo', 'tipo_display', 'precio',
                  'stock_total', 'stock_disponible', 'activo',
                  'veces_rentado', 'ultima_renta']

    def get_veces_rentado(self, obj):
        return getattr(obj, 'veces_rentado', None) or 0

    def get_ultima_renta(self, obj):
        d = getattr(obj, 'ultima_renta', None)
        return str(d) if d else None


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
    usuario_username = serializers.CharField(source='user.username', read_only=True, default=None)

    class Meta:
        model = Empleado
        fields = [
            'id', 'nombre', 'telefono', 'correo', 'tipo_empleado',
            'activo', 'sueldo_diario', 'comentarios', 'es_eventual',
            'usuario_username',
        ]


class PagoExtraNominaSerializer(serializers.ModelSerializer):
    tipo_nombre = serializers.CharField(source='tipo.nombre', read_only=True)

    class Meta:
        model = PagoExtraNomina
        fields = ['id', 'tipo', 'tipo_nombre', 'monto']


class NominaSerializer(serializers.ModelSerializer):
    empleado_nombre = serializers.CharField(source='empleado.nombre', read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)
    pagos_extra = PagoExtraNominaSerializer(many=True, read_only=True, source='pagos_extras')

    class Meta:
        model = Nomina
        fields = [
            'id', 'empleado', 'empleado_nombre',
            'fecha_inicio', 'fecha_fin', 'dias_trabajados',
            'total', 'pagos_extra'
        ]


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