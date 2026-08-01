# Brincolines — búsqueda bot (contrato v1)

## Nombres de nodos (obligatorios)

| Nodo | Nombre exacto en n8n |
|------|----------------------|
| Rewrite | `BR Rewrite` |
| HTTP CRM | `BR HTTP Disponibilidad` |
| Rerank | `BR Rerank` |

Si cambias el nombre, Rerank **lanza error explícito** (ya no falla en silencio).

## Cableado

```
[user_text] → BR Rewrite → BR HTTP Disponibilidad → BR Rerank → Twilio
```

### HTTP query (copiar tal cual)

```
GET {{ $env.CRM_API_BASE }}/bot/disponibilidad/
  tipo=BR
  search={{ $('BR Rewrite').item.json.query_crm }}
  fecha={{ $('Session').item.json.fecha_renta }}
  hora_inicio={{ $('Session').item.json.hora_inicio }}
  hora_fin={{ $('Session').item.json.hora_fin }}
  solo_disponibles=true
  limit=15
Authorization: Bearer {{ token }}
```

> `fecha` (query) ← `fecha_renta` (sesión). No mandes `fecha_renta` como nombre del query param.

### CRM response (canónico)

```json
{
  "count": 2,
  "search_tokens": ["spiderman", "chico"],
  "resultados": [
    {
      "id": 101,
      "nombre": "...",
      "tipo": "BR",
      "tipo_display": "Brincolín",
      "precio": "1800.00",
      "disponible": true,
      "unidades_libres": 2,
      "familia_mesa": null
    }
  ]
}
```

Campo canónico del array: **`resultados`** (no `candidatos`).

### Rerank lee por referencia

- `search_tokens` ← `$('BR Rewrite')` (sinónimos)
- `resultados` ← `$('BR HTTP Disponibilidad')`

No uses el `$json` post-HTTP para tokens del rewrite: se pierden.

### Selección menú → motor crear-plan

```
usuario responde N (1..5)
producto = top[N-1]
session.productos.push({ id: producto.id, cantidad: 1 })
```

Usar **`id`**, no `producto_id`.

## Archivos

- `brincolines-ai-contract.json` — contrato + matriz de alineación
- `brincolines-rewrite-code.js` — pegar en BR Rewrite
- `brincolines-rerank-code.js` — pegar en BR Rerank
