from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User

from core.models import Renta, Ruta
from core.decorators import solo_admin


@login_required
@solo_admin
def asignar_cargador(request, renta_id):
    renta = get_object_or_404(Renta, id=renta_id)
    if request.method == 'POST':
        cargador_id = request.POST.get('cargador')
        cargador = get_object_or_404(User, id=cargador_id)
        renta.cargador = cargador
        renta.estado_entrega = 'ASIGNADO'
        renta.save()
        return redirect('lista_rentas')
    cargadores = User.objects.filter(groups__name='Cargador')
    return render(request, 'core/asignar_cargador.html', {
        'renta': renta,
        'cargadores': cargadores
    })


@login_required
def iniciar_ruta(request, ruta_id):
    ruta = get_object_or_404(Ruta, id=ruta_id, cargador=request.user)
    if ruta.estado != 'CREADA':
        return redirect('mi_ruta')
    ruta.estado = 'EN_RUTA'
    ruta.save()
    ruta.rentas.update(estado_entrega='EN_RUTA')
    return redirect('mi_ruta')


@login_required
def finalizar_ruta(request, ruta_id):
    ruta = get_object_or_404(Ruta, id=ruta_id, cargador=request.user)
    if ruta.estado != 'EN_RUTA':
        return redirect('mi_ruta')
    ruta.estado = 'FINALIZADA'
    ruta.save()
    ruta.rentas.update(estado_entrega='ENTREGADO')
    return redirect('mi_ruta')


@login_required
def mi_ruta(request):
    ruta = Ruta.objects.filter(
        cargador=request.user,
        estado__in=['CREADA', 'EN_RUTA']
    ).first()
    return render(request, 'core/mi_ruta.html', {'ruta': ruta})


@login_required
@solo_admin
def asignar_rentas_a_ruta(request, ruta_id):
    ruta = get_object_or_404(Ruta, id=ruta_id)
    rentas_disponibles = Renta.objects.filter(
        ruta__isnull=True,
        estado_entrega='ASIGNADO',
        fecha_renta=ruta.fecha
    )
    if request.method == 'POST':
        rentas_ids = request.POST.getlist('rentas')
        Renta.objects.filter(id__in=rentas_ids).update(ruta=ruta)
        return redirect('detalle_ruta', ruta_id=ruta.id)
    return render(request, 'core/asignar_rentas_ruta.html', {
        'ruta': ruta,
        'rentas': rentas_disponibles
    })


@login_required
@solo_admin
def detalle_ruta(request, ruta_id):
    ruta = get_object_or_404(Ruta, id=ruta_id)
    return render(request, 'core/detalle_ruta.html', {'ruta': ruta})


@login_required
@solo_admin
def crear_ruta(request):
    if request.method == 'POST':
        fecha = request.POST.get('fecha')
        cargador_id = request.POST.get('cargador')
        cargador = get_object_or_404(User, id=cargador_id)
        Ruta.objects.create(fecha=fecha, cargador=cargador)
        return redirect('lista_rutas')
    cargadores = User.objects.filter(groups__name='cargador')
    return render(request, 'core/crear_ruta.html', {'cargadores': cargadores})


@login_required
@solo_admin
def lista_rutas(request):
    rutas = Ruta.objects.all().order_by('-fecha')
    return render(request, 'core/lista_rutas.html', {'rutas': rutas})