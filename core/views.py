from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse, HttpResponse
from .models import Ruta, Empleado, Nomina
from .decorators import solo_admin
from .models import Cliente, Producto, Renta, RentaProducto, PedidoFinanzas, Gasto, Compra, OcupacionDia, calcular_total
from .forms import ClienteForm, ProductoForm, RentaForm, RentaProductoFormSet, EmpleadoForm, NominaForm
from django.db.models import Q
from django.template.loader import render_to_string
import json
import weasyprint
from django.templatetags.static import static
from datetime import date, timedelta
from django.contrib.auth.decorators import login_required
from django.utils import timezone
from django.db.models import Case, When, Value, IntegerField, Sum, F, Q
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

@login_required
def dashboard_ventas(request):
    return render(request, 'core/dashboard_ventas.html')

@login_required
def dashboard_admin(request):
    return render(request, 'core/dashboard_admin.html')


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
        producto = form.save(commit=False)

        # 🔥 SINCRONIZACIÓN OBLIGATORIA
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
def ocupacion_productos(request):
    # 🔁 Semana navegable
    week_str = request.GET.get('week')

    try:
        base_date = date.fromisoformat(week_str) if week_str else date.today()
    except ValueError:
        base_date = date.today()

    inicio = base_date - timedelta(days=base_date.weekday())  # lunes
    fin = inicio + timedelta(days=6)
    dias = [inicio + timedelta(days=i) for i in range(7)]

    # 🔎 Filtro
    filtro = request.GET.get("filtro", "todos")
    data = []

    # 🟢 1 sola query semanal (CLAVE)
    ocupaciones = OcupacionDia.objects.filter(
        fecha__range=[inicio, fin]
    )

    # 🧠 Mapa en memoria: (producto_id, fecha) → estado
    ocupacion_map = {
        (o.producto_id, o.fecha): o.estado
        for o in ocupaciones
    }

    # 📦 Productos
    for producto in Producto.objects.all():
        estados = []
        mostrar_producto = False

        for dia in dias:
            estado = ocupacion_map.get(
                (producto.id, dia),
                'LIBRE'  # default
            )

            estados.append({
                "fecha": dia,
                "estado": estado
            })

            # 🧠 lógica semanal
            if filtro == "todos" and estado in ("PARCIAL", "LLENO"):
                mostrar_producto = True
            elif filtro == "lleno" and estado == "LLENO":
                mostrar_producto = True
            elif filtro == "parcial" and estado == "PARCIAL":
                mostrar_producto = True

        if mostrar_producto:
            data.append({
                "producto": producto,
                "estados": estados
            })

    return render(
        request,
        "core/ocupacion_productos.html",
        {
            "dias": dias,
            "data": data,
            "filtro": filtro,
            "inicio": inicio,
            "fin": fin,
            "prev_week": inicio - timedelta(days=7),
            "next_week": inicio + timedelta(days=7),
        }
    )



