import json
from datetime import date, timedelta
from decimal import Decimal

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.core.paginator import Paginator
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils import timezone
from weasyprint import HTML

from core.models import (
    Nomina, HorasExtra, TipoPagoExtra, PagoExtraNomina, Gasto, Empleado
)
from core.forms import (
    NominaForm, HorasExtraForm, PagoExtraNominaForm,
    TipoPagoExtraForm, PagoExtraForm
)
from core.utils import sincronizar_gasto_nomina


@login_required
def lista_nomina(request):
    semana_param = request.GET.get('semana')
    if semana_param:
        lunes = date.fromisoformat(semana_param)
    else:
        hoy = date.today()
        lunes = hoy - timedelta(days=hoy.weekday())
    domingo = lunes + timedelta(days=6)
    lunes_anterior = lunes - timedelta(days=7)
    lunes_siguiente = lunes + timedelta(days=7)
    nominas = Nomina.objects.select_related('empleado').filter(
        fecha_inicio__lte=domingo,
        fecha_fin__gte=lunes
    )
    for n in nominas:
        n.total = (
            n.dias_trabajados * n.empleado.sueldo_diario
        ) + sum(p.monto for p in n.pagos_extras.all())
    recibo_horas_extra_id = request.GET.get('recibo_horas_extra')
    recibo_nomina_id = request.GET.get('recibo_nomina')
    paginator = Paginator(nominas, 25)
    page_obj = paginator.get_page(request.GET.get('page'))
    return render(request, 'core/nomina_lista.html', {
        'nominas': page_obj,
        'page_obj': page_obj,
        'lunes': lunes,
        'domingo': domingo,
        'lunes_anterior': lunes_anterior,
        'lunes_siguiente': lunes_siguiente,
        'recibo_horas_extra_id': recibo_horas_extra_id,
        'recibo_nomina_id': recibo_nomina_id,
        "module": 'admin',
    })


@login_required
def nueva_nomina(request):
    if request.method == 'POST':
        form = NominaForm(request.POST)
        if form.is_valid():
            nomina = form.save()
            nomina.total = nomina.calcular_total()
            nomina.save()
            sincronizar_gasto_nomina(nomina)
            return redirect('editar_nomina', nomina.id)
    else:
        form = NominaForm()
    return render(request, 'core/nomina_form.html', {'form': form, 'nomina': None})


@login_required
def editar_nomina(request, pk):
    nomina = get_object_or_404(Nomina, pk=pk)
    pago_extra_form = PagoExtraNominaForm(request.POST or None)
    if request.method == "POST":
        form = NominaForm(request.POST, instance=nomina)
        if 'guardar_nomina' in request.POST and form.is_valid():
            form.save()
            nomina.total = nomina.calcular_total()
            nomina.save()
            sincronizar_gasto_nomina(nomina)
            return redirect('lista_nomina')
        elif 'agregar_pago_extra' in request.POST and pago_extra_form.is_valid():
            pago = pago_extra_form.save(commit=False)
            pago.nomina = nomina
            pago.save()
            nomina.total = nomina.calcular_total()
            nomina.save()
            sincronizar_gasto_nomina(nomina)
            return redirect('editar_nomina', pk=nomina.pk)
    else:
        form = NominaForm(instance=nomina)
    pagos = nomina.pagos_extras.select_related('tipo').all()
    return render(request, 'core/editar_nomina.html', {
        'form': form,
        'nomina': nomina,
        'pago_extra_form': pago_extra_form,
        'pagos': pagos,
    })


@login_required
def recibo_nomina_pdf(request, nomina_id):
    nomina = get_object_or_404(Nomina, id=nomina_id)
    sueldo_base = nomina.dias_trabajados * nomina.empleado.sueldo_diario
    total_extra = nomina.pago_eventos_extra()
    total_pagado = sueldo_base + total_extra
    html_string = render_to_string('nomina/recibo_nomina_pdf.html', {
        'nomina': nomina,
        'sueldo_base': sueldo_base,
        'total_pagado': total_pagado,
        'fecha': date.today(),
    })
    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = 'inline; filename="recibo_nomina.pdf"'
    HTML(string=html_string).write_pdf(response)
    return response


@login_required
def pagos_extra_nomina(request, nomina_id):
    nomina = get_object_or_404(Nomina, id=nomina_id)
    pagos = nomina.pagos_extras.select_related('tipo')
    return render(request, 'nomina/pagos_extra.html', {'nomina': nomina, 'pagos': pagos})


@login_required
def crear_pago_extra(request, nomina_id):
    nomina = get_object_or_404(Nomina, pk=nomina_id)
    if request.method == "POST":
        form = PagoExtraNominaForm(request.POST)
        if form.is_valid():
            pago = form.save(commit=False)
            pago.nomina = nomina
            pago.save()
            return redirect('editar_nomina', pk=nomina.id)
    else:
        form = PagoExtraNominaForm()
    return render(request, 'core/editar_nomina.html', {
        'form': NominaForm(instance=nomina),
        'nomina': nomina,
        'pago_extra_form': form,
    })


