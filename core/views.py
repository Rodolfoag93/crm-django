from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse, HttpResponse
from .models import Ruta, Empleado, Nomina, Pedido, Cuenta, MovimientoContable, Cuenta, Compra, HorasExtra, BitacoraMantenimiento
from .decorators import solo_admin
from .models import Cliente, Producto, Renta, RentaProducto, PedidoFinanzas, Gasto, Compra, OcupacionDia, calcular_total, TipoPagoExtra, PagoExtraNomina
from .forms import ClienteForm, ProductoForm, RentaForm, RentaProductoFormSet, EmpleadoForm, NominaForm, GastoForm, CompraForm, HorasExtraForm, PagoExtraForm, TipoPagoExtraForm, PagoExtraNominaForm, TransferenciaForm, MovimientoForm, TraspasoEfectivoBancoForm
from django.db.models import Q
from django.template.loader import render_to_string
import json
import weasyprint
from django.templatetags.static import static
from datetime import date, timedelta, datetime
from django.contrib.auth.decorators import login_required
from django.utils import timezone
from django.db.models import Case, When, Value, IntegerField, Sum, F, Q
from django.contrib.auth.models import User
from core.decorators import solo_admin
from django.db import transaction
from django.contrib import messages
from django.core.serializers.json import DjangoJSONEncoder
from django.urls import reverse
from django.views.decorators.csrf import csrf_exempt
from django.core.paginator import Paginator
from weasyprint import HTML
from decimal import Decimal
from django.utils.timezone import now
from core.utils import saldo_efectivo, sincronizar_gasto_nomina, calcular_total
from core.models import Cuenta







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
    q = request.GET.get("q", "").strip()
    orden = request.GET.get("orden", "nombre")

    clientes = Cliente.objects.all()

    # 🔎 Filtro por nombre o teléfono
    if q:
        clientes = clientes.filter(
            Q(nombre__icontains=q) |
            Q(telefono__icontains=q)
        )

    # ↕️ Ordenamiento seguro
    if orden in ["nombre", "telefono"]:
        clientes = clientes.order_by(orden)

    return render(
        request,
        "core/lista_clientes.html",
        {
            "clientes": clientes,
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


# -----------------------------
# PRODUCTOS
# -----------------------------
@login_required
def lista_productos(request):
    productos = Producto.objects.all()
    return render(request, 'core/lista_productos.html', {'productos': productos, "module": 'ventas'})


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

    # 🔎 Parámetros GET
    query = request.GET.get("q", "").strip()
    fecha = request.GET.get("fecha", "").strip()

    rentas = Renta.objects.select_related("cliente")

    # 👷‍♂️ Si es cargador, solo ve sus rentas
    es_cargador = request.user.groups.filter(name="Cargador").exists()
    if es_cargador:
        rentas = rentas.filter(asignado_a=user)

    # 🔍 Filtro texto (folio / cliente)
    if query:
        rentas = rentas.filter(
            Q(folio__icontains=query) |
            Q(cliente__nombre__icontains=query)
        )

    # 📅 Filtro por fecha
    if fecha:
        rentas = rentas.filter(fecha_renta=fecha)

    # ⭐ Prioridad: futuras primero
    rentas = rentas.annotate(
        prioridad=Case(
            When(fecha_renta__gte=hoy, then=Value(1)),
            default=Value(2),
            output_field=IntegerField(),
        )
    ).order_by("prioridad", "fecha_renta")

    # 📄 Paginación
    paginator = Paginator(rentas, 25)
    page_number = request.GET.get("page")
    page_obj = paginator.get_page(page_number)

    return render(
        request,
        "core/lista_rentas.html",
        {
            "page_obj": page_obj,
            "es_cargador": es_cargador,
            "query": query,
            "fecha": fecha,  # 🔴 ESTE ERA EL QUE FALTABA
            "module": 'ventas',
        }
    )

@login_required
def marcar_recolectado(request, pk):
    renta = get_object_or_404(Renta, pk=pk)

    if request.method == "POST":
        renta.fecha_recoleccion = request.POST.get("fecha_recoleccion")
        renta.recolectado_por_id = request.POST.get("empleado")
        renta.recolectado = True
        renta.save()

        messages.success(request, "Pedido marcado como recolectado")

    return redirect("pedidos_semana")

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
            "module": 'ventas',
        }
    )

@login_required
def ocupacion_por_fecha(request, fecha):
    try:
        fecha_obj = datetime.strptime(fecha, "%Y-%m-%d").date()

        # 🔥 RENTAS DEL DÍA
        rentas_productos = RentaProducto.objects.filter(
            renta__fecha_renta=fecha_obj
        ).select_related("producto")

        data = []
        for rp in rentas_productos:
            try:
                # 🔹 Tomamos la bitácora del producto
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
        print("❌ Error ocupacion_por_fecha:", e)
        return JsonResponse({"error": str(e)}, status=500)



