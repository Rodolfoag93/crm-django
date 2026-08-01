/**
 * Genera n8n/br-test-t1a-t1b.json con código canónico embebido.
 * Uso: node scripts/build-br-test-workflow.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const n8nDir = path.join(root, 'n8n');

// Rewrite wrapper: canónico + preserva session/telefono/purpose del T1a
const rewriteWrapped = `// === BR Rewrite (canónico + merge prep T1a) ===
const __prep = $input.first().json;
const text = String(__prep.user_text || '').trim();
if (!text) throw new Error('BR Rewrite: falta user_text');

const raw = text.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
const synonyms = {
  chiquito: 'chico', chiquita: 'chico', pequeno: 'chico',
  grande: 'grande', tobogan: 'tobogan', 'hombre arana': 'spiderman',
};
let normalized = raw;
for (const [from, to] of Object.entries(synonyms)) {
  normalized = normalized.replace(new RegExp(from.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), 'g'), to);
}
const stop = new Set(['con','de','el','la','los','las','un','una','para','brincolin','brincolines']);
const tokens = normalized.split(/[^a-z0-9]+/).map(t => synonyms[t] || t)
  .filter(t => t.length >= 2 && !stop.has(t)).slice(0, 6);
const unique = [...new Set(tokens)];

return [{
  json: {
    ...__prep,
    user_text: text,
    search_tokens: unique,
    query_crm: unique.join(' '),
    search: unique.join(' '),
    tipo: 'BR',
    alt_queries: unique.length > 1 ? [unique[0]] : [],
    needs_human: unique.length === 0,
    reason: unique.length ? null : 'No se pudo extraer tokens de búsqueda',
  },
}];`;

const rerankSrc = fs
  .readFileSync(path.join(n8nDir, 'brincolines-rerank-code.js'), 'utf8')
  .replace(/\r\n/g, '\n');
const sessionSrc = fs
  .readFileSync(path.join(n8nDir, 'session-to-crm-query.js'), 'utf8')
  .replace(/\r\n/g, '\n');

const t1aPrep = `const body = $input.first().json.body ?? $input.first().json;

if (!body.telefono) throw new Error('T1a: falta telefono');
if (!body.user_text) throw new Error('T1a: falta user_text');
if (!body.session) throw new Error('T1a: falta session');
if (!body.session.fecha_renta) throw new Error('T1a: falta session.fecha_renta');
if (!body.session.hora_inicio) throw new Error('T1a: falta session.hora_inicio');
if (!body.session.hora_fin) throw new Error('T1a: falta session.hora_fin');

return [{
  json: {
    telefono: String(body.telefono).replace(/\\D/g, ''),
    user_text: String(body.user_text).trim(),
    session: {
      ...body.session,
      telefono: String(body.telefono).replace(/\\D/g, ''),
    },
    purpose: 'disponibilidad',
    tipo: 'BR',
    solo_disponibles: true,
    limit: 15,
  }
}];`;

const guardarState = `const rerank = $input.first().json;
const prep = $('T1a Preparar Input').item.json;

const staticData = $getWorkflowStaticData('global');
if (!staticData.br_searches) staticData.br_searches = {};

const now = Date.now();
const TTL_MS = 15 * 60 * 1000;
for (const [id, entry] of Object.entries(staticData.br_searches)) {
  if (now - entry.created_at > TTL_MS) delete staticData.br_searches[id];
}

const hasTop = Array.isArray(rerank.top) && rerank.top.length > 0;
const searchId = hasTop ? \`br_\${prep.telefono}_\${now}\` : null;

if (hasTop) {
  staticData.br_searches[searchId] = {
    created_at: now,
    telefono: prep.telefono,
    session: prep.session,
    top: rerank.top,
    query_crm: $('BR Rewrite').item.json.query_crm || null,
  };
}

return [{
  json: {
    ok: hasTop,
    search_id: searchId,
    expires_in_sec: hasTop ? 900 : null,
    menu_whatsapp: rerank.menu_whatsapp,
    needs_human: rerank.needs_human,
    reason: rerank.reason,
    top: rerank.top || [],
    preferred_order_ids: rerank.preferred_order_ids || [],
    search_tokens_rewrite: rerank.search_tokens_rewrite,
    search_tokens_crm: rerank.search_tokens_crm,
    _debug: rerank._debug || null,
  }
}];`;

const t1bCargar = `const body = $input.first().json.body ?? $input.first().json;

if (!body.search_id) throw new Error('T1b: falta search_id');
if (body.choice === undefined || body.choice === null || body.choice === '') {
  throw new Error('T1b: falta choice (número de opción, 0 = buscar de nuevo)');
}

const choice = Number(body.choice);
const staticData = $getWorkflowStaticData('global');
const entry = staticData.br_searches && staticData.br_searches[body.search_id];

if (!entry) {
  throw new Error(
    \`T1b: search_id "\${body.search_id}" no encontrado o expirado (TTL 15 min). Vuelve a correr T1a.\`
  );
}

// choice 0 = buscar de nuevo (turno conversacional, no llama motor)
if (choice === 0) {
  return [{
    json: {
      ok: false,
      reason: 'search_again',
      needs_human: false,
      mensaje_whatsapp: 'Ok, escribe de nuevo qué brincolín buscas (tema, tamaño…).',
      skip_motor: true,
      telefono: entry.telefono,
      session: entry.session,
    }
  }];
}

const idx = choice - 1;
const item = entry.top[idx];
if (!item) {
  throw new Error(
    \`T1b: choice=\${choice} fuera de rango. Opciones válidas: 1-\${entry.top.length} (o 0 para buscar de nuevo)\`
  );
}

const purpose = body.purpose === 'renta_crear' ? 'renta_crear' : 'cotizacion';

return [{
  json: {
    skip_motor: false,
    telefono: entry.telefono,
    session: {
      ...entry.session,
      telefono: entry.telefono,
      productos: [{ id: item.id, cantidad: 1 }],
    },
    productos: [{ id: item.id, cantidad: 1 }],
    producto_elegido: item,
    purpose,
  }
}];`;

const armarPayload = `const s = $input.first().json;

if (s.skip_motor) {
  return [{ json: s }];
}

const mapped = $('Session To CRM Query (T1b)').item.json;
const purpose = mapped.purpose;
let payload;

if (purpose === 'renta_crear') {
  payload = mapped.renta_crear_body;
} else {
  payload = mapped.cotizacion_body;
}

if (!payload) {
  throw new Error('Armar Payload Motor: body null para purpose=' + purpose);
}

// Motor trotacrm-crear-plan espera top-level accion + telefono + horario + productos
const motorBody = {
  ...payload,
  accion: purpose === 'renta_crear' ? 'crear' : 'cotizar',
  telefono: s.telefono || payload.telefono,
  nombre: payload.cliente_nombre || s.session?.cliente_nombre || '',
  direccion: payload.calle_y_numero || s.session?.direccion || '',
  colonia: payload.colonia || s.session?.colonia || '',
  ciudad: payload.ciudad_o_municipio || s.session?.ciudad || '',
};

return [{
  json: {
    skip_motor: false,
    purpose,
    motor_body: motorBody,
    producto_elegido: s.producto_elegido,
  }
}];`;

const formatearT1b = `const prev = $('Armar Payload Motor').item.json;

if (prev.skip_motor) {
  return [{
    json: {
      ok: false,
      reason: prev.reason,
      needs_human: false,
      mensaje_whatsapp: prev.mensaje_whatsapp,
    }
  }];
}

const motor = $input.first().json;
return [{
  json: {
    ...motor,
    purpose: prev.purpose,
    producto_elegido: prev.producto_elegido,
  }
}];`;

function codeNode(id, name, jsCode, position) {
  return {
    parameters: { jsCode },
    id,
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
  };
}

function webhookNode(id, name, webhookPath, position) {
  return {
    parameters: {
      httpMethod: 'POST',
      path: webhookPath,
      responseMode: 'responseNode',
      options: {},
    },
    id,
    name,
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position,
    webhookId: webhookPath,
  };
}

function respondNode(id, name, position) {
  return {
    parameters: {
      respondWith: 'json',
      responseBody: '={{ $json }}',
      options: {},
    },
    id,
    name,
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position,
  };
}

const workflow = {
  name: 'BR TEST - Search (T1a) + Select (T1b)',
  nodes: [
    webhookNode('t1a-0001', 'T1a Webhook', 'br-test-search', [0, 200]),
    codeNode('t1a-0002', 'T1a Preparar Input', t1aPrep, [220, 200]),
    codeNode('t1a-0003', 'BR Rewrite', rewriteWrapped, [440, 200]),
    codeNode('t1a-0004', 'Session To CRM Query (T1a)', sessionSrc, [660, 200]),
    {
      parameters: {
        method: 'POST',
        url: 'https://app.trotacrm.com/v1/auth/token/',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={\n  "username": "{{ $env.CRM_BOT_USER || \'bot-whatsapp\' }}",\n  "password": "{{ $env.CRM_BOT_PASSWORD }}"\n}',
        options: {},
      },
      id: 't1a-0005',
      name: 'Obtener Token JWT',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [880, 200],
    },
    {
      parameters: {
        method: 'GET',
        url: '={{ $env.CRM_API_BASE }}/bot/disponibilidad/',
        sendQuery: true,
        queryParameters: {
          parameters: [
            { name: 'tipo', value: 'BR' },
            { name: 'search', value: "={{ $('BR Rewrite').item.json.query_crm }}" },
            {
              name: 'fecha',
              value:
                "={{ $('Session To CRM Query (T1a)').item.json.disponibilidad_query.fecha }}",
            },
            {
              name: 'hora_inicio',
              value:
                "={{ $('Session To CRM Query (T1a)').item.json.disponibilidad_query.hora_inicio }}",
            },
            {
              name: 'hora_fin',
              value:
                "={{ $('Session To CRM Query (T1a)').item.json.disponibilidad_query.hora_fin }}",
            },
            { name: 'solo_disponibles', value: 'true' },
            { name: 'limit', value: '15' },
          ],
        },
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'Authorization',
              value: "=Bearer {{ $('Obtener Token JWT').item.json.access }}",
            },
          ],
        },
        options: {},
      },
      id: 't1a-0006',
      name: 'BR HTTP Disponibilidad',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1100, 200],
    },
    codeNode('t1a-0007', 'BR Rerank', rerankSrc, [1320, 200]),
    codeNode('t1a-0008', 'Guardar Search State', guardarState, [1540, 200]),
    respondNode('t1a-0009', 'T1a Responder', [1760, 200]),

    webhookNode('t1b-0001', 'T1b Webhook', 'br-test-select', [0, 560]),
    codeNode('t1b-0002', 'T1b Cargar Search State', t1bCargar, [220, 560]),
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
          conditions: [
            {
              id: 'skip',
              leftValue: '={{ $json.skip_motor }}',
              rightValue: true,
              operator: { type: 'boolean', operation: 'true' },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
      id: 't1b-0002b',
      name: 'Skip Motor?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [400, 560],
    },
    codeNode('t1b-0003', 'Session To CRM Query (T1b)', sessionSrc, [620, 480]),
    codeNode('t1b-0004', 'Armar Payload Motor', armarPayload, [840, 480]),
    {
      parameters: {
        method: 'POST',
        url: 'https://bot.app.trotacrm.com/webhook/trotacrm-crear-plan',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json.motor_body) }}',
        options: {},
      },
      id: 't1b-0005',
      name: 'Llamar Motor Crear-Plan',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1060, 480],
    },
    codeNode('t1b-0006', 'Formatear Respuesta T1b', formatearT1b, [1280, 480]),
    {
      parameters: {
        jsCode: `const s = $input.first().json;
return [{
  json: {
    ok: false,
    reason: s.reason || 'search_again',
    needs_human: false,
    mensaje_whatsapp: s.mensaje_whatsapp,
  }
}];`,
      },
      id: 't1b-0006b',
      name: 'Respuesta Search Again',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [620, 680],
    },
    respondNode('t1b-0007', 'T1b Responder', [1500, 560]),
  ],
  connections: {
    'T1a Webhook': { main: [[{ node: 'T1a Preparar Input', type: 'main', index: 0 }]] },
    'T1a Preparar Input': { main: [[{ node: 'BR Rewrite', type: 'main', index: 0 }]] },
    'BR Rewrite': { main: [[{ node: 'Session To CRM Query (T1a)', type: 'main', index: 0 }]] },
    'Session To CRM Query (T1a)': { main: [[{ node: 'Obtener Token JWT', type: 'main', index: 0 }]] },
    'Obtener Token JWT': { main: [[{ node: 'BR HTTP Disponibilidad', type: 'main', index: 0 }]] },
    'BR HTTP Disponibilidad': { main: [[{ node: 'BR Rerank', type: 'main', index: 0 }]] },
    'BR Rerank': { main: [[{ node: 'Guardar Search State', type: 'main', index: 0 }]] },
    'Guardar Search State': { main: [[{ node: 'T1a Responder', type: 'main', index: 0 }]] },
    'T1b Webhook': { main: [[{ node: 'T1b Cargar Search State', type: 'main', index: 0 }]] },
    'T1b Cargar Search State': { main: [[{ node: 'Skip Motor?', type: 'main', index: 0 }]] },
    'Skip Motor?': {
      main: [
        [{ node: 'Respuesta Search Again', type: 'main', index: 0 }],
        [{ node: 'Session To CRM Query (T1b)', type: 'main', index: 0 }],
      ],
    },
    'Session To CRM Query (T1b)': { main: [[{ node: 'Armar Payload Motor', type: 'main', index: 0 }]] },
    'Armar Payload Motor': { main: [[{ node: 'Llamar Motor Crear-Plan', type: 'main', index: 0 }]] },
    'Llamar Motor Crear-Plan': { main: [[{ node: 'Formatear Respuesta T1b', type: 'main', index: 0 }]] },
    'Formatear Respuesta T1b': { main: [[{ node: 'T1b Responder', type: 'main', index: 0 }]] },
    'Respuesta Search Again': { main: [[{ node: 'T1b Responder', type: 'main', index: 0 }]] },
  },
  pinData: {},
  settings: { executionOrder: 'v1' },
  staticData: null,
  tags: [{ name: 'TROTA' }, { name: 'BR' }, { name: 'TEST' }],
  meta: { templateCredsSetupCompleted: false },
};

const outPath = path.join(n8nDir, 'br-test-t1a-t1b.json');
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2));
console.log('Wrote', outPath);
console.log('Nodes:', workflow.nodes.length);
