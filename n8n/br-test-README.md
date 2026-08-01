# BR TEST T1a + T1b

Workflow importable: `br-test-t1a-t1b.json`  
Generar/actualizar: `node scripts/build-br-test-workflow.js`

## Importar

1. n8n → Import from File → `n8n/br-test-t1a-t1b.json`
2. Activar el workflow
3. Confirmar que existe y está activo `TROTA CRM - Crear Plan WhatsApp` (motor)

## T1a — Search

```bash
curl -s -X POST https://bot.app.trotacrm.com/webhook/br-test-search \
  -H "Content-Type: application/json" \
  -d "{
    \"telefono\": \"5512345678\",
    \"user_text\": \"spiderman chico tobogan\",
    \"session\": {
      \"fecha_renta\": \"2026-08-15\",
      \"hora_inicio\": \"14:00\",
      \"hora_fin\": \"22:00\",
      \"cliente_nombre\": \"María López\",
      \"direccion\": \"Calle A 10\",
      \"colonia\": \"Jardines\",
      \"ciudad\": \"Colima\"
    }
  }"
```

Respuesta esperada: `search_id`, `menu_whatsapp`, `top[]`.

## T1b — Select

```bash
curl -s -X POST https://bot.app.trotacrm.com/webhook/br-test-select \
  -H "Content-Type: application/json" \
  -d "{\"search_id\":\"PEGAR_SEARCH_ID\",\"choice\":1,\"purpose\":\"cotizacion\"}"
```

- `choice: 0` → no llama motor (`search_again`)
- `purpose: renta_crear` → crea folio en CRM

## Ajustes vs draft original

- Código canónico: Rewrite, Rerank, Session To CRM Query
- HTTP usa `disponibilidad_query.*` (objeto), no string `disponibilidad_qs`
- `choice: 0` manejado
- Payload motor con `accion` + `telefono` top-level
