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

function normText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Score estricto: "mini slider" debe preferir Mini Slider sobre Combo Mini Slider.
 * - exige todos los tokens del query
 * - boost si la frase aparece
 * - boost grande si el nombre es exactamente esos tokens
 * - penaliza palabras extra en el nombre (combo, two, bowl…)
 */
function scoreAgainstQuery(nombre, queryTokens) {
  const tokens = (queryTokens || [])
    .map((t) => normText(t))
    .filter((t) => t.length >= 2);
  if (!tokens.length) return 0;

  const n = normText(nombre);
  const nameTokens = n.split(/[^a-z0-9]+/).filter((t) => t.length >= 2);

  for (const t of tokens) {
    if (!n.includes(t)) return -1000;
  }

  let s = tokens.length * 2;
  const phrase = tokens.join(' ');
  if (n.includes(phrase)) s += 8;

  const exact =
    nameTokens.length === tokens.length &&
    tokens.every((t) => nameTokens.includes(t));
  if (exact) s += 20;

  const extras = nameTokens.filter((t) => !tokens.includes(t));
  s -= extras.length * 5;
  s -= Math.max(0, nameTokens.length - tokens.length) * 2;
  return s;
}

// Con varios nombres (search_parts), cada producto se puntúa vs el mejor grupo
const partsForScore =
  Array.isArray(rewrite.search_parts) && rewrite.search_parts.length
    ? rewrite.search_parts.map((p) =>
        String(p)
          .split(/\s+/)
          .filter(Boolean)
      )
    : [tokens];

function score(nombre) {
  let best = -1000;
  for (const partTokens of partsForScore) {
    const s = scoreAgainstQuery(nombre, partTokens.length ? partTokens : tokens);
    if (s > best) best = s;
  }
  return best;
}

const crmIds = new Set(resultados.map((c) => c.id));

const ranked = [...resultados]
  .filter((c) => c && c.id != null && c.disponible !== false)
  .map((c) => ({ ...c, _score: score(c.nombre) }))
  .filter((c) => c._score > -1000)
  .sort(
    (a, b) =>
      b._score - a._score ||
      String(a.nombre).length - String(b.nombre).length ||
      String(a.nombre).localeCompare(String(b.nombre))
  );

if (ranked.length === 0) {
  return [{
    json: {
      preferred_order_ids: [],
      top_n: 5,
      needs_human: false,
      reason: 'no_matches',
      confidence: 0,
      top: [],
      menu_whatsapp:
        `No encontré brincolines con "${userText}".\nPrueba otra palabra (tema, tamaño)\n` +
        '0. Buscar de nuevo\n9. Hablar con un asesor',
      search_tokens_rewrite,
      search_tokens_crm,
      _debug: {
        query_crm: rewrite.query_crm || null,
        http_count: http.count ?? 0,
        exit: 'business_empty_after_score',
      },
    },
  }];
}

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
  'Encontré estas opciones en el sistema:',
  ...lines,
  '',
  'Escribe el *número* de la que quieres.',
  'Si quieres *varias*, mándalas juntas: *1 y 3* o *1,2*.',
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
