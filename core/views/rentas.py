import json
import weasyprint
from datetime import date, timedelta, datetime
from decimal import Decimal

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib import messages
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Q, Case, When, Value, IntegerField
from django.http import HttpResponse, JsonResponse
from django.template.loader import render_to_string
from django.templatetags.static import static
from django.urls import reverse
from django.utils import timezone

from core.models import (
    Renta, RentaProducto, Producto, Cliente, Cuenta,
    MovimientoContable, PedidoFinanzas, OcupacionDia, BitacoraMantenimiento
)
from core.forms import RentaForm
from core.decorators import solo_admin, no_coordinador
from core.services.ocupacion import recalcular_ocupacion_producto_dia


@login_required
@solo_admin
@no_coordinador
def lista_rentas(request):
    user = request.user
    hoy = timezone.localdate()
    query = request.GET.get("q", "").strip()
    fecha = request.GET.get("fecha", "").strip()
    rentas = Renta.objects.select_related("cliente")
    es_cargador = request.user.groups.filter(name="Cargador").exists()
    if es_cargador:
        rentas = rentas.filter(asignado_a=user)
    if query:
        rentas = rentas.filter(
            Q(folio__icontains=query) |
            Q(cliente__nombre__icontains=query)
        )
    if fecha:
        rentas = rentas.filter(fecha_renta=fecha)
    rentas = rentas.annotate(
        prioridad=Case(
            When(fecha_renta__gte=hoy, then=Value(1)),
            default=Value(2),
            output_field=IntegerField(),
        )
    ).order_by("prioridad", "fecha_renta")
    paginator = Paginator(rentas, 25)
    page_obj = paginator.get_page(request.GET.get("page"))
    return render(request, "core/lista_rentas.html", {
        "page_obj": page_obj,
        "es_cargador": es_cargador,
        "query": query,
        "fecha": fecha,
        "module": 'ventas',
    })


@login_required
def marcar_recolectado(request, pk):
    renta = get_object_or_404(Renta, pk=pk)
    if request.method == "POST":
        renta.fecha_recoleccion = request.POST.get("fecha_recoleccion")
        renta.recolectado_por_id = request.POST.get("empleado")
        renta.recolectado = True
        renta.save()
        messages.success(request, "Pedido marcado como recolectado")
    return redirect(request.META.get('HTTP_REFERER', 'pedidos_semana'))


@login_required
def ocupacion_productos(request):
    week_str = request.GET.get('week')
    try:
        base_date = date.fromisoformat(week_str) if week_str else date.today()
    except ValueError:
        base_date = date.today()
    inicio = base_date - timedelta(days=base_date.weekday())
    fin = inicio + timedelta(days=6)
    dias = [inicio + timedelta(days=i) for i in range(7)]
    filtro = request.GET.get("filtro", "todos")
    data = []
    ocupaciones = OcupacionDia.objects.filter(fecha__range=[inicio, fin])
    ocupacion_map = {(o.producto_id, o.fecha): o.estado for o in ocupaciones}
    for producto in Producto.objects.all():
        estados = []
        mostrar_producto = False
        for dia in dias:
            estado = ocupacion_map.get((producto.id, dia), 'LIBRE')
            estados.append({"fecha": dia, "estado": estado})
            if filtro == "todos" and estado in ("PARCIAL", "LLENO"):
                mostrar_producto = True
            elif filtro == "lleno" and estado == "LLENO":
                mostrar_producto = True
            elif filtro == "parcial" and estado == "PARCIAL":
                mostrar_producto = True
        if mostrar_producto:
            data.append({"producto": producto, "estados": estados})
    return render(request, "core/ocupacion_productos.html", {
        "dias": dias,
        "data": data,
        "filtro": filtro,
        "inicio": inicio,
        "fin": fin,
        "prev_week": inicio - timedelta(days=7),
        "next_week": inicio + timedelta(days=7),
        "module": 'ventas',
    })


