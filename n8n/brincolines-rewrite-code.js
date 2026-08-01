/**
 * Nodo Code n8n — Rewrite query BR (sin LLM).
 * Usa esto como fallback o Fase 0. Con LLM, reemplaza el cuerpo
 * por la llamada al modelo y parsea el mismo JSON de salida.
 *
 * Input esperado: $json.user_text
 * Output: rewrite_output (ver brincolines-ai-contract.json)
 */

const text = String($input.first().json.user_text || $input.first().json.body || '').trim();
if (!text) {
  throw new Error('Falta user_text');
}

const raw = text
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const synonyms = {
  chiquito: 'chico',
  chiquita: 'chico',
  pequeño: 'chico',
  pequeno: 'chico',
  grande: 'grande',
  tobogan: 'tobogan',
  'hombre arana': 'spiderman',
  'hombre araña': 'spiderman',
};

let normalized = raw;
for (const [from, to] of Object.entries(synonyms)) {
  normalized = normalized.replace(new RegExp(from, 'g'), to);
}

const stop = new Set(['con', 'de', 'el', 'la', 'los', 'las', 'un', 'una', 'para', 'brincolin', 'brincolines']);
const tokens = normalized
  .split(/[^a-z0-9]+/)
  .map((t) => synonyms[t] || t)
  .filter((t) => t.length >= 2 && !stop.has(t))
  .slice(0, 6);

const unique = [...new Set(tokens)];

return [{
  json: {
    search_tokens: unique,
    query_crm: unique.join(' '),
    alt_queries: unique.length > 1 ? [unique[0]] : [],
    needs_human: false,
    reason: null,
    user_text: text,
  },
}];