def nueva_renta(request):
    productos = Producto.objects.filter(activo=True)
    clientes = Cliente.objects.all()
    cuentas = Cuenta.objects.all()

    productos_catalogo_json = json.dumps(
        list(productos.values("id", "nombre", "precio")),
        cls=DjangoJSONEncoder
    )

    clientes_json = json.dumps(
        list(clientes.values(
            "id", "nombre", "telefono",
            "calle_y_numero", "colonia", "ciudad_o_municipio"
        )),
        cls=DjangoJSONEncoder
    )

    if request.method == "POST":
        # ===== DATOS BÁSICOS =====
        fecha = request.POST.get("fecha_renta")
        hora_inicio = request.POST.get("hora_inicio")
        hora_fin = request.POST.get("hora_fin")
        cliente_input = request.POST.get("cliente", "")
        anticipo = float(request.POST.get("anticipo") or 0)

        metodo_pago = request.POST.get("metodo_pago_anticipo")
        cuenta_id = request.POST.get("cuenta_anticipo")

        telefono_cliente = cliente_input.split(" - ")[0].strip()

        # ===== VALIDACIONES =====
        if not fecha or not hora_inicio or not hora_fin or not telefono_cliente:
            messages.error(request, "Debes seleccionar cliente, fecha y horario.")
            return redirect("nueva_renta")

        try:
            cliente = Cliente.objects.get(telefono=telefono_cliente)
        except Cliente.DoesNotExist:
            messages.error(request, f"No existe un cliente con el teléfono {telefono_cliente}.")
            return redirect("nueva_renta")

        cuenta = None
        if anticipo > 0 and metodo_pago == "transferencia":
            cuenta = Cuenta.objects.filter(id=cuenta_id).first()
            if not cuenta:
                messages.error(request, "Selecciona una cuenta para la transferencia.")
                return redirect("nueva_renta")

        productos_data = request.POST.get("productos_data")
        if not productos_data:
            messages.error(request, "Debes agregar al menos un producto a la renta.")
            return redirect("nueva_renta")

        productos_list = json.loads(productos_data)

        try:
            with transaction.atomic():
                # ===== VALIDAR STOCK =====
                for p in productos_list:
                    producto = Producto.objects.select_for_update().get(id=p["id"])
                    cantidad = int(p.get("cantidad", 1))

                    disponible = producto.stock_disponible_en_horario(
                        fecha, hora_inicio, hora_fin
                    )

                    if cantidad > disponible:
                        raise ValueError(
                            f"Solo hay {disponible} disponibles de '{producto.nombre}'."
                        )

                precio_total = sum(
                    float(p.get("precio_unitario", 0)) * int(p.get("cantidad", 1))
                    for p in productos_list
                )

                # ===== CREAR RENTA =====
                renta = Renta.objects.create(
                    cliente=cliente,
                    fecha_renta=fecha,
                    hora_inicio=hora_inicio,
                    hora_fin=hora_fin,
                    calle_y_numero=request.POST.get("calle_y_numero"),
                    colonia=request.POST.get("colonia"),
                    ciudad_o_municipio=request.POST.get("ciudad_o_municipio"),
                    comentarios=request.POST.get("comentarios", ""),
                    precio_total=precio_total,
                    anticipo=anticipo,
                    pagado=False
                )

                # ===== PRODUCTOS =====
                for p in productos_list:
                    RentaProducto.objects.create(
                        renta=renta,
                        producto_id=p["id"],
                        cantidad=int(p.get("cantidad", 1)),
                        precio_unitario=float(p.get("precio_unitario", 0)),
                        nota=p.get("nota", "")
                    )

                # ===== MOVIMIENTO CONTABLE ANTICIPO =====
                if anticipo > 0:
                    MovimientoContable.objects.create(
                        tipo='INGRESO',
                        monto=anticipo,
                        metodo_pago=metodo_pago,
                        cuenta=cuenta,
                        fecha=timezone.now(),
                        descripcion=f"Anticipo renta #{renta.folio or renta.id}"
                    )

            messages.success(request, f"Renta creada correctamente (ID: {renta.id})")
            return redirect(f"{reverse('nueva_renta')}?renta_creada={renta.id}")

        except ValueError as e:
            messages.error(request, str(e))
            return redirect("nueva_renta")

    # ===== GET =====
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

    # 🔒 Bloqueo por estado
    if renta.estado_entrega in ['EN_RUTA', 'ENTREGADO'] and request.method == 'POST':
        messages.error(
            request,
            'No puedes modificar una renta que ya está en ruta o entregada.'
        )
        return redirect('lista_rentas')

    anticipo_anterior = renta.anticipo or Decimal('0.00')

    if request.method == 'POST':
        form = RentaForm(request.POST, instance=renta)

        if form.is_valid():
            try:
                with transaction.atomic():

                    # ===============================
                    # DATOS ANTICIPO
                    # ===============================
                    anticipo_nuevo = Decimal(request.POST.get('anticipo') or '0')

                    diferencia_anticipo = anticipo_nuevo - anticipo_anterior

                    # ===============================
                    # GUARDAR RENTA
                    # ===============================
                    print("POST anticipo:", request.POST.get('anticipo'))
                    print("FORM cleaned anticipo:", form.cleaned_data.get('anticipo'))
                    print("RENTA antes:", renta.anticipo)
                    renta = form.save(commit=False)
                    renta.anticipo = anticipo_nuevo
                    renta.save()
                    print("RENTA después:", renta.anticipo)

                    # ===============================
                    # MOVIMIENTO CONTABLE (AJUSTE)
                    # ===============================
                    print("DIF:", diferencia_anticipo)
                    print("PEDIDO:", renta_id)
                    print("CUENTA:", cuentas)
                    if diferencia_anticipo != 0:
                        metodo_pago = request.POST.get('metodo_pago_anticipo')
                        cuenta_id = request.POST.get('cuenta_anticipo')

                        if not metodo_pago:
                            raise ValueError("Selecciona un método de pago para el anticipo.")

                        cuenta = None
                        if metodo_pago == 'transferencia':
                            cuenta = Cuenta.objects.filter(id=cuenta_id).first()
                            if not cuenta:
                                raise ValueError(
                                    "Selecciona una cuenta válida para la transferencia."
                                )

                        MovimientoContable.objects.create(
                            tipo='INGRESO' if diferencia_anticipo > 0 else 'EGRESO',
                            monto=abs(diferencia_anticipo),
                            metodo_pago=metodo_pago,
                            cuenta=cuenta,
                            fecha=timezone.now(),
                            descripcion=f"Ajuste de anticipo renta #{renta.folio or renta.id}"
                        )

                    # ===============================
                    # LIBERAR STOCK ANTERIOR
                    # ===============================
                    for rp in renta.rentaproductos.select_related('producto'):
                        rp.producto.liberar_stock(rp.cantidad)

                    renta.rentaproductos.all().delete()

                    # ===============================
                    # PROCESAR NUEVOS PRODUCTOS
                    # ===============================
                    productos_json = request.POST.get('productos_data')
                    total = 0

                    if productos_json:
                        productos = json.loads(productos_json)

                        for p in productos:
                            producto = Producto.objects.select_for_update().get(
                                id=p['id']
                            )
                            cantidad = int(p['cantidad'])

                            if not producto.activo:
                                raise ValueError(
                                    f'El producto {producto.nombre} no está activo.'
                                )

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

                            producto.reservar_stock(cantidad)

                            RentaProducto.objects.create(
                                renta=renta,
                                producto=producto,
                                cantidad=cantidad,
                                precio_unitario=producto.precio,
                                subtotal=producto.precio * cantidad
                            )

                            total += producto.precio * cantidad

                    # ===============================
                    # ACTUALIZAR TOTAL RENTA
                    # ===============================
                    renta.precio_total = total
                    renta.save()

                    # ===============================
                    # PEDIDO FINANZAS
                    # ===============================
                    pedido, _ = PedidoFinanzas.objects.get_or_create(
                        renta=renta
                    )

                    pedido.total = total - renta.anticipo
                    pedido.save()

                    # ===============================
                    # 🔥 MOVIMIENTO CONTABLE ANTICIPO
                    # ===============================
                    if diferencia_anticipo > 0:
                        MovimientoContable.objects.create(
                            pedido=pedido,
                            tipo='INGRESO',
                            monto=diferencia_anticipo,
                            metodo_pago=metodo_pago,
                            cuenta=cuenta if metodo_pago == 'transferencia' else None,
                            fecha=timezone.now(),
                            descripcion=(
                                f"Anticipo adicional renta "
                                f"#{renta.folio or renta.id}"
                            )
                        )

                messages.success(request, 'Renta actualizada correctamente.')
                return redirect('lista_rentas')

            except ValueError as e:
                messages.error(request, str(e))
                return redirect('editar_renta', renta_id=renta.id)

        messages.error(request, "Hay errores en el formulario")

    else:
        form = RentaForm(instance=renta)

    # ===============================
    # DATOS PARA TEMPLATE
    # ===============================
    productos_data = [
        {
            'id': rp.producto.id,
            'nombre': rp.producto.nombre,
            'precio_unitario': float(rp.precio_unitario),
            'cantidad': rp.cantidad
        }
        for rp in renta.rentaproductos.select_related('producto')
    ]

    clientes = Cliente.objects.all()
    productos_catalogo = Producto.objects.filter(activo=True)

    clientes_json = [
        {
            'id': c.id,
            'telefono': c.telefono,
            'nombre': c.nombre,
            'calle_y_numero': c.calle_y_numero,
            'colonia': c.colonia,
            'ciudad_o_municipio': c.ciudad_o_municipio,
        }
        for c in clientes
    ]

    productos_catalogo_json = [
        {
            'id': p.id,
            'nombre': p.nombre,
            'precio': float(p.precio),
        }
        for p in productos_catalogo
    ]

    return render(request, 'core/form_renta.html', {
        'form': form,
        'renta': renta,
        'productos_data': json.dumps(productos_data),
        'clientes_json': json.dumps(clientes_json),
        'productos_catalogo_json': json.dumps(productos_catalogo_json),
        'editando': True,
        'cuentas': cuentas
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
def contabilidad_home(request):
    categoria = request.GET.get("categoria")
    semana_param = request.GET.get("semana")  # formato YYYY-MM-DD

    # Calcular rango de semana
    if semana_param:
        lunes = date.fromisoformat(semana_param)
    else:
        hoy = date.today()
        lunes = hoy - timedelta(days=hoy.weekday())  # lunes de la semana actual
    domingo = lunes + timedelta(days=6)

    # Pedidos filtrados por semana
    pedidos = PedidoFinanzas.objects.select_related("renta").filter(
        renta__fecha_renta__gte=lunes,
        renta__fecha_renta__lte=domingo
    )

    # Gastos filtrados por semana
    gastos = Gasto.objects.filter(fecha__gte=lunes, fecha__lte=domingo)

    # Compras filtradas por semana
    compras = Compra.objects.filter(fecha__gte=lunes, fecha__lte=domingo)

    # Filtrar productos dentro de cada pedido por categoría
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
        "categoria_filtrada": categoria,
        "lunes": lunes,
        "domingo": domingo,
        "lunes_anterior": lunes - timedelta(days=7),
        "lunes_siguiente": lunes + timedelta(days=7),
        "module": 'admin',
    })