@login_required
def ocupacion_por_fecha(request, fecha):
    try:
        fecha_obj = datetime.strptime(fecha, "%Y-%m-%d").date()
        rentas_productos = RentaProducto.objects.filter(
            renta__fecha_renta=fecha_obj
        ).select_related("producto")
        data = []
        for rp in rentas_productos:
            try:
                mant = BitacoraMantenimiento.objects.get(producto=rp.producto)
                ultima_renta = mant.fecha_ultima_renta.strftime("%Y-%m-%d") if mant.fecha_ultima_renta else None
                ultimo_mant = mant.fecha_ultimo_mantenimiento.strftime("%Y-%m-%d") if mant.fecha_ultimo_mantenimiento else None
            except BitacoraMantenimiento.DoesNotExist:
                ultima_renta = None
                ultimo_mant = None
            data.append({
                "producto_id": rp.producto.id,
                "nombre": rp.producto.nombre,
                "cantidad_rentada": rp.cantidad,
                "fecha_ultima_renta": ultima_renta,
                "fecha_ultimo_mantenimiento": ultimo_mant
            })
        return JsonResponse(data, safe=False)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@login_required
@solo_admin
@no_coordinador
def nueva_renta(request):
    productos = Producto.objects.filter(activo=True)
    clientes = Cliente.objects.all()
    cuentas = Cuenta.objects.all()
    from django.core.serializers.json import DjangoJSONEncoder
    productos_catalogo_json = json.dumps(
        list(productos.values("id", "nombre", "precio")), cls=DjangoJSONEncoder
    )
    clientes_json = json.dumps(
        list(clientes.values("id", "nombre", "telefono", "calle_y_numero", "colonia", "ciudad_o_municipio")),
        cls=DjangoJSONEncoder
    )
    if request.method == "POST":
        fecha = request.POST.get("fecha_renta")
        hora_inicio = request.POST.get("hora_inicio")
        hora_fin = request.POST.get("hora_fin")
        telefono = request.POST.get("cliente_telefono", "").strip()
        nombre = request.POST.get("cliente_nombre", "").strip()
        anticipo = Decimal(request.POST.get("anticipo") or "0")
        metodo_pago = request.POST.get("metodo_pago_anticipo")
        cuenta_id = request.POST.get("cuenta_anticipo")
        if not fecha or not hora_inicio or not hora_fin or not telefono:
            messages.error(request, "Debes capturar teléfono, fecha y horario.")
            return redirect("nueva_renta")
        cliente = Cliente.objects.filter(telefono=telefono).first()
        if not cliente:
            if not nombre:
                messages.error(request, "El nombre es obligatorio para crear un nuevo cliente.")
                return redirect("nueva_renta")
            cliente = Cliente.objects.create(
                telefono=telefono,
                nombre=nombre,
                calle_y_numero=request.POST.get("calle_y_numero", ""),
                colonia=request.POST.get("colonia", ""),
                ciudad_o_municipio=request.POST.get("ciudad_o_municipio", "")
            )
        cuenta = None
        if anticipo > 0:
            if metodo_pago == "transferencia":
                cuenta = Cuenta.objects.filter(id=cuenta_id).first()
            else:
                cuenta = Cuenta.objects.filter(tipo__iexact="efectivo").first()
            if not cuenta:
                messages.error(request, "Cuenta inválida para el anticipo.")
                return redirect("nueva_renta")
        productos_data = request.POST.get("productos_data")
        if not productos_data:
            messages.error(request, "Debes agregar al menos un producto a la renta.")
            return redirect("nueva_renta")
        productos_list = json.loads(productos_data)
        try:
            with transaction.atomic():
                for p in productos_list:
                    producto = Producto.objects.select_for_update().get(id=p["id"])
                    cantidad = int(p.get("cantidad", 1))
                    disponible = producto.stock_disponible_en_horario(fecha, hora_inicio, hora_fin)
                    if cantidad > disponible:
                        raise ValueError(f"Solo hay {disponible} disponibles de '{producto.nombre}'.")
                renta = Renta.objects.create(
                    cliente=cliente,
                    fecha_renta=fecha,
                    hora_inicio=hora_inicio,
                    hora_fin=hora_fin,
                    calle_y_numero=request.POST.get("calle_y_numero", ""),
                    colonia=request.POST.get("colonia", ""),
                    ciudad_o_municipio=request.POST.get("ciudad_o_municipio", ""),
                    comentarios=request.POST.get("comentarios", ""),
                    precio_total=Decimal("0.00"),
                    anticipo=anticipo,
                    pagado=False,
                    status="ACTIVO"
                )
                total = Decimal("0.00")
                for p in productos_list:
                    producto = Producto.objects.get(id=p["id"])
                    cantidad = int(p.get("cantidad", 1))
                    precio_unitario = Decimal(str(p.get("precio_unitario", producto.precio)))
                    rp = RentaProducto.objects.create(
                        renta=renta,
                        producto=producto,
                        cantidad=cantidad,
                        precio_lista=producto.precio,
                        precio_unitario=precio_unitario,
                        nota=p.get("nota", "")
                    )
                    total += rp.subtotal
                renta.precio_total = total
                renta.save()
                if anticipo > 0:
                    MovimientoContable.objects.create(
                        tipo="INGRESO",
                        monto=anticipo,
                        metodo_pago=metodo_pago,
                        cuenta=cuenta,
                        fecha=timezone.now(),
                        descripcion=f"Anticipo renta #{renta.folio or renta.id}"
                    )
                pedido, _ = PedidoFinanzas.objects.get_or_create(renta=renta)
                pedido.total = renta.precio_total - renta.anticipo
                pedido.save()
            messages.success(request, f"Renta creada correctamente (ID: {renta.id})")
            return redirect(f"{reverse('nueva_renta')}?renta_creada={renta.id}")
        except ValueError as e:
            messages.error(request, str(e))
            return redirect("nueva_renta")
    form = RentaForm()
    return render(request, "core/form_renta.html", {
        "form": form,
        "clientes_json": clientes_json,
        "productos_catalogo_json": productos_catalogo_json,
        "productos_data": json.dumps([]),
        "editando": False,
        "cuentas": cuentas,
    })


