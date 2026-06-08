from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from core.models import Empleado, SolicitudRegistro
from core.forms import EmpleadoForm
from django.contrib import messages


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
    solicitud = get_object_or_404(SolicitudRegistro, id=solicitud_id)

    if request.method == 'POST':
        if solicitud.estado != 'PENDIENTE':
            messages.error(request, 'Esta solicitud ya fue procesada.')
            return redirect('lista_solicitudes')

        from django.contrib.auth.models import User
        from django.utils import timezone as tz

        # Crear usuario
        username = solicitud.telefono
        if User.objects.filter(username=username).exists():
            username = f"{solicitud.telefono}_{solicitud.id}"

        user = User.objects.create(
            username=username,
            first_name=solicitud.nombre.split()[0],
            last_name=' '.join(solicitud.nombre.split()[1:]),
            email=solicitud.email or '',
            password=solicitud.password_hash
        )

        # Buscar empleado existente por teléfono
        empleado = Empleado.objects.filter(telefono=solicitud.telefono).first()

        if empleado:
            empleado.user = user
            empleado.save()
        else:
            empleado = Empleado.objects.create(
                nombre=solicitud.nombre,
                telefono=solicitud.telefono,
                correo=solicitud.email or '',
                tipo_empleado=solicitud.tipo_empleado,
                sueldo_diario=0,
                activo=True,
                user=user
            )

        # Actualizar solicitud
        solicitud.estado = 'APROBADA'
        solicitud.revisada_por = request.user
        solicitud.fecha_revision = tz.now()
        solicitud.user_creado = user
        solicitud.save()

        messages.success(request, f'Solicitud de {solicitud.nombre} aprobada. Usuario {username} creado.')

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