from django import forms
from .models import Cliente, Producto, Renta, Empleado, Nomina
from django.contrib.auth.models import User
from django.forms import inlineformset_factory
from core.utils import saldo_efectivo
from django.core.exceptions import ValidationError
from .models import RentaProducto, Gasto, Compra, HorasExtra, TipoPagoExtra, PagoExtraNomina, MovimientoContable, Cuenta
from django.utils import timezone
# ----------------------------
# Formulario Cliente
# ----------------------------
class ClienteForm(forms.ModelForm):
    class Meta:
        model = Cliente
        fields = '__all__'
        widgets = {
            'nombre': forms.TextInput(attrs={'class': 'form-control'}),
            'telefono': forms.TextInput(attrs={'class': 'form-control'}),
            'email': forms.EmailInput(attrs={'class': 'form-control'}),
            'direccion': forms.Textarea(attrs={
                'class': 'form-control',
                'rows': 3
            }),
        }

# ----------------------------
# Formulario Producto
# ----------------------------
class ProductoForm(forms.ModelForm):
    class Meta:
        model = Producto
        fields = [
            'nombre',
            'tipo',
            'precio',
            'stock_total',
            'activo',
        ]

# ----------------------------
# Formulario Renta
# ----------------------------
class RentaForm(forms.ModelForm):
    cargador = forms.ModelChoiceField(
        queryset=User.objects.filter(groups__name='Cargador'),
        required=False,
        label='Cargador asignado'
    )

    class Meta:
        model = Renta
        exclude = ('productos', 'precio_total', 'cliente', 'status', 'estado_entrega')
        widgets = {
            'fecha_renta': forms.DateInput(attrs={
            'type': 'date',
            'class': 'form-input'
            }),
            'hora_inicio': forms.TimeInput(attrs={
            'type': 'time',
            'class': 'form-input'
            }),
            'hora_fin': forms.TimeInput(attrs={
            'type': 'time',
            'class': 'form-input'
            }),

            'comentarios': forms.Textarea(attrs={
                'rows': 3,
                'placeholder': 'Comentarios'
            }),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # Bloquear folio si ya existe
        if self.instance.pk and 'folio' in self.fields:
            self.fields['folio'].widget.attrs['readonly'] = True


# ✅ ESTO VA FUERA DE LA CLASE
RentaProductoFormSet = inlineformset_factory(
    Renta,
    RentaProducto,
    fields=('producto', 'cantidad'),
    extra=1,
    can_delete=True
)

class RentaProductoForm(forms.ModelForm):
    class Meta:
        model = RentaProducto
        fields = (
            'producto',
            'cantidad',
            'precio_unitario',
            'nota',
        )
        widgets = {
            'precio_unitario': forms.NumberInput(attrs={
                'step': '0.01',
                'class': 'form-input'
            }),
            'nota': forms.TextInput(attrs={
                'placeholder': 'Cortesía, paquete, descuento…'
            })
        }

    def clean_precio_unitario(self):
        precio = self.cleaned_data.get('precio_unitario')
        if precio is None:
            raise forms.ValidationError("Debes indicar un precio.")
        if precio < 0:
            raise forms.ValidationError("El precio no puede ser negativo.")
        return precio

class EmpleadoForm(forms.ModelForm):
    class Meta:
        model = Empleado
        fields = '__all__'
        widgets = {
            'nombre': forms.TextInput(attrs={'class': 'form-control'}),
            'sueldo_diario': forms.NumberInput(attrs={'class': 'form-control'}),
            'tipo_empleado': forms.Select(attrs={'class': 'form-select'}),
            'comentarios': forms.Textarea(attrs={
                'class': 'form-control',
                'rows': 3,  # 👈 altura pequeña
                'placeholder': 'Comentarios breves (opcional)'
            }),
        }

class NominaForm(forms.ModelForm):
    class Meta:
        model = Nomina
        fields = ['empleado', 'fecha_inicio', 'fecha_fin', 'dias_trabajados']
        widgets = {
            'empleado': forms.Select(attrs={'class': 'form-select'}),
            'fecha_inicio': forms.DateInput(attrs={
                'class': 'form-control',
                'type': 'date'
            }),
            'fecha_fin': forms.DateInput(attrs={
                'class': 'form-control',
                'type': 'date'
            }),
            'dias_trabajados': forms.NumberInput(attrs={'class': 'form-control'}),
        }

class HorasExtraForm(forms.ModelForm):
    class Meta:
        model = HorasExtra
        fields = ['empleado', 'semana_inicio', 'horas_trabajadas']

class GastoForm(forms.ModelForm):
    class Meta:
        model = Gasto
        fields = ['fecha', 'tipo', 'categoria', 'descripcion', 'monto', 'cuenta']
        widgets = {
            'fecha': forms.DateInput(attrs={'type': 'date', 'class': 'form-control'}),
            'tipo': forms.Select(attrs={'class': 'form-select'}),
            'categoria': forms.Select(attrs={'class': 'form-select'}),
            'descripcion': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Descripción del gasto'
            }),
            'monto': forms.NumberInput(attrs={
                'class': 'form-control',
                'step': '0.01',
                'min': '0'
            }),
            'cuenta': forms.Select(attrs={'class': 'form-select'}),
        }

    def clean(self):
        cleaned_data = super().clean()
        monto = cleaned_data.get('monto')
        cuenta = cleaned_data.get('cuenta')

        if not monto:
            return cleaned_data

        # 🏦 Gasto desde banco
        if cuenta:
            saldo = cuenta.saldo_actual()
            if monto > saldo:
                raise ValidationError(
                    f"Saldo insuficiente en la cuenta '{cuenta.nombre}'. "
                    f"Disponible: ${saldo:.2f}"
                )

        # 💵 Gasto desde efectivo
        else:
            saldo = saldo_efectivo()
            if monto > saldo:
                raise ValidationError(
                    f"Saldo insuficiente en efectivo. "
                    f"Disponible: ${saldo:.2f}"
                )

        return cleaned_data