@login_required
@solo_admin
def editar_renta(request, renta_id):
    renta = get_object_or_404(Renta, id=renta_id)
    cuentas = Cuenta.objects.all()
    if renta.estado_entrega in ['EN_RUTA', 'ENTREGADO'] and request.method == 'POST':
        messages.error(request, 'No puedes modificar una renta que ya está en ruta o entregada.')
        return redirect('lista_rentas')
    anticipo_anterior = renta.anticipo or Decimal('0.00')
    if request.method == 'POST':
        form = RentaForm(request.POST, instance=renta)
        cliente_id = request.POST.get("cliente_id")
        if not cliente_id:
            messages.error(request, "Debes seleccionar un cliente válido.")
            return redirect(request.path)
        if form.is_valid():
            try:
                with transaction.atomic():
                    anticipo_nuevo = Decimal(request.POST.get('anticipo') or '0')
                    diferencia_anticipo = anticipo_nuevo - anticipo_anterior
                    renta = form.save(commit=False)
                    renta.anticipo = anticipo_nuevo
                    renta.save()
                    if diferencia_anticipo != 0:
                        metodo_pago = request.POST.get('metodo_pago_anticipo')
                        cuenta_id = request.POST.get('cuenta_anticipo')
                        if metodo_pago == "transferencia":
                            cuenta = Cuenta.objects.filter(id=cuenta_id).first()
                        else:
                            cuenta = Cuenta.objects.filter(tipo__iexact="efectivo").first()
                        if not cuenta:
                            raise ValueError("No se encontró cuenta válida.")
                        MovimientoContable.objects.create(
                            tipo='INGRESO' if diferencia_anticipo > 0 else 'EGRESO',
                            monto=abs(diferencia_anticipo),
                            metodo_pago=metodo_pago,
                            cuenta=cuenta,
                            fecha=timezone.now(),
                            descripcion=f"Ajuste de anticipo renta #{renta.folio}"
                        )
                    for rp in renta.rentaproductos.select_related('producto'):
                        rp.producto.liberar_stock(rp.cantidad)
                    renta.rentaproductos.all().delete()
                    productos_json = request.POST.get('productos_data')
                    total = 0
                    if productos_json:
                        productos = json.loads(productos_json)
                        for p in productos:
                            producto = Producto.objects.select_for_update().get(id=p['id'])
                            cantidad = int(p['cantidad'])
                            if not producto.activo:
                                raise ValueError(f'El producto {producto.nombre} no está activo.')
                            disponible = producto.stock_disponible_en_horario(
                                renta.fecha_renta, renta.hora_inicio, renta.hora_fin
                            )
                            if cantidad > disponible:
                                raise ValueError(f'Solo hay {disponible} disponibles de {producto.nombre} en ese horario.')
                            producto.reservar_stock(cantidad)
                            RentaProducto.objects.create(
                                renta=renta,
                                producto=producto,
                                cantidad=cantidad,
                                precio_unitario=Decimal(str(p.get('precio_unitario', producto.precio))),
                                subtotal=Decimal(str(p.get('precio_unitario', producto.precio))) * cantidad
                            )
                            total += producto.precio * cantidad
                    precio_manual = form.cleaned_data.get('precio_total')
                    renta.precio_total = precio_manual if precio_manual is not None else total
                    renta.save()
                    pedido, _ = PedidoFinanzas.objects.get_or_create(renta=renta)
                    pedido.total = renta.precio_total - renta.anticipo
                    pedido.save()
                messages.success(request, 'Renta actualizada correctamente.')
                return redirect('lista_rentas')
            except ValueError as e:
                messages.error(request, str(e))
                return redirect('editar_renta', renta_id=renta.id)
        messages.error(request, "Hay errores en el formulario")
    else:
        form = RentaForm(instance=renta)
    productos_data = [
        {'id': rp.producto.id, 'nombre': rp.producto.nombre,
         'precio_unitario': float(rp.precio_unitario), 'cantidad': rp.cantidad}
        for rp in renta.rentaproductos.select_related('producto')
    ]
    clientes = Cliente.objects.all()
    productos_catalogo = Producto.objects.filter(activo=True)
    return render(request, 'core/form_renta.html', {
        'form': form,
        'renta': renta,
        'productos_data': json.dumps(productos_data),
        'clientes_json': json.dumps([
            {'id': c.id, 'telefono': c.telefono, 'nombre': c.nombre,
             'calle_y_numero': c.calle_y_numero, 'colonia': c.colonia,
             'ciudad_o_municipio': c.ciudad_o_municipio}
            for c in clientes
        ]),
        'productos_catalogo_json': json.dumps([
            {'id': p.id, 'nombre': p.nombre, 'precio': float(p.precio)}
            for p in productos_catalogo
        ]),
        'editando': True,
        'cuentas': cuentas
    })


