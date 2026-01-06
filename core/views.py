from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse, HttpResponse
from .models import Ruta
from .decorators import solo_admin
from .models import Cliente, Producto, Renta, RentaProducto, PedidoFinanzas, Gasto, Compra
from .forms import ClienteForm, ProductoForm, RentaForm, RentaProductoFormSet
from django.db.models import Q
from django.template.loader import render_to_string
import json
import weasyprint
from django.templatetags.static import static
from datetime import date, timedelta
from django.contrib.auth.decorators import login_required
from django.utils import timezone
from django.db.models import Case, When, Value, IntegerField
from django.contrib.auth.models import User
from core.decorators import solo_admin
from django.db import transaction
from django.contrib import messages


# -----------------------------
# HOME
# -----------------------------
@login_required
def home(request):
    return render(request, 'core/home.html')

@login_required
def home(request):
    es_cargador = request.user.groups.filter(name='cargador').exists()

    return render(request, 'core/home.html', {
        'es_cargador': es_cargador
    })


# -----------------------------
# CLIENTES
# -----------------------------
@login_required
def lista_clientes(request):
    clientes = Cliente.objects.all()
    return render(request, 'core/lista_clientes.html', {'clientes': clientes})


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


# -----------------------------
# PRODUCTOS
# -----------------------------
@login_required
def lista_productos(request):
    productos = Producto.objects.all()
    return render(request, 'core/lista_productos.html', {'productos': productos})


@login_required
def nuevo_producto(request):
    form = ProductoForm(request.POST or None)
    if form.is_valid():
        form.save()
        return redirect('lista_productos')
    return render(request, 'core/form_producto.html', {'form': form})


@login_required
def editar_producto(request, producto_id):
    producto = get_object_or_404(Producto, id=producto_id)
    form = ProductoForm(request.POST or None, instance=producto)
    if form.is_valid():
        form.save()
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


# -----------------------------
# RENTAS
# -----------------------------
@login_required
@solo_admin
def lista_rentas(request):
    user = request.user
    hoy = timezone.localdate()

    rentas = Renta.objects.all()

    # Si es Cargador, solo ve sus rentas asignadas
    es_cargador = request.user.groups.filter(name='Cargador').exists()

    rentas = rentas.annotate(
        prioridad=Case(
            When(fecha_renta__gte=hoy, then=Value(1)),
            default=Value(2),
            output_field=IntegerField(),
        )
    ).order_by(
        'prioridad',
        'fecha_renta'
    )

    return render(request, 'core/lista_rentas.html', {
        'rentas': rentas,
        'es_cargador': es_cargador,
    })

@login_required
@solo_admin
def nueva_renta(request):
    if request.method == "POST":
        renta = Renta.objects.create(
            cliente_id=request.POST.get("cliente"),
            fecha_renta=request.POST.get("fecha_renta"),
            hora_inicio=request.POST.get("hora_inicio"),
            hora_fin=request.POST.get("hora_fin"),
            calle_y_numero=request.POST.get("calle_y_numero"),
            colonia=request.POST.get("colonia"),
            ciudad_o_municipio=request.POST.get("ciudad_o_municipio"),
            comentarios=request.POST.get("comentarios",""),
            precio_total=float(request.POST.get("precio_total") or 0),
            anticipo=float(request.POST.get("anticipo") or 0),
            pagado=request.POST.get("pagado") == "on"
        )

        productos = json.loads(request.POST.get("productos_data", "[]"))
        for p in productos:
            producto = Producto.objects.get(id=p["id"])
            RentaProducto.objects.create(
                renta=renta,
                producto=producto,
                cantidad=p.get("cantidad", 1),
                precio_unitario=producto.precio,
                subtotal=producto.precio * p.get("cantidad", 1)
            )

        return redirect("ticket_pdf", renta_id=renta.id)

    return render(request, "core/form_renta.html", {"form": RentaForm()})