class CompraForm(forms.ModelForm):
    class Meta:
        model = Compra
        fields = ['proveedor', 'concepto', 'monto', 'fecha', 'cuenta']
        widgets = {
            'proveedor': forms.TextInput(attrs={'class': 'form-control'}),
            'concepto': forms.TextInput(attrs={'class': 'form-control'}),
            'monto': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.01', 'min': '0'}),
            'fecha': forms.DateInput(attrs={'type': 'date', 'class': 'form-control'}),
            'cuenta': forms.Select(attrs={'class': 'form-select'}),
        }

    def clean(self):
        cleaned_data = super().clean()
        monto = cleaned_data.get('monto')
        cuenta = cleaned_data.get('cuenta')

        if not monto:
            return cleaned_data

        # 🏦 Compra desde banco
        if cuenta:
            saldo = cuenta.saldo_actual()
            if monto > saldo:
                raise ValidationError(
                    f"Saldo insuficiente en la cuenta '{cuenta.nombre}'. "
                    f"Saldo disponible: ${saldo:.2f}"
                )

        # 💵 Compra desde efectivo
        else:
            saldo = saldo_efectivo()
            if monto > saldo:
                raise ValidationError(
                    f"Saldo insuficiente en efectivo. "
                    f"Disponible: ${saldo:.2f}"
                )

        return cleaned_data


class PagoExtraForm(forms.ModelForm):
    class Meta:
        model = PagoExtraNomina
        fields = ['tipo', 'monto']
        widgets = {
            'tipo': forms.Select(attrs={'class': 'form-select'}),
            'monto': forms.NumberInput(attrs={
                'class': 'form-control',
                'step': '0.01'
            }),
        }

class TipoPagoExtraForm(forms.ModelForm):
    class Meta:
        model = TipoPagoExtra        # <--- OBLIGATORIO
        fields = ['nombre', 'monto_default']
        widgets = {
            'nombre': forms.TextInput(attrs={'class': 'form-control'}),
            'monto_default': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.01'}),
        }

