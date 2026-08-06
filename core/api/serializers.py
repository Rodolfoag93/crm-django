from rest_framework import serializers
from core.models import (
    Cliente, Producto, Renta, RentaProducto,
    Empleado, Nomina, Gasto, MovimientoContable, Asistencia, SolicitudRegistro, HorasExtra, PagoExtraNomina, TipoPagoExtra,
    TemporadaAlta,
)
from django.contrib.auth.hashers import make_password


class ClienteSerializer(serializers.ModelSerializer):
    rentas_count    = serializers.SerializerMethodField()
    total_gastado   = serializers.SerializerMethodField()
    ultima_renta    = serializers.SerializerMethodField()
    colonia_frecuente = serializers.SerializerMethodField()

    class Meta:
        model = Cliente
        fields = [
            'id', 'nombre', 'telefono', 'calle_y_numero', 'colonia', 'ciudad_o_municipio',
            'rfc', 'razon_social', 'regimen_fiscal', 'codigo_postal_fiscal',
            'email_facturacion', 'uso_cfdi_default',
            'rentas_count', 'total_gastado', 'ultima_renta', 'colonia_frecuente',
        ]

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
    factura = serializers.SerializerMethodField()
    datos_fiscales_cliente = serializers.SerializerMethodField()

    class Meta:
        model = Renta
        fields = [
            'id', 'folio', 'cliente', 'cliente_nombre', 'cliente_telefono',
            'fecha_renta', 'hora_inicio', 'hora_fin',
            'calle_y_numero', 'colonia', 'ciudad_o_municipio',
            'precio_total', 'anticipo', 'pagado', 'status',
            'estado_entrega', 'comentarios', 'productos',
            'validacion_logistica',
            'factura', 'datos_fiscales_cliente',
        ]

    def get_factura(self, obj):
        from core.services.facturacion import factura_resumen, ultima_factura_renta
        return factura_resumen(ultima_factura_renta(obj))

    def get_datos_fiscales_cliente(self, obj):
        c = obj.cliente
        if not c:
            return None
        return {
            'rfc': c.rfc or '',
            'razon_social': c.razon_social or c.nombre or '',
            'regimen_fiscal': c.regimen_fiscal or '',
            'codigo_postal': c.codigo_postal_fiscal or '',
            'email': c.email_facturacion or '',
            'uso_cfdi': c.uso_cfdi_default or 'G03',
        }


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
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    categoria_display = serializers.CharField(source='get_categoria_display', read_only=True)
    cuenta_nombre = serializers.SerializerMethodField()
    comprobante_url = serializers.SerializerMethodField()

    class Meta:
        model = Gasto
        fields = [
            'id', 'tipo', 'tipo_display', 'categoria', 'categoria_display',
            'cuenta', 'cuenta_nombre', 'descripcion', 'monto', 'fecha',
            'referencia', 'comprobante', 'comprobante_url', 'nomina',
        ]
        read_only_fields = ['nomina']

    def get_cuenta_nombre(self, obj):
        if obj.cuenta:
            return obj.cuenta.nombre
        return 'Efectivo'

    def get_comprobante_url(self, obj):
        if obj.comprobante:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.comprobante.url)
            return obj.comprobante.url
        return None


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

class TemporadaAltaSerializer(serializers.ModelSerializer):
    class Meta:
        model = TemporadaAlta
        fields = ['id', 'nombre', 'fecha_inicio', 'fecha_fin', 'activo', 'notas']

    def validate(self, attrs):
        inicio = attrs.get('fecha_inicio', getattr(self.instance, 'fecha_inicio', None))
        fin = attrs.get('fecha_fin', getattr(self.instance, 'fecha_fin', None))
        if inicio and fin and fin < inicio:
            raise serializers.ValidationError({
                'fecha_fin': 'La fecha fin debe ser igual o posterior a la fecha inicio.',
            })
        return attrs

