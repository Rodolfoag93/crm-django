from django import forms
from .models import Cliente, Producto, Renta, Empleado, Nomina
from django.contrib.auth.models import User
from django.forms import inlineformset_factory
from .models import RentaProducto

# ----------------------------
# Formulario Cliente
# ----------------------------
class ClienteForm(forms.ModelForm):
    class Meta:
        model = Cliente
        fields = '__all__'

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
        exclude = ('productos', 'precio_total',)
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
        fields = ['nombre', 'telefono', 'sueldo_diario', 'correo', 'comentarios']

class NominaForm(forms.ModelForm):
    class Meta:
        model = Nomina
        fields = ['empleado', 'fecha_inicio', 'fecha_fin', 'dias_trabajados', 'eventos_extras', 'pago_extra_por_evento']