@login_required
def marcar_pagado(request, renta_id):
    renta = get_object_or_404(Renta, id=renta_id)

    if renta.pagado:
        messages.warning(request, "Esta renta ya fue liquidada.")
        return redirect("pedidos_semana")

    pedido, _ = PedidoFinanzas.objects.get_or_create(renta=renta)

    if request.method != "POST":
        messages.error(request, "Método no permitido.")
        return redirect("pedidos_semana")

    metodo_pago = request.POST.get("metodo_pago")
    cuenta_id = request.POST.get("cuenta_transferencia")

    if not metodo_pago:
        messages.error(request, "Selecciona un método de pago.")
        return redirect("pedidos_semana")

    total_renta = calcular_total(renta)
    saldo = total_renta - (renta.anticipo or 0)

    if saldo <= 0:
        messages.error(request, "La renta no tiene saldo pendiente.")
        return redirect("pedidos_semana")

    cuenta = None
    if metodo_pago == "transferencia":
        cuenta = Cuenta.objects.filter(id=cuenta_id).first()

    with transaction.atomic():
        # ===== PEDIDO FINANZAS =====
        pedido.total = saldo
        pedido.pagado = True
        pedido.metodo_pago = metodo_pago
        pedido.fecha_pago = timezone.now()
        pedido.cuenta_destino = cuenta
        pedido.save()

        # ===== MOVIMIENTO CONTABLE =====
        MovimientoContable.objects.create(
            pedido=pedido,
            tipo="INGRESO",
            monto=saldo,
            metodo_pago=metodo_pago,
            cuenta=cuenta,
            fecha=pedido.fecha_pago,
            descripcion=f"Liquidación renta #{renta.folio or renta.id}"
        )

        # ===== CERRAR RENTA =====
        renta.pagado = True
        renta.save(update_fields=["pagado"])

    messages.success(request, "Pago registrado correctamente.")
    return redirect("pedidos_semana")

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
    return redirect('pedidos_semana')


