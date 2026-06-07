from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from core.models import Empleado
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