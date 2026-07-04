import json
from datetime import date, timedelta, datetime
from decimal import Decimal

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.utils.timezone import now
from django.views.decorators.http import require_POST

from core.models import (
    Renta, PedidoFinanzas, Gasto, Compra, Cuenta, MovimientoContable,
    Empleado, RentaProducto, BitacoraMantenimiento, Producto
)
from core.forms import (
    GastoForm, CompraForm, MovimientoForm, TransferenciaForm, TraspasoEfectivoBancoForm
)
from core.models import calcular_total
from core.services import gastos as gastos_service
from core.views.helpers import get_caja_efectivo


@login_required
def contabilidad_home(request):
    categoria = request.GET.get("categoria")
    semana_param = request.GET.get("semana")
    if semana_param:
        lunes = date.fromisoformat(semana_param)
    else:
        hoy = date.today()
        lunes = hoy - timedelta(days=hoy.weekday())
    domingo = lunes + timedelta(days=6)
    pedidos = PedidoFinanzas.objects.select_related("renta").filter(
        renta__fecha_renta__gte=lunes,
        renta__fecha_renta__lte=domingo
    )
    gastos = Gasto.objects.filter(fecha__gte=lunes, fecha__lte=domingo)
    compras = Compra.objects.filter(fecha__gte=lunes, fecha__lte=domingo)
    pedidos_filtrados = []
    for p in pedidos:
        if categoria:
            productos = p.renta.rentaproductos.filter(producto__tipo=categoria)
            if productos.exists():
                pedidos_filtrados.append((p, productos))
        else:
            pedidos_filtrados.append((p, p.renta.rentaproductos.all()))
    total_ventas = sum(
        sum(rp.subtotal for rp in productos if rp.producto.tipo != "FLETE")
        for p, productos in pedidos_filtrados
    )
    total_fletes = sum(
        sum(rp.subtotal for rp in productos if rp.producto.tipo == "FLETE")
        for p, productos in pedidos_filtrados
    )
    total_pagado = sum(p.total for p, _ in pedidos_filtrados if p.pagado)
    total_pendiente = sum(p.total for p, _ in pedidos_filtrados if not p.pagado)
    total_gastos = sum(g.monto for g in gastos)
    total_compras = sum(c.monto for c in compras)
    saldo = total_pagado - total_gastos - total_compras
    return render(request, "core/contabilidad_home.html", {
        "pedidos": pedidos_filtrados,
        "gastos": gastos,
        "compras": compras,
        "total_ventas": total_ventas,
        "total_fletes": total_fletes,
        "total_pagado": total_pagado,
        "total_pendiente": total_pendiente,
        "total_gastos": total_gastos,
        "total_compras": total_compras,
        "saldo": saldo,
        "categoria_filtrada": categoria,
        "lunes": lunes,
        "domingo": domingo,
        "lunes_anterior": lunes - timedelta(days=7),
        "lunes_siguiente": lunes + timedelta(days=7),
        "module": 'admin',
    })


@login_required
def marcar_pagado(request, renta_id):
    metodo_pago = request.POST.get("metodo_pago")
    cuenta_id = request.POST.get("cuenta")
    if not metodo_pago:
        messages.error(request, "Selecciona un método de pago.")
        return redirect("pedidos_semana")
    if not cuenta_id:
        messages.error(request, "Debes seleccionar una cuenta.")
        return redirect("pedidos_semana")
    cuenta = get_object_or_404(Cuenta, id=cuenta_id)
    mp = (metodo_pago or "").lower().strip()
    tipo = (cuenta.tipo or "").lower().strip()
    if mp == "transferencia" and tipo != "banco":
        messages.error(request, "Selecciona una cuenta bancaria.")
        return redirect("pedidos_semana")
    if mp == "efectivo" and tipo != "efectivo":
        messages.error(request, "Selecciona una cuenta de efectivo.")
        return redirect("pedidos_semana")
    renta = get_object_or_404(Renta, id=renta_id)
    pedido, _ = PedidoFinanzas.objects.get_or_create(renta=renta)
    total_renta = calcular_total(renta)
    saldo = total_renta - (renta.anticipo or 0)
    if saldo <= 0:
        messages.error(request, "La renta no tiene saldo pendiente.")
        return redirect("pedidos_semana")
    with transaction.atomic():
        pedido.total = saldo
        pedido.pagado = True
        pedido.metodo_pago = metodo_pago
        pedido.fecha_pago = timezone.now()
        pedido.cuenta_destino = cuenta
        pedido.save()
        MovimientoContable.objects.create(
            pedido=pedido,
            tipo="INGRESO",
            monto=saldo,
            metodo_pago=metodo_pago,
            cuenta=cuenta,
            fecha=pedido.fecha_pago,
            descripcion=f"Liquidación renta #{renta.folio or renta.id}"
        )
        renta.pagado = True
        renta.save(update_fields=["pagado"])
    messages.success(request, "Pago registrado correctamente.")
    return redirect(request.META.get('HTTP_REFERER', 'pedidos_semana'))


