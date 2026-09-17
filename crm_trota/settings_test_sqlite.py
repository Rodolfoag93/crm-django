"""Local test settings: in-memory SQLite. Do not use in production."""
from .settings import *  # noqa: F401,F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': 'file:memorydb_default?mode=memory&cache=shared',
        'OPTIONS': {'uri': True},
    }
}