@login_required
def pedidos_semana(request):
    # Revisar si viene el lunes de la semana a mostrar
    semana_inicio_str = request.GET.get("semana_inicio")
    if semana_inicio_str:
        try:
            inicio = date.fromisoformat(semana_inicio_str)
        except ValueError:
            inicio = date.today() - timedelta(days=date.today().weekday())
    else:
        inicio = date.today() - timedelta(days=date.today().weekday())

    fin = inicio + timedelta(days=6)  # domingo de la semana

    tipo_filtrado = request.GET.get("tipo")  # filtro opcional

    cuentas = Cuenta.objects.filter(activa=True)
    rentas = Renta.objects.filter(fecha_renta__range=[inicio, fin])

    rentas_filtradas = []
    for r in rentas:
        productos = r.rentaproductos.all()
        if tipo_filtrado:
            productos = productos.filter(producto__tipo=tipo_filtrado)

        if productos.exists():
            # Asegurarse de que el total de finanza tenga el valor correcto
            if r.finanza and r.finanza.total == 0:
                r.finanza.total = r.precio_total
            rentas_filtradas.append((r, productos))

    # Totales
    total_ventas = sum(r.finanza.total for r, _ in rentas_filtradas)
    total_fletes = sum(
        sum(rp.subtotal for rp in productos if rp.producto.tipo == "FL")
        for r, productos in rentas_filtradas
    )
    total_pagado = sum(r.finanza.total for r, _ in rentas_filtradas if r.finanza.pagado)
    total_pendiente = sum(r.finanza.total for r, _ in rentas_filtradas if not r.finanza.pagado)

    # Fechas para navegación
    semana_anterior = inicio - timedelta(days=7)
    semana_siguiente = inicio + timedelta(days=7)

    #marcar recolectado
    empleados = Empleado.objects.filter(activo=True)

    return render(request, 'core/pedidos_semana.html', {
        "rentas": rentas_filtradas,
        "inicio_semana": inicio,
        "fin_semana": fin,
        "total_ventas": total_ventas,
        "total_fletes": total_fletes,
        "total_pagado": total_pagado,
        "total_pendiente": total_pendiente,
        "tipo_filtrado": tipo_filtrado,
        "cuentas": cuentas,
        "semana_anterior": semana_anterior,
        "semana_siguiente": semana_siguiente,
        "empleados": empleados,  # 👈 NUEVO
        "module": 'admin'
    })

