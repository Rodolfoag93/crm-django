from django import forms
from .models import Cliente, Producto, Renta
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
        fields = ['nombre', 'tipo', 'precio', 'stock_total',]

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
            'fecha_renta': forms.DateInput(attrs={'type': 'date'}),
            'hora_inicio': forms.TimeInput(attrs={'type': 'time'}),
            'hora_fin': forms.TimeInput(attrs={'type': 'time'}),
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
