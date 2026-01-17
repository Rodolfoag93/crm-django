from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


STATIC_URL = '/static/'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'


STATICFILES_DIRS = [
    BASE_DIR /  "static",
]

LOGIN_REDIRECT_URL = '/home/'
LOGOUT_REDIRECT_URL = '/accounts/login/'
LOGIN_URL = '/accounts/login/'
INSTALLED_APPS = [
    'core.apps.CoreConfig',  'dashboard', 'widget_tweaks',
]
