"""Contenido por defecto del sitio público (seed + fallback)."""

SITIO_MEDIA_CLAVES = (
    'hero',
    'servicio_0',
    'servicio_1',
    'servicio_2',
    'servicio_3',
    'nosotros',
)

SITIO_MEDIA_LABELS = {
    'hero': 'Foto principal (hero)',
    'servicio_0': 'Servicio: Brincolines',
    'servicio_1': 'Servicio: Mobiliario',
    'servicio_2': 'Servicio: Loza y cristalería',
    'servicio_3': 'Servicio: Animación',
    'nosotros': 'Foto Nosotros / equipo',
}


def default_sitio_datos():
    return {
        'contacto': {
            'whatsapp_display': '55 0000 0000',
            'whatsapp_phone': '5500000000',
            'email': 'hola@trotamundos.mx',
            'horario': 'Lun a sáb, 9:00 a 19:00',
        },
        'hero': {
            'pill': 'Desde 2001 haciendo fiestas en el estado',
            'titulo_l1': 'La fiesta',
            'titulo_l2': 'lista y segura,',
            'titulo_l3': 'en una llamada',
            'lead': (
                'Renta de mobiliario, loza, brincolines y animación para eventos. '
                'Más de 60 brincolines en catálogo, instalación certificada y personal '
                'capacitado que se queda a cuidar el juego.'
            ),
            'garantias': [
                'Entrega e instalación',
                'Anclaje y supervisión',
                'Cobertura estatal',
            ],
            'chip_numero': '+60',
            'chip_texto': 'brincolines distintos',
        },
        'trust': [
            {'valor': '24 años', 'etiqueta': 'de experiencia'},
            {'valor': '+60', 'etiqueta': 'brincolines en catálogo'},
            {'valor': '4', 'etiqueta': 'servicios en un solo proveedor'},
            {'valor': '100%', 'etiqueta': 'equipo sanitizado'},
        ],
        'servicios_intro': {
            'eyebrow': 'Servicios',
            'titulo': 'Todo tu evento con un solo proveedor',
        },
        'servicios': [
            {
                'title': 'Brincolines',
                'blurb': (
                    'Más de 60 modelos: inflables, resbaladillas y combos. '
                    'Anclaje y supervisión incluidos.'
                ),
            },
            {
                'title': 'Mobiliario',
                'blurb': (
                    'Mesas, sillas, periqueras, carpas y pistas. '
                    'Montaje y desmontaje por nuestro equipo.'
                ),
            },
            {
                'title': 'Loza y cristalería',
                'blurb': (
                    'Vajilla, cubiertos, copas y mantelería. '
                    'Todo sanitizado y contado pieza por pieza.'
                ),
            },
            {
                'title': 'Animación',
                'blurb': (
                    'Botargas, juegos, música y show. '
                    'Animadores con experiencia en fiestas infantiles.'
                ),
            },
        ],
        'seguridad': {
            'eyebrow': 'Seguridad',
            'titulo': 'Un brincolín divertido primero tiene que estar bien puesto',
            'lead': (
                'Revisamos, lavamos y probamos cada juego antes de salir de bodega. '
                'En el evento anclamos según el tipo de piso y dejamos personal atento al juego.'
            ),
            'items': [
                {
                    'title': 'Anclaje certificado',
                    'blurb': 'Estacas o contrapesos según el piso.',
                },
                {
                    'title': 'Personal capacitado',
                    'blurb': 'Un responsable por juego durante el evento.',
                },
                {
                    'title': 'Lavado y sanitizado',
                    'blurb': 'Después de cada renta, sin excepción.',
                },
                {
                    'title': 'Respaldo eléctrico',
                    'blurb': 'Blowers de repuesto en cada montaje.',
                },
            ],
        },
        'catalogo_intro': {
            'eyebrow': 'Catálogo',
            'titulo': 'Más de 60 brincolines para escoger',
        },
        'paquetes_intro': {
            'eyebrow': 'Paquetes',
            'titulo': 'Precios claros para empezar',
            'lead': (
                'Cada evento se cotiza según fecha, sede y horas. '
                'Estos paquetes son la referencia más pedida.'
            ),
        },
        'paquetes': [
            {
                'id': 'fiesta-en-casa',
                'title': 'Fiesta en casa',
                'blurb': '1 brincolín, 5 mesas, 40 sillas y 4 horas de servicio.',
                'price': 'Desde $2,400',
                'features': [
                    'Entrega e instalación',
                    'Supervisión del juego',
                    'Recolección al cierre',
                ],
                'featured': False,
                'cta': 'Cotizar',
                'dark': False,
            },
            {
                'id': 'fiesta-completa',
                'title': 'Fiesta completa',
                'blurb': '2 brincolines, mobiliario para 80, loza y 1 animador.',
                'price': 'Desde $6,900',
                'features': [
                    'Todo lo del paquete anterior',
                    'Loza y mantelería sanitizada',
                    '3 horas de animación',
                ],
                'featured': True,
                'cta': 'Cotizar',
                'dark': True,
            },
            {
                'id': 'evento-social',
                'title': 'Evento social',
                'blurb': (
                    'Bodas, XV años y empresas. Montaje a medida desde 150 personas.'
                ),
                'price': 'A cotizar',
                'features': [
                    'Visita previa a la sede',
                    'Carpas, pista y periqueras',
                    'Coordinador en sitio',
                ],
                'featured': False,
                'cta': 'Hablar con ventas',
                'dark': False,
            },
        ],
        'nosotros': {
            'eyebrow': 'Nosotros',
            'titulo': 'Llevamos desde 2001 armando fiestas en el estado',
            'lead': (
                'Empezamos rentando unos cuantos brincolines y hoy montamos desde '
                'cumpleaños en casa hasta eventos de empresa. Lo que no cambió es '
                'cómo trabajamos: llegamos temprano, dejamos todo instalado y '
                'probado, y nos quedamos hasta que la fiesta termina.'
            ),
            'stats': [
                {'valor': '2001', 'etiqueta': 'Año de fundación'},
                {'valor': 'Estatal', 'etiqueta': 'Cobertura de servicio'},
            ],
        },
        'faq_intro': {
            'eyebrow': 'Preguntas',
            'titulo': 'Lo que más nos preguntan',
            'lead': (
                '¿No ves tu duda? Escríbenos por WhatsApp y te contestamos el mismo día.'
            ),
        },
        'faq': [
            {
                'q': '¿Con cuánta anticipación debo apartar?',
                'a': (
                    'Recomendamos dos semanas. En temporada alta (mayo, diciembre) '
                    'conviene un mes.'
                ),
            },
            {
                'q': '¿Qué necesito para instalar un brincolín?',
                'a': (
                    'Un espacio plano libre de obstáculos y una toma de corriente '
                    'a menos de 20 metros.'
                ),
            },
            {
                'q': '¿El precio incluye entrega?',
                'a': (
                    'Sí, dentro de la ciudad. Fuera se cobra traslado según la distancia.'
                ),
            },
            {
                'q': '¿Qué pasa si llueve?',
                'a': (
                    'Reprogramamos sin costo o cambiamos el juego por uno bajo techo.'
                ),
            },
        ],
        'cta': {
            'titulo': 'Dinos la fecha y te mandamos la cotización',
            'lead': (
                'Contesta cinco datos y recibes el presupuesto por WhatsApp o '
                'correo el mismo día.'
            ),
            'boton': 'Abrir cotizador',
        },
        'footer': {
            'descripcion': (
                'Renta de mobiliario, loza, brincolines y animación para eventos. '
                'Trotando a mundos posibles desde 2001.'
            ),
            'copyright': '© 2026 Trotamundos',
        },
    }
