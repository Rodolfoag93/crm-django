from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient


class WhatsappCartResolverTests(TestCase):
    """resolver_carrito + POST /v1/bot/whatsapp/resolver-carrito/."""

    def setUp(self):
        from core.models import Producto
        self.Producto = Producto
        self.activo = Producto.objects.create(
            nombre='Mini slider',
            tipo='BR',
            precio='1800.00',
            stock_total=2,
            stock_disponible=2,
            activo=True,
            meta_retailer_id='SKU-MINI',
        )
        self.inactivo = Producto.objects.create(
            nombre='Castillo viejo',
            tipo='BR',
            precio='900.00',
            stock_total=1,
            stock_disponible=0,
            activo=False,
            meta_retailer_id='SKU-VIEJO',
        )
        self.staff = User.objects.create_user('bot-cart', password='x', is_staff=True)
        self.no_staff = User.objects.create_user('empleado-cart', password='x', is_staff=False)
        self.client_api = APIClient()

    def test_servicio_resuelve_activo(self):
        from core.services import whatsapp_cart as wa_cart
        out = wa_cart.resolver_carrito([
            {'product_retailer_id': 'SKU-MINI', 'cantidad': 2},
        ])
        self.assertEqual(len(out['resueltos']), 1)
        self.assertEqual(out['resueltos'][0]['id'], self.activo.id)
        self.assertEqual(out['resueltos'][0]['cantidad'], 2)
        self.assertEqual(out['resueltos'][0]['product_retailer_id'], 'SKU-MINI')
        self.assertEqual(out['no_identificados'], [])

    def test_servicio_inactivo_motivo_explicito(self):
        """Dos pasos: existe + activo=False → motivo 'inactivo', no 'sin_mapeo'."""
        from core.services import whatsapp_cart as wa_cart
        out = wa_cart.resolver_carrito([
            {'product_retailer_id': 'SKU-VIEJO', 'cantidad': 1},
        ])
        self.assertEqual(out['resueltos'], [])
        self.assertEqual(len(out['no_identificados']), 1)
        self.assertEqual(out['no_identificados'][0]['motivo'], 'inactivo')
        self.assertEqual(out['no_identificados'][0]['product_retailer_id'], 'SKU-VIEJO')

    def test_servicio_sin_mapeo(self):
        from core.services import whatsapp_cart as wa_cart
        out = wa_cart.resolver_carrito([
            {'product_retailer_id': 'SKU-NO-EXISTE', 'cantidad': 1},
        ])
        self.assertEqual(out['resueltos'], [])
        self.assertEqual(out['no_identificados'][0]['motivo'], 'sin_mapeo')

    def test_servicio_fusiona_duplicados(self):
        from core.services import whatsapp_cart as wa_cart
        out = wa_cart.resolver_carrito([
            {'product_retailer_id': 'SKU-MINI', 'cantidad': 1},
            {'product_retailer_id': 'SKU-MINI', 'cantidad': 3},
        ])
        self.assertEqual(len(out['resueltos']), 1)
        self.assertEqual(out['resueltos'][0]['cantidad'], 4)

    def test_endpoint_items_ausente_400(self):
        self.client_api.force_authenticate(self.staff)
        resp = self.client_api.post('/v1/bot/whatsapp/resolver-carrito/', {}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_endpoint_items_no_lista_400(self):
        self.client_api.force_authenticate(self.staff)
        resp = self.client_api.post(
            '/v1/bot/whatsapp/resolver-carrito/',
            {'items': 'SKU-MINI'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_endpoint_items_vacio_200(self):
        self.client_api.force_authenticate(self.staff)
        resp = self.client_api.post(
            '/v1/bot/whatsapp/resolver-carrito/',
            {'items': []},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['resueltos'], [])
        self.assertEqual(resp.data['no_identificados'], [])

    def test_endpoint_mixto_200(self):
        self.client_api.force_authenticate(self.staff)
        resp = self.client_api.post('/v1/bot/whatsapp/resolver-carrito/', {
            'items': [
                {'product_retailer_id': 'SKU-MINI', 'cantidad': 1},
                {'product_retailer_id': 'SKU-VIEJO', 'cantidad': 1},
                {'product_retailer_id': 'SKU-X', 'cantidad': 1},
            ],
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['resueltos']), 1)
        self.assertEqual(resp.data['resueltos'][0]['id'], self.activo.id)
        motivos = {x['product_retailer_id']: x['motivo'] for x in resp.data['no_identificados']}
        self.assertEqual(motivos['SKU-VIEJO'], 'inactivo')
        self.assertEqual(motivos['SKU-X'], 'sin_mapeo')

    def test_endpoint_requiere_staff(self):
        self.client_api.force_authenticate(self.no_staff)
        resp = self.client_api.post(
            '/v1/bot/whatsapp/resolver-carrito/',
            {'items': []},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)