@login_required
def lista_gastos(request):
    hoy = now().date()

    # 📅 Semana seleccionada
    semana_str = request.GET.get('semana')
    if semana_str:
        lunes = datetime.strptime(semana_str, '%Y-%m-%d').date()
    else:
        lunes = hoy - timedelta(days=hoy.weekday())

    domingo = lunes + timedelta(days=6)

    lunes_anterior = lunes - timedelta(days=7)
    lunes_siguiente = lunes + timedelta(days=7)

    # 📌 Filtros
    tipo = request.GET.get('tipo')
    categoria = request.GET.get('categoria')

    gastos = Gasto.objects.filter(
        fecha__range=[lunes, domingo]
    )

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
        'lunes_anterior': lunes_anterior,
        'lunes_siguiente': lunes_siguiente,
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
            gasto = form.save(commit=False)
            cuenta = form.cleaned_data.get('cuenta')

            gasto.save()

            MovimientoContable.objects.create(
                tipo='EGRESO',
                monto=gasto.monto,
                metodo_pago='efectivo' if cuenta is None else 'transferencia',
                cuenta=cuenta,
                fecha=timezone.now(),
                descripcion=f'Gasto: {gasto.descripcion}'
            )

            messages.success(request, "Gasto registrado correctamente.")
            return redirect('lista_gastos')
    else:
        form = GastoForm()

    return render(
        request,
        'core/nuevo_gasto.html',
        {
            'form': form,
            'titulo': 'Registrar Gasto'
        }
    )

@login_required
def editar_gasto(request, gasto_id):
    gasto = get_object_or_404(Gasto, id=gasto_id)
    if request.method == 'POST':
        form = GastoForm(request.POST, instance=gasto)
        if form.is_valid():
            form.save()
            messages.success(request, "Gasto actualizado correctamente.")
            return redirect('lista_gastos')
    else:
        form = GastoForm(instance=gasto)
    return render(request, 'core/nuevo_gasto.html', {'form': form, 'titulo': 'Editar Gasto'})

@login_required
def eliminar_gasto(request, gasto_id):
    gasto = get_object_or_404(Gasto, id=gasto_id)
    if request.method == 'POST':
        gasto.delete()
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

    return render(
        request,
        'core/nueva_compra.html',
        {
            'form': form,
            'titulo': 'Registrar Compra'
        }
    )

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

def es_admin(user):
    return user.groups.filter(name='Administrador').exists()

def es_cargador(user):
    return user.groups.filter(name='Cargador').exists()


# ---------------- Empleados ----------------
def lista_empleados(request):
    empleados = Empleado.objects.all()
    return render(request, 'core/empleados_lista.html', {'empleados': empleados, "module": 'admin',})

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
    # Obtener lunes de la semana a mostrar desde GET
    semana_param = request.GET.get('semana')  # formato 'YYYY-MM-DD'
    if semana_param:
        lunes = date.fromisoformat(semana_param)
    else:
        hoy = date.today()
        lunes = hoy - timedelta(days=hoy.weekday())  # lunes de esta semana

    domingo = lunes + timedelta(days=6)

    # Calcular semanas anterior y siguiente
    lunes_anterior = lunes - timedelta(days=7)
    lunes_siguiente = lunes + timedelta(days=7)

    # Filtrar nóminas cuya fecha_inicio o fecha_fin caiga dentro de la semana
    nominas = Nomina.objects.select_related('empleado').filter(
        fecha_inicio__lte=domingo,
        fecha_fin__gte=lunes
    )

    # Calcular total por nómina
    for n in nominas:
        n.total = (
                          n.dias_trabajados * n.empleado.sueldo_diario
                  ) + sum(p.monto for p in n.pagos_extras.all())

    # Recibos opcionales
    recibo_horas_extra_id = request.GET.get('recibo_horas_extra')
    recibo_nomina_id = request.GET.get('recibo_nomina')

    contexto = {
        'nominas': nominas,
        'lunes': lunes,
        'domingo': domingo,
        'lunes_anterior': lunes_anterior,
        'lunes_siguiente': lunes_siguiente,
        'recibo_horas_extra_id': recibo_horas_extra_id,
        'recibo_nomina_id': recibo_nomina_id,
        "module": 'admin',
    }

    return render(request, 'core/nomina_lista.html', contexto)