@login_required
def marcar_pendiente(request, renta_id):
    renta = get_object_or_404(Renta, id=renta_id)
    pedido = get_object_or_404(PedidoFinanzas, renta=renta)
    pedido.pagado = False
    pedido.metodo_pago = None
    pedido.cuenta_destino = None
    pedido.fecha_pago = None
    pedido.save()
    pedido.movimientos.all().delete()
    messages.info(request, "Pedido marcado como pendiente.")
    return redirect(request.META.get('HTTP_REFERER', 'pedidos_semana'))


@login_required
def pedidos_semana(request):
    semana_inicio_str = request.GET.get("semana_inicio")
    busqueda = request.GET.get("q", "").strip()
    hoy = timezone.localdate()
    if semana_inicio_str:
        try:
            inicio = date.fromisoformat(semana_inicio_str)
        except ValueError:
            inicio = hoy - timedelta(days=hoy.weekday())
    else:
        inicio = hoy - timedelta(days=hoy.weekday())
    fin = inicio + timedelta(days=6)
    tipo_filtrado = request.GET.get("tipo")
    rentas_qs = (
        Renta.objects
        .filter(fecha_renta__range=[inicio, fin], status='ACTIVO')
        .select_related("cliente", "finanza", "finanza__cuenta_destino")
        .prefetch_related("rentaproductos", "rentaproductos__producto")
    )
    if busqueda:
        rentas_qs = rentas_qs.filter(
            Q(cliente__nombre__icontains=busqueda) |
            Q(cliente__telefono__icontains=busqueda) |
            Q(folio__icontains=busqueda)
        )
    rentas = []
    for r in rentas_qs:
        productos = list(r.rentaproductos.all())
        if tipo_filtrado:
            productos = [rp for rp in productos if rp.producto.tipo == tipo_filtrado]
        if not productos:
            continue
        rentas.append((r, productos))
    total_ventas = sum(r.finanza.total for r, _ in rentas if r.finanza)
    total_fletes = sum(
        rp.subtotal for _, productos in rentas
        for rp in productos if rp.producto.tipo == "FL"
    )
    total_pagado = sum(r.finanza.total for r, _ in rentas if r.finanza and r.finanza.pagado)
    total_pendiente = sum(r.finanza.total for r, _ in rentas if r.finanza and not r.finanza.pagado)
    return render(request, "core/pedidos_semana.html", {
        "rentas": rentas,
        "inicio_semana": inicio,
        "fin_semana": fin,
        "total_ventas": total_ventas,
        "total_fletes": total_fletes,
        "total_pagado": total_pagado,
        "total_pendiente": total_pendiente,
        "semana_anterior": inicio - timedelta(days=7),
        "semana_siguiente": inicio + timedelta(days=7),
        "cuentas": Cuenta.objects.filter(activa=True),
        "empleados": Empleado.objects.filter(activo=True),
        "module": "admin"
    })


@login_required
def lista_gastos(request):
    hoy = now().date()
    semana_str = request.GET.get('semana')
    if semana_str:
        lunes = datetime.strptime(semana_str, '%Y-%m-%d').date()
    else:
        lunes = hoy - timedelta(days=hoy.weekday())
    domingo = lunes + timedelta(days=6)
    tipo = request.GET.get('tipo')
    categoria = request.GET.get('categoria')
    gastos = Gasto.objects.filter(fecha__range=[lunes, domingo])
    if tipo:
        gastos = gastos.filter(tipo=tipo)
    if categoria:
        gastos = gastos.filter(categoria=categoria)
    gastos = gastos.order_by('fecha')
    total_semana = sum(g.monto for g in gastos)
    return render(request, 'core/lista_gastos.html', {
        'gastos': gastos,
        'lunes': lunes,
        'domingo': domingo,
        'lunes_anterior': lunes - timedelta(days=7),
        'lunes_siguiente': lunes + timedelta(days=7),
        'total_semana': total_semana,
        'tipo_seleccionado': tipo,
        'categoria_seleccionada': categoria,
        'tipos': Gasto.TIPO,
        'categorias': Gasto.CATEGORIA,
        "module": 'admin',
    })


