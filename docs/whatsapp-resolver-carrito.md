# Resolver carrito WhatsApp (product_retailer_id → Producto)

## Campo CRM

En `Producto.meta_retailer_id` (admin → Productos, editable en lista).

- Debe coincidir **exactamente** con el `product_retailer_id` del catálogo Meta.
- Vacío = no mapeado.
- Unique entre valores no vacíos.

## Endpoint

`POST /v1/bot/whatsapp/resolver-carrito/` (JWT staff, mismo `bot-whatsapp`)

```json
{ "items": [ { "product_retailer_id": "SKU-123", "cantidad": 2 } ] }
```

Respuesta:

```json
{
  "resueltos": [
    {
      "id": 17,
      "nombre": "Mini slider",
      "tipo": "BR",
      "precio": "1800.00",
      "cantidad": 2,
      "product_retailer_id": "SKU-123"
    }
  ],
  "no_identificados": [
    { "product_retailer_id": "SKU-X", "cantidad": 1, "motivo": "sin_mapeo" }
  ]
}
```

Motivos de `no_identificados`: `sin_mapeo` | `inactivo` | `vacio`.

Contrato HTTP:

- `items` ausente o no-lista → **400**
- `items: []` → **200** con ambas listas vacías

No consulta disponibilidad ni stock. Solo mapeo.
