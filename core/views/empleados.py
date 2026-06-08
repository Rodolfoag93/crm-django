from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from core.models import Empleado, SolicitudRegistro
from core.forms import EmpleadoForm


@login_required
def lista_empleados(request):
    empleados = Empleado.objects.filter(activo=True).order_by('nombre')
    paginator = Paginator(empleados, 25)
    page_obj = paginator.get_page(request.GET.get('page'))
    return render(request, 'core/empleados_lista.html', {
        'empleados': page_obj,
        'page_obj': page_obj,
    })


@login_required
def nuevo_empleado(request):
    if request.method == "POST":
        form = EmpleadoForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('lista_empleados')
    else:
        form = EmpleadoForm()
    return render(request, 'core/empleado_form.html', {'form': form})


@login_required
def editar_empleado(request, pk):
    empleado = get_object_or_404(Empleado, pk=pk)
    if request.method == "POST":
        form = EmpleadoForm(request.POST, instance=empleado)
        if form.is_valid():
            form.save()
            return redirect('lista_empleados')
    else:
        form = EmpleadoForm(instance=empleado)
    return render(request, 'core/empleado_form.html', {'form': form})

@login_required
def lista_solicitudes(request):
    solicitudes = SolicitudRegistro.objects.all().order_by('-fecha_solicitud')
    return render(request, 'core/solicitudes_registro.html', {
        'solicitudes': solicitudes,
    })

@login_required
def aprobar_solicitud(request, solicitud_id):
    import requests
    from django.conf import settings

    solicitud = get_object_or_404(SolicitudRegistro, id=solicitud_id)

    if request.method == 'POST':
        # Llamar al endpoint de la API internamente
        from rest_framework.authtoken.models import Token
        token, _ = Token.objects.get_or_create(user=request.user)

        response = requests.post(
            f'http://localhost/v1/solicitudes/{solicitud_id}/aprobar/',
            headers={'Authorization': f'Token {token.key}'},
        )

        if response.status_code == 200:
            messages.success(request, f'Solicitud de {solicitud.nombre} aprobada correctamente.')
        else:
            messages.error(request, 'Error al aprobar la solicitud.')

    return redirect('lista_solicitudes')

@login_required
def rechazar_solicitud(request, solicitud_id):
    solicitud = get_object_or_404(SolicitudRegistro, id=solicitud_id)
    if request.method == 'POST':
        solicitud.estado = 'RECHAZADA'
        solicitud.revisada_por = request.user
        from django.utils import timezone as tz
        solicitud.fecha_revision = tz.now()
        solicitud.notas_admin = request.POST.get('notas', '')
        solicitud.save()
        messages.success(request, f'Solicitud de {solicitud.nombre} rechazada.')
    return redirect('lista_solicitudes')