def pagos_extra_nomina(request, nomina_id):
    nomina = get_object_or_404(Nomina, id=nomina_id)
    pagos = nomina.pagos_extras.select_related('tipo')

    return render(request, 'nomina/pagos_extra.html', {
        'nomina': nomina,
        'pagos': pagos,
    })

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

def eliminar_pago_extra(request, pago_id):
    pago = get_object_or_404(PagoExtraNomina, id=pago_id)
    nomina_id = pago.nomina.id
    pago.delete()
    return redirect('editar_nomina', pk=nomina_id)

def catalogo_pagos_extra(request, tipo_id=None):
    """
    Lista y permite crear/editar conceptos de pago extra.
    """

    # ✅ Instancia para edición (si viene tipo_id)
    tipo = None
    if tipo_id:
        tipo = get_object_or_404(TipoPagoExtra, pk=tipo_id)

    # Formulario (POST o instancia existente)
    form = TipoPagoExtraForm(request.POST or None, instance=tipo)

    # Todos los conceptos para la tabla
    conceptos = TipoPagoExtra.objects.all()

    # Guardar el concepto si el formulario es válido
    if request.method == "POST" and form.is_valid():
        form.save()
        return redirect('catalogo_pagos_extra')

    # Depuración
    print("Conceptos:", conceptos)

    return render(request, 'nomina/catalogo_pagos_extra.html', {
        'form': form,
        'conceptos': conceptos,
        'tipo': tipo
    })


def crear_editar_tipo_pago_extra(request, tipo_id=None):
    # Inicializamos tipo (None si es creación)
    tipo = None
    if tipo_id:
        tipo = get_object_or_404(TipoPagoExtra, pk=tipo_id)

    # Formulario con POST o instancia existente
    form = TipoPagoExtraForm(request.POST or None, instance=tipo)

    # Todos los conceptos para mostrar en la tabla
    conceptos = TipoPagoExtra.objects.all()

    if request.method == 'POST' and form.is_valid():
        form.save()
        return redirect('crear_tipo_pago_extra')  # Redirige siempre a la lista de catálogo

    return render(request, 'nomina/catalogo_pagos_extra.html', {
        'form': form,
        'conceptos': conceptos,
        'tipo': tipo
    })




def eliminar_tipo_pago_extra(request, tipo_id):
    tipo = get_object_or_404(TipoPagoExtra, id=tipo_id)

    try:
        tipo.delete()
        messages.success(request, 'Concepto eliminado')
    except ProtectedError:
        messages.error(
            request,
            'No se puede eliminar: el concepto está en uso'
        )

    return redirect('catalogo_pagos_extra')

def nueva_nomina(request):
    print("➡️ Entró a nueva_nomina")

    if request.method == 'POST':
        print("🟡 Método POST recibido")
        print("POST DATA:", request.POST)

        form = NominaForm(request.POST)

        if 'guardar_nomina' in request.POST:
            print("🟢 Se presionó guardar_nomina")

        if form.is_valid():
            print("✅ Form válido")

            nomina = form.save()
            print("🧾 Nómina creada con ID:", nomina.id)

            nomina.total = nomina.calcular_total()
            nomina.save()
            print("💰 Total calculado:", nomina.total)



            return redirect('editar_nomina', nomina.id)

        else:
            print("❌ Form NO válido")
            print("ERRORES:", form.errors)

    else:
        print("🔵 Método GET")

        form = NominaForm()

    print("🔴 Renderizando nomina_form.html (NO guardó)")
    return render(request, 'core/nomina_form.html', {
        'form': form,
        'nomina': None,
    })


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

    # ✅ Queryset explícito para pasar al template
    pagos = nomina.pagos_extras.select_related('tipo').all()

    return render(request, 'core/editar_nomina.html', {
        'form': form,
        'nomina': nomina,
        'pago_extra_form': pago_extra_form,
        'pagos': pagos,  # <-- importante
    })


