# Brincolines — búsqueda bot (contrato v1)

## Session → CRM query (centralizado)

**Nombre nodo:** `Session To CRM Query`  
**Código:** `session-to-crm-query.js`

### Purpose (input)

```json
{ "purpose": "disponibilidad" | "cotizacion" | "renta_crear" }
```

Default: `disponibilidad`.

### Outputs (shapes hermanos, no mezclados)

| Key | Usar en | Contiene |
|-----|---------|----------|
| `disponibilidad_query` / `disponibilidad_qs` | **GET** `/bot/disponibilidad/` | Solo `fecha`, horas, tipo, search, limit… **sin** productos/dirección |
| `cotizacion_body` | **POST** `/bot/cotizacion/` | `fecha_renta` + productos (+ manteles). `null` si purpose=disponibilidad |
| `renta_crear_body` | **POST** `/bot/renta/crear/` | Body completo (teléfono, dirección, productos, horario…). `null` si purpose≠renta_crear |

### Rename horario

| Session | GET disponibilidad | POST cotizacion/renta |
|---------|--------------------|------------------------|
| `fecha_renta` | `fecha` | `fecha_renta` |
| `hora_inicio` | `hora_inicio` | `hora_inicio` |
| `hora_fin` | `hora_fin` | `hora_fin` |

### Fail-loud

Si falta un campo requerido para el `purpose`, el nodo hace **throw**:

```
session_to_crm_query: falta fecha_renta en session (purpose=disponibilidad)...
```

No deja pasar `undefined` al CRM.

### Ejemplo HTTP BR

```
GET .../bot/disponibilidad/?{{ $('Session To CRM Query').item.json.disponibilidad_qs }}
  &search={{ $('BR Rewrite').item.json.query_crm }}
```

(o incluye `search`/`tipo` en el input del mapper antes de llamar).

No reimplementes el rename en cada handler.


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
