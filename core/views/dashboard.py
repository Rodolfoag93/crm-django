from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.utils import timezone
from core.models import Renta
from core.decorators import no_coordinador
from core.views.helpers import es_encargado_material
from core.views.coordinador import alertas_coordinador


@login_required
def home(request):
    es_coordinador = request.user.groups.filter(name='Coordinador').exists()
    es_cargador = request.user.groups.filter(name='cargador').exists()
    es_encargado = es_encargado_material(request.user)
    if es_coordinador and es_encargado:
        return redirect('home_encargado')
    if es_coordinador:
        return redirect('mis_eventos')
    if es_encargado:
        return redirect('home_encargado')
    rentas_sin_coordinador = alertas_coordinador(request) if not es_cargador else []
    hoy = timezone.localdate()
    rentas_sin_pago = Renta.objects.filter(
        status='ACTIVO',
        pagado=False,
        fecha_renta__lt=hoy
    ).select_related('cliente').order_by('fecha_renta')
    return render(request, 'core/home.html', {
        'es_cargador': es_cargador,
        'es_coordinador': es_coordinador,
        'rentas_sin_coordinador': rentas_sin_coordinador,
        'rentas_sin_pago': rentas_sin_pago,
    })


@login_required
@no_coordinador
def dashboard_ventas(request):
    return render(request, 'core/dashboard_ventas.html')


@login_required
@no_coordinador
def dashboard_admin(request):
    return render(request, 'core/dashboard_admin.html')