@login_required
def nuevo_gasto(request):
    if request.method == 'POST':
        form = GastoForm(request.POST)
        if form.is_valid():
            cd = form.cleaned_data
            try:
                gastos_service.crear_gasto({
                    'tipo': cd['tipo'],
                    'categoria': cd['categoria'],
                    'cuenta': cd['cuenta'].id if cd.get('cuenta') else None,
                    'descripcion': cd['descripcion'],
                    'monto': cd['monto'],
                    'fecha': cd['fecha'],
                })
                messages.success(request, "Gasto registrado correctamente.")
                return redirect('lista_gastos')
            except ValueError as e:
                form.add_error(None, str(e))
    else:
        form = GastoForm()
    return render(request, 'core/nuevo_gasto.html', {'form': form, 'titulo': 'Registrar Gasto'})


@login_required
def editar_gasto(request, gasto_id):
    gasto = get_object_or_404(Gasto, id=gasto_id)
    if gasto.nomina_id:
        messages.error(request, "No puedes editar gastos generados automáticamente por nómina.")
        return redirect('lista_gastos')
    if request.method == 'POST':
        form = GastoForm(request.POST, instance=gasto)
        if form.is_valid():
            cd = form.cleaned_data
            try:
                gastos_service.actualizar_gasto(gasto, {
                    'tipo': cd['tipo'],
                    'categoria': cd['categoria'],
                    'cuenta': cd['cuenta'].id if cd.get('cuenta') else None,
                    'descripcion': cd['descripcion'],
                    'monto': cd['monto'],
                    'fecha': cd['fecha'],
                })
                messages.success(request, "Gasto actualizado correctamente.")
                return redirect('lista_gastos')
            except ValueError as e:
                form.add_error(None, str(e))
    else:
        form = GastoForm(instance=gasto)
    return render(request, 'core/nuevo_gasto.html', {'form': form, 'titulo': 'Editar Gasto'})


@login_required
def eliminar_gasto(request, gasto_id):
    gasto = get_object_or_404(Gasto, id=gasto_id)
    if request.method == 'POST':
        if gasto.nomina_id:
            messages.error(request, "No puedes eliminar gastos generados automáticamente por nómina.")
            return redirect('lista_gastos')
        gastos_service.eliminar_gasto(gasto)
        messages.success(request, "Gasto eliminado correctamente.")
        return redirect('lista_gastos')
    return render(request, 'core/eliminar_gasto.html', {'gasto': gasto})


@login_required
def lista_compras(request):
    compras = Compra.objects.all().order_by('-fecha')
    return render(request, 'core/lista_compras.html', {'compras': compras, "module": 'admin'})


@login_required
def nueva_compra(request):
    if request.method == 'POST':
        form = CompraForm(request.POST)
        if form.is_valid():
            compra = form.save(commit=False)
            cuenta = form.cleaned_data.get('cuenta')
            compra.save()
            MovimientoContable.objects.create(
                tipo='EGRESO',
                monto=compra.monto,
                metodo_pago='efectivo' if cuenta is None else 'transferencia',
                cuenta=cuenta,
                fecha=timezone.now(),
                descripcion=f'Compra: {compra.concepto}'
            )
            messages.success(request, "Compra registrada correctamente.")
            return redirect('lista_compras')
    else:
        form = CompraForm()
    return render(request, 'core/nueva_compra.html', {'form': form, 'titulo': 'Registrar Compra'})


@login_required
def editar_compra(request, compra_id):
    compra = get_object_or_404(Compra, id=compra_id)
    if request.method == 'POST':
        form = CompraForm(request.POST, instance=compra)
        if form.is_valid():
            form.save()
            messages.success(request, "Compra actualizada correctamente.")
            return redirect('lista_compras')
    else:
        form = CompraForm(instance=compra)
    return render(request, 'core/nueva_compra.html', {'form': form, 'titulo': 'Editar Compra'})


@login_required
def eliminar_compra(request, compra_id):
    compra = get_object_or_404(Compra, id=compra_id)
    if request.method == 'POST':
        compra.delete()
        messages.success(request, "Compra eliminada correctamente.")
        return redirect('lista_compras')
    return render(request, 'core/eliminar_compra.html', {'compra': compra})


@login_required
def lista_cuentas(request):
    cuentas = Cuenta.objects.all()
    return render(request, 'core/lista_cuentas.html', {'cuentas': cuentas, "module": 'admin'})


