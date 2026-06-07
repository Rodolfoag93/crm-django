from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView, TokenVerifyView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('core.urls')),
    path('v1/', include('core.api.urls')),
    path('api-auth/', include('rest_framework.urls')),

    # ─── JWT Auth ────────────────────────────────────────────────────
    path('v1/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('v1/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('v1/auth/token/verify/', TokenVerifyView.as_view(), name='token_verify'),

    # ─── Documentación API ───────────────────────────────────────────
    path('v1/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('v1/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('v1/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)