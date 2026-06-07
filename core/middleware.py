from django.shortcuts import redirect
from django.contrib import messages


class SessionExpiradaMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        urls_publicas = ['/', '/accounts/logout/', '/admin/']
        rutas_api = request.path.startswith('/api/')
        tiene_token = request.META.get('HTTP_AUTHORIZATION', '').startswith('Token ')

        if not request.user.is_authenticated and not rutas_api and not tiene_token:
            es_publica = any(
                request.path == url or request.path.startswith('/admin/')
                for url in urls_publicas
            )
            if not es_publica:
                if request.method == 'POST':
                    messages.warning(request, 'Tu sesión expiró. Por favor inicia sesión de nuevo.')
                return redirect('/')

        response = self.get_response(request)
        return response