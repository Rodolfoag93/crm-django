/**
 * Nodo Code n8n — Rerank candidatos CRM (sin LLM).
 * Preferencia simple por cobertura de tokens en el nombre.
 * Con LLM: mismo I/O, el modelo solo reordena ids existentes.
 *
 * Input:
 *  - $json.search_tokens
 *  - $json.candidatos  (desde /bot/disponibilidad/ → resultados)
 *    o $('HTTP Disponibilidad').item.json.resultados
 */

const base = $input.first().json;
const tokens = (base.search_tokens || []).map((t) => String(t).toLowerCase());
let candidatos = base.candidatos || base.resultados || [];

if (!candidatos.length) {
  try {
    candidatos = $('HTTP Disponibilidad').first().json.resultados || [];
  } catch (_) {
    candidatos = [];
  }
}

if (!candidatos.length) {
  return [{
    json: {
      preferred_order_ids: [],
      top_n: 5,
      needs_human: true,
      reason: 'Sin resultados en CRM',
      top: [],
      menu_whatsapp: 'No encontré brincolines con eso.\nPrueba otra palabra (tema, tamaño) o responde *9* para un asesor.',
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

const ranked = [...candidatos]
  .filter((c) => c.disponible !== false)
  .map((c) => ({ ...c, _score: score(c.nombre) }))
  .sort((a, b) => b._score - a._score || String(a.nombre).localeCompare(String(b.nombre)));

const topN = 5;
const top = ranked.slice(0, topN);
const ids = top.map((c) => c.id);

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
    confidence: tokens.length ? Math.min(1, (top[0]?._score || 0) / (tokens.length * 2)) : 0.5,
    top: top.map(({ _score, ...rest }) => rest),
    menu_whatsapp: menu,
  },
}];
