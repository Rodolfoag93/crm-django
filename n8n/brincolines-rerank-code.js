/**
 * Nodo Code n8n — nombre FIJO: "BR Rerank"
 *
 * Rutas de salida:
 *  A) CONTRATO ROTO  → throw (técnico)
 *     - falta nodo Rewrite/HTTP
 *     - HTTP no trae array "resultados" (undefined/null/no-array)
 *     - id fuera del set CRM
 *  B) NEGOCIO SIN MATCH → return conversacional (NO throw)
 *     - resultados: []  (array vacío válido)
 *
 * Tokens:
 *  - search_tokens_rewrite ← $('BR Rewrite').search_tokens  (scoring)
 *  - search_tokens_crm     ← $('BR HTTP Disponibilidad').search_tokens (audit)
 */

const REWRITE = 'BR Rewrite';
const HTTP = 'BR HTTP Disponibilidad';

function nodeJson(name) {
  try {
    return $(name).first().json;
  } catch (err) {
    throw new Error(
      `BR Rerank: CONTRATO — no encuentro el nodo "${name}". ` +
      `Renómbralo exactamente así.`
    );
  }
}

const rewrite = nodeJson(REWRITE);
const http = nodeJson(HTTP);

const userText = rewrite.user_text || '';
const search_tokens_rewrite = Array.isArray(rewrite.search_tokens)
  ? rewrite.search_tokens.map((t) => String(t).toLowerCase())
  : [];
const search_tokens_crm = Array.isArray(http.search_tokens)
  ? http.search_tokens.map((t) => String(t).toLowerCase())
  : [];

// --- Fix 1: forma del campo vs vacío de negocio ---
// null  = contrato roto (falta key o no es array) → THROW
// []    = 0 matches reales → mensaje conversacional
const resultadosRaw = Object.prototype.hasOwnProperty.call(http, 'resultados')
  ? http.resultados
  : (Object.prototype.hasOwnProperty.call(http, 'candidatos') ? http.candidatos : undefined);

if (!Array.isArray(resultadosRaw)) {
  throw new Error(
    `BR Rerank: CONTRATO — "${HTTP}" debe exponer array "resultados". ` +
    `Recibido typeof=${typeof resultadosRaw}; keys=${Object.keys(http || {}).join(',') || '(vacío)'}`
  );
}

const resultados = resultadosRaw;

// Scoring usa SOLO tokens del rewrite (sinónimos). CRM tokens son audit.
const tokens = search_tokens_rewrite;

if (resultados.length === 0) {
  const alts = Array.isArray(rewrite.alt_queries) ? rewrite.alt_queries : [];
  const hint = alts.length ? `\nPrueba: ${alts.join(', ')}` : '\nPrueba otra palabra (tema, tamaño)';
  return [{
    json: {
      preferred_order_ids: [],
      top_n: 5,
      needs_human: false, // negocio: reintentar búsqueda, no handoff técnico
      reason: 'no_matches',
      confidence: 0,
      top: [],
      menu_whatsapp:
        `No encontré brincolines con "${userText}".${hint}\n` +
        '0. Buscar de nuevo\n9. Hablar con un asesor',
      search_tokens_rewrite,
      search_tokens_crm,
      _debug: {
        query_crm: rewrite.query_crm || null,
        http_count: http.count ?? 0,
        exit: 'business_empty',
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

for (const id of ids) {
  if (!crmIds.has(id)) {
    throw new Error(`BR Rerank: CONTRATO — id ${id} no está en resultados CRM`);
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
    search_tokens_rewrite,
    search_tokens_crm,
    _debug: {
      user_text: userText,
      http_count: http.count ?? resultados.length,
      exit: 'ok',
    },
  },
}];