@login_required
@solo_admin
def editar_renta(request, renta_id):
    renta = get_object_or_404(Renta, id=renta_id)

    # 🔒 Bloqueo por estado
    if renta.estado_entrega in ['EN_RUTA', 'ENTREGADO'] and request.method == 'POST':
        messages.error(
            request,
            'No puedes modificar una renta que ya está en ruta o entregada.'
        )
        return redirect('lista_rentas')

    if request.method == 'POST':
        form = RentaForm(request.POST, instance=renta)

        if form.is_valid():
            try:
                with transaction.atomic():

                    renta = form.save(commit=False)
                    renta.save()

                    # ===== LIBERAR STOCK ANTERIOR =====
                    for rp in renta.rentaproductos.all():
                        rp.producto.liberar_stock(rp.cantidad)

                    renta.rentaproductos.all().delete()

                    # ===== PROCESAR NUEVOS PRODUCTOS =====
                    productos_json = request.POST.get('productos_data')
                    total = 0

                    if productos_json:
                        productos = json.loads(productos_json)

                        for p in productos:
                            producto = Producto.objects.select_for_update().get(
                                id=p['id']
                            )
                            cantidad = int(p['cantidad'])

                            # ❌ Producto inactivo
                            if not producto.activo:
                                raise ValueError(
                                    f'El producto {producto.nombre} no está activo.'
                                )

                            # ❌ Sin stock
                            if not producto.hay_stock(cantidad):
                                raise ValueError(
                                    f'No hay stock suficiente de {producto.nombre}.'
                                )

                            # ✅ Reservar stock
                            producto.reservar_stock(cantidad)

                            RentaProducto.objects.create(
                                renta=renta,
                                producto=producto,
                                cantidad=cantidad,
                                precio_unitario=producto.precio,
                                subtotal=producto.precio * cantidad
                            )

                            total += producto.precio * cantidad

                    renta.precio_total = total
                    renta.save()

                messages.success(request, 'Renta actualizada correctamente.')
                return redirect('lista_rentas')

            except ValueError as e:
                messages.error(request, str(e))
                return redirect('editar_renta', renta_id=renta.id)

    else:
        form = RentaForm(instance=renta)

    productos_data = [
        {
            'id': rp.producto.id,
            'nombre': rp.producto.nombre,
            'precio_unitario': float(rp.precio_unitario),
            'cantidad': rp.cantidad
        }
        for rp in renta.rentaproductos.all()
    ]

    return render(request, 'core/form_renta.html', {
        'form': form,
        'renta': renta,
        'productos_data': json.dumps(productos_data),
        'editando': True
    })


@login_required
@solo_admin
def cancelar_renta(request, renta_id):
    renta = get_object_or_404(Renta, id=renta_id)

    # 🔒 Validación: no se puede cancelar si ya fue entregada
    if renta.estado_entrega == 'ENTREGADO':
        messages.error(request, 'No puedes cancelar una renta ya entregada.')
        return redirect('lista_rentas')

    try:
        with transaction.atomic():
            # 🟢 Liberar stock de cada producto
            for rp in renta.rentaproductos.select_for_update():
                rp.producto.liberar_stock(rp.cantidad)

            # 🔄 Actualizar estado de entrega y status
            renta.estado_entrega = 'CANCELADO'
            renta.status = 'CANCELADO'
            renta.save(update_fields=['estado_entrega', 'status'])

        messages.success(request, f'Renta {renta.folio} cancelada y stock liberado correctamente.')

    except Exception as e:
        # 🔴 Registrar el error si quieres en logs
        print(f"Error al cancelar renta {renta.id}: {e}")
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

    return render(request, 'core/mi_ruta.html', {
        'ruta': ruta
    })

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

        Renta.objects.filter(
            id__in=rentas_ids
        ).update(ruta=ruta)

        return redirect('detalle_ruta', ruta_id=ruta.id)

    return render(request, 'core/asignar_rentas_ruta.html', {
        'ruta': ruta,
        'rentas': rentas_disponibles
    })
@login_required
@solo_admin
def detalle_ruta(request, ruta_id):
    ruta = get_object_or_404(Ruta, id=ruta_id)

    return render(request, 'core/detalle_ruta.html', {
        'ruta': ruta
    })

@login_required
@solo_admin
def crear_ruta(request):
    if request.method == 'POST':
        fecha = request.POST.get('fecha')
        cargador_id = request.POST.get('cargador')

        cargador = get_object_or_404(User, id=cargador_id)

        Ruta.objects.create(
            fecha=fecha,
            cargador=cargador
        )

        return redirect('lista_rutas')

    cargadores = User.objects.filter(groups__name='cargador')

    return render(request, 'core/crear_ruta.html', {
        'cargadores': cargadores
    })

@login_required
@solo_admin
def lista_rutas(request):
    rutas = Ruta.objects.all().order_by('-fecha')

    return render(request, 'core/lista_rutas.html', {
        'rutas': rutas
    })

# -----------------------------
# CONTABILIDAD
# -----------------------------
@login_required
def contabilidad_home(request):
    pedidos = PedidoFinanzas.objects.all()
    gastos = Gasto.objects.all()
    compras = Compra.objects.all()

    return render(request, "core/contabilidad_home.html", {
        "pedidos": pedidos,
        "gastos": gastos,
        "compras": compras,
    })


@login_required
def marcar_pagado(request, pk):
    pedido = get_object_or_404(PedidoFinanzas, pk=pk)
    pedido.pagado = True
    pedido.save()
    return redirect("contabilidad")


@login_required
def marcar_pendiente(request, pk):
    pedido = get_object_or_404(PedidoFinanzas, pk=pk)
    pedido.pagado = False
    pedido.save()
    return redirect("contabilidad")


@login_required
def pedidos_semana(request):
    hoy = date.today()
    inicio = hoy - timedelta(days=hoy.weekday())
    fin = inicio + timedelta(days=6)

    rentas = Renta.objects.filter(fecha_renta__range=[inicio, fin])
    return render(request, 'core/pedidos_semana.html', {"rentas": rentas})


@login_required
def nuevo_gasto(request):
    return render(request, 'core/nuevo_gasto.html')


@login_required
def nueva_compra(request):
    return render(request, 'core/nueva_compra.html')

def es_admin(user):
    return user.groups.filter(name='Administrador').exists()

def es_cargador(user):
    return user.groups.filter(name='Cargador').exists()