from django.utils import timezone
from django.db.models import Sum, Count
from core.models import Renta, Gasto, Nomina, RentaProducto
from django.shortcuts import render
from datetime import date
from django.utils.timezone import now

def dashboard_home(request):
    hoy = timezone.now().date()

    mes = request.GET.get("mes")
    año = request.GET.get("año")

    try:
        mes = int(mes) if mes else hoy.month
        año = int(año) if año else hoy.year
    except ValueError:
        mes = hoy.month
        año = hoy.year

    meses = range(1, 13)

    # 🔁 Mes anterior
    mes_anterior = mes - 1
    año_anterior = año
    if mes_anterior == 0:
        mes_anterior = 12
        año_anterior -= 1

    # 🔁 Mes siguiente
    mes_siguiente = mes + 1
    año_siguiente = año
    if mes_siguiente == 13:
        mes_siguiente = 1
        año_siguiente += 1

    # 🔹 Ingresos reales (solo pagadas)
    ingresos_mes = (
        Renta.objects
        .filter(
            fecha_renta__year=año,
            fecha_renta__month=mes,
            finanza__pagado=True
        )
        .aggregate(total=Sum('finanza__total'))['total'] or 0
    )

    # 🔹 Gastos
    gastos_mes = (
        Gasto.objects
        .filter(fecha__year=año, fecha__month=mes)
        .aggregate(total=Sum('monto'))['total'] or 0
    )

    # 🔹 Nómina
    nominas_mes = Nomina.objects.filter(
        fecha_inicio__lte=date(año, mes, 28),
        fecha_fin__gte=date(año, mes, 1)
    )

    nomina_mes = sum(
        (n.dias_trabajados * n.empleado.sueldo_diario) + n.pago_eventos_extra()
        for n in nominas_mes
    )

    utilidad = ingresos_mes - gastos_mes - nomina_mes

    context = {
        "ingresos_mes": ingresos_mes,
        "gastos_mes": gastos_mes,
        "nomina_mes": nomina_mes,
        "utilidad": utilidad,

        "mes_seleccionado": mes,
        "año_seleccionado": año,
        "meses": meses,

        # 🔥 ESTO ES LO QUE FALTABA
        "mes_anterior": mes_anterior,
        "año_anterior": año_anterior,
        "mes_siguiente": mes_siguiente,
        "año_siguiente": año_siguiente,
    }

    return render(request, "core/dashboard/home.html", context)

def productos_mas_rentados(request):
    hoy = now().date()

    # 📌 Mes y año desde GET
    mes = int(request.GET.get('mes', hoy.month))
    anio = int(request.GET.get('anio', hoy.year))
    anual = request.GET.get('anual')

    # ⬅️➡️ Navegación mensual
    if mes == 1:
        mes_anterior, anio_anterior = 12, anio - 1
    else:
        mes_anterior, anio_anterior = mes - 1, anio

    if mes == 12:
        mes_siguiente, anio_siguiente = 1, anio + 1
    else:
        mes_siguiente, anio_siguiente = mes + 1, anio

    # 📊 Query base
    productos = RentaProducto.objects.filter(
        renta__status='ACTIVO'
    )

    if anual:
        productos = productos.filter(
            renta__fecha_renta__year=anio
        )
        titulo = f"Productos más rentados por ingreso - {anio}"
    else:
        productos = productos.filter(
            renta__fecha_renta__month=mes,
            renta__fecha_renta__year=anio
        )
        titulo = f"Productos más rentados por ingreso - {mes}/{anio}"

    productos = (
        productos
        .values(
            'producto__nombre',
            'producto__tipo'
        )
        .annotate(
            ingreso_total=Sum('subtotal')
        )
        .order_by('-ingreso_total')
    )

    return render(request, 'core/dashboard/productos_mas_rentados.html', {
        'productos': productos,
        'mes': mes,
        'anio': anio,
        'titulo': titulo,
        'mes_anterior': mes_anterior,
        'anio_anterior': anio_anterior,
        'mes_siguiente': mes_siguiente,
        'anio_siguiente': anio_siguiente,
    })