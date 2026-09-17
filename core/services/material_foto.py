"""Procesamiento de fotos del catálogo de materiales."""

from __future__ import annotations

import io


class MaterialFotoError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def quitar_fondo_fondo_blanco(source: bytes) -> bytes:
    """
    Recorta el sujeto (rembg) y lo compone sobre fondo blanco.
    Devuelve JPEG.
    """
    try:
        from rembg import remove
    except ImportError as exc:
        raise MaterialFotoError(
            'Quitar fondo no está instalado en el servidor (rembg).',
            status=503,
        ) from exc

    from PIL import Image

    if not source:
        raise MaterialFotoError('Imagen vacía')

    try:
        cut = remove(source)
    except Exception as exc:
        raise MaterialFotoError(f'No se pudo procesar la imagen: {exc}') from exc

    img = Image.open(io.BytesIO(cut)).convert('RGBA')
    white = Image.new('RGBA', img.size, (255, 255, 255, 255))
    composed = Image.alpha_composite(white, img).convert('RGB')
    out = io.BytesIO()
    composed.save(out, format='JPEG', quality=92, optimize=True)
    return out.getvalue()
