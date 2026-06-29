from django.shortcuts import redirect
from django.contrib import messages


class SessionExpiradaMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Ignorar rutas de API REST
        if request.path.startswith('/api/') or request.path.startswith('/v1/'):
            return self.get_response(request)

        urls_publicas = ['/', '/accounts/logout/', '/admin/', '/accounts/login/']

        if not request.user.is_authenticated:
            es_publica = any(
                request.path == url or request.path.startswith('/admin/')
                for url in urls_publicas
            )
            if not es_publica:
                if request.method == 'POST' and hasattr(request, '_messages'):
                    messages.warning(request, 'Tu sesión expiró. Por favor inicia sesión de nuevo.')
                return redirect(f'/?next={request.get_full_path()}')

        response = self.get_response(request)
        return response