@login_required
def nueva_cuenta(request):
    if request.method == 'POST':
        Cuenta.objects.create(
            nombre=request.POST['nombre'],
            banco=request.POST['banco'],
            numero=request.POST.get('numero', ''),
            activa=True
        )
        messages.success(request, 'Cuenta creada correctamente')
        return redirect('lista_cuentas')
    return render(request, 'core/nueva_cuenta.html')


@login_required
def balance_cuentas(request):
    cuentas = Cuenta.objects.filter(activa=True)
    caja = cuentas.filter(tipo__iexact='efectivo').first()
    bancos = cuentas.filter(tipo__iexact='banco')
    saldo_cash = caja.saldo_actual() if caja else 0
    saldo_bancos = sum(c.saldo_actual() for c in bancos)
    total = saldo_cash + saldo_bancos
    return render(request, 'finanzas/balance_cuentas.html', {
        'cuentas': cuentas,
        'saldo_efectivo': saldo_cash,
        'saldo_bancos': saldo_bancos,
        'total': total,
        "module": 'admin',
    })


@login_required
def movimientos_cuenta(request, cuenta_id):
    cuenta = Cuenta.objects.get(id=cuenta_id)
    movimientos = MovimientoContable.objects.filter(cuenta=cuenta).order_by('-fecha')
    return render(request, 'finanzas/movimientos_cuenta.html', {
        'cuenta': cuenta,
        'movimientos': movimientos
    })


@login_required
def registrar_movimiento(request):
    if request.method == 'POST':
        form = MovimientoForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('balance_cuentas')
    else:
        form = MovimientoForm()
    return render(request, 'finanzas/registrar_movimiento.html', {'form': form})


@login_required
def transferencia_cuentas(request):
    if request.method == 'POST':
        form = TransferenciaForm(request.POST)
        if form.is_valid():
            origen = form.cleaned_data['cuenta_origen']
            destino = form.cleaned_data['cuenta_destino']
            monto = form.cleaned_data['monto']
            descripcion = form.cleaned_data['descripcion']
            MovimientoContable.objects.create(
                pedido=None, tipo='EGRESO', monto=monto,
                metodo_pago='TRANSFERENCIA', cuenta=origen,
                fecha=timezone.now(),
                descripcion=f"Transferencia a {destino.nombre}. {descripcion}"
            )
            MovimientoContable.objects.create(
                pedido=None, tipo='INGRESO', monto=monto,
                metodo_pago='TRANSFERENCIA', cuenta=destino,
                fecha=timezone.now(),
                descripcion=f"Transferencia desde {origen.nombre}. {descripcion}"
            )
            return redirect('balance_cuentas')
    else:
        form = TransferenciaForm()
    return render(request, 'finanzas/transferencia.html', {'form': form})


@login_required
def transferir_entre_cuentas(request):
    if request.method == "POST":
        form = TransferenciaForm(request.POST)
        if form.is_valid():
            origen = form.cleaned_data['cuenta_origen']
            destino = form.cleaned_data['cuenta_destino']
            monto = form.cleaned_data['monto']
            descripcion = form.cleaned_data['descripcion']
            MovimientoContable.objects.create(
                pedido=None, tipo='EGRESO', monto=monto,
                metodo_pago='TRANSFERENCIA', cuenta=origen,
                fecha=timezone.now(),
                descripcion=f"Transferencia a {destino}: {descripcion}"
            )
            MovimientoContable.objects.create(
                pedido=None, tipo='INGRESO', monto=monto,
                metodo_pago='TRANSFERENCIA', cuenta=destino,
                fecha=timezone.now(),
                descripcion=f"Transferencia de {origen}: {descripcion}"
            )
            return redirect('balance_cuentas')
    else:
        form = TransferenciaForm()
    return render(request, 'finanzas/transferencia.html', {'form': form})


@login_required
def movimientos_efectivo(request):
    caja = get_caja_efectivo()
    movimientos = MovimientoContable.objects.filter(cuenta=caja).order_by('-fecha')
    return render(request, 'finanzas/movimientos_efectivo.html', {'movimientos': movimientos})


