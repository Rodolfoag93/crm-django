from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db.models import Q
from django.http import JsonResponse
from core.models import Cliente
from core.forms import ClienteForm


@login_required
def lista_clientes(request):
    q = request.GET.get("q", "").strip()
    orden = request.GET.get("orden", "nombre")
    clientes = Cliente.objects.all()
    if q:
        clientes = clientes.filter(
            Q(nombre__icontains=q) |
            Q(telefono__icontains=q)
        )
    if orden in ["nombre", "telefono"]:
        clientes = clientes.order_by(orden)
    paginator = Paginator(clientes, 25)
    page_obj = paginator.get_page(request.GET.get('page'))
    return render(
        request,
        "core/lista_clientes.html",
        {
            "clientes": page_obj,
            "page_obj": page_obj,
            "module": 'ventas',
        }
    )


@login_required
def nuevo_cliente(request):
    form = ClienteForm(request.POST or None)
    if form.is_valid():
        form.save()
        return redirect('lista_clientes')
    return render(request, 'core/form_cliente.html', {'form': form})


@login_required
def editar_cliente(request, cliente_id):
    cliente = get_object_or_404(Cliente, id=cliente_id)
    form = ClienteForm(request.POST or None, instance=cliente)
    if form.is_valid():
        form.save()
        return redirect('lista_clientes')
    return render(request, "core/form_cliente.html", {"form": form})


@login_required
def eliminar_cliente(request, cliente_id):
    cliente = get_object_or_404(Cliente, id=cliente_id)
    cliente.delete()
    return redirect('lista_clientes')


@login_required
def api_clientes(request):
    q = request.GET.get('q', '')
    clientes = Cliente.objects.filter(
        Q(nombre__icontains=q) | Q(telefono__icontains=q)
    )[:10]
    data = [{
        "id": c.id,
        "nombre": c.nombre,
        "telefono": c.telefono,
        "calle_y_numero": c.calle_y_numero,
        "colonia": c.colonia,
        "ciudad_o_municipio": c.ciudad_o_municipio
    } for c in clientes]
    return JsonResponse(data, safe=False)