@login_required
@solo_admin
def nueva_renta(request):
    if request.method == "POST":
        # ===== DATOS BÁSICOS =====
        fecha = request.POST.get("fecha_renta")
        hora_inicio = request.POST.get("hora_inicio")
        hora_fin = request.POST.get("hora_fin")
        cliente_id = request.POST.get("cliente")

        print("POST:", request.POST)

        if not fecha or not hora_inicio or not hora_fin or not cliente_id:
            messages.error(request, "Debes seleccionar cliente, fecha y horario.")
            return redirect("nueva_renta")

        productos_data = request.POST.get("productos_data")

        if not productos_data:
            messages.error(request, "Debes agregar al menos un producto a la renta.")
            return redirect("nueva_renta")

        productos = json.loads(productos_data)

        try:
            with transaction.atomic():
                for p in productos:
                    producto = Producto.objects.select_for_update().get(id=p["id"])
                    cantidad = int(p.get("cantidad", 1))

                    disponible = producto.stock_disponible_en_horario(
                        fecha, hora_inicio, hora_fin
                    )

                    print("DISPONIBLE:", disponible, type(disponible))

                    if disponible <= 0:
                        raise ValueError(
                            f"No hay disponibilidad del producto "
                            f"'{producto.nombre}' en el horario seleccionado."
                        )

                    if cantidad > disponible:
                        raise ValueError(
                            f"Solo hay {disponible} disponibles del producto "
                            f"'{producto.nombre}' en el horario seleccionado."
                        )

                renta = Renta.objects.create(
                    cliente_id=cliente_id,
                    fecha_renta=fecha,
                    hora_inicio=hora_inicio,
                    hora_fin=hora_fin,
                    calle_y_numero=request.POST.get("calle_y_numero"),
                    colonia=request.POST.get("colonia"),
                    ciudad_o_municipio=request.POST.get("ciudad_o_municipio"),
                    comentarios=request.POST.get("comentarios", ""),
                    precio_total=float(request.POST.get("precio_total") or 0),
                    anticipo=float(request.POST.get("anticipo") or 0),
                    pagado=request.POST.get("pagado") == "on"
                )

                for p in productos:
                    producto = Producto.objects.get(id=p["id"])
                    cantidad = int(p.get("cantidad", 1))

                    precio_unitario = float(
                        p.get("precio_unitario", producto.precio)
                    )

                    nota = p.get("nota", "")

                    RentaProducto.objects.create(
                        renta=renta,
                        producto=producto,
                        cantidad=cantidad,
                        precio_unitario=precio_unitario,
                        nota=nota
                        # 👆 NO subtotal, NO precio_lista → el modelo lo calcula
                    )

            messages.success(
                request,
                f"RENTA_CREADA::{renta.id}"
            )
            return redirect("nueva_renta")

        except ValueError as e:
            messages.error(request, str(e))
            return redirect("nueva_renta")

    # 🔥 ESTO ES LO QUE FALTABA
    form = RentaForm()
    return render(request, "core/form_renta.html", {
        "form": form
    })


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
                            disponible = producto.stock_disponible_en_horario(
                                renta.fecha_renta,
                                renta.hora_inicio,
                                renta.hora_fin
                            )

                            if cantidad > disponible:
                                raise ValueError(
                                    f'Solo hay {disponible} disponibles de '
                                    f'{producto.nombre} en ese horario.'
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
            # 🟢 Liberar stock + recalcular ocupación
            for rp in renta.rentaproductos.select_for_update():
                rp.producto.liberar_stock(rp.cantidad)

                # 🔁 Google Calendar style: recalcular ese día
                recalcular_ocupacion_producto_dia(
                    rp.producto,
                    renta.fecha_renta
                )

            # 🔄 Actualizar estado de entrega y status
            renta.estado_entrega = 'CANCELADO'
            renta.status = 'CANCELADO'
            renta.save(update_fields=['estado_entrega', 'status'])

        messages.success(
            request,
            f'Renta {renta.folio} cancelada y ocupación actualizada correctamente.'
        )

    except Exception as e:
        print(f"Error al cancelar renta {renta.id}: {e}")
        messages.error(
            request,
            'Ocurrió un error al cancelar la renta. Intenta de nuevo.'
        )

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
    categoria = request.GET.get("categoria")

    pedidos = PedidoFinanzas.objects.select_related("renta").all()
    gastos = Gasto.objects.all()
    compras = Compra.objects.all()

    # Filtrar productos dentro de cada pedido por categoría si se especifica
    pedidos_filtrados = []
    for p in pedidos:
        if categoria:
            productos = p.renta.rentaproductos.filter(producto__tipo=categoria)
            if productos.exists():
                pedidos_filtrados.append((p, productos))
        else:
            pedidos_filtrados.append((p, p.renta.rentaproductos.all()))

    # Totales
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
        "categoria_filtrada": categoria
    })

