from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from core.models import Producto
from core.forms import ProductoForm


@login_required
def lista_productos(request):
    productos = Producto.objects.all()
    return render(request, 'core/lista_productos.html', {'productos': productos, "module": 'ventas'})


@login_required
def nuevo_producto(request):
    form = ProductoForm(request.POST or None)
    if form.is_valid():
        producto = form.save(commit=False)
        producto.stock_disponible = producto.stock_total
        producto.save()
        return redirect('lista_productos')
    return render(request, 'core/form_producto.html', {'form': form})


@login_required
def editar_producto(request, producto_id):
    producto = get_object_or_404(Producto, id=producto_id)
    form = ProductoForm(request.POST or None, instance=producto)
    if form.is_valid():
        producto_anterior = producto.stock_total
        producto = form.save(commit=False)
        diferencia = producto.stock_total - producto_anterior
        if diferencia > 0:
            producto.stock_disponible += diferencia
        producto.save()
        return redirect("lista_productos")
    return render(request, "core/form_producto.html", {"form": form})


@login_required
def api_productos(request):
    q = request.GET.get("q", "")
    productos = Producto.objects.filter(nombre__icontains=q)[:10]
    return JsonResponse(
        [{"id": p.id, "nombre": p.nombre, "precio": float(p.precio)} for p in productos],
        safe=False
    )