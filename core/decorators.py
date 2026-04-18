from functools import wraps
from django.shortcuts import redirect
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied

# Coordinador, encargado y administración de listas de material por evento
_GRUPOS_LISTAS_MATERIAL = frozenset({
    'Coordinador',
    'Encargado Material',
    'Administrador',
})


def acceso_listas_material(view_func):
    """Solo Coordinador, Encargado Material, Administrador o superusuario."""
    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect('login')
        u = request.user
        if u.is_superuser or u.groups.filter(name__in=_GRUPOS_LISTAS_MATERIAL).exists():
            return view_func(request, *args, **kwargs)
        messages.error(
            request,
            'No tienes permiso para acceder a las listas de material.',
        )
        return redirect('home')

    return _wrapped

def solo_admin(view_func):
    @wraps(view_func)
    def _wrapped_view(request, *args, **kwargs):
        user = request.user

        if (
            user.is_authenticated
            and user.groups.filter(name='cargador').exists()
            and not user.is_superuser
        ):
            return redirect('mi_ruta')

        return view_func(request, *args, **kwargs)

    return _wrapped_view

def solo_coordinador(view_func):
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect('login')
        if not request.user.groups.filter(name='Coordinador').exists():
            return redirect('home')
        return view_func(request, *args, **kwargs)
    return wrapper

def no_coordinador(view_func):
    def wrapper(request, *args, **kwargs):
        es_coordinador = request.user.groups.filter(name='Coordinador').exists()
        es_encargado = request.user.groups.filter(name='Encargado Material').exists()
        if es_coordinador and not es_encargado:
            return redirect('mis_eventos')
        return view_func(request, *args, **kwargs)
    return login_required(wrapper)