@login_required
def marcar_pagado(request, renta_id):
    renta = get_object_or_404(Renta, id=renta_id)
    pedido, created = PedidoFinanzas.objects.get_or_create(
        renta=renta,
        defaults={'total': calcular_total(renta)}
    )
    pedido.total = calcular_total(renta)  # recalcula por si hubo ajustes en el form
    pedido.pagado = True  # o False si es pendiente
    pedido.save()
    return redirect('pedidos_semana')

@login_required
def marcar_pendiente(request, renta_id):
    renta = get_object_or_404(Renta, id=renta_id)
    pedido, created = PedidoFinanzas.objects.get_or_create(
        renta=renta,
        defaults={'total': calcular_total(renta)}
    )
    pedido.total = calcular_total(renta)  # recalcula por si hubo ajustes en el form
    pedido.pagado = True  # o False si es pendiente
    pedido.save()
    return redirect('pedidos_semana')


@login_required
def pedidos_semana(request):
    hoy = date.today()
    inicio = hoy - timedelta(days=hoy.weekday())
    fin = inicio + timedelta(days=6)

    tipo_filtrado = request.GET.get("tipo")  # recibe el filtro de tipo_producto

    rentas = Renta.objects.filter(fecha_renta__range=[inicio, fin])

    rentas_filtradas = []
    for r in rentas:
        productos = r.rentaproductos.all()  # todos los RentaProducto
        if tipo_filtrado:
            productos = productos.filter(producto__tipo=tipo_filtrado)
        if productos.exists():
            rentas_filtradas.append((r, productos))  # tupla (renta, productos filtrados)

    # Totales
    total_ventas = sum(r.finanza.total for r, _ in rentas_filtradas)

    total_fletes = sum(
        sum(rp.subtotal for rp in productos if rp.producto.tipo == "FL")
        for r, productos in rentas_filtradas
    )

    total_pagado = sum(r.finanza.total for r, _ in rentas_filtradas if r.finanza.pagado)
    total_pendiente = sum(r.finanza.total for r, _ in rentas_filtradas if not r.finanza.pagado)

    return render(request, 'core/pedidos_semana.html', {
        "rentas": rentas_filtradas,  # lista de tuplas (renta, productos filtrados)
        "inicio_semana": inicio,
        "fin_semana": fin,
        "total_ventas": total_ventas,
        "total_fletes": total_fletes,
        "total_pagado": total_pagado,
        "total_pendiente": total_pendiente,
        "tipo_filtrado": tipo_filtrado
    })




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


# ---------------- Empleados ----------------
def lista_empleados(request):
    empleados = Empleado.objects.all()
    return render(request, 'core/empleados_lista.html', {'empleados': empleados})

def nuevo_empleado(request):
    if request.method == "POST":
        form = EmpleadoForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('lista_empleados')
    else:
        form = EmpleadoForm()
    return render(request, 'core/empleado_form.html', {'form': form})

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

# ---------------- Nómina ----------------
def lista_nomina(request):
    nominas = Nomina.objects.select_related('empleado').all()
    return render(request, 'core/nomina_lista.html', {'nominas': nominas})

def nueva_nomina(request):
    if request.method == "POST":
        form = NominaForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('lista_nomina')
    else:
        form = NominaForm()
    return render(request, 'core/nomina_form.html', {'form': form})

def editar_nomina(request, pk):
    nomina = get_object_or_404(Nomina, pk=pk)
    if request.method == "POST":
        form = NominaForm(request.POST, instance=nomina)
        if form.is_valid():
            form.save()
            return redirect('lista_nomina')
    else:
        form = NominaForm(instance=nomina)
    return render(request, 'core/nomina_form.html', {'form': form})

def lista_empleados(request):
    empleados = Empleado.objects.all()
    return render(request, 'core/empleados_lista.html', {'empleados': empleados})