@login_required
def traspaso_efectivo_banco(request):
    if request.method == 'POST':
        form = TraspasoEfectivoBancoForm(request.POST)
        if form.is_valid():
            origen = form.cleaned_data['origen_tipo']
            cuenta = form.cleaned_data['cuenta_banco']
            monto = form.cleaned_data['monto']
            descripcion = form.cleaned_data['descripcion']
            now_time = timezone.now()
            caja = get_caja_efectivo()
            if not caja:
                messages.error(request, "No existe una cuenta de caja configurada.")
                return redirect('balance_cuentas')
            if origen == 'EFECTIVO':
                MovimientoContable.objects.create(
                    pedido=None, tipo='EGRESO', monto=monto,
                    metodo_pago='efectivo', cuenta=caja, fecha=now_time,
                    descripcion=f"Traspaso a banco {cuenta.nombre}. {descripcion}"
                )
                MovimientoContable.objects.create(
                    pedido=None, tipo='INGRESO', monto=monto,
                    metodo_pago='transferencia', cuenta=cuenta, fecha=now_time,
                    descripcion="Traspaso desde efectivo"
                )
            else:
                MovimientoContable.objects.create(
                    pedido=None, tipo='EGRESO', monto=monto,
                    metodo_pago='transferencia', cuenta=cuenta, fecha=now_time,
                    descripcion="Retiro a efectivo"
                )
                MovimientoContable.objects.create(
                    pedido=None, tipo='INGRESO', monto=monto,
                    metodo_pago='efectivo', cuenta=caja, fecha=now_time,
                    descripcion=f"Traspaso desde banco {cuenta.nombre}. {descripcion}"
                )
            return redirect('balance_cuentas')
    else:
        form = TraspasoEfectivoBancoForm()
    return render(request, 'finanzas/traspaso_efectivo_banco.html', {'form': form})


@login_required
def bitacora_list(request):
    from datetime import date
    hoy = date.today()
    q = request.GET.get("q", "").strip()
    estado = request.GET.get("estado", "")  # 'limpio', 'sucio', ''

    # Solo brincolines
    brincolines = Producto.objects.filter(tipo='BR', activo=True)
    for p in brincolines:
        BitacoraMantenimiento.objects.get_or_create(producto=p)

    # Solo brincolines
    bitacoras = BitacoraMantenimiento.objects.select_related("producto").filter(
        producto__tipo='BR',
        producto__activo=True
    )

    if q:
        bitacoras = bitacoras.filter(producto__nombre__icontains=q)

    # Anotar próxima renta y última renta a cada bitácora
    bitacora_list = []
    for b in bitacoras:
        # Próxima renta (futura)
        proxima = RentaProducto.objects.filter(
            producto=b.producto,
            renta__fecha_renta__gte=hoy,
            renta__status='ACTIVO'
        ).order_by('renta__fecha_renta').first()
        b.proxima_renta = proxima.renta.fecha_renta if proxima else None

        # Última renta (pasada)
        b.ultima_renta = RentaProducto.obtener_fecha_ultima_renta(b.producto)

        # Estado: sucio = sin mantenimiento desde última renta
        b.necesita_limpieza = (
            b.ultima_renta and (
                not b.fecha_ultimo_mantenimiento or
                b.fecha_ultimo_mantenimiento < b.ultima_renta
            )
        )
        bitacora_list.append(b)

    # Filtro por estado
    if estado == 'sucio':
        bitacora_list = [b for b in bitacora_list if b.necesita_limpieza]
    elif estado == 'limpio':
        bitacora_list = [b for b in bitacora_list if not b.necesita_limpieza]

    # Ordenar: primero los que tienen próxima renta más cercana
    bitacora_list.sort(key=lambda b: (
        b.proxima_renta is None,
        b.proxima_renta or date.max
    ))

    return render(request, "core/bitacora_list.html", {
        "bitacoras": bitacora_list,
        "q": q,
        "estado": estado,
        "module": 'ventas',
    })


@login_required
@require_POST
def marcar_mantenimiento(request):
    data = json.loads(request.body)
    producto_id = data.get("producto_id")
    notas = data.get("notas", "")
    producto = get_object_or_404(Producto, id=producto_id)
    fecha_ultima_renta = RentaProducto.obtener_fecha_ultima_renta(producto)
    mant, created = BitacoraMantenimiento.objects.update_or_create(
        producto=producto,
        defaults={
            "fecha_ultima_renta": fecha_ultima_renta,
            "fecha_ultimo_mantenimiento": timezone.now().date(),
            "notas": notas
        }
    )
    return JsonResponse({
        "status": "ok",
        "fecha_ultimo_mantenimiento": mant.fecha_ultimo_mantenimiento.strftime("%Y-%m-%d"),
        "fecha_ultima_renta": mant.fecha_ultima_renta.strftime("%Y-%m-%d") if mant.fecha_ultima_renta else None
    })