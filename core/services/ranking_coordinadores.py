"""Ranking de coordinadores: 70% encuesta cliente + 30% volumen de eventos."""
from __future__ import annotations

from django.contrib.auth.models import User
from django.db.models import Avg, Count

from core.models import AsignacionCoordinador, EncuestaClienteAnimacion

ENCUESTA_FIELD_NAMES = (
    'comunicacion_previo',
    'atencion_coordinador',
    'juegos_aceptacion',
    'staff_servicio',
    'material_estado',
)

ENCUESTA_CLIENTE_PREGUNTAS = (
    {
        'key': 'comunicacion_previo',
        'texto': 'El coordinador se comunicó a tiempo y resolvió tus dudas',
    },
    {
        'key': 'atencion_coordinador',
        'texto': 'Estuvo atento al staff e invitados durante el evento',
    },
    {
        'key': 'juegos_aceptacion',
        'texto': 'Los juegos tuvieron buena aceptación y hubo opciones para todos',
    },
    {
        'key': 'staff_servicio',
        'texto': 'El staff fue puntual, amable y estuvo al pendiente',
    },
    {
        'key': 'material_estado',
        'texto': 'El material llegó en buen estado y listo para usar',
    },
)


def _nombre_coordinador(user: User) -> str:
    try:
        if user.empleado and user.empleado.nombre:
            return user.empleado.nombre
    except Exception:
        pass
    nombre = f'{user.first_name} {user.last_name}'.strip()
    return nombre or user.username


def _filtros_periodo(anio: int | None, mes: int | None) -> dict:
    filtros = {}
    if anio is not None:
        filtros['renta__fecha_renta__year'] = anio
    if mes is not None:
        filtros['renta__fecha_renta__month'] = mes
    return filtros


def _promedio_encuesta_asignacion(encuesta: EncuestaClienteAnimacion) -> float:
    vals = [getattr(encuesta, f) for f in ENCUESTA_FIELD_NAMES]
    return round(sum(vals) / len(vals), 2)


def ranking_coordinadores(
    anio: int | None = None,
    mes: int | None = None,
    limit: int | None = None,
) -> list[dict]:
    filtros = _filtros_periodo(anio, mes)
    base_qs = AsignacionCoordinador.objects.filter(
        **filtros,
        coordinador__isnull=False,
    )

    eventos_por_coord = {
        row['coordinador_id']: row['total_eventos']
        for row in base_qs.values('coordinador_id').annotate(total_eventos=Count('id'))
    }
    if not eventos_por_coord:
        return []

    max_eventos = max(eventos_por_coord.values())

    encuesta_qs = EncuestaClienteAnimacion.objects.filter(
        asignacion__in=base_qs,
    )
    encuesta_por_coord: dict[int, list[float]] = {}
    for enc in encuesta_qs.select_related('asignacion'):
        cid = enc.asignacion.coordinador_id
        if cid is None:
            continue
        encuesta_por_coord.setdefault(cid, []).append(_promedio_encuesta_asignacion(enc))

    promedio_encuesta_por_coord = {
        cid: round(sum(vals) / len(vals), 2)
        for cid, vals in encuesta_por_coord.items()
    }

    user_ids = list(eventos_por_coord.keys())
    users = {u.id: u for u in User.objects.filter(id__in=user_ids).select_related('empleado')}

    filas = []
    for cid, total_eventos in eventos_por_coord.items():
        user = users.get(cid)
        if not user:
            continue

        eventos_5 = (total_eventos / max_eventos) * 5 if max_eventos > 0 else 0.0
        puntaje_eventos_componente = round(0.3 * eventos_5, 2)

        promedio_encuesta = promedio_encuesta_por_coord.get(cid)
        if promedio_encuesta is not None:
            puntaje_encuesta_componente = round(0.7 * promedio_encuesta, 2)
            puntaje_final = round(puntaje_encuesta_componente + puntaje_eventos_componente, 2)
        else:
            puntaje_encuesta_componente = 0.0
            puntaje_final = round(puntaje_eventos_componente, 2)

        filas.append({
            'id': cid,
            'nombre': _nombre_coordinador(user),
            'total_eventos': total_eventos,
            'promedio_encuesta': promedio_encuesta,
            'puntaje_final': puntaje_final,
            'puntaje_encuesta_componente': puntaje_encuesta_componente,
            'puntaje_eventos_componente': puntaje_eventos_componente,
        })

    filas.sort(
        key=lambda r: (-r['puntaje_final'], -r['total_eventos'], r['nombre'].lower()),
    )
    if limit is not None:
        filas = filas[:limit]
    return filas


def mi_calificacion_coordinador(user: User, anio: int | None = None) -> dict:
    filtros = _filtros_periodo(anio, None)
    encuestas = EncuestaClienteAnimacion.objects.filter(
        asignacion__coordinador=user,
        **{f'asignacion__{k}': v for k, v in filtros.items()},
    )
    total_encuestas = encuestas.count()

    agg = encuestas.aggregate(
        **{f: Avg(f) for f in ENCUESTA_FIELD_NAMES},
    )
    detalle = {
        f: round(agg[f] or 0, 2) if total_encuestas else None
        for f in ENCUESTA_FIELD_NAMES
    }
    promedio_general = None
    if total_encuestas:
        promedio_general = round(
            sum(detalle[f] or 0 for f in ENCUESTA_FIELD_NAMES) / len(ENCUESTA_FIELD_NAMES),
            2,
        )

    ranking = ranking_coordinadores(anio=anio)
    fila = next((r for r in ranking if r['id'] == user.id), None)
    puntaje_final = fila['puntaje_final'] if fila else None

    return {
        'sin_calificaciones': total_encuestas == 0,
        'promedio_general': promedio_general,
        'detalle': detalle,
        'total_encuestas': total_encuestas,
        'puntaje_final': puntaje_final,
        'total_eventos': fila['total_eventos'] if fila else 0,
    }