@login_required
def eliminar_pago_extra(request, pago_id):
    pago = get_object_or_404(PagoExtraNomina, id=pago_id)
    nomina_id = pago.nomina.id
    pago.delete()
    return redirect('editar_nomina', pk=nomina_id)


@login_required
def catalogo_pagos_extra(request, tipo_id=None):
    tipo = None
    if tipo_id:
        tipo = get_object_or_404(TipoPagoExtra, pk=tipo_id)
    form = TipoPagoExtraForm(request.POST or None, instance=tipo)
    conceptos = TipoPagoExtra.objects.all()
    if request.method == "POST" and form.is_valid():
        form.save()
        return redirect('catalogo_pagos_extra')
    return render(request, 'nomina/catalogo_pagos_extra.html', {
        'form': form,
        'conceptos': conceptos,
        'tipo': tipo
    })


@login_required
def crear_editar_tipo_pago_extra(request, tipo_id=None):
    tipo = None
    if tipo_id:
        tipo = get_object_or_404(TipoPagoExtra, pk=tipo_id)
    form = TipoPagoExtraForm(request.POST or None, instance=tipo)
    conceptos = TipoPagoExtra.objects.all()
    if request.method == 'POST' and form.is_valid():
        form.save()
        return redirect('crear_tipo_pago_extra')
    return render(request, 'nomina/catalogo_pagos_extra.html', {
        'form': form,
        'conceptos': conceptos,
        'tipo': tipo
    })


@login_required
def eliminar_tipo_pago_extra(request, tipo_id):
    from django.db.models import ProtectedError
    tipo = get_object_or_404(TipoPagoExtra, id=tipo_id)
    try:
        tipo.delete()
        messages.success(request, 'Concepto eliminado')
    except ProtectedError:
        messages.error(request, 'No se puede eliminar: el concepto está en uso')
    return redirect('catalogo_pagos_extra')


@login_required
def lista_horas_extra(request):
    horas = HorasExtra.objects.order_by('-semana_inicio')
    return render(request, 'nomina/horas_extra_list.html', {'horas': horas})


@login_required
def crear_horas_extra(request):
    initial = {}
    preview = None

    if request.method == 'GET':
        empleado_id = request.GET.get('empleado')
        inicio = request.GET.get('inicio')
        if empleado_id:
            initial['empleado'] = empleado_id
        if inicio:
            initial['semana_inicio'] = inicio

        # Preview automático si tenemos empleado y semana
        if empleado_id and inicio:
            try:
                from core.models import Empleado, HorasExtra
                from datetime import date
                empleado = Empleado.objects.get(id=empleado_id)
                semana_inicio = date.fromisoformat(inicio)
                # Calcular sin guardar
                preview_obj = HorasExtra(
                    empleado=empleado,
                    semana_inicio=semana_inicio,
                    semana_fin=semana_inicio + timedelta(days=6)
                )
                preview_obj.calcular()
                preview = {
                    'horas_trabajadas': preview_obj.horas_trabajadas,
                    'horas_descontadas': preview_obj.horas_descontadas,
                    'horas_computables': preview_obj.horas_computables,
                    'horas_extra': preview_obj.horas_extra,
                    'total_pago': preview_obj.total_pago,
                }
            except Exception:
                pass

        form = HorasExtraForm(initial=initial)

    else:
        form = HorasExtraForm(request.POST)
        if form.is_valid():
            horas = form.save(commit=False)
            horas.pago_hora = Decimal('55.0')
            horas.save()
            if horas.total_pago > 0:
                Gasto.objects.create(
                    tipo="NOMINA",
                    descripcion=f"Horas extra {horas.empleado} ({horas.semana_inicio} - {horas.semana_fin})",
                    monto=horas.total_pago,
                    fecha=horas.semana_fin
                )
            return redirect(f"{reverse('lista_nomina')}?recibo_horas_extra={horas.id}")
    return render(request, 'nomina/horas_extra_form.html', {
        'form': form,
        'preview': preview,
    })


@login_required
def pagar_horas_extra(request, id):
    horas = get_object_or_404(HorasExtra, id=id)
    horas.pagado = True
    horas.fecha_pago = timezone.now().date()
    horas.save()
    messages.success(request, "Horas extra pagadas")
    return redirect('lista_horas_extra')


@login_required
def recibo_horas_extra_pdf(request, horas_id):
    horas = get_object_or_404(HorasExtra, id=horas_id)
    html_string = render_to_string('nomina/recibo_horas_extra.html', {
        'horas': horas,
        'fecha': date.today(),
    })
    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = 'inline; filename="recibo_horas_extra.pdf"'
    HTML(string=html_string).write_pdf(response)
    return response