from functools import wraps
from django.shortcuts import redirect

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