def recibo_nomina_pdf(request, nomina_id):
    nomina = get_object_or_404(Nomina, id=nomina_id)

    # Calcular sueldo base
    sueldo_base = nomina.dias_trabajados * nomina.empleado.sueldo_diario

    # Calcular total de pagos extra
    total_extra = nomina.pago_eventos_extra()  # método que suma todos los pagos extra

    # Total pagado = sueldo base + pagos extra
    total_pagado = sueldo_base + total_extra

    # Renderizar HTML del recibo
    html_string = render_to_string(
        'nomina/recibo_nomina_pdf.html',  # tu template
        {
            'nomina': nomina,
            'sueldo_base': sueldo_base,
            'total_pagado': total_pagado,
            'fecha': date.today(),
        }
    )

    # Generar PDF con WeasyPrint
    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = 'inline; filename="recibo_nomina.pdf"'

    HTML(string=html_string).write_pdf(response)
    return response

def lista_horas_extra(request):
    horas = HorasExtra.objects.order_by('-semana_inicio')
    return render(request, 'nomina/horas_extra_list.html', {'horas': horas})

def crear_horas_extra(request):
    initial = {}

    if request.method == 'GET':
        empleado_id = request.GET.get('empleado')
        inicio = request.GET.get('inicio')

        if empleado_id:
            initial['empleado'] = empleado_id
        if inicio:
            initial['semana_inicio'] = inicio

        form = HorasExtraForm(initial=initial)

    else:  # POST
        form = HorasExtraForm(request.POST)
        if form.is_valid():
            horas = form.save(commit=False)

            # 🧠 Pago por hora
            horas.pago_hora = Decimal(horas.empleado.sueldo_diario) / Decimal(8)

            # 🧮 Calcular horas extra
            horas.calcular()
            horas.save()

            # 📅 Fecha del gasto = domingo
            fecha_gasto = horas.semana_inicio + timedelta(days=6)

            # 💸 Generar gasto automático
            Gasto.objects.create(
                tipo="NOMINA",
                descripcion=f"Horas extra {horas.empleado} ({horas.semana_inicio} - {horas.semana_fin})",
                monto=horas.total_pago,
                fecha=horas.semana_fin
            )

            return redirect(
                f"{reverse('lista_nomina')}?recibo_horas_extra={horas.id}"
            )

    return render(request, 'nomina/horas_extra_form.html', {'form': form})


def pagar_horas_extra(request, id):
    horas = get_object_or_404(HorasExtra, id=id)
    horas.pagado = True
    horas.fecha_pago = timezone.now().date()
    horas.save()
    messages.success(request, "Horas extra pagadas")
    return redirect('lista_horas_extra')

def recibo_horas_extra_pdf(request, horas_id):
    horas = get_object_or_404(HorasExtra, id=horas_id)

    html_string = render_to_string(
        'nomina/recibo_horas_extra.html',
        {
            'horas': horas,
            'fecha': date.today(),
        }
    )

    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = 'inline; filename="recibo_horas_extra.pdf"'

    HTML(string=html_string).write_pdf(response)
    return response



def lista_empleados(request):
    empleados = Empleado.objects.all()
    return render(request, 'core/empleados_lista.html', {'empleados': empleados})

@login_required
def lista_cuentas(request):
    cuentas = Cuenta.objects.all()
    return render(request, 'core/lista_cuentas.html', {
        'cuentas': cuentas,
        "module": 'admin',
    })


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
def bitacora_list(request):
    q = request.GET.get("q", "").strip()

    bitacoras = BitacoraMantenimiento.objects.select_related("producto")

    if q:
        bitacoras = bitacoras.filter(
            producto__nombre__icontains=q
        )

    # 🧠 Agregar fecha última renta a cada fila
    for b in bitacoras:
        b.ultima_renta = RentaProducto.obtener_fecha_ultima_renta(b.producto)

    return render(
        request,
        "core/bitacora_list.html",
        {
            "bitacoras": bitacoras,
            "q": q,
            "module": 'ventas',
        }
    )




# Marcar mantenimiento
@csrf_exempt
def marcar_mantenimiento(request):
    if request.method == "POST":
        data = json.loads(request.body)
        producto_id = data.get("producto_id")
        notas = data.get("notas", "")

        producto = get_object_or_404(Producto, id=producto_id)

        # 🔹 Aquí llamas al método de RentaProducto
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
            "fecha_ultima_renta": (
                mant.fecha_ultima_renta.strftime("%Y-%m-%d")
                if mant.fecha_ultima_renta else None
            )
        })

    return JsonResponse({"status": "error"}, status=400)


def transferir_entre_cuentas(request):
    if request.method == "POST":
        form = TransferenciaForm(request.POST)
        if form.is_valid():
            origen = form.cleaned_data['cuenta_origen']
            destino = form.cleaned_data['cuenta_destino']
            monto = form.cleaned_data['monto']
            descripcion = form.cleaned_data['descripcion']

            # Egreso en cuenta origen
            MovimientoContable.objects.create(
                pedido=None,
                tipo='EGRESO',
                monto=monto,
                metodo_pago='TRANSFERENCIA',
                cuenta=origen,
                fecha=timezone.now(),
                descripcion=f"Transferencia a {destino}: {descripcion}"
            )

            # Ingreso en cuenta destino
            MovimientoContable.objects.create(
                pedido=None,
                tipo='INGRESO',
                monto=monto,
                metodo_pago='TRANSFERENCIA',
                cuenta=destino,
                fecha=timezone.now(),
                descripcion=f"Transferencia de {origen}: {descripcion}"
            )

            return redirect('balance_cuentas')
    else:
        form = TransferenciaForm()
    return render(request, 'finanzas/transferencia.html', {'form': form})

