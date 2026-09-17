# Facturación CFDI (FiscalAPI) — variables de entorno

Agregar al `.env` del CRM (local y `/home/trota/crm-django/.env` en el droplet):

```
FISCALAPI_BASE_URL=https://test.fiscalapi.com
# Producción: https://live.fiscalapi.com

FISCALAPI_API_KEY=
FISCALAPI_TENANT_KEY=
FISCALAPI_ISSUER_ID=
FISCALAPI_EXPEDITION_ZIP=

# Opcionales
FISCALAPI_SERIES=R
FISCALAPI_ITEM_CODE=90101500
FISCALAPI_UNIT_CODE=E48
FISCALAPI_TAX_RATE=0.16
FISCALAPI_TOTAL_INCLUDES_TAX=true
FISCALAPI_PAYMENT_FORM=03
FISCALAPI_TIMEZONE=America/Mexico_City
# Copia interna de cada CFDI (además del email del cliente, si lo hay)
FISCALAPI_COPY_EMAIL=trota.admon@gmail.com
```

Envío por correo (FiscalAPI):
- Tras timbrar, el CRM llama `POST /api/v4/invoices/send` con `{ invoiceId, toEmail }`.
- Destinos: email del cliente en el modal + `FISCALAPI_COPY_EMAIL`.
- La respuesta de `POST /v1/rentas/{id}/facturar/` incluye `email_enviado_a` y `email_errores`.

Pasos en FiscalAPI:
1. Crear cuenta y activar sandbox (test).
2. Crear emisor (RFC Trotamundos) y subir CSD (.cer / .key).
3. Copiar el **ID del emisor** → `FISCALAPI_ISSUER_ID`.
4. Crear API key + tenant → `FISCALAPI_API_KEY` / `FISCALAPI_TENANT_KEY`.
5. Poner el CP de expedición del emisor en `FISCALAPI_EXPEDITION_ZIP`.
6. Probar timbrado desde CRM (botón Facturar en una renta).
7. Para live: cambiar `FISCALAPI_BASE_URL`, keys de producción y comprar timbres.

Endpoint CRM:
- `GET  /v1/rentas/{id}/facturar/`
- `POST /v1/rentas/{id}/facturar/`  body: rfc, razon_social, regimen_fiscal, codigo_postal, email, uso_cfdi, forma_pago
- `GET  /v1/rentas/{id}/factura-pdf/`  → PDF (auth staff; on-demand desde FiscalAPI)
- `POST /v1/rentas/{id}/reenviar-factura/`  body: `{ email?, incluir_copia? }`
- `POST /v1/rentas/{id}/cancelar-factura/`  body: motivo, replacement_uuid (si motivo 01)