@login_required
@solo_admin
def cancelar_renta(request, renta_id):
    renta = get_object_or_404(Renta, id=renta_id)
    if renta.estado_entrega == 'ENTREGADO':
        messages.error(request, 'No puedes cancelar una renta ya entregada.')
        return redirect('lista_rentas')
    try:
        with transaction.atomic():
            for rp in renta.rentaproductos.select_for_update():
                rp.producto.liberar_stock(rp.cantidad)
                recalcular_ocupacion_producto_dia(rp.producto, renta.fecha_renta)
            renta.estado_entrega = 'CANCELADO'
            renta.status = 'CANCELADO'
            renta.save(update_fields=['estado_entrega', 'status'])
        messages.success(request, f'Renta {renta.folio} cancelada y ocupación actualizada correctamente.')
    except Exception as e:
        messages.error(request, 'Ocurrió un error al cancelar la renta. Intenta de nuevo.')
    return redirect('lista_rentas')


@login_required
def ticket_pdf(request, renta_id):
    renta = get_object_or_404(Renta, id=renta_id)
    productos = []
    total = float(renta.precio_total or 0)
    anticipo = float(renta.anticipo or 0)
    restante = total - anticipo
    for rp in RentaProducto.objects.filter(renta=renta):
        subtotal = float(rp.precio_unitario) * rp.cantidad
        productos.append({
            'nombre': rp.producto.nombre,
            'cantidad': rp.cantidad,
            'precio': float(rp.precio_unitario),
            'subtotal': subtotal
        })
    logo_url = request.build_absolute_uri(static('img/trota_logo.jpeg'))
    html = render_to_string('core/ticket_renta.html', {
        'renta': renta,
        'productos': productos,
        'total': total,
        'anticipo': anticipo,
        'restante': restante,
        'logo_url': logo_url
    })
    pdf = weasyprint.HTML(string=html).write_pdf()
    return HttpResponse(pdf, content_type='application/pdf')