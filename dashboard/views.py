from django.utils import timezone
from django.db.models import Sum
from core.models import Renta
from core.models import Gasto
from core.models import Nomina
from django.shortcuts import render

def dashboard_home(request):
    hoy = timezone.now().date()

    # 🔹 Ingresos reales (solo rentas pagadas)
    ingresos_mes = (
        Renta.objects
        .filter(
            fecha_renta__month=hoy.month,
            pagado=True
        )
        .aggregate(total=Sum('precio_total'))['total'] or 0
    )

    # 🔹 Gastos del mes
    gastos_mes = (
        Gasto.objects
        .filter(fecha__month=hoy.month)
        .aggregate(total=Sum('monto'))['total'] or 0
    )

    # 🔹 Nómina del mes (cálculo real)
    nominas_mes = Nomina.objects.filter(
        fecha_inicio__lte=hoy.replace(day=28),
        fecha_fin__gte=hoy.replace(day=1)
    )

    nomina_mes = sum(
        (n.dias_trabajados * n.empleado.sueldo_diario) + n.pago_evento_extra
        for n in nominas_mes
    )

    # 🔹 Utilidad
    utilidad = ingresos_mes - (gastos_mes + nomina_mes)

    context = {
        'ingresos_mes': ingresos_mes,
        'gastos_mes': gastos_mes,
        'nomina_mes': nomina_mes,
        'utilidad': utilidad,
    }

    return render(request, 'core/dashboard/home.html', context)