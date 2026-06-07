from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.utils import timezone
from django.views.decorators.http import require_POST

from core.models import (
    MaterialAnimacion, ListaMaterialEvento, FotoMaterial
)
from core.decorators import acceso_listas_material


@login_required
def catalogo_materiales(request):
    q = request.GET.get('q', '').strip()
    tipo = request.GET.get('tipo', '')
    materiales = MaterialAnimacion.objects.filter(activo=True)
    if q:
        materiales = materiales.filter(nombre__icontains=q)
    if tipo:
        materiales = materiales.filter(tipo=tipo)
    return render(request, 'core/catalogo_materiales.html', {
        'materiales': materiales,
        'tipos': MaterialAnimacion.TIPO,
        'tipo_seleccionado': tipo,
        'q': q,
        'module': 'ventas',
    })


@login_required
def nuevo_material(request):
    from core.forms import MaterialAnimacionForm
    if request.method == 'POST':
        form = MaterialAnimacionForm(request.POST, request.FILES)
        if form.is_valid():
            material = form.save(commit=False)
            material.stock_disponible = material.stock_total
            material.save()
            for foto in request.FILES.getlist('fotos_extra'):
                FotoMaterial.objects.create(material=material, foto=foto)
            messages.success(request, 'Material agregado al catálogo.')
            return redirect('catalogo_materiales')
    else:
        form = MaterialAnimacionForm()
    return render(request, 'core/form_material.html', {'form': form})


@login_required
def editar_material(request, material_id):
    from core.forms import MaterialAnimacionForm
    material = get_object_or_404(MaterialAnimacion, id=material_id)
    if request.method == 'POST':
        form = MaterialAnimacionForm(request.POST, request.FILES, instance=material)
        if form.is_valid():
            form.save()
            for foto_id in request.POST.getlist('eliminar_foto'):
                FotoMaterial.objects.filter(id=foto_id, material=material).delete()
            for foto in request.FILES.getlist('fotos_extra'):
                FotoMaterial.objects.create(material=material, foto=foto)
            messages.success(request, 'Material actualizado.')
            return redirect('catalogo_materiales')
    else:
        form = MaterialAnimacionForm(instance=material)
    return render(request, 'core/form_material.html', {
        'form': form,
        'editando': True,
        'material': material
    })


@login_required
@acceso_listas_material
def home_encargado(request):
    listas_pendientes = ListaMaterialEvento.objects.filter(
        estado='PENDIENTE'
    ).select_related(
        'asignacion__renta__cliente',
        'asignacion__coordinador'
    ).order_by('asignacion__renta__fecha_renta')
    return render(request, 'core/home_encargado.html', {
        'listas_pendientes': listas_pendientes,
    })


@login_required
@acceso_listas_material
def todas_listas_material(request):
    estado = request.GET.get('estado', '')
    listas = ListaMaterialEvento.objects.select_related(
        'asignacion__renta__cliente',
        'asignacion__coordinador',
        'revisada_por'
    ).prefetch_related(
        'asignacion__materiales__material'
    ).order_by('asignacion__renta__fecha_renta')
    if estado:
        listas = listas.filter(estado=estado)
    return render(request, 'core/todas_listas_material.html', {
        'listas': listas,
        'estado_seleccionado': estado,
        'estados': ListaMaterialEvento.ESTADO,
    })


@login_required
@acceso_listas_material
def detalle_lista_material(request, lista_id):
    lista = get_object_or_404(ListaMaterialEvento, id=lista_id)
    if lista.estado == 'PENDIENTE':
        lista.estado = 'REVISADA'
        lista.revisada_por = request.user
        lista.fecha_revision = timezone.now()
        lista.save()
        messages.success(request, 'Lista marcada como revisada automáticamente.')
    materiales = lista.asignacion.materiales.select_related('material')
    consumibles = materiales.filter(material__tipo='CONSUMIBLE')
    reutilizables = materiales.filter(material__tipo='REUTILIZABLE')
    return render(request, 'core/detalle_lista_material.html', {
        'lista': lista,
        'consumibles': consumibles,
        'reutilizables': reutilizables,
    })


@login_required
@acceso_listas_material
@require_POST
def cambiar_estado_lista(request, lista_id):
    lista = get_object_or_404(ListaMaterialEvento, id=lista_id)
    nuevo_estado = request.POST.get('estado')
    notas = request.POST.get('notas_encargado', '')
    if nuevo_estado in dict(ListaMaterialEvento.ESTADO):
        lista.estado = nuevo_estado
        lista.notas_encargado = notas
        if nuevo_estado in ['REVISADA', 'PREPARADA']:
            lista.revisada_por = request.user
        lista.save()
        messages.success(request, 'Estado actualizado.')
    return redirect('detalle_lista_material', lista_id=lista_id)