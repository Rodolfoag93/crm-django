# Brincolines — búsqueda bot (Fase B + IA opcional)

## Backend (ya implementado)

`GET /v1/bot/disponibilidad/`

| Param | Ejemplo | Efecto |
|-------|---------|--------|
| `tipo` | `BR` | Solo brincolines |
| `search` | `spiderman chico` | AND multi-token, case/accent-insensitive |
| `fecha` | `2026-08-15` | Obligatorio |
| `hora_inicio` / `hora_fin` | `14:00` / `22:00` | Obligatorio |
| `solo_disponibles` | `true` | Omite stock 0 |
| `limit` | `15` | Tope de filas (máx 50) |

Respuesta:

```json
{
  "count": 2,
  "search_tokens": ["spiderman", "chico"],
  "resultados": [
    {
      "id": 101,
      "nombre": "Brincolín Spiderman chico c/tobogán",
      "tipo": "BR",
      "precio": "1800.00",
      "disponible": true,
      "unidades_libres": 2
    }
  ]
}
```

También: `GET /v1/productos-buscar/?q=&tipo=BR` usa el mismo motor multi-token (sigue devolviendo **lista** para no romper la PWA).

## n8n — orden de nodos

1. **Rewrite** — pegar `brincolines-rewrite-code.js` (o LLM con mismo JSON)
2. **HTTP Request** CRM:
   ```
   GET {{ $env.CRM_API_BASE }}/bot/disponibilidad/
     ?tipo=BR
     &search={{ $json.query_crm }}
     &fecha={{ session.fecha_renta }}
     &hora_inicio={{ session.hora_inicio }}
     &hora_fin={{ session.hora_fin }}
     &solo_disponibles=true
     &limit=15
   Authorization: Bearer {{ token }}
   ```
3. **Rerank** — pegar `brincolines-rerank-code.js` (o LLM)
4. Enviar `menu_whatsapp` por Twilio
5. Usuario responde `1`–`5` → mapear a `top[i-1].id` → `productos[]`

## Contrato formal

Ver `brincolines-ai-contract.json`.
