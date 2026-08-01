/**
 * Nodo Code n8n — nombre FIJO: "BR Rewrite"
 * Input:  { user_text: string }  (también acepta body)
 * Output: ver brincolines-ai-contract.json → step_1_rewrite.output
 */

const text = String($input.first().json.user_text || $input.first().json.body || '').trim();
if (!text) {
  throw new Error('BR Rewrite: falta user_text');
}

const raw = text
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const synonyms = {
  chiquito: 'chico',
  chiquita: 'chico',
  pequeno: 'chico',
  grande: 'grande',
  tobogan: 'tobogan',
  'hombre arana': 'spiderman',
};

let normalized = raw;
for (const [from, to] of Object.entries(synonyms)) {
  normalized = normalized.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to);
}

const stop = new Set(['con', 'de', 'el', 'la', 'los', 'las', 'un', 'una', 'para', 'brincolin', 'brincolines']);
const tokens = normalized
  .split(/[^a-z0-9]+/)
  .map((t) => synonyms[t] || t)
  .filter((t) => t.length >= 2 && !stop.has(t))
  .slice(0, 6);

const unique = [...new Set(tokens)];

if (!unique.length) {
  return [{
    json: {
      user_text: text,
      search_tokens: [],
      query_crm: '',
      alt_queries: [],
      needs_human: true,
      reason: 'No se pudo extraer tokens de búsqueda',
    },
  }];
}

return [{
  json: {
    user_text: text,
    search_tokens: unique,
    query_crm: unique.join(' '),
    alt_queries: unique.length > 1 ? [unique[0]] : [],
    needs_human: false,
    reason: null,
  },
}];