class PagoExtraNominaForm(forms.ModelForm):
    tipo = forms.ModelChoiceField(
        queryset=TipoPagoExtra.objects.all(),
        widget=forms.Select(attrs={'class': 'form-select'})
    )
    monto = forms.DecimalField(
        max_digits=10,
        decimal_places=2,
        widget=forms.NumberInput(attrs={'class': 'form-control', 'step': '0.01'})
    )

    class Meta:
        model = PagoExtraNomina
        fields = ['tipo', 'monto']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Inicialmente monto vacío; JS llenará el monto default
        self.fields['monto'].initial = 0

class TransferenciaForm(forms.Form):
    cuenta_origen = forms.ModelChoiceField(queryset=Cuenta.objects.filter(activa=True))
    cuenta_destino = forms.ModelChoiceField(queryset=Cuenta.objects.filter(activa=True))
    monto = forms.DecimalField(max_digits=10, decimal_places=2)
    descripcion = forms.CharField(max_length=255, required=False)

    def clean(self):
        cleaned_data = super().clean()
        origen = cleaned_data.get('cuenta_origen')
        destino = cleaned_data.get('cuenta_destino')
        monto = cleaned_data.get('monto')

        if origen == destino:
            raise forms.ValidationError("La cuenta de origen y destino no pueden ser la misma.")
        if monto <= 0:
            raise forms.ValidationError("El monto debe ser mayor a cero.")
        if origen.saldo_actual() < monto:
            raise forms.ValidationError("Saldo insuficiente en la cuenta de origen.")
        return cleaned_data

class MovimientoForm(forms.ModelForm):
    class Meta:
        model = MovimientoContable
        fields = ['tipo', 'monto', 'metodo_pago', 'cuenta', 'descripcion']

    def save(self, commit=True):
        obj = super().save(commit=False)
        obj.fecha = timezone.now()
        if commit:
            obj.save()
        return obj

class TransferenciaForm(forms.Form):
    cuenta_origen = forms.ModelChoiceField(
        queryset=Cuenta.objects.filter(activa=True),
        label="Cuenta origen"
    )
    cuenta_destino = forms.ModelChoiceField(
        queryset=Cuenta.objects.filter(activa=True),
        label="Cuenta destino"
    )
    monto = forms.DecimalField(max_digits=10, decimal_places=2)
    descripcion = forms.CharField(required=False)

    def clean(self):
        cleaned_data = super().clean()
        origen = cleaned_data.get('cuenta_origen')
        destino = cleaned_data.get('cuenta_destino')
        monto = cleaned_data.get('monto')

        if origen == destino:
            raise forms.ValidationError("No puedes transferir a la misma cuenta.")

        if monto <= 0:
            raise forms.ValidationError("El monto debe ser mayor a cero.")

        if origen.saldo_actual() < monto:
            raise forms.ValidationError("Saldo insuficiente en la cuenta origen.")

        return cleaned_data


class TraspasoEfectivoBancoForm(forms.Form):
    ORIGEN_CHOICES = (
        ('EFECTIVO', 'Efectivo'),
        ('BANCO', 'Banco'),
    )

    origen_tipo = forms.ChoiceField(choices=ORIGEN_CHOICES)
    cuenta_banco = forms.ModelChoiceField(
        queryset=Cuenta.objects.filter(activa=True),
        label="Cuenta bancaria"
    )
    monto = forms.DecimalField(max_digits=10, decimal_places=2)
    descripcion = forms.CharField(required=False)

    def clean(self):
        cleaned = super().clean()
        origen = cleaned.get('origen_tipo')
        monto = cleaned.get('monto')
        cuenta = cleaned.get('cuenta_banco')

        if monto <= 0:
            raise forms.ValidationError("El monto debe ser mayor a cero.")

        # Validar saldo
        if origen == 'EFECTIVO':
            if saldo_efectivo() < monto:
                raise forms.ValidationError("Saldo insuficiente en efectivo.")
        else:
            if cuenta.saldo_actual() < monto:
                raise forms.ValidationError("Saldo insuficiente en la cuenta bancaria.")

        return cleaned