def balance_cuentas(request):
    cuentas = Cuenta.objects.filter(activa=True)
    saldo_cash = saldo_efectivo()
    saldo_bancos = sum(c.saldo_actual() for c in cuentas)

    total = saldo_cash + sum(c.saldo_actual() for c in cuentas)

    return render(request, 'finanzas/balance_cuentas.html', {
        'cuentas': cuentas,
        'saldo_efectivo': saldo_cash,
        'saldo_bancos': saldo_bancos,
        'total': total,
        "module": 'admin',
    })

def movimientos_cuenta(request, cuenta_id):
    cuenta = Cuenta.objects.get(id=cuenta_id)
    movimientos = MovimientoContable.objects.filter(
        cuenta=cuenta
    ).order_by('-fecha')

    return render(request, 'finanzas/movimientos_cuenta.html', {
        'cuenta': cuenta,
        'movimientos': movimientos
    })

def registrar_movimiento(request):
    if request.method == 'POST':
        form = MovimientoForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('balance_cuentas')
    else:
        form = MovimientoForm()

    return render(request, 'finanzas/registrar_movimiento.html', {
        'form': form
    })

def transferencia_cuentas(request):
    if request.method == 'POST':
        form = TransferenciaForm(request.POST)
        if form.is_valid():
            origen = form.cleaned_data['cuenta_origen']
            destino = form.cleaned_data['cuenta_destino']
            monto = form.cleaned_data['monto']
            descripcion = form.cleaned_data['descripcion']

            # EGRESO
            MovimientoContable.objects.create(
                pedido=None,
                tipo='EGRESO',
                monto=monto,
                metodo_pago='TRANSFERENCIA',
                cuenta=origen,
                fecha=timezone.now(),
                descripcion=f"Transferencia a {destino.nombre}. {descripcion}"
            )

            # INGRESO
            MovimientoContable.objects.create(
                pedido=None,
                tipo='INGRESO',
                monto=monto,
                metodo_pago='TRANSFERENCIA',
                cuenta=destino,
                fecha=timezone.now(),
                descripcion=f"Transferencia desde {origen.nombre}. {descripcion}"
            )

            return redirect('balance_cuentas')
    else:
        form = TransferenciaForm()

    return render(request, 'finanzas/transferencia.html', {
        'form': form
    })

def movimientos_efectivo(request):
    movimientos = MovimientoContable.objects.filter(
        metodo_pago='efectivo',
        cuenta__isnull=True
    ).order_by('-fecha')

    return render(request, 'finanzas/movimientos_efectivo.html', {
        'movimientos': movimientos
    })

def traspaso_efectivo_banco(request):
    if request.method == 'POST':
        form = TraspasoEfectivoBancoForm(request.POST)
        if form.is_valid():
            origen = form.cleaned_data['origen_tipo']
            cuenta = form.cleaned_data['cuenta_banco']
            monto = form.cleaned_data['monto']
            descripcion = form.cleaned_data['descripcion']

            now = timezone.now()

            if origen == 'EFECTIVO':
                # EGRESO efectivo
                MovimientoContable.objects.create(
                    pedido=None,
                    tipo='EGRESO',
                    monto=monto,
                    metodo_pago='efectivo',
                    cuenta=None,
                    fecha=now,
                    descripcion=f"Traspaso a banco {cuenta.nombre}. {descripcion}"
                )

                # INGRESO banco
                MovimientoContable.objects.create(
                    pedido=None,
                    tipo='INGRESO',
                    monto=monto,
                    metodo_pago='transferencia',
                    cuenta=cuenta,
                    fecha=now,
                    descripcion="Traspaso desde efectivo"
                )

            else:
                # EGRESO banco
                MovimientoContable.objects.create(
                    pedido=None,
                    tipo='EGRESO',
                    monto=monto,
                    metodo_pago='transferencia',
                    cuenta=cuenta,
                    fecha=now,
                    descripcion="Retiro a efectivo"
                )

                # INGRESO efectivo
                MovimientoContable.objects.create(
                    pedido=None,
                    tipo='INGRESO',
                    monto=monto,
                    metodo_pago='efectivo',
                    cuenta=None,
                    fecha=now,
                    descripcion=f"Traspaso desde banco {cuenta.nombre}. {descripcion}"
                )

            return redirect('balance_cuentas')
    else:
        form = TraspasoEfectivoBancoForm()

    return render(request, 'finanzas/traspaso_efectivo_banco.html', {
        'form': form
    })
