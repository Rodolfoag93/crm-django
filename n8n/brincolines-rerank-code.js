/**
 * Nodo Code n8n — nombre FIJO: "BR Rerank"
 *
 * NO lee candidatos del $json actual a ciegas.
 * Toma campos por referencia de nodo (contrato v1):
 *   search_tokens ← $('BR Rewrite')
 *   resultados    ← $('BR HTTP Disponibilidad')
 *
 * Output: step_3_rerank.output (incluye top[] + menu_whatsapp)
 */

const REWRITE = 'BR Rewrite';
const HTTP = 'BR HTTP Disponibilidad';

function nodeJson(name) {
  try {
    return $(name).first().json;
  } catch (err) {
    throw new Error(
      `BR Rerank: no encuentro el nodo "${name}". ` +
      `Renómbralo exactamente así o el flujo falla en silencio.`
    );
  }
}

const rewrite = nodeJson(REWRITE);
const http = nodeJson(HTTP);

const userText = rewrite.user_text || '';
const tokens = Array.isArray(rewrite.search_tokens)
  ? rewrite.search_tokens.map((t) => String(t).toLowerCase())
  : [];

// CANÓNICO: resultados (CRM). Alias candidatos solo si alguien lo renombró a mano.
const resultados = Array.isArray(http.resultados)
  ? http.resultados
  : (Array.isArray(http.candidatos) ? http.candidatos : null);

if (resultados === null) {
  throw new Error(
    `BR Rerank: "${HTTP}" no trae array "resultados". ` +
    `Keys recibidas: ${Object.keys(http || {}).join(', ') || '(vacío)'}`
  );
}

if (typeof http.count === 'number' && http.count !== resultados.length) {
  // No aborta: aviso en reason si hace falta; count es informativo.
}

if (!resultados.length) {
  const alts = Array.isArray(rewrite.alt_queries) ? rewrite.alt_queries : [];
  const hint = alts.length ? `\nPrueba: ${alts.join(', ')}` : '\nPrueba otra palabra (tema, tamaño)';
  return [{
    json: {
      preferred_order_ids: [],
      top_n: 5,
      needs_human: true,
      reason: 'Sin resultados en CRM',
      confidence: 0,
      top: [],
      menu_whatsapp:
        `No encontré brincolines con "${userText}".${hint}\n` +
        '0. Buscar de nuevo\n9. Hablar con un asesor',
      _debug: {
        query_crm: rewrite.query_crm || null,
        search_tokens: tokens,
        http_count: http.count ?? 0,
      },
    },
  }];
}

function score(nombre) {
  const n = String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  let s = 0;
  for (const t of tokens) {
    if (n.includes(t)) s += 2;
  }
  return s;
}

const crmIds = new Set(resultados.map((c) => c.id));

const ranked = [...resultados]
  .filter((c) => c && c.id != null && c.disponible !== false)
  .map((c) => ({ ...c, _score: score(c.nombre) }))
  .sort((a, b) => b._score - a._score || String(a.nombre).localeCompare(String(b.nombre)));

const topN = 5;
const top = ranked.slice(0, topN).map(({ _score, ...rest }) => rest);
const ids = top.map((c) => c.id);

// Guardrail: nunca devolver id fuera del CRM
for (const id of ids) {
  if (!crmIds.has(id)) {
    throw new Error(`BR Rerank: id ${id} no está en resultados CRM`);
  }
}

const lines = top.map((c, i) => {
  const libres = c.unidades_libres ?? '?';
  return `${i + 1}. ${c.nombre} — $${c.precio} (${libres} libres)`;
});

const menu = [
  'Encontré estas opciones:',
  ...lines,
  '',
  '0. Buscar de nuevo',
  '9. Hablar con un asesor',
].join('\n');

return [{
  json: {
    preferred_order_ids: ids,
    top_n: topN,
    needs_human: false,
    reason: null,
    confidence: tokens.length ? Math.min(1, (ranked[0]?._score || 0) / (tokens.length * 2)) : 0.5,
    top,
    menu_whatsapp: menu,
    _debug: {
      user_text: userText,
      search_tokens_used: tokens,
      http_search_tokens: http.search_tokens || [],
      http_count: http.count ?? resultados.length,
    },
  },
}];
