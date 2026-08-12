/**
 * Genera n8n/whatsapp-w1-w2-w5.json
 * W1 + W2 (sesión/FSM) + rama BR (search/select) + motor + W5
 * Uso: node scripts/build-whatsapp-w1-w2-w5.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const n8nDir = path.join(root, 'n8n');
const outPath = path.join(n8nDir, 'whatsapp-w1-w2-w5.json');

const sessionSrc = fs.readFileSync(path.join(n8nDir, 'session-to-crm-query.js'), 'utf8').replace(/\r\n/g, '\n');
const rerankSrc = fs.readFileSync(path.join(n8nDir, 'brincolines-rerank-code.js'), 'utf8').replace(/\r\n/g, '\n');

const w1Normalize = `// W1 Extraer y Normalizar (+ filtros grupo / número negocio)
const body = $input.first().json.body ?? $input.first().json;
const fromRaw = String(body.From || '');
const toRaw = String(body.To || '');
let bodyTexto = String(body.Body || '').trim();
const messageSid = body.MessageSid || '';
const profileName = body.ProfileName || '';
const latitude = body.Latitude || body.latitude || '';
const longitude = body.Longitude || body.longitude || '';

if (!fromRaw) throw new Error('W1: falta From. Keys: ' + Object.keys(body).join(', '));

// Pin de ubicación WhatsApp (Twilio o marcador [location|lat|lng] desde CRM)
if (latitude && longitude) {
  if (!bodyTexto || /^\\[location\\]/i.test(bodyTexto)) {
    bodyTexto = '[location|' + latitude + '|' + longitude + ']';
  }
}

const telefono = fromRaw.replace(/^whatsapp:/i, '').replace(/\\D/g, '');
const telefono_crm = telefono.length > 10 ? telefono.slice(-10) : telefono;
const toDigits = toRaw.replace(/^whatsapp:/i, '').replace(/\\D/g, '');
const to_crm = toDigits.length > 10 ? toDigits.slice(-10) : toDigits;

// Media Twilio (comprobantes / fotos)
const numMedia = Math.max(0, Number(body.NumMedia || 0) || 0);
const media_urls = [];
const media_types = [];
for (let i = 0; i < numMedia; i++) {
  const url = String(body['MediaUrl' + i] || '').trim();
  const ctype = String(body['MediaContentType' + i] || '').trim();
  if (url) {
    media_urls.push(url);
    media_types.push(ctype);
  }
}

// Grupos WhatsApp (Twilio / formatos comunes)
const fromLower = fromRaw.toLowerCase();
const is_group = fromLower.includes('@g.us')
  || fromLower.includes('group')
  || Boolean(body.ParticipantProductMedia)
  || String(body.WaId || '').includes('@g.us')
  || String(body.ChatId || body.Chat || '').toLowerCase().includes('@g.us');

// Evitar loops si el From es el mismo número del negocio
const businessEnv = String($env.TWILIO_WHATSAPP_NUMBER || '').replace(/\\D/g, '');
const business_crm = businessEnv.length > 10 ? businessEnv.slice(-10) : businessEnv;
const is_business = Boolean(business_crm) && telefono_crm === business_crm;

let skip_bot = false;
let skip_reason = null;
if (is_group) { skip_bot = true; skip_reason = 'group'; }
else if (is_business) { skip_bot = true; skip_reason = 'business_number'; }

return [{
  json: {
    telefono,
    telefono_crm,
    to_crm,
    from_raw: fromRaw,
    body_texto: bodyTexto,
    message_sid: messageSid,
    profile_name: profileName,
    media_urls,
    media_types,
    num_media: media_urls.length,
    latitude: latitude || null,
    longitude: longitude || null,
    is_group,
    is_business,
    skip_bot,
    skip_reason,
  }
}];`;

const checkPhonesCache = `const input = $input.first().json;
const staticData = $getWorkflowStaticData('global');
const TTL = 10 * 60 * 1000;
const now = Date.now();

if (input.skip_bot) {
  return [{ json: { ...input, need_fetch_phones: false, action_pre: 'skip' } }];
}

const cache = staticData.bot_phones;
if (cache && (now - (cache.fetched_at || 0)) < TTL) {
  return [{
    json: {
      ...input,
      need_fetch_phones: false,
      action_pre: 'gate',
      ignore_phones: cache.ignore_phones || [],
      asesores: cache.asesores || [],
    }
  }];
}

return [{ json: { ...input, need_fetch_phones: true, action_pre: 'fetch_phones' } }];`;

const applyPhonesGate = `const staticData = $getWorkflowStaticData('global');
const w1 = $('W1 Extraer y Normalizar').first().json;
const prev = $input.first().json;

let ignore = [];

// Respuesta HTTP: { ignore: [...], asesores: [...] } — asesores CRM se ignoran; handoff es lista fija
if (Array.isArray(prev.ignore)) {
  ignore = (prev.ignore || [])
    .map((x) => String(x.telefono || '').replace(/\\D/g, '').slice(-10))
    .filter((t) => t.length >= 10);
  staticData.bot_phones = { fetched_at: Date.now(), ignore_phones: ignore };
} else if (Array.isArray(prev.ignore_phones)) {
  ignore = prev.ignore_phones;
} else if (staticData.bot_phones) {
  ignore = staticData.bot_phones.ignore_phones || [];
}

const extra = String($env.BOT_IGNORE_PHONES || '')
  .split(',')
  .map((t) => t.replace(/\\D/g, '').slice(-10))
  .filter((t) => t.length >= 10);
ignore = [...new Set([...ignore, ...extra])];

// Números que nunca se ignoran ni reciben handoff (coma-separados; vacío = ninguno)
const exclude = String($env.BOT_EXCLUDE_PHONES || '')
  .split(',')
  .map((t) => t.replace(/\\D/g, '').slice(-10))
  .filter((t) => t.length >= 10);
ignore = ignore.filter((t) => !exclude.includes(t));

// Handoff solo a números fijos (no CRM)
const asesores = String($env.BOT_HANDOFF_PHONES || '3121208876,3125500124')
  .split(',')
  .map((t) => t.replace(/\\D/g, '').slice(-10))
  .filter((t) => t.length >= 10 && !exclude.includes(t))
  .map((telefono) => ({ nombre: 'asesor', telefono }));

if (staticData.bot_phones) {
  staticData.bot_phones.ignore_phones = ignore;
  staticData.bot_phones.asesores = asesores;
}

const clave = String(w1.telefono_crm || '').slice(-10);
let skip_bot = Boolean(w1.skip_bot);
let skip_reason = w1.skip_reason || null;
if (!skip_bot && clave && ignore.includes(clave)) {
  skip_bot = true;
  skip_reason = 'empleado_crm';
}

return [{
  json: {
    ...w1,
    ignore_phones: ignore,
    asesores,
    skip_bot,
    skip_reason,
    action_pre: skip_bot ? 'skip' : 'continue',
  }
}];`;

const prepHandoff = `// Une W2 (From del cliente) + lookup CRM para el aviso a asesores
const w2 = $('W2 Router Session').first().json;
const cli = $input.first().json;
const session = w2.session || {};

const crmNombre = (cli && cli.existe && cli.cliente && cli.cliente.nombre)
  ? String(cli.cliente.nombre).trim()
  : '';
const sessionNombre = String(session.cliente_nombre || '').trim();
const waNombre = String(w2.profile_name || '').trim();

// Prioridad: nombre CRM del cliente → nombre ya en sesión → ProfileName WhatsApp
const nombre = crmNombre || sessionNombre || waNombre || 'Cliente';

// Siempre el número desde el que escribe el cliente (From / telefono_crm)
const telefonoCliente = String(w2.telefono_crm || w2.telefono || '')
  .replace(/\\D/g, '')
  .slice(-10);

return [{
  json: {
    ...w2,
    cliente_nombre_alerta: nombre,
    telefono_cliente_alerta: telefonoCliente,
  }
}];`;

const expandHandoff = `const w2 = $input.first().json;
const staticData = $getWorkflowStaticData('global');
const exclude = String($env.BOT_EXCLUDE_PHONES || '')
  .split(',')
  .map((t) => t.replace(/\\D/g, '').slice(-10))
  .filter((t) => t.length >= 10);

let asesores = (w2.asesores && w2.asesores.length)
  ? w2.asesores
  : ((staticData.bot_phones && staticData.bot_phones.asesores) || []);

if (!asesores.length) {
  asesores = String($env.BOT_HANDOFF_PHONES || '3121208876,3125500124')
    .split(',')
    .map((t) => t.replace(/\\D/g, '').slice(-10))
    .filter((t) => t.length >= 10)
    .map((telefono) => ({ nombre: 'asesor', telefono }));
}
asesores = asesores.filter((a) => a.telefono && !exclude.includes(String(a.telefono).slice(-10)));

const clientMsg = w2.mensaje_whatsapp
  || 'Listo, un asesor de *Trotamundos* te escribe en este chat en un momento.\\nSi quieres volver al menú, escribe *MENU*.';

const mediaUrls = Array.isArray(w2.media_urls) ? w2.media_urls.filter(Boolean) : [];
const mediaUrl0 = mediaUrls[0] || '';

// Respuesta al cliente (mismo From que escribió) — sin media reenviada
const items = [{
  json: {
    telefono: w2.telefono,
    telefono_crm: w2.telefono_crm,
    mensaje_whatsapp: clientMsg,
  }
}];

if (w2.notify_asesores) {
  const sess = w2.session || {};
  const nombre = String(
    w2.cliente_nombre_alerta
    || sess.cliente_nombre
    || w2.profile_name
    || 'Cliente'
  ).trim() || 'Cliente';
  const tel = String(
    w2.telefono_cliente_alerta
    || w2.telefono_crm
    || w2.telefono
    || ''
  ).replace(/\\D/g, '').slice(-10);
  const motivo = String(w2.handoff_motivo || sess.handoff_motivo || 'asesor').trim();
  const isComprobante = w2.action === 'comprobante_recibido' || motivo === 'comprobante';
  const isTemporada = w2.action === 'alerta_temporada' || motivo === 'temporada_alta' || motivo.includes('temporada');

  let alert;
  if (isTemporada) {
    const folio = String(w2.folio || sess.ultimo_folio || '').trim();
    const fecha = String(w2.fecha_renta || sess.fecha_renta || '').trim();
    const horario = [String(w2.hora_inicio || '').slice(0, 5), String(w2.hora_fin || '').slice(0, 5)].filter(Boolean).join('-');
    const dir = String(w2.direccion || '').trim();
    const temporada = String(w2.temporada_alta || 'Temporada alta').trim();
    const prods = Array.isArray(w2.productos_resumen) ? w2.productos_resumen.join('\\n') : String(w2.productos_resumen || '').trim();
    alert = [
      '*Temporada alta — validar logística*',
      \`Temporada: \${temporada}\`,
      \`Cliente: \${nombre}\`,
      \`Teléfono: \${tel}\`,
      folio ? \`Folio: *\${folio}*\` : null,
      fecha ? \`Fecha: \${fecha}\${horario ? ' ' + horario : ''}\` : null,
      dir ? \`Dirección: \${dir}\` : null,
      prods ? ('Productos:\\n' + prods) : null,
      '',
      'Comunícate con el cliente para confirmar si hay repartidores/camionetas.',
      folio
        ? \`WhatsApp:\\n*OK \${folio}*  aprobar\\n*NO \${folio}*  rechazar (libera stock)\\nTambién puedes aprobar/rechazar en el CRM.\`
        : 'Aprueba o rechaza en el CRM.',
    ].filter((x) => x !== null).join('\\n');
  } else if (isComprobante) {
    const folio = String(w2.folio || sess.ultimo_folio || '').trim();
    const total = String(w2.total || '').trim();
    const saldo = String(w2.saldo_pendiente || '').trim();
    alert = [
      '*Comprobante de pago recibido*',
      \`Cliente: \${nombre}\`,
      \`Teléfono: \${tel}\`,
      folio ? \`Folio: *\${folio}*\` : 'Folio: (revisar pedidos del número)',
      total ? \`Total: $\${total}\` : null,
      saldo ? \`Saldo pendiente: $\${saldo}\` : null,
      '',
      folio
        ? \`Para registrar responde:\\n*PAGO \${folio}*  (saldo completo)\\no *PAGO \${folio} 1500* (monto parcial)\`
        : 'Revisa el folio y responde: *PAGO R… monto*',
    ].filter((x) => x !== null).join('\\n');
  } else {
    alert = [
      \`El cliente (\${nombre}) con número de teléfono \${tel} requiere atención personalizada.\`,
      \`Motivo: \${motivo}\`,
    ].join('\\n');
  }

  for (const a of asesores) {
    const digitos = String(a.telefono || '').replace(/\\D/g, '').slice(-10);
    if (!digitos) continue;
    const item = {
      telefono: digitos.length === 10 ? '52' + digitos : digitos,
      telefono_crm: digitos,
      mensaje_whatsapp: alert,
    };
    if (isComprobante && mediaUrl0) item.media_url = mediaUrl0;
    items.push({ json: item });
  }
}

return items;`;

const w2Router = `// W2 Router + Session
const TTL_MS = 24 * 60 * 60 * 1000;
const MENU = [
  'Hola, soy el asistente de *Trotamundos*. ¿En qué te ayudo hoy?',
  '',
  '1. Cotizar / rentar',
  '2. Ver mis pedidos',
  '3. Animación',
  '4. Eventos especiales',
  '5. Hablar con un asesor',
  '',
  '_Escribe el número de la opción, o *MENU* cuando quieras volver al inicio._',
].join('\\n');

const MSG_ASK_CALLE = [
  '¿Dónde te entregamos?',
  '',
  'Escribe la *calle y número*.',
  'Si no conoces el domicilio del local, escribe el *nombre del local*.',
  'También puedes *mandar la ubicación* 📍 desde WhatsApp.',
].join('\\n');

function parseSharedLocation(texto, inputObj) {
  const latF = inputObj.latitude ?? inputObj.Latitude ?? inputObj.location_lat;
  const lngF = inputObj.longitude ?? inputObj.Longitude ?? inputObj.location_lng;
  if (latF != null && lngF != null && String(latF) !== '' && String(lngF) !== '') {
    const lat = Number(latF);
    const lng = Number(lngF);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { ok: true, lat, lng };
  }
  const m = String(texto || '').match(/^\\[location\\|([\\-\\d.]+)\\|([\\-\\d.]+)\\]/i);
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { ok: true, lat, lng };
  }
  if (/^\\[location\\]/i.test(String(texto || '').trim())) return { ok: true, lat: null, lng: null };
  return null;
}

const input = $input.first().json;
const telefono = input.telefono;
// WhatsApp a veces añade marcadores como [edit] al reeditar un mensaje
let texto = String(input.body_texto || '').trim();
texto = texto.replace(/\\[edit\\]/gi, '').replace(/\\[\\s*edit\\s*\\]/gi, '').trim();
texto = texto.replace(/\\n{2,}/g, '\\n').trim();
const textoNorm = texto.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
const mediaUrls = Array.isArray(input.media_urls) ? input.media_urls.filter(Boolean) : [];
const hasMedia = mediaUrls.length > 0;
if (!telefono) throw new Error('W2: falta telefono');

const staticData = $getWorkflowStaticData('global');
if (!staticData.wa_sessions) staticData.wa_sessions = {};
if (!staticData.br_searches) staticData.br_searches = {};

const now = Date.now();
for (const [k, s] of Object.entries(staticData.wa_sessions)) {
  if (now - (s.updated_at || 0) > TTL_MS) delete staticData.wa_sessions[k];
}
for (const [id, entry] of Object.entries(staticData.br_searches)) {
  if (now - (entry.created_at || 0) > 15 * 60 * 1000) delete staticData.br_searches[id];
}

function freshSession() {
  return {
    telefono,
    telefono_crm: input.telefono_crm,
    estado: 'IDLE',
    intent: null,
    fecha_renta: null,
    hora_inicio: null,
    hora_fin: null,
    categoria: null,
    br_query: null,
    search_id: null,
    br_top: [],
    productos: [],
    producto_elegido: null,
    agregando: false,
    modo_mixto: false,
    handoff_notified: false,
    me_familia: null,
    me_top: [],
    si_top: [],
    pending_me: null,
    pending_si_qty: null,
    me_mesa_qty: null,
    si_qty: null,
    mt_top: [],
    cubre_top: [],
    mantel_gift_qty: 0,
    omitir_promo_mantel: false,
    manteles_regalo: [],
    loza_material: null,
    loza_top: [],
    loza_personas: null,
    notas: null,
    cliente_nombre: null,
    direccion: null,
    colonia: null,
    ciudad: null,
    direccion_guardada: null,
    colonia_guardada: null,
    ciudad_guardada: null,
    mismo_domicilio: null,
    handoff: false,
    awaiting_confirm: false,
    ultimo_folio: null,
    pedidos_lista: [],
    pedido_activo: null,
    editando_folio: null,
    updated_at: now,
    profile_name: input.profile_name || '',
  };
}

let session = staticData.wa_sessions[telefono];
if (!session || now - (session.updated_at || 0) > TTL_MS) session = freshSession();
if (input.profile_name) session.profile_name = input.profile_name;

function save(s) {
  s.updated_at = Date.now();
  staticData.wa_sessions[telefono] = s;
  return s;
}

function out(extra, s) {
  save(s);
  return [{
    json: {
      action: 'reply',
      telefono,
      telefono_crm: s.telefono_crm,
      body_texto: texto,
      message_sid: input.message_sid,
      profile_name: s.profile_name,
      asesores: input.asesores || [],
      media_urls: mediaUrls,
      session: { ...s },
      estado: s.estado,
      ...extra,
    }
  }];
}

function reply(mensaje_whatsapp, s) {
  return out({ action: 'reply', mensaje_whatsapp }, s);
}

function mergeLine(list, id, cantidad) {
  const arr = Array.isArray(list) ? list.map((p) => ({ ...p })) : [];
  const ex = arr.find((p) => Number(p.id) === Number(id));
  const qty = Math.max(1, Number(cantidad) || 1);
  if (ex) ex.cantidad = Number(ex.cantidad || 0) + qty;
  else arr.push({ id: Number(id), cantidad: qty });
  return arr;
}

function promptMesaFamilia() {
  return [
    '¿Qué tipo de *mesa* te gustaría?',
    '1. Tablón',
    '2. Infantil',
    '3. Redonda',
    '4. Imperial',
  ].join('\\n');
}

function startMuebles(s, { keepProductos }) {
  s.categoria = s.categoria === 'MIXTO' || s.modo_mixto ? 'MIXTO' : 'ME_SI';
  if (!keepProductos) {
    s.productos = [];
    s.producto_elegido = null;
  }
  s.me_familia = null;
  s.me_top = [];
  s.si_top = [];
  s.pending_me = null;
  s.pending_si_qty = null;
  s.me_mesa_qty = null;
  s.si_qty = null;
  s.mt_top = [];
  s.cubre_top = [];
  s.mantel_gift_qty = 0;
  s.omitir_promo_mantel = false;
  s.manteles_regalo = [];
  s.estado = 'ASK_MESA_FAMILIA';
  return s;
}

function giftMantelQty(s) {
  const mesas = Math.max(0, Number(s.me_mesa_qty) || 0);
  const sillas = Math.max(0, Number(s.si_qty) || 0);
  if (!mesas || sillas < 10) return 0;
  return Math.min(mesas, Math.floor(sillas / 10));
}

function outListManteles(s) {
  s.mantel_gift_qty = giftMantelQty(s);
  return out({
    action: 'list_manteles',
    familia: s.me_familia,
    session: {
      ...s,
      telefono: s.telefono_crm || telefono,
      fecha_renta: s.fecha_renta,
      hora_inicio: s.hora_inicio,
      hora_fin: s.hora_fin,
    },
  }, s);
}

function outListCubre(s) {
  return out({
    action: 'catalog_search',
    purpose: 'disponibilidad',
    catalog_kind: 'CUBRE',
    tipo: 'MT',
    search: 'cubre',
    solo_disponibles: true,
    limit: 15,
    session: {
      ...s,
      telefono: s.telefono_crm || telefono,
      fecha_renta: s.fecha_renta,
      hora_inicio: s.hora_inicio,
      hora_fin: s.hora_fin,
    },
  }, s);
}

function promptLozaMaterial() {
  return [
    '¿Loza de *cerámica* o *plástico*?',
    '',
    '1. Cerámica (platos cerámicos, vaso highball de vidrio y cubiertos de metal)',
    '2. Plástico',
  ].join('\\n');
}

function promptAskLoza() {
  return [
    '¿Requieres también *loza* para tu evento?',
    '1. Sí',
    '2. No',
  ].join('\\n');
}

function promptAskExtras() {
  return [
    '¿Agregamos *mantel*, *cubremantel* o *loza*?',
    '1. No — cotizar solo mesas y sillas',
    '2. Sí, agregar extras',
  ].join('\\n');
}

function skipExtrasAndQuote(s) {
  s.manteles_regalo = [];
  s.omitir_promo_mantel = true;
  s.cubre_top = [];
  s.mt_top = [];
  s.loza_material = null;
  s.loza_top = [];
  s.loza_personas = null;
  return outCotizarMuebles(s);
}

function isPlasticoNombre(nombre) {
  return /plast/i.test(String(nombre || ''));
}

function filterLozaByMaterial(items, material) {
  const wantPlastico = String(material) === 'plastico';
  return (items || []).filter((r) => {
    const p = isPlasticoNombre(r.nombre);
    return wantPlastico ? p : !p;
  });
}

function pickLozaPack(items, material) {
  const pool = filterLozaByMaterial(items, material);
  const patterns = material === 'plastico'
    ? [
        /plato\\s*extendido.*plast/i,
        /vaso\\s*plast/i,
        /tenedor\\s*plast/i,
        /cuchara\\s*plast/i,
      ]
    : [
        /plato\\s*trinche.*ceram/i,
        /vaso\\s*highball/i,
        /tenedor\\s*metal/i,
        /cuchillo\\s*metal/i,
        /cuchara\\s*sopera.*metal/i,
      ];
  const picked = [];
  for (const re of patterns) {
    const hit = pool.find((r) => re.test(String(r.nombre || '')) && !picked.some((x) => Number(x.id) === Number(r.id)));
    if (hit) picked.push(hit);
  }
  return picked;
}

function outAskLoza(s) {
  s.estado = 'ASK_LOZA_SI';
  return reply(promptAskLoza(), s);
}

function outSearchLoza(s) {
  return out({
    action: 'catalog_search',
    purpose: 'disponibilidad',
    catalog_kind: 'LZ',
    tipo: 'LZ',
    search: '',
    solo_disponibles: true,
    limit: 40,
    session: {
      ...s,
      telefono: s.telefono_crm || telefono,
      fecha_renta: s.fecha_renta,
      hora_inicio: s.hora_inicio,
      hora_fin: s.hora_fin,
    },
  }, s);
}

function outCotizarMuebles(s) {
  s.estado = 'SHOW_QUOTE';
  s.awaiting_confirm = true;
  return out({
    action: 'motor',
    purpose: 'cotizacion',
    productos: s.productos,
    producto_elegido: s.producto_elegido,
    session: {
      ...s,
      telefono: s.telefono_crm || telefono,
      productos: s.productos,
      manteles_regalo: s.manteles_regalo || [],
      omitir_promo_mantel: !!s.omitir_promo_mantel,
      notas: s.notas || '',
    },
  }, s);
}

function todayYmdMexico() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function weekdayOfYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=dom … 6=sáb
}

function formatFechaEs(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return \`\${dias[dt.getUTCDay()]} \${d} de \${meses[m - 1]} de \${y}\`;
}

function nextWeekdayYmd(fromYmd, targetDow, { excludeToday = false } = {}) {
  let cur = fromYmd;
  for (let i = 0; i < 8; i++) {
    if (i === 0 && excludeToday) {
      cur = addDaysYmd(cur, 1);
      continue;
    }
    if (weekdayOfYmd(cur) === targetDow) return cur;
    cur = addDaysYmd(cur, 1);
  }
  return null;
}

function parseFecha(raw) {
  let t = String(raw || '').trim().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  t = t.replace(/\\[edit\\]/gi, '').replace(/\\[\\s*edit\\s*\\]/gi, '').trim();
  t = t.replace(/^(para|el|la|del|para el|para la)\\s+/i, '').trim();
  t = t.replace(/\\s+/g, ' ');
  // Si viene "17 de agosto\\n[edit]" u otra basura en 2ª línea, usa la primera
  t = t.split(/\\n/)[0].trim();
  if (!t) return null;

  const hoy = todayYmdMexico();

  if (/^(hoy)$/.test(t)) return hoy;
  if (/^(manana)$/.test(t)) return addDaysYmd(hoy, 1);
  if (/^(pasado\\s*manana)$/.test(t)) return addDaysYmd(hoy, 2);

  // YYYY-MM-DD
  let m = t.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})$/);
  if (m) {
    return \`\${m[1]}-\${m[2].padStart(2, '0')}-\${m[3].padStart(2, '0')}\`;
  }
  // DD/MM/YYYY o DD-MM-YYYY
  m = t.match(/^(\\d{1,2})[\\/\\-.](\\d{1,2})[\\/\\-.](\\d{4})$/);
  if (m) {
    return \`\${m[3]}-\${m[2].padStart(2, '0')}-\${m[1].padStart(2, '0')}\`;
  }
  // DD/MM (año actual o próximo si ya pasó)
  m = t.match(/^(\\d{1,2})[\\/\\-.](\\d{1,2})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const mon = m[2].padStart(2, '0');
    const year = Number(hoy.slice(0, 4));
    let ymd = \`\${year}-\${mon}-\${day}\`;
    if (ymd < hoy) ymd = \`\${year + 1}-\${mon}-\${day}\`;
    return ymd;
  }

  // "15 de agosto" / "15 agosto 2026"
  const meses = {
    enero: 1, ene: 1,
    febrero: 2, feb: 2,
    marzo: 3, mar: 3,
    abril: 4, abr: 4,
    mayo: 5, may: 5,
    junio: 6, jun: 6,
    julio: 7, jul: 7,
    agosto: 8, ago: 8,
    septiembre: 9, setiembre: 9, sep: 9, sept: 9,
    octubre: 10, oct: 10,
    noviembre: 11, nov: 11,
    diciembre: 12, dic: 12,
  };
  m = t.match(/^(\\d{1,2})\\s*(?:de\\s+)?([a-z]+)\\s*(\\d{4})?$/);
  if (m && meses[m[2]]) {
    const day = m[1].padStart(2, '0');
    const mon = String(meses[m[2]]).padStart(2, '0');
    const year = m[3] ? Number(m[3]) : Number(hoy.slice(0, 4));
    let ymd = \`\${year}-\${mon}-\${day}\`;
    if (!m[3] && ymd < hoy) ymd = \`\${year + 1}-\${mon}-\${day}\`;
    return ymd;
  }

  // Días de la semana: este/próximo/siguiente viernes, el viernes, viernes
  const dias = {
    domingo: 0, dom: 0,
    lunes: 1, lun: 1,
    martes: 2, mar: 2,
    miercoles: 3, mie: 3, mier: 3,
    jueves: 4, jue: 4,
    viernes: 5, vie: 5,
    sabado: 6, sab: 6,
  };
  m = t.match(/^(este|proximo|siguiente|el)?\\s*(domingo|dom|lunes|lun|martes|mar|miercoles|mie|mier|jueves|jue|viernes|vie|sabado|sab)$/);
  if (m && dias[m[2]] !== undefined) {
    const excludeToday = m[1] === 'proximo' || m[1] === 'siguiente';
    return nextWeekdayYmd(hoy, dias[m[2]], { excludeToday });
  }
  // "el siguiente viernes" / "para el proximo sabado"
  m = t.match(/^(?:el\\s+)?(siguiente|proximo)\\s+(domingo|dom|lunes|lun|martes|mar|miercoles|mie|mier|jueves|jue|viernes|vie|sabado|sab)$/);
  if (m && dias[m[2]] !== undefined) {
    return nextWeekdayYmd(hoy, dias[m[2]], { excludeToday: true });
  }

  return null;
}

function parseHoraToken(token) {
  let s = String(token || '').trim().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  // Quitar artículos sueltos (no "a las", eso se normaliza antes del split)
  s = s.replace(/\\b(la|las|el|los|al)\\b/g, ' ');
  s = s.replace(/\\s+/g, '');
  if (!s) return null;

  let ampm = null;
  if (/a\\.?m\\.?|manana/.test(s)) ampm = 'am';
  if (/p\\.?m\\.?|tarde|noche/.test(s)) ampm = 'pm';
  s = s.replace(/(a\\.?m\\.?|p\\.?m\\.?|manana|tarde|noche|dela|de)/g, '');

  let h;
  let min = 0;
  let m = s.match(/^(\\d{1,2}):(\\d{2})$/);
  if (m) {
    h = Number(m[1]);
    min = Number(m[2]);
  } else if (/^\\d{1,2}$/.test(s)) {
    h = Number(s);
  } else {
    return null;
  }
  if (!Number.isInteger(h) || h < 0 || h > 23 || min < 0 || min > 59) return null;

  if (ampm === 'am') {
    if (h === 12) h = 0;
  } else if (ampm === 'pm') {
    if (h < 12) h += 12;
  }
  return { h, min, ampm };
}

function parseHorarioOne(raw) {
  let t = String(raw || '').trim().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  t = t.replace(/^(de|desde)\\s+/, '');
  // "a las 5" → "a 5" (conservar el separador "a")
  t = t.replace(/\\ba\\s+las\\b/g, 'a');
  t = t.replace(/\\ba\\s+la\\b/g, 'a');
  t = t.replace(/\\b(la|las|el|los|al)\\b/g, ' ');
  t = t.replace(/\\s+/g, ' ').trim();
  if (!t) return null;

  // Separadores: -, hasta, / ; " a " con espacios (no romper "am"/"pm")
  let parts = t.split(/\\s*(?:-|–|—|hasta|\\/)\\s*|\\s+a\\s+/);
  if (parts.length !== 2) {
    parts = t.split(/[-–—]/);
  }
  if (parts.length !== 2) return null;

  let start = parseHoraToken(parts[0]);
  let end = parseHoraToken(parts[1]);
  if (!start || !end) return null;

  // 24h explícito = hora >= 13 SIN am/pm (no confundir con "10 pm" → 22)
  const formato24hExplicito =
    (!start.ampm && start.h >= 13) || (!end.ampm && end.h >= 13);

  if (!formato24hExplicito) {
    // Si solo el fin trae pm y el inicio es 1–11 sin am/pm, heredar tarde
    if (!start.ampm && end.ampm === 'pm' && start.h >= 1 && start.h <= 11) {
      start = { ...start, h: start.h < 12 ? start.h + 12 : start.h, ampm: 'pm' };
    }
    // Sin am/pm: horas 1–11 → asumir tarde/noche (renta de eventos)
    if (!start.ampm && start.h >= 1 && start.h <= 11) start = { ...start, h: start.h + 12 };
    if (!end.ampm && end.h >= 1 && end.h <= 11) end = { ...end, h: end.h + 12 };
  }

  if (start.h > 23 || end.h > 23) return null;
  const hi = start.h * 60 + start.min;
  const hf = end.h * 60 + end.min;
  if (hf <= hi) return { ambiguo: true };

  return {
    hora_inicio: \`\${String(start.h).padStart(2, '0')}:\${String(start.min).padStart(2, '0')}\`,
    hora_fin: \`\${String(end.h).padStart(2, '0')}:\${String(end.min).padStart(2, '0')}\`,
  };
}

function parseHorario(raw) {
  const full = String(raw || '').trim();
  if (!full) return null;
  // Debounce puede juntar varios intentos en líneas; probar de abajo hacia arriba
  const lines = full.split(/[\\n\\r]+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const got = parseHorarioOne(lines[i]);
      if (got) return got;
    }
    return null;
  }
  return parseHorarioOne(full);
}

const isMenu = /^(menu|menú|cancelar|cancel|inicio)$/i.test(textoNorm);
const isHola = /^(hola|hi|hey|buenas|buen dia|buen día)$/i.test(textoNorm);
// Asesor: palabra sola o frases naturales ("hablar con un asesor", "quiero asesor"…)
// Nota: *9* se maneja en menús BR (no aquí, para no chocar con opción #9 del listado)
const isAsesorKw = (
  /^(asesor|humano|persona)$/i.test(textoNorm)
  || /\\b(hablar|platicar|pasar|comunicar|contactar)\\b.*\\b(asesor|humano|persona)\\b/i.test(textoNorm)
  || /\\b(quiero|necesito|manda|pasame|pásame)\\b.*\\b(asesor|humano)\\b/i.test(textoNorm)
  || /^hablar con un asesor$/i.test(textoNorm)
);
const isCatalogOrder = /^\\[order\\b/i.test(texto) || textoNorm === '[order]';
const isAnimacion = /^(3|animacion|animación|animaciones)$/i.test(textoNorm);
const isEventoEspecial = /^(4|evento especial|eventos especiales|eventos|especiales)$/i.test(textoNorm);
const isCatalogoBr = /(catalogo|catálogo|brincolines?\\s+tienen|que\\s+tienen|qué\\s+tienen|cuales\\s+tienen|cuáles\\s+tienen|que\\s+modelos|qué\\s+modelos|ver\\s+catalogo|ver\\s+catálogo|lista\\s+de\\s+brincolines|opciones\\s+de\\s+brincolines|mostrarme|ensename|enséñame)/i.test(textoNorm);
const isComprobanteKw = /(comprobante|transferencia|deposite|deposité|deposite|pague|pagué|ya\\s+pague|ya\\s+pagué|envío\\s+pago|envio\\s+pago|captura)/i.test(textoNorm);

const CATALOG_BR_URL = String($env.BOT_WHATSAPP_CATALOG_URL || 'https://wa.me/c/5213121529952').trim();

const HANDOFF_PHONES = String($env.BOT_HANDOFF_PHONES || '3121208876,3125500124')
  .split(',')
  .map((t) => t.replace(/\\D/g, '').slice(-10))
  .filter((t) => t.length >= 10);
const telefonoCrmKey = String(input.telefono_crm || telefono || '').replace(/\\D/g, '').slice(-10);
const isAsesorPhone = HANDOFF_PHONES.includes(telefonoCrmKey);

const MSG_HANDOFF_CLIENTE =
  'Listo, un asesor te escribe en este mismo chat en un momento.\\n' +
  'Si quieres volver al menú, escribe *MENU*.';

function msgCatalogoBr() {
  return [
    'Con gusto: este es nuestro *catálogo de brincolines*:',
    CATALOG_BR_URL,
    '',
    'Míralo y *escríbeme aquí el nombre* del que quieres (ej. *mini slider*).',
    '_Si usas el carrito del catálogo, un asesor te atiende para cerrarlo._',
  ].join('\\n');
}

function extractFolio(raw) {
  const m = String(raw || '').toUpperCase().match(/\\b(R[A-Z0-9]{4,})\\b/);
  return m ? m[1] : null;
}

// Asesor: PAGO {folio} [monto]
if (isAsesorPhone) {
  const pagoMatch = textoNorm.match(/^pago\\s+(r[a-z0-9]+)\\s*([0-9]+(?:[.,][0-9]+)?)?$/i)
    || texto.match(/^pago\\s+(R[A-Za-z0-9]+)\\s*([0-9]+(?:[.,][0-9]+)?)?$/i);
  if (pagoMatch) {
    const folioPago = String(pagoMatch[1]).toUpperCase();
    const montoRaw = pagoMatch[2] ? String(pagoMatch[2]).replace(',', '.') : null;
    return out({
      action: 'registrar_pago',
      folio: folioPago,
      monto: montoRaw,
      metodo_pago: 'transferencia',
      mensaje_whatsapp: 'Registrando pago…',
    }, session);
  }
  const okMatch = textoNorm.match(/^(ok|aprobar)\\s+(r[a-z0-9]+)$/i)
    || texto.match(/^(OK|APROBAR)\\s+(R[A-Za-z0-9]+)$/i);
  if (okMatch) {
    return out({
      action: 'validacion_logistica',
      folio: String(okMatch[2]).toUpperCase(),
      decision: 'aprobar',
      actor: 'whatsapp:' + telefonoCrmKey,
    }, session);
  }
  const noMatch = textoNorm.match(/^(no|rechazar)\\s+(r[a-z0-9]+)(?:\\s+(.+))?$/i)
    || texto.match(/^(NO|RECHAZAR)\\s+(R[A-Za-z0-9]+)(?:\\s+(.+))?$/i);
  if (noMatch) {
    return out({
      action: 'validacion_logistica',
      folio: String(noMatch[2]).toUpperCase(),
      decision: 'rechazar',
      motivo: (noMatch[3] || '').trim() || 'Sin disponibilidad logística (WhatsApp)',
      actor: 'whatsapp:' + telefonoCrmKey,
    }, session);
  }
}

function doHandoff(s, motivo) {
  const notify = !s.handoff_notified;
  s.estado = 'HANDOFF';
  s.handoff = true;
  s.handoff_notified = true;
  s.handoff_motivo = motivo || 'asesor';
  return out({
    action: 'handoff',
    notify_asesores: notify,
    handoff_motivo: s.handoff_motivo,
    mensaje_whatsapp: MSG_HANDOFF_CLIENTE,
  }, s);
}

function msgPedidoMenu(folio) {
  return [
    'Pedido *' + folio + '*',
    '¿Qué te gustaría hacer?',
    '',
    '1. Hablar con un asesor',
    '2. Cancelar pedido',
    '3. Cambiar fecha',
    '4. Cambiar productos',
    '',
    '0. Volver a mis pedidos',
    '_*MENU*_ para ir al inicio.',
  ].join('\\n');
}

function openPedidoMenu(s, rentaOrFolio) {
  const folio = typeof rentaOrFolio === 'string'
    ? rentaOrFolio
    : String((rentaOrFolio && rentaOrFolio.folio) || '').trim();
  if (!folio) {
    return reply('No logré ubicar el folio. Escribe *2* y te muestro tus pedidos.', s);
  }
  s.pedido_activo = folio;
  s.ultimo_folio = folio;
  s.estado = 'SHOW_PEDIDO_MENU';
  return reply(msgPedidoMenu(folio), s);
}

if (isMenu || (isHola && (session.estado === 'IDLE' || !session.estado || session.estado === 'WAIT_COMPROBANTE' || session.estado === 'SHOW_PEDIDOS_LIST' || session.estado === 'SHOW_PEDIDO_MENU' || session.estado === 'CONFIRM_CANCEL_PEDIDO' || session.estado === 'ASK_PEDIDO_FECHA' || session.estado === 'ASK_PEDIDO_HORARIO'))) {
  const keepFolio = session.ultimo_folio || null;
  session = { ...freshSession(), profile_name: session.profile_name || input.profile_name || '', ultimo_folio: keepFolio };
  return reply(MENU, session);
}

if (isCatalogOrder) {
  return out({
    action: 'handoff',
    notify_asesores: !session.handoff_notified,
    handoff_motivo: 'pedido catálogo WhatsApp: ' + texto,
    mensaje_whatsapp: [
      '¡Perfecto! Ya recibí tu pedido del *catálogo*.',
      'Un asesor te confirma disponibilidad y te cierra la renta aquí mismo.',
      'Si prefieres, también puedes escribir el *nombre del brincolín*.',
    ].join('\\n'),
  }, Object.assign(session, { estado: 'HANDOFF', handoff: true, handoff_notified: true }));
}

if (isAsesorKw) return doHandoff(session, 'asesor');

if (session.estado === 'IDLE' || !session.estado) {
  if (isAnimacion) return doHandoff(session, 'animación');
  if (isEventoEspecial) return doHandoff(session, 'eventos especiales');
  if (textoNorm === '5') return doHandoff(session, 'asesor');
}

function emitComprobante(s, folioHint) {
  const folio = folioHint || extractFolio(texto) || s.ultimo_folio || null;
  s.estado = 'WAIT_COMPROBANTE';
  if (folio) s.ultimo_folio = folio;
  return out({
    action: 'comprobante_recibido',
    notify_asesores: true,
    handoff_motivo: 'comprobante',
    folio: folio || '',
    media_urls: mediaUrls,
    mensaje_whatsapp: [
      '¡Gracias! Ya recibimos tu *comprobante*.',
      folio ? ('Folio: *' + folio + '*') : null,
      'Un asesor lo revisa y te confirmamos el pago por aquí.',
      'Si necesitas otra cosa, escribe *MENU*.',
    ].filter(Boolean).join('\\n'),
  }, s);
}

const quiereComprobante = hasMedia || isComprobanteKw;

const estado = session.estado || 'IDLE';

if (estado === 'HANDOFF') {
  // Si en handoff manda foto de pago, igual avisamos (no bloquea al asesor)
  if (quiereComprobante && hasMedia) {
    return emitComprobante(session, extractFolio(texto) || session.ultimo_folio);
  }
  return reply(
    'Sigues en chat con un asesor.\\nCuando quieras volver al menú, escribe *MENU*.',
    session
  );
}

if (estado === 'WAIT_COMPROBANTE') {
  if (quiereComprobante) {
    if (!hasMedia && isComprobanteKw) {
      return reply(
        'Cuando puedas, mándame la *foto del comprobante* de la transferencia.\\n' +
        (session.ultimo_folio ? ('Folio: *' + session.ultimo_folio + '*') : 'Si puedes, incluye el folio *R…* en el mensaje.'),
        session
      );
    }
    return emitComprobante(session, extractFolio(texto) || session.ultimo_folio);
  }
  if (/^(2|pedidos|pedido)$/i.test(textoNorm)) {
    session.intent = 'pedidos';
    return out({
      action: 'lookup_pedidos',
      telefono_crm: session.telefono_crm || telefono,
    }, session);
  }
  return reply(
    'Cuando transfieras, mándame aquí la *captura del comprobante*.\\n' +
    (session.ultimo_folio ? ('Folio: *' + session.ultimo_folio + '*\\n') : '') +
    'O escribe *MENU*.',
    session
  );
}

if (estado === 'IDLE') {
  if (quiereComprobante && (hasMedia || session.ultimo_folio || extractFolio(texto))) {
    if (!hasMedia) {
      return reply(
        'Envía la *captura* (foto) del comprobante' +
        (session.ultimo_folio ? (' de *' + session.ultimo_folio + '*') : '') +
        '.',
        session
      );
    }
    return emitComprobante(session, extractFolio(texto) || session.ultimo_folio);
  }
  if (isCatalogoBr) {
    return reply(
      msgCatalogoBr() + '\\n\\nCuando quieras cotizar, escribe *1* o *MENU*.',
      session
    );
  }

  // Fase 1-B: intención IA (solo IDLE; confianza alta|media). No toca stock/folio/precio.
  const ia = input.intencion_ia;
  const iaUsable = ia && (ia.confianza === 'alta' || ia.confianza === 'media');
  if (iaUsable) {
    if (ia.intencion === 'asesor') return doHandoff(session, 'ia:asesor');
    if (ia.intencion === 'animacion') return doHandoff(session, 'ia:animación');
    if (ia.intencion === 'eventos') return doHandoff(session, 'ia:eventos especiales');

    if (ia.intencion === 'pedidos') {
      session.intent = 'pedidos';
      return out({
        action: 'lookup_pedidos',
        telefono_crm: session.telefono_crm || telefono,
      }, session);
    }

    if (ia.intencion === 'cotizar') {
      session.intent = 'cotizar';
      const fechaIso = (typeof ia.fecha_renta === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(ia.fecha_renta))
        ? ia.fecha_renta
        : null;
      const hi = (typeof ia.hora_inicio === 'string' && /^([01]\\d|2[0-3]):[0-5]\\d$/.test(ia.hora_inicio))
        ? ia.hora_inicio
        : null;
      const hf = (typeof ia.hora_fin === 'string' && /^([01]\\d|2[0-3]):[0-5]\\d$/.test(ia.hora_fin))
        ? ia.hora_fin
        : null;
      if (ia.direccion_texto) {
        const notaDir = 'Dir. (IA): ' + String(ia.direccion_texto).slice(0, 200);
        session.notas = session.notas ? (String(session.notas) + ' | ' + notaDir) : notaDir;
      }

      // Fecha + ambas horas → saltar a categoría (máximo impacto)
      if (fechaIso && hi && hf) {
        session.fecha_renta = fechaIso;
        session.hora_inicio = hi;
        session.hora_fin = hf;
        session.estado = 'ASK_CATEGORIA';
        return reply([
          'Listo: *' + formatFechaEs(fechaIso) + '* · *' + hi + '-' + hf + '*',
          '',
          '¿Qué te gustaría rentar?',
          '1. Mesas / sillas / mantelería',
          '2. Brincolines',
          '3. Ambos (brincolines + muebles)',
          '4. Solo loza',
        ].join('\\n'), session);
      }

      // Solo fecha → preguntar horario
      if (fechaIso) {
        session.fecha_renta = fechaIso;
        session.estado = 'ASK_HORARIO';
        const franja = ia.franja_horaria_texto
          ? (' (mencionaste *' + String(ia.franja_horaria_texto).slice(0, 40) + '*)')
          : '';
        return reply(
          'Fecha: *' + formatFechaEs(fechaIso) + '* (' + fechaIso + ')' + franja + '\\n\\n' +
          '¿Horario del evento?\\n' +
          'Ejemplos: *1 a 8*, *14 a 22*, *2 a 10 pm*, *14:00-22:00*',
          session
        );
      }

      // Cotizar sin fecha usable → flujo clásico
      session.estado = 'ASK_FECHA';
      const hint = ia.franja_horaria_texto
        ? (' (anoté *' + String(ia.franja_horaria_texto).slice(0, 40) + '*)')
        : '';
      return reply(
        '¡Vamos a cotizar!' + hint + ' ¿Para qué *fecha* es tu evento?\\n' +
        'Ejemplos: *mañana*, *viernes*, *próximo sábado*, *15/08*, *15 de agosto*',
        session
      );
    }
  }

  if (/^(1|cotizar|renta|rentar)$/i.test(textoNorm)) {
    session.estado = 'ASK_FECHA';
    session.intent = 'cotizar';
    return reply(
      '¡Vamos a cotizar! ¿Para qué *fecha* es tu evento?\\n' +
      'Ejemplos: *mañana*, *viernes*, *próximo sábado*, *15/08*, *15 de agosto*',
      session
    );
  }
  if (/^(2|pedidos|pedido)$/i.test(textoNorm)) {
    session.intent = 'pedidos';
    return out({
      action: 'lookup_pedidos',
      telefono_crm: session.telefono_crm || telefono,
    }, session);
  }
  // Folio directo: R… 
  if (/^r[a-z0-9]{4,}$/i.test(textoNorm.replace(/\\s+/g, ''))) {
    session.intent = 'pedidos';
    return out({
      action: 'lookup_pedidos',
      folio: texto.trim().toUpperCase().replace(/\\s+/g, ''),
      telefono_crm: session.telefono_crm || telefono,
    }, session);
  }
  return reply(MENU, session);
}

if (estado === 'ASK_FECHA') {
  const fecha = parseFecha(texto);
  if (!fecha) {
    return reply(
      'No alcancé a entender la fecha. ¿Me la das así?\\n' +
      '• *mañana* / *pasado mañana*\\n' +
      '• *viernes* / *próximo lunes*\\n' +
      '• *15/08* o *15 de agosto*',
      session
    );
  }
  session.fecha_renta = fecha;
  session.estado = 'ASK_HORARIO';
  return reply(
    'Fecha: *' + formatFechaEs(fecha) + '* (' + fecha + ')\\n\\n' +
    '¿Horario del evento?\\n' +
    'Ejemplos: *1 a 8*, *14 a 22*, *2 a 10 pm*, *14:00-22:00*',
    session
  );
}

if (estado === 'ASK_HORARIO') {
  const hor = parseHorario(texto);
  if (!hor) {
    return reply(
      'No alcancé a entender el horario. Prueba con:\\n' +
      '• *1 a 8*\\n' +
      '• *14 a 22*\\n' +
      '• *2 a 10 pm*\\n' +
      '• *14:00-22:00*',
      session
    );
  }
  if (hor.ambiguo) {
    return reply(
      '¿Es de la mañana o de la noche? Especifica *am* o *pm* para que no me confunda, por ejemplo: *8am a 1pm* o *8:00-13:00*.',
      session
    );
  }
  session.hora_inicio = hor.hora_inicio;
  session.hora_fin = hor.hora_fin;
  session.estado = 'ASK_CATEGORIA';
  return reply([
    'Horario anotado: *' + hor.hora_inicio + '-' + hor.hora_fin + '*',
    '',
    '¿Qué te gustaría rentar?',
    '1. Mesas / sillas / mantelería',
    '2. Brincolines',
    '3. Ambos (brincolines + muebles)',
    '4. Solo loza',
  ].join('\\n'), session);
}

if (estado === 'ASK_CATEGORIA') {
  // Número primero; luego palabras del menú
  if (/^1\\b/.test(textoNorm) || (/\\b(mesa|mesas|silla|sillas|mantel|manteleria|mueble|muebles)\\b/.test(textoNorm) && !/\\b(brincolin|inflable|ambos|mixto|loza)\\b/.test(textoNorm))) {
    session.modo_mixto = false;
    startMuebles(session, { keepProductos: false });
    return reply(promptMesaFamilia(), session);
  }
  if (/^2\\b/.test(textoNorm) || (/\\b(brincolin|brincolines|inflable)\\b/.test(textoNorm) && !/\\b(ambos|mixto)\\b/.test(textoNorm))) {
    session.categoria = 'BR';
    session.modo_mixto = false;
    session.estado = 'ASK_BR_TEXT';
    session.agregando = false;
    return reply(
      '¿Qué brincolín buscas?\\n' +
      'Puedes escribir uno (*mini slider*) o varios (*mini slider y castillo unicornios*).\\n' +
      'Si quieres ver opciones, pide el *catálogo*.',
      session
    );
  }
  if (/^3\\b/.test(textoNorm) || /\\b(ambos|mixto)\\b/.test(textoNorm)) {
    session.categoria = 'MIXTO';
    session.modo_mixto = true;
    session.estado = 'ASK_BR_TEXT';
    session.agregando = false;
    return reply(
      'Perfecto: primero armamos brincolines y luego te pregunto por mesas/sillas.\\n\\n' +
      '¿Qué brincolín buscas? (uno o varios con "y")\\n' +
      'O pide el *catálogo* para ver opciones.',
      session
    );
  }
  if (/^4\\b/.test(textoNorm) || /\\b(loza|vajilla)\\b/.test(textoNorm)) {
    session.categoria = 'LZ';
    session.modo_mixto = false;
    session.productos = [];
    session.producto_elegido = null;
    session.loza_material = null;
    session.loza_top = [];
    session.loza_personas = null;
    session.estado = 'ASK_LOZA_MATERIAL';
    return reply(promptLozaMaterial(), session);
  }
  return reply(
    'Elige con el *número* o el nombre:\\n' +
    '*1* Mesas / sillas / mantelería\\n' +
    '*2* Brincolines\\n' +
    '*3* Ambos\\n' +
    '*4* Solo loza',
    session
  );
}

if (estado === 'ASK_MESA_FAMILIA') {
  const map = {
    '1': { familia: 'TABLON', search: 'tablon' },
    '2': { familia: 'INFANTIL', search: 'infantil' },
    '3': { familia: 'REDONDO', search: 'redond' },
    '4': { familia: 'IMPERIAL', search: 'imperial' },
  };
  let picked = map[textoNorm];
  if (!picked) {
    if (/tablon|tablón/.test(textoNorm)) picked = map['1'];
    else if (/infantil/.test(textoNorm)) picked = map['2'];
    else if (/redond/.test(textoNorm)) picked = map['3'];
    else if (/imperial/.test(textoNorm)) picked = map['4'];
  }
  if (!picked) return reply('Elige *1* tablón, *2* infantil, *3* redonda o *4* imperial, por favor.', session);
  if (!session.fecha_renta || !session.hora_inicio || !session.hora_fin) {
    session.estado = 'ASK_FECHA';
    return reply('Me falta la fecha o el horario. ¿Para qué fecha es tu evento?', session);
  }
  session.me_familia = picked.familia;
  return out({
    action: 'catalog_search',
    purpose: 'disponibilidad',
    catalog_kind: 'ME',
    tipo: 'ME',
    search: picked.search,
    solo_disponibles: true,
    limit: 15,
    session: {
      ...session,
      telefono: session.telefono_crm || telefono,
      fecha_renta: session.fecha_renta,
      hora_inicio: session.hora_inicio,
      hora_fin: session.hora_fin,
    },
  }, session);
}

if (estado === 'SHOW_MESA_MENU') {
  if (textoNorm === '0') {
    session.estado = 'ASK_MESA_FAMILIA';
    session.me_top = [];
    session.pending_me = null;
    return reply(promptMesaFamilia(), session);
  }
  const top = Array.isArray(session.me_top) ? session.me_top : [];
  const choice = Number(texto);
  if (!Number.isInteger(choice) || choice < 1 || choice > top.length) {
    return reply(
      \`Encontré esas mesas en el sistema.\\n\` +
      \`Escribe el *número* de la que quieres (1–\${top.length || 1}).\\n\` +
      \`Después te pido la cantidad y las sillas.\\n\` +
      \`*0* = otra familia de mesas.\`,
      session
    );
  }
  session.pending_me = top[choice - 1];
  session.estado = 'ASK_MESA_QTY';
  return reply(
    \`*\${session.pending_me.nombre}* — $\${session.pending_me.precio}\\n¿Cuántas mesas? (número)\\nLibres: \${session.pending_me.unidades_libres ?? '?'}\`,
    session
  );
}

if (estado === 'ASK_MESA_QTY') {
  const qty = Number(String(texto).replace(/\\D/g, ''));
  if (!Number.isInteger(qty) || qty < 1) {
    return reply('Dime cuántas mesas necesitas, por ejemplo *2*.', session);
  }
  const item = session.pending_me;
  if (!item || !item.id) {
    session.estado = 'ASK_MESA_FAMILIA';
    return reply('Se me escapó la mesa elegida. ' + promptMesaFamilia(), session);
  }
  const libres = Number(item.unidades_libres);
  if (Number.isFinite(libres) && qty > libres) {
    return reply(\`Uy, solo hay *\${libres}* libres. ¿Otra cantidad? O *0* en el menú para cambiar de mesa.\`, session);
  }
  session.productos = mergeLine(session.productos, item.id, qty);
  session.producto_elegido = item;
  session.pending_me = { ...item, cantidad: qty };
  session.me_mesa_qty = qty;
  session.estado = 'ASK_SILLAS_QTY';
  return reply(
    'Listo: *' + qty + '* × ' + item.nombre + '.\\n\\n¿Cuántas *sillas* necesitas?',
    session
  );
}

if (estado === 'ASK_SILLAS_QTY') {
  const qty = Number(String(texto).replace(/\\D/g, ''));
  if (!Number.isInteger(qty) || qty < 1) {
    return reply('Dime cuántas sillas, por ejemplo *20*.', session);
  }
  session.pending_si_qty = qty;
  session.si_qty = qty;
  return out({
    action: 'catalog_search',
    purpose: 'disponibilidad',
    catalog_kind: 'SI',
    tipo: 'SI',
    search: '',
    solo_disponibles: true,
    limit: 10,
    session: {
      ...session,
      telefono: session.telefono_crm || telefono,
      fecha_renta: session.fecha_renta,
      hora_inicio: session.hora_inicio,
      hora_fin: session.hora_fin,
    },
  }, session);
}

if (estado === 'SHOW_SILLA_MENU') {
  const top = Array.isArray(session.si_top) ? session.si_top : [];
  const choice = Number(texto);
  if (!Number.isInteger(choice) || choice < 1 || choice > top.length) {
    return reply('Elige la silla con un número del *1* al *' + (top.length || 1) + '*.', session);
  }
  const item = top[choice - 1];
  const qty = Math.max(1, Number(session.pending_si_qty) || 1);
  session.productos = mergeLine(session.productos, item.id, qty);
  session.producto_elegido = item;
  session.si_qty = qty;
  session.pending_si_qty = null;
  session.estado = 'ASK_EXTRAS_MUEBLES';
  return reply(
    'Listo: *' + qty + '* × ' + item.nombre + '.\\n\\n' + promptAskExtras(),
    session
  );
}

if (estado === 'ASK_EXTRAS_MUEBLES') {
  if (textoNorm === '1' || /^(no|nel|nop|solo|cotizar)$/i.test(textoNorm)) {
    return skipExtrasAndQuote(session);
  }
  if (textoNorm === '2' || /^(si|sí|sip|extras|agregar)$/i.test(textoNorm)) {
    return outListManteles(session);
  }
  return reply(promptAskExtras(), session);
}

if (estado === 'SHOW_MANTEL_MENU') {
  const top = Array.isArray(session.mt_top) ? session.mt_top : [];
  if (textoNorm === '0' || /^(no|ninguno|sin mantel)$/i.test(textoNorm)) {
    session.manteles_regalo = [];
    if (Number(session.mantel_gift_qty) > 0) session.omitir_promo_mantel = true;
    return outListCubre(session);
  }
  const choice = Number(texto);
  if (!Number.isInteger(choice) || choice < 1 || choice > top.length) {
    return reply('Elige el color (*1*' + (top.length > 1 ? '-' + top.length : '') + ') o *0* si prefieres sin mantel.', session);
  }
  const item = top[choice - 1];
  const gift = Math.max(0, Number(session.mantel_gift_qty) || 0);
  const mesaQty = Math.max(1, Number(session.me_mesa_qty) || 1);
  if (gift > 0) {
    session.manteles_regalo = [{ producto_id: item.id, cantidad: gift }];
    session.omitir_promo_mantel = false;
  } else {
    session.manteles_regalo = [];
    session.omitir_promo_mantel = true;
    session.productos = mergeLine(session.productos, item.id, mesaQty);
  }
  session.producto_elegido = item;
  return outListCubre(session);
}

if (estado === 'SHOW_CUBRE_MENU') {
  const top = Array.isArray(session.cubre_top) ? session.cubre_top : [];
  if (textoNorm === '0' || /^(no|ninguno|sin cubre)$/i.test(textoNorm)) {
    return outAskLoza(session);
  }
  const choice = Number(texto);
  if (!Number.isInteger(choice) || choice < 1 || choice > top.length) {
    return reply('Elige cubremantel (*1*' + (top.length > 1 ? '-' + top.length : '') + ') o *0* si no lo necesitas.', session);
  }
  const item = top[choice - 1];
  const mesaQty = Math.max(1, Number(session.me_mesa_qty) || 1);
  session.productos = mergeLine(session.productos, item.id, mesaQty);
  session.producto_elegido = item;
  return outAskLoza(session);
}

if (estado === 'ASK_LOZA_SI') {
  if (textoNorm === '2' || /^(no|nel|nop)$/i.test(textoNorm)) {
    return outCotizarMuebles(session);
  }
  if (textoNorm === '1' || /^(si|sí|sip|claro|ok)$/i.test(textoNorm)) {
    session.estado = 'ASK_LOZA_MATERIAL';
    return reply(promptLozaMaterial(), session);
  }
  return reply(promptAskLoza(), session);
}

if (estado === 'ASK_LOZA_MATERIAL') {
  let material = null;
  if (textoNorm === '1' || /ceram/.test(textoNorm)) material = 'ceramica';
  if (textoNorm === '2' || /plast/.test(textoNorm)) material = 'plastico';
  if (!material) return reply(promptLozaMaterial(), session);
  if (!session.fecha_renta || !session.hora_inicio || !session.hora_fin) {
    session.estado = 'ASK_FECHA';
    return reply('Me falta la fecha o el horario. ¿Para qué fecha es tu evento?', session);
  }
  session.loza_material = material;
  return outSearchLoza(session);
}

if (estado === 'ASK_LOZA_PERSONAS') {
  const n = Number(String(texto).replace(/[^0-9]/g, ''));
  if (!Number.isInteger(n) || n < 1 || n > 500) {
    return reply('Dime para cuántas *personas* (por ejemplo *50*).', session);
  }
  const pack = pickLozaPack(session.loza_top || [], session.loza_material);
  if (!pack.length) {
    return doHandoff(session, 'loza_sin_stock');
  }
  const faltantes = [];
  let agregados = 0;
  for (const item of pack) {
    const libres = Number(item.unidades_libres);
    if (Number.isFinite(libres) && n > libres) {
      faltantes.push(item.nombre + ' (solo ' + libres + ')');
      continue;
    }
    session.productos = mergeLine(session.productos, item.id, n);
    agregados += 1;
  }
  if (!agregados) {
    return doHandoff(session, 'loza_sin_stock');
  }
  session.loza_personas = n;
  session.producto_elegido = pack[0] || session.producto_elegido;
  const lineas = pack
    .filter((p) => !faltantes.some((f) => f.indexOf(p.nombre) === 0))
    .map((p) => '· ' + n + 'x ' + p.nombre);
  let msg = [
    'Listo, armé loza *' + (session.loza_material === 'plastico' ? 'plástico' : 'cerámica') + '* para *' + n + '* personas:',
    '',
    ...lineas,
  ].join('\\n');
  if (faltantes.length) {
    msg += '\\n\\nNo alcanzó stock en: ' + faltantes.join(', ');
  }
  if (session.loza_material === 'plastico') {
    session.estado = 'ASK_LOZA_COLOR';
    return reply(msg + '\\n\\n¿Qué *colores* de loza plástica necesitas? (queda como nota en tu pedido)', session);
  }
  return outCotizarMuebles(session);
}

if (estado === 'ASK_LOZA_COLOR') {
  if (!texto || texto.length < 2) {
    return reply('Escríbeme los *colores* de la loza plástica, por favor.', session);
  }
  const colorNote = 'Colores loza plástico: ' + texto.trim();
  session.notas = session.notas ? (String(session.notas) + ' | ' + colorNote) : colorNote;
  return outCotizarMuebles(session);
}

if (estado === 'ASK_BR_TEXT') {
  if (!texto) {
    return reply(
      'Escríbeme el nombre o tema del brincolín.\\n' +
      'Ejemplo: *mini slider*\\n' +
      'O pide el *catálogo* si quieres ver opciones.',
      session
    );
  }
  if (textoNorm === '9' || isAsesorKw) {
    return doHandoff(session, 'asesor desde búsqueda BR');
  }
  if (isCatalogOrder) {
    return out({
      action: 'handoff',
      notify_asesores: !session.handoff_notified,
      handoff_motivo: 'pedido catálogo WhatsApp: ' + texto,
      mensaje_whatsapp: [
        '¡Perfecto! Ya recibí tu pedido del *catálogo*.',
        'Un asesor te confirma disponibilidad y te cierra la renta aquí mismo.',
      ].join('\\n'),
    }, Object.assign(session, { estado: 'HANDOFF', handoff: true, handoff_notified: true }));
  }
  if (isCatalogoBr) {
    return reply(msgCatalogoBr(), session);
  }
  if (!session.fecha_renta || !session.hora_inicio || !session.hora_fin) {
    session.estado = 'ASK_FECHA';
    return reply('Me falta la fecha o el horario. ¿Para qué fecha es tu evento?', session);
  }
  session.br_query = texto;
  return out({
    action: 'br_search',
    purpose: 'disponibilidad',
    tipo: 'BR',
    user_text: texto,
    search: texto,
    query_crm: texto,
    solo_disponibles: true,
    limit: 15,
    session: {
      ...session,
      telefono: session.telefono_crm || telefono,
      fecha_renta: session.fecha_renta,
      hora_inicio: session.hora_inicio,
      hora_fin: session.hora_fin,
    },
  }, session);
}

if (estado === 'SHOW_BR_MENU') {
  if (textoNorm === '0') {
    session.estado = 'ASK_BR_TEXT';
    session.search_id = null;
    session.br_top = [];
    session.productos = [];
    session.producto_elegido = null;
    return reply('¡Va! ¿Qué brincolín buscas?', session);
  }
  if (textoNorm === '9') {
    return doHandoff(session, 'asesor desde menú BR');
  }
  // CONFIRMAR → domicilio (nueva) o guardar edición
  if (/^(confirmar|si|sí|ok)$/i.test(textoNorm) && session.productos && session.productos.length) {
    if (session.editando_folio) {
      return out({
        action: 'editar_renta',
        folio: session.editando_folio,
        telefono_crm: session.telefono_crm || telefono,
        fecha_renta: session.fecha_renta,
        hora_inicio: session.hora_inicio,
        hora_fin: session.hora_fin,
        productos: session.productos,
      }, session);
    }
    session.estado = 'SHOW_QUOTE';
    session.awaiting_confirm = true;
    return out({
      action: 'lookup_cliente',
      telefono_crm: session.telefono_crm || telefono,
    }, session);
  }
  if (/^(editar)$/i.test(textoNorm)) {
    session.estado = 'ASK_BR_TEXT';
    session.productos = [];
    session.producto_elegido = null;
    session.awaiting_confirm = false;
    session.br_top = [];
    session.search_id = null;
    return reply('¡Va! ¿Qué brincolín buscas?', session);
  }
  const choice = Number(texto);
  const top = Array.isArray(session.br_top) ? session.br_top : [];
  // Varios números: "1 y 3", "1,2", "1 2 3"
  const multiNums = [...String(textoNorm).matchAll(/\\b([1-9]\\d*)\\b/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= top.length);
  const uniqueNums = [...new Set(multiNums)];
  if (uniqueNums.length > 1) {
    let productos = session.agregando ? [...(session.productos || [])] : [];
    const elegidos = [];
    for (const n of uniqueNums) {
      const item = top[n - 1];
      if (!item) continue;
      const ex = productos.find((p) => Number(p.id) === Number(item.id));
      if (ex) ex.cantidad = Number(ex.cantidad || 1) + 1;
      else productos.push({ id: item.id, cantidad: 1 });
      elegidos.push(item);
    }
    if (!elegidos.length) {
      return reply(
        \`Encontré esas opciones en el sistema. Escribe el *número* de la que quieres (1–\${top.length}), o varios: *1 y 3*.\`,
        session
      );
    }
    session.productos = productos;
    session.producto_elegido = elegidos[elegidos.length - 1];
    session.agregando = false;
    session.cliente_nombre = session.cliente_nombre || session.profile_name || null;
    session.estado = 'SHOW_QUOTE';
    session.awaiting_confirm = true;
    return out({
      action: 'motor',
      purpose: 'cotizacion',
      productos: session.productos,
      producto_elegido: session.producto_elegido,
      session: {
        ...session,
        telefono: session.telefono_crm || telefono,
        productos: session.productos,
      },
    }, session);
  }
  if (!Number.isInteger(choice) || choice < 1 || choice > top.length) {
    return reply(
      \`Encontré esas opciones en el sistema.\\n\` +
      \`Escribe el *número* de la que quieres (1–\${top.length || 1}).\\n\` +
      \`Si quieres *varios*, mándalos juntos: *1 y 3* o *1,2*.\\n\` +
      \`*0* buscar de nuevo · *9* asesor.\`,
      session
    );
  }
  const item = top[choice - 1];
  const prev = Array.isArray(session.productos) ? [...session.productos] : [];
  if (session.agregando) {
    const ex = prev.find((p) => Number(p.id) === Number(item.id));
    if (ex) ex.cantidad = Number(ex.cantidad || 1) + 1;
    else prev.push({ id: item.id, cantidad: 1 });
    session.productos = prev;
  } else {
    session.productos = [{ id: item.id, cantidad: 1 }];
  }
  session.producto_elegido = item;
  session.agregando = false;
  session.cliente_nombre = session.cliente_nombre || session.profile_name || null;
  session.estado = 'SHOW_QUOTE';
  session.awaiting_confirm = true;
  return out({
    action: 'motor',
    purpose: 'cotizacion',
    productos: session.productos,
    producto_elegido: item,
    session: {
      ...session,
      telefono: session.telefono_crm || telefono,
      productos: session.productos,
    },
  }, session);
}

if (estado === 'SHOW_CART_PREVIEW') {
  if (textoNorm === '0') {
    session.estado = 'ASK_BR_TEXT';
    session.agregando = false;
    session.productos = [];
    session.producto_elegido = null;
    session.br_top = [];
    session.search_id = null;
    return reply('¡Va! ¿Qué brincolín(es) buscas? Puedes listar varios con "y".', session);
  }
  if (textoNorm === '9') {
    return doHandoff(session, 'asesor desde carrito BR');
  }
  if (/^(2|otro|agregar|mas|más)$/i.test(textoNorm)) {
    session.agregando = true;
    session.estado = 'ASK_BR_TEXT';
    return reply('¿Qué otro brincolín sumamos? (uno o varios con "y")', session);
  }
  if (/^(1|cotizar|ok|si|sí)$/i.test(textoNorm)) {
    if (!session.productos || !session.productos.length) {
      session.estado = 'ASK_BR_TEXT';
      return reply('Tu carrito está vacío todavía. ¿Qué brincolín buscas?', session);
    }
    session.estado = 'SHOW_QUOTE';
    session.awaiting_confirm = true;
    return out({
      action: 'motor',
      purpose: 'cotizacion',
      productos: session.productos,
      producto_elegido: session.producto_elegido,
      session: {
        ...session,
        telefono: session.telefono_crm || telefono,
        productos: session.productos,
      },
    }, session);
  }
  return reply('Elige:\\n1. Cotizar estos\\n2. Agregar otro\\n0. Buscar de nuevo\\n9. Asesor', session);
}

if (estado === 'SHOW_QUOTE') {
  if (/^(confirmar|si|sí|ok)$/i.test(textoNorm)) {
    if (!session.productos || !session.productos.length) {
      session.estado = 'ASK_BR_TEXT';
      return reply('Aún no hay producto seleccionado. ¿Qué brincolín buscas?', session);
    }
    if (session.editando_folio) {
      return out({
        action: 'editar_renta',
        folio: session.editando_folio,
        telefono_crm: session.telefono_crm || telefono,
        fecha_renta: session.fecha_renta,
        hora_inicio: session.hora_inicio,
        hora_fin: session.hora_fin,
        productos: session.productos,
      }, session);
    }
    return out({
      action: 'lookup_cliente',
      telefono_crm: session.telefono_crm || telefono,
    }, session);
  }
  if (/^(editar)$/i.test(textoNorm)) {
    session.estado = 'ASK_BR_TEXT';
    session.productos = [];
    session.producto_elegido = null;
    session.agregando = false;
    session.awaiting_confirm = false;
    session.br_top = [];
    session.search_id = null;
    return reply('¡Va! ¿Qué brincolín(es) buscas?', session);
  }
  if (/^(3|otro|agregar|mas|más)$/i.test(textoNorm)) {
    session.agregando = true;
    session.estado = 'ASK_BR_TEXT';
    return reply('¿Qué otro brincolín sumamos?', session);
  }
  if (session.editando_folio) {
    return reply(
      'Cuando quieras:\\n*CONFIRMAR* — guardar cambios en *' + session.editando_folio + '*\\n*3* — agregar otro\\n*EDITAR* — reiniciar productos\\n*MENU* — inicio',
      session
    );
  }
  return reply(
    'Cuando quieras:\\n*CONFIRMAR* — domicilio y crear pedido\\n*3* — agregar otro brincolín\\n*EDITAR* — empezar de nuevo\\n*MENU* — inicio',
    session
  );
}

if (estado === 'ASK_ADD_MUEBLES') {
  if (/^(1|no|seguir|continuar)$/i.test(textoNorm)) {
    session.modo_mixto = false;
    session.estado = 'SHOW_QUOTE';
    return reply(
      'Perfecto, seguimos solo con brincolines.\\nResponde *CONFIRMAR* para domicilio, *3* agregar otro BR, o *EDITAR*.',
      session
    );
  }
  if (/^(2|si|sí|mesas|muebles)$/i.test(textoNorm)) {
    session.modo_mixto = false;
    startMuebles(session, { keepProductos: true });
    return reply(
      '¡Genial! Sumamos mesas/sillas a tu pedido de brincolines.\\n\\n' + promptMesaFamilia(),
      session
    );
  }
  return reply('¿También quieres mesas/sillas?\\n1. No, continuar\\n2. Sí, agregar muebles', session);
}

if (estado === 'ASK_DOMICILIO') {
  if (/^(1|si|sí|mismo|correcto|ese)$/i.test(textoNorm)) {
    session.mismo_domicilio = true;
    session.direccion = session.direccion_guardada || session.direccion;
    session.colonia = session.colonia_guardada || session.colonia || '';
    session.ciudad = session.ciudad_guardada || session.ciudad || 'Colima';
    session.cliente_nombre = session.cliente_nombre || session.profile_name || 'Cliente WhatsApp';
    return out({
      action: 'motor',
      purpose: 'renta_crear',
      productos: session.productos,
      producto_elegido: session.producto_elegido,
      session: {
        ...session,
        telefono: session.telefono_crm || telefono,
        productos: session.productos,
        anticipo: 0,
        mismo_domicilio: true,
      },
    }, session);
  }
  if (/^(2|no|otro|nueva|nuevo|cambiar)$/i.test(textoNorm)) {
    session.mismo_domicilio = false;
    session.estado = 'ASK_DIR_CALLE';
    return reply(MSG_ASK_CALLE, session);
  }
  const g = [session.direccion_guardada, session.colonia_guardada, session.ciudad_guardada].filter(Boolean).join('\\n');
  return reply(\`¿La entrega es en este domicilio?\\n\\n📍 \${g}\\n\\n1. Sí, ese domicilio\\n2. Otro domicilio\`, session);
}

if (estado === 'ASK_NOMBRE') {
  if (!texto || texto.length < 2) return reply('¿A nombre de quién queda / quién recibe?', session);
  session.cliente_nombre = texto;
  session.estado = 'ASK_DIR_CALLE';
  return reply(\`Gracias, *\${texto}*.\\n\\n\${MSG_ASK_CALLE}\`, session);
}

if (estado === 'ASK_DIR_CALLE') {
  const loc = parseSharedLocation(texto, input);
  if (loc) {
    session.direccion = 'Manda ubicación';
    session.colonia = 'Por definir';
    session.lat = loc.lat;
    session.lon = loc.lng;
    session.estado = 'ASK_CIUDAD';
    return reply('Recibí tu ubicación 📍\\n¿Ciudad o municipio? (ej. Colima)', session);
  }
  if (!texto || texto.length < 3 || /^\\[/.test(texto)) {
    return reply('Escríbeme la calle y número, el *nombre del local*, o *manda la ubicación* 📍.', session);
  }
  session.direccion = texto;
  session.lat = null;
  session.lon = null;
  // Calle+número suele traer dígitos; nombre de local normalmente no → no pedimos colonia
  const pareceCalleYNumero = /\\d/.test(texto);
  if (pareceCalleYNumero) {
    session.estado = 'ASK_COLONIA';
    return reply('¿En qué colonia es?', session);
  }
  session.colonia = 'Por definir';
  session.estado = 'ASK_CIUDAD';
  return reply('¿Ciudad o municipio? (ej. Colima)', session);
}

if (estado === 'ASK_COLONIA') {
  if (!texto) return reply('¿En qué colonia es?', session);
  session.colonia = texto;
  session.estado = 'ASK_CIUDAD';
  return reply('¿Ciudad o municipio? (ej. Colima)', session);
}

if (estado === 'ASK_CIUDAD') {
  if (!texto) return reply('¿Me dices la ciudad o municipio?', session);
  session.ciudad = texto;
  session.mismo_domicilio = false;
  if (!session.colonia) session.colonia = 'Por definir';
  session.cliente_nombre = session.cliente_nombre || session.profile_name || 'Cliente WhatsApp';
  return out({
    action: 'motor',
    purpose: 'renta_crear',
    productos: session.productos,
    producto_elegido: session.producto_elegido,
    session: {
      ...session,
      telefono: session.telefono_crm || telefono,
      productos: session.productos,
      anticipo: 0,
      mismo_domicilio: false,
    },
  }, session);
}

if (estado === 'SHOW_PEDIDOS_LIST') {
  const lista = Array.isArray(session.pedidos_lista) ? session.pedidos_lista : [];
  if (textoNorm === '0' || /^(menu|atras|atrás|volver)$/i.test(textoNorm)) {
    session.estado = 'IDLE';
    session.pedidos_lista = [];
    session.pedido_activo = null;
    return reply(MENU, session);
  }
  const folioTxt = extractFolio(texto);
  if (folioTxt) {
    const hit = lista.find((r) => String(r.folio).toUpperCase() === folioTxt);
    if (hit || /^r[a-z0-9]{4,}$/i.test(folioTxt)) {
      return openPedidoMenu(session, hit || folioTxt);
    }
  }
  const choice = Number(textoNorm);
  if (Number.isInteger(choice) && choice >= 1 && choice <= lista.length) {
    return openPedidoMenu(session, lista[choice - 1]);
  }
  if (!lista.length) {
    session.estado = 'IDLE';
    return reply('No hay pedidos en la lista. Escribe *2* y los buscamos de nuevo.', session);
  }
  return reply(
    'Elige el número del pedido (*1*' + (lista.length > 1 ? '-' + lista.length : '') + '), el *folio*, o *0* / *MENU*.',
    session
  );
}

if (estado === 'SHOW_PEDIDO_MENU') {
  const folio = String(session.pedido_activo || session.ultimo_folio || '').trim();
  if (!folio) {
    session.estado = 'IDLE';
    return reply('Se me escapó el folio. Escribe *2* para ver tus pedidos.', session);
  }
  if (textoNorm === '0' || /^(atras|atrás|volver)$/i.test(textoNorm)) {
    if (session.pedidos_lista && session.pedidos_lista.length) {
      session.estado = 'SHOW_PEDIDOS_LIST';
      session.pedido_activo = null;
      const lineas = session.pedidos_lista.map((r, i) => {
        return \`*\${i + 1}. \${r.folio}* — \${r.fecha_renta || ''} · Total $\${r.total || '?'}\`;
      });
      return reply(
        ['*Tus pedidos:*', '', ...lineas, '', 'Elige el *número* o el folio. *0* / *MENU* para salir.'].join('\\n'),
        session
      );
    }
    return out({
      action: 'lookup_pedidos',
      telefono_crm: session.telefono_crm || telefono,
    }, session);
  }
  if (textoNorm === '1' || /^(asesor|hablar)$/i.test(textoNorm)) {
    return doHandoff(session, 'pedido ' + folio + ' — hablar con asesor');
  }
  if (textoNorm === '2' || /^(cancelar|cancelacion|cancelación)$/i.test(textoNorm)) {
    session.estado = 'CONFIRM_CANCEL_PEDIDO';
    return reply(
      '¿Seguro que quieres *cancelar* el pedido *' + folio + '*?\\n\\n' +
      '1. Sí, cancelar\\n' +
      '2. No, volver',
      session
    );
  }
  if (textoNorm === '3' || /^(fecha|cambiar fecha|reagendar)$/i.test(textoNorm)) {
    session.editando_folio = folio;
    session.estado = 'ASK_PEDIDO_FECHA';
    return reply(
      '¿Cuál es la nueva *fecha* para *' + folio + '*?\\n' +
      'Ejemplos: *mañana*, *viernes*, *15/08*, *15 de agosto*',
      session
    );
  }
  if (textoNorm === '4' || /^(productos|cambiar productos|editar)$/i.test(textoNorm)) {
    const info = (session.pedidos_lista || []).find((r) => String(r.folio).toUpperCase() === folio.toUpperCase());
    session.editando_folio = folio;
    session.pedido_activo = folio;
    session.ultimo_folio = folio;
    session.productos = [];
    session.producto_elegido = null;
    session.agregando = false;
    session.modo_mixto = false;
    if (info) {
      session.fecha_renta = info.fecha_renta || session.fecha_renta;
      session.hora_inicio = info.hora_inicio ? String(info.hora_inicio).slice(0, 5) : session.hora_inicio;
      session.hora_fin = info.hora_fin ? String(info.hora_fin).slice(0, 5) : session.hora_fin;
    }
    session.estado = 'ASK_CATEGORIA';
    return reply(
      'Vamos a *cambiar los productos* de *' + folio + '*.\\n' +
      'El domicilio y el horario se mantienen.\\n\\n' +
      '¿Qué necesitas ahora?\\n1. Mesas / sillas / manteles\\n2. Brincolines\\n3. Ambos\\n4. Solo loza',
      session
    );
  }
  return reply(msgPedidoMenu(folio), session);
}

if (estado === 'CONFIRM_CANCEL_PEDIDO') {
  const folio = String(session.pedido_activo || session.ultimo_folio || '').trim();
  if (textoNorm === '2' || /^(no|volver|atras|atrás)$/i.test(textoNorm)) {
    session.estado = 'SHOW_PEDIDO_MENU';
    return reply(msgPedidoMenu(folio || '—'), session);
  }
  if (textoNorm === '1' || /^(si|sí|confirmar|cancelar)$/i.test(textoNorm)) {
    return out({
      action: 'cancelar_renta',
      folio,
      telefono_crm: session.telefono_crm || telefono,
      motivo: 'Cancelado por cliente vía WhatsApp',
    }, session);
  }
  return reply(
    '¿Me confirmas la cancelación de *' + (folio || 'pedido') + '*:\\n1. Sí, cancelar\\n2. No, volver',
    session
  );
}

if (estado === 'ASK_PEDIDO_FECHA') {
  const folio = String(session.editando_folio || session.pedido_activo || '').trim();
  const fecha = parseFecha(texto);
  if (!fecha) {
    return reply(
      'No alcancé a entender la fecha. Prueba *mañana*, *viernes*, *15/08* o *15 de agosto*.',
      session
    );
  }
  session.fecha_renta = fecha;
  session.estado = 'ASK_PEDIDO_HORARIO';
  return reply(
    'Fecha: *' + formatFechaEs(fecha) + '*\\n\\n¿Cuál sería el nuevo *horario*?\\nEj: *14:00-22:00* o *2 a 10 pm*',
    session
  );
}

if (estado === 'ASK_PEDIDO_HORARIO') {
  const folio = String(session.editando_folio || session.pedido_activo || '').trim();
  const hor = parseHorario(texto);
  if (!hor) {
    return reply('No alcancé a entender el horario. Prueba *14:00-22:00* o *2 a 10 pm*.', session);
  }
  if (hor.ambiguo) {
    return reply(
      '¿Es de la mañana o de la noche? Especifica *am* o *pm* para que no me confunda, por ejemplo: *8am a 1pm* o *8:00-13:00*.',
      session
    );
  }
  session.hora_inicio = hor.hora_inicio;
  session.hora_fin = hor.hora_fin;
  return out({
    action: 'editar_renta',
    folio,
    telefono_crm: session.telefono_crm || telefono,
    fecha_renta: session.fecha_renta,
    hora_inicio: session.hora_inicio,
    hora_fin: session.hora_fin,
  }, session);
}

session.estado = 'IDLE';
return reply('No alcancé a entender eso. ¿Eliges una opción del menú?\\n\\n' + MENU, session);`;

const brRewrite = `// BR Rewrite: tokens + parseo de VARIOS nombres
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

// Separar varios pedidos: líneas, "mini slider y castillo", "a, b", "a / b"
const lineParts = normalized
  .split(/[\\n\\r]+/)
  .map((p) => p.trim())
  .filter((p) => p.length >= 2);

const partRaw = (lineParts.length ? lineParts : [normalized])
  .flatMap((line) =>
    line
      .split(/\\s*(?:,|;|\\/|\\+|\\by\\b|\\be\\b)\\s*/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 2)
  )
  .slice(0, 5);

const stop = new Set(['con','de','el','la','los','las','un','una','para','brincolin','brincolines','quiero','necesito','rentar','renta']);

function tokensOf(part) {
  return [...new Set(
    part.split(/[^a-z0-9]+/)
      .map((t) => synonyms[t] || t)
      .filter((t) => t.length >= 2 && !stop.has(t))
  )].slice(0, 6);
}

const search_parts = (partRaw.length ? partRaw : [normalized])
  .map((p) => tokensOf(p).join(' '))
  .filter(Boolean);

const unique = [...new Set(search_parts.flatMap((p) => p.split(' ')))].slice(0, 8);
// CRM: grupos OR unidos por |  (AND dentro de cada grupo)
const query_crm = search_parts.join('|');

return [{
  json: {
    ...__prep,
    user_text: text,
    search_parts,
    search_tokens: unique,
    query_crm,
    search: query_crm,
    tipo: 'BR',
    alt_queries: search_parts.length > 1 ? search_parts : (unique.length > 1 ? [unique[0]] : []),
    needs_human: search_parts.length === 0,
    reason: search_parts.length ? null : 'No se pudo extraer tokens',
  }
}];`;

const postBrSearch = `const rerank = $input.first().json;
const prep = $('W2 Router Session').item.json;
const rewrite = $('BR Rewrite').item.json;
const staticData = $getWorkflowStaticData('global');
if (!staticData.wa_sessions) staticData.wa_sessions = {};
if (!staticData.br_searches) staticData.br_searches = {};

const telefono = prep.telefono;
let session = staticData.wa_sessions[telefono] || prep.session || {};
const agregando = !!session.agregando;
const top = Array.isArray(rerank.top) ? rerank.top : [];
const parts = Array.isArray(rewrite.search_parts) ? rewrite.search_parts.filter(Boolean) : [];
const multi = parts.length > 1;

function normText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
}

function scoreNombre(nombre, part) {
  const tokens = String(part || '').split(/\\s+/).map(normText).filter((t) => t.length >= 2);
  if (!tokens.length) return -1000;
  const n = normText(nombre);
  const nameTokens = n.split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  for (const t of tokens) {
    if (!n.includes(t)) return -1000;
  }
  let s = tokens.length * 2;
  if (n.includes(tokens.join(' '))) s += 8;
  if (
    nameTokens.length === tokens.length &&
    tokens.every((t) => nameTokens.includes(t))
  ) {
    s += 20;
  }
  const extras = nameTokens.filter((t) => !tokens.includes(t));
  s -= extras.length * 5;
  s -= Math.max(0, nameTokens.length - tokens.length) * 2;
  return s;
}

function bestForPart(part) {
  let best = null;
  let bestScore = -1000;
  for (const r of top) {
    const s = scoreNombre(r.nombre, part);
    if (
      s > bestScore ||
      (s === bestScore &&
        best &&
        String(r.nombre).length < String(best.nombre).length)
    ) {
      best = r;
      bestScore = s;
    }
  }
  return bestScore > -1000 ? best : null;
}

function mergeProducto(list, item) {
  const arr = Array.isArray(list) ? [...list] : [];
  const ex = arr.find((p) => Number(p.id) === Number(item.id));
  if (ex) ex.cantidad = Number(ex.cantidad || 1) + 1;
  else arr.push({ id: item.id, cantidad: 1 });
  return arr;
}

const hasTop = top.length > 0;
const searchId = hasTop ? \`br_\${telefono}_\${Date.now()}\` : null;
if (hasTop) {
  staticData.br_searches[searchId] = {
    created_at: Date.now(),
    telefono,
    top,
    query_crm: rewrite.query_crm || null,
  };
}

let mensaje;

if (!hasTop) {
  session.estado = 'ASK_BR_TEXT';
  session.search_id = null;
  session.br_top = [];
  mensaje = rerank.menu_whatsapp || (
    'No encontré brincolines con ese nombre.\\n' +
    'Prueba otro nombre, varios separados por "y", o pide el *catálogo*.'
  );
} else if (multi) {
  // Varios nombres → mejor match por cada uno
  const matched = [];
  const missing = [];
  const seen = new Set();
  for (const part of parts) {
    const best = bestForPart(part);
    if (best && !seen.has(best.id)) {
      seen.add(best.id);
      matched.push({ part, item: best });
    } else if (!best) {
      missing.push(part);
    }
  }

  if (matched.length === 0) {
    session.estado = 'SHOW_BR_MENU';
    session.search_id = searchId;
    session.br_top = top;
    mensaje = rerank.menu_whatsapp;
  } else {
    let productos = agregando ? [...(session.productos || [])] : [];
    for (const m of matched) productos = mergeProducto(productos, m.item);
    session.productos = productos;
    session.producto_elegido = matched[matched.length - 1].item;
    session.br_top = top;
    session.search_id = searchId;
    session.agregando = false;
    session.estado = 'SHOW_CART_PREVIEW';

    const lineas = matched.map((m, i) =>
      \`\${i + 1}. *\${m.item.nombre}* — $\${m.item.precio} (buscaste: \${m.part})\`
    );
    if (missing.length) {
      lineas.push('', 'No encontré: ' + missing.map((x) => \`"\${x}"\`).join(', '));
    }
    mensaje = [
      agregando ? 'Sumé esto a tu pedido:' : 'Encontré estas opciones en el sistema:',
      '',
      ...lineas,
      '',
      '1. Cotizar estos',
      '2. Agregar otro',
      '0. Buscar de nuevo',
      '9. Hablar con un asesor',
    ].join('\\n');
  }
} else {
  // Un solo nombre → menú numerado (o append si agregando y top[0] claro)
  session.search_id = searchId;
  session.br_top = top;
  if (agregando && top.length === 1) {
    session.productos = mergeProducto(session.productos, top[0]);
    session.producto_elegido = top[0];
    session.agregando = false;
    session.estado = 'SHOW_CART_PREVIEW';
    const lineas = (session.productos || []).map((p, i) => {
      const meta = top.find((t) => Number(t.id) === Number(p.id)) || session.producto_elegido;
      return \`\${i + 1}. \${meta && meta.nombre ? meta.nombre : ('ID ' + p.id)} x\${p.cantidad}\`;
    });
    mensaje = [
      'Así va tu pedido:',
      ...lineas,
      '',
      '1. Cotizar',
      '2. Agregar otro',
      '0. Buscar de nuevo',
    ].join('\\n');
  } else {
    session.estado = 'SHOW_BR_MENU';
    mensaje = rerank.menu_whatsapp;
  }
}

session.br_query = prep.user_text || session.br_query;
session.updated_at = Date.now();
staticData.wa_sessions[telefono] = session;

return [{
  json: {
    action: 'reply',
    telefono,
    telefono_crm: prep.telefono_crm,
    mensaje_whatsapp: mensaje,
    estado: session.estado,
    session: { ...session },
    search_id: searchId,
  }
}];`;

const postCliente = `const w2 = $('W2 Router Session').item.json;
const cli = $input.first().json;
const staticData = $getWorkflowStaticData('global');
if (!staticData.wa_sessions) staticData.wa_sessions = {};
const telefono = w2.telefono;
let session = staticData.wa_sessions[telefono] || { ...(w2.session || {}) };

let mensaje;
const c = cli.cliente || null;

if (cli.existe && c) {
  session.cliente_id = c.id;
  session.cliente_nombre = c.nombre || session.cliente_nombre || session.profile_name || null;
  session.direccion_guardada = (c.calle_y_numero || '').trim();
  session.colonia_guardada = (c.colonia || '').trim();
  session.ciudad_guardada = (c.ciudad_o_municipio || '').trim();

  if (session.direccion_guardada) {
    session.direccion = session.direccion_guardada;
    session.colonia = session.colonia_guardada;
    session.ciudad = session.ciudad_guardada || 'Colima';
    session.estado = 'ASK_DOMICILIO';
    const nombre = session.cliente_nombre || 'Cliente';
    const lineas = [
      session.direccion_guardada,
      session.colonia_guardada,
      session.ciudad_guardada,
    ].filter(Boolean).join('\\n');
    mensaje = [
      \`*\${nombre}*, el domicilio que tenemos es:\`,
      '',
      '📍 ' + lineas,
      '',
      '¿La entrega del evento es ahí?',
      '1. Sí, ese domicilio',
      '2. Otro domicilio',
    ].join('\\n');
  } else if (!session.cliente_nombre) {
    session.estado = 'ASK_NOMBRE';
    mensaje = 'Aún no tenemos domicilio guardado.\\n¿A nombre de quién queda / quién recibe?';
  } else {
    session.estado = 'ASK_DIR_CALLE';
    mensaje = \`*\${session.cliente_nombre}*, no tenemos domicilio guardado.\\n\\n\${[
      '¿Dónde te entregamos?',
      '',
      'Escribe la *calle y número*.',
      'Si no conoces el domicilio del local, escribe el *nombre del local*.',
      'También puedes *mandar la ubicación* 📍 desde WhatsApp.',
    ].join('\\n')}\`;
  }
} else {
  // Cliente nuevo
  if (!session.cliente_nombre && session.profile_name) {
    session.cliente_nombre = session.profile_name;
  }
  if (!session.cliente_nombre) {
    session.estado = 'ASK_NOMBRE';
    mensaje = 'Aún no encontramos tu número en *Trotamundos*.\\n¿A nombre de quién queda / quién recibe?';
  } else {
    session.estado = 'ASK_DIR_CALLE';
    mensaje = \`*\${session.cliente_nombre}*\\n\\n\${[
      '¿Dónde te entregamos?',
      '',
      'Escribe la *calle y número*.',
      'Si no conoces el domicilio del local, escribe el *nombre del local*.',
      'También puedes *mandar la ubicación* 📍 desde WhatsApp.',
    ].join('\\n')}\`;
  }
}

session.updated_at = Date.now();
staticData.wa_sessions[telefono] = session;
return [{
  json: {
    action: 'reply',
    telefono,
    telefono_crm: w2.telefono_crm,
    mensaje_whatsapp: mensaje,
    estado: session.estado,
    session: { ...session },
  }
}];`;

const postCatalogSearch = `const http = $input.first().json;
const prep = $('W2 Router Session').item.json;
const staticData = $getWorkflowStaticData('global');
if (!staticData.wa_sessions) staticData.wa_sessions = {};

const telefono = prep.telefono;
let session = staticData.wa_sessions[telefono] || prep.session || {};
const kind = String(prep.catalog_kind || '').toUpperCase();
const resultados = Array.isArray(http.resultados)
  ? http.resultados
  : (Array.isArray(http) ? http : []);

function mergeLine(list, id, cantidad) {
  const arr = Array.isArray(list) ? list.map((p) => ({ ...p })) : [];
  const ex = arr.find((p) => Number(p.id) === Number(id));
  const qty = Math.max(1, Number(cantidad) || 1);
  if (ex) ex.cantidad = Number(ex.cantidad || 0) + qty;
  else arr.push({ id: Number(id), cantidad: qty });
  return arr;
}

let mensaje;
let passToMotor = false;

if (kind === 'ME') {
  const top = resultados.filter((r) => (r.unidades_libres == null || Number(r.unidades_libres) > 0)).slice(0, 10);
  if (!top.length) {
    session.estado = 'ASK_MESA_FAMILIA';
    session.me_top = [];
    mensaje = 'No hay mesas de esa familia en ese horario.\\nElige otra:\\n1 Tablón  2 Infantil  3 Redonda  4 Imperial';
  } else {
    session.me_top = top;
    session.estado = 'SHOW_MESA_MENU';
    const lineas = top.map((r, i) =>
      \`\${i + 1}. *\${r.nombre}* — $\${r.precio} (\${r.unidades_libres ?? '?'} libres)\`
    );
    mensaje = [
      \`Encontré estas mesas *\${session.me_familia || ''}* disponibles en el sistema:\`,
      '',
      ...lineas,
      '',
      'Escribe el *número* de la que quieres (luego te pido sillas/cantidad).',
      'Si quieres otra familia, manda *0*.',
    ].join('\\n');
  }
} else if (kind === 'SI') {
  const top = resultados.filter((r) => (r.unidades_libres == null || Number(r.unidades_libres) > 0)).slice(0, 10);
  const qty = Math.max(1, Number(session.pending_si_qty) || 1);
  if (!top.length) {
    session.estado = 'ASK_SILLAS_QTY';
    mensaje = 'No encontré sillas disponibles. Prueba otra cantidad o escribe *ASESOR* y te ayudamos.';
  } else if (top.length === 1) {
    const item = top[0];
    const libres = Number(item.unidades_libres);
    if (Number.isFinite(libres) && qty > libres) {
      session.estado = 'ASK_SILLAS_QTY';
      mensaje = \`Solo hay *\${libres}* sillas libres. ¿Me das otra cantidad?\`;
    } else {
      session.productos = mergeLine(session.productos, item.id, qty);
      session.producto_elegido = item;
      session.si_top = top;
      session.si_qty = qty;
      session.pending_si_qty = null;
      const mesas = Math.max(0, Number(session.me_mesa_qty) || 0);
      const sillas = Math.max(0, Number(session.si_qty) || 0);
      session.mantel_gift_qty = (!mesas || sillas < 10) ? 0 : Math.min(mesas, Math.floor(sillas / 10));
      session.estado = 'ASK_EXTRAS_MUEBLES';
      mensaje = [
        'Listo: *' + qty + '* × ' + item.nombre + '.',
        '',
        '¿Agregamos *mantel*, *cubremantel* o *loza*?',
        '1. No — cotizar solo mesas y sillas',
        '2. Sí, agregar extras',
      ].join('\\n');
    }
  } else {
    session.si_top = top;
    session.estado = 'SHOW_SILLA_MENU';
    const lineas = top.map((r, i) =>
      \`\${i + 1}. *\${r.nombre}* — $\${r.precio} (\${r.unidades_libres ?? '?'} libres)\`
    );
    mensaje = [
      \`¿Cuál silla te gustaría? (cantidad: *\${qty}*)\`,
      '',
      ...lineas,
    ].join('\\n');
  }
} else if (kind === 'CUBRE') {
  const top = resultados
    .filter((r) => /cubre/i.test(String(r.nombre || '')))
    .filter((r) => (r.unidades_libres == null || Number(r.unidades_libres) > 0))
    .slice(0, 10);
  if (!top.length) {
    session.cubre_top = [];
    session.estado = 'ASK_LOZA_SI';
    mensaje = [
      '¿Requieres también *loza* para tu evento?',
      '1. Sí',
      '2. No',
    ].join('\\n');
  } else {
    session.cubre_top = top;
    session.estado = 'SHOW_CUBRE_MENU';
    const lineas = top.map((r, i) =>
      \`\${i + 1}. *\${r.nombre}* — $\${r.precio} (\${r.unidades_libres ?? '?'} libres)\`
    );
    mensaje = [
      '¿Te gustaría agregar *cubremantel*?',
      '',
      ...lineas,
      '',
      '0. No, gracias',
    ].join('\\n');
  }
} else if (kind === 'LZ') {
  const material = String(session.loza_material || '').toLowerCase();
  const wantPlastico = material === 'plastico';
  const top = resultados
    .filter((r) => (r.unidades_libres == null || Number(r.unidades_libres) > 0))
    .filter((r) => {
      const p = /plast/i.test(String(r.nombre || ''));
      return wantPlastico ? p : !p;
    });
  session.loza_top = top;
  if (!top.length) {
    session.estado = 'ASK_LOZA_MATERIAL';
    mensaje = 'No encontré loza *' + (wantPlastico ? 'plástico' : 'cerámica') + '* disponible en esa fecha.\\nElige otra opción:\\n1. Cerámica\\n2. Plástico';
  } else {
    session.estado = 'ASK_LOZA_PERSONAS';
    mensaje = [
      'Loza *' + (wantPlastico ? 'plástico' : 'cerámica') + '* lista.',
      wantPlastico
        ? 'El paquete incluye plato, vaso, tenedor y cuchara plásticos.'
        : 'El paquete incluye plato trinche cerámico, vaso highball, tenedor, cuchillo y cuchara de metal.',
      '',
      '¿Para cuántas *personas*?',
    ].join('\\n');
  }
} else {
  session.estado = 'ASK_MESA_FAMILIA';
  mensaje = 'No pude listar el catálogo. Intenta de nuevo con la familia de mesa, por favor.';
}

session.updated_at = Date.now();
staticData.wa_sessions[telefono] = session;

if (passToMotor) {
  return [{
    json: {
      action: 'motor',
      purpose: 'cotizacion',
      telefono,
      telefono_crm: prep.telefono_crm,
      productos: session.productos,
      producto_elegido: session.producto_elegido,
      session: {
        ...session,
        telefono: session.telefono_crm || telefono,
        productos: session.productos,
        manteles_regalo: session.manteles_regalo || [],
        omitir_promo_mantel: !!session.omitir_promo_mantel,
        notas: session.notas || '',
      },
      estado: session.estado,
    }
  }];
}

return [{
  json: {
    action: 'reply',
    telefono,
    telefono_crm: prep.telefono_crm,
    mensaje_whatsapp: mensaje,
    estado: session.estado,
    session: { ...session },
  }
}];`;

const armarMotor = `const mapped = $input.first().json;
const state = $('W2 Router Session').item.json;
const purpose = mapped.purpose || state.purpose;
let payload = purpose === 'renta_crear' ? mapped.renta_crear_body : mapped.cotizacion_body;
if (!payload) throw new Error('Armar Motor: body null purpose=' + purpose);

const session = mapped.session || state.session || {};
const telefono = String(
  state.telefono_crm || mapped.telefono_crm || state.telefono || session.telefono || payload.telefono || ''
).replace(/\\D/g, '');
if (!telefono) throw new Error('Armar Motor: falta telefono');

const motorBody = {
  ...payload,
  accion: purpose === 'renta_crear' ? 'crear' : 'cotizar',
  telefono,
  nombre: payload.cliente_nombre || session.cliente_nombre || session.profile_name || 'Cliente WhatsApp',
  direccion: payload.calle_y_numero || session.direccion || 'Por confirmar',
  colonia: payload.colonia || session.colonia || 'Por definir',
  ciudad: payload.ciudad_o_municipio || session.ciudad || 'Colima',
  mismo_domicilio: session.mismo_domicilio ?? payload.mismo_domicilio ?? true,
  omitir_promo_mantel: Boolean(session.omitir_promo_mantel || mapped.omitir_promo_mantel || payload.omitir_promo_mantel),
  manteles_regalo: payload.manteles_regalo || session.manteles_regalo || [],
};

return [{
  json: {
    purpose,
    telefono: state.telefono || mapped.telefono,
    telefono_crm: telefono,
    motor_body: motorBody,
    producto_elegido: mapped.producto_elegido || state.producto_elegido,
    session,
  }
}];`;

const postMotor = `const prev = $('Armar Payload Motor').item.json;
const w2 = $('W2 Router Session').item.json;
const motor = $input.first().json;
const staticData = $getWorkflowStaticData('global');
if (!staticData.wa_sessions) staticData.wa_sessions = {};

// Misma key que W2 (teléfono WhatsApp completo), no telefono_crm
const telefono = w2.telefono;
let session = staticData.wa_sessions[telefono] || { ...(w2.session || prev.session || {}) };

const mensaje = motor.mensaje_whatsapp || motor.message || JSON.stringify(motor).slice(0, 400);
const purpose = prev.purpose || w2.purpose;

if (purpose === 'renta_crear' && (motor.folio || motor.ok || motor.tipo === 'renta_creada')) {
  const folioCreado = String(motor.folio || '').trim();
  session.estado = 'WAIT_COMPROBANTE';
  session.awaiting_confirm = false;
  session.productos = [];
  session.producto_elegido = null;
  session.br_top = [];
  session.search_id = null;
  if (folioCreado) session.ultimo_folio = folioCreado;
  const tipPago = '\\n\\n*Pago:* efectivo al entregar, o transferencia + *foto del comprobante* aquí' +
    (folioCreado ? (' (folio *' + folioCreado + '*).') : '.');
  let msgCreado = String(mensaje) + tipPago;
  const requiereVal = Boolean(
    motor.requiere_validacion_logistica
    || motor.validacion_logistica === 'PENDIENTE'
  );
  if (requiereVal) {
    const tempNombre = motor.temporada_alta || 'temporada alta';
    msgCreado += '\\n\\n*' + tempNombre + '*: tu pedido ya quedó *registrado* y el stock reservado. '
      + 'Un asesor confirma la *logística* (repartidores/camionetas) y te avisa aquí en un momento.';
    session.updated_at = Date.now();
    staticData.wa_sessions[telefono] = session;
    const prods = Array.isArray(motor.productos)
      ? motor.productos.map((p) => '· ' + (p.cantidad || 1) + 'x ' + (p.nombre || p.id))
      : [];
    return [{
      json: {
        action: 'alerta_temporada',
        notify_asesores: true,
        handoff_motivo: 'temporada_alta',
        telefono,
        telefono_crm: w2.telefono_crm,
        profile_name: w2.profile_name,
        asesores: w2.asesores || [],
        mensaje_whatsapp: msgCreado,
        folio: folioCreado,
        fecha_renta: motor.fecha_renta || session.fecha_renta,
        hora_inicio: motor.hora_inicio || session.hora_inicio,
        hora_fin: motor.hora_fin || session.hora_fin,
        direccion: motor.direccion || '',
        temporada_alta: tempNombre,
        productos_resumen: prods,
        cliente_nombre_alerta: (motor.cliente && motor.cliente.nombre) || session.cliente_nombre || w2.profile_name || 'Cliente',
        telefono_cliente_alerta: String(
          (motor.cliente && motor.cliente.telefono) || w2.telefono_crm || ''
        ).replace(/\\D/g, '').slice(-10),
        session: { ...session },
        purpose,
      }
    }];
  }
  session.updated_at = Date.now();
  staticData.wa_sessions[telefono] = session;
  return [{ json: { action: 'reply', telefono, telefono_crm: w2.telefono_crm, mensaje_whatsapp: msgCreado, estado: session.estado, session: { ...session }, purpose } }];
} else if (purpose === 'cotizacion') {
  if (w2.productos) session.productos = w2.productos;
  if (w2.producto_elegido) session.producto_elegido = w2.producto_elegido;
  session.awaiting_confirm = true;
  if (session.modo_mixto) {
    session.estado = 'ASK_ADD_MUEBLES';
    const extra = '\\n\\n¿También quieres mesas/sillas?\\n1. No, continuar\\n2. Sí, agregar muebles';
    const msg = String(mensaje) + extra;
    session.updated_at = Date.now();
    staticData.wa_sessions[telefono] = session;
    return [{ json: { action: 'reply', telefono, telefono_crm: w2.telefono_crm, mensaje_whatsapp: msg, estado: session.estado, session: { ...session }, purpose } }];
  }
  session.estado = 'SHOW_QUOTE';
  const extra = '\\n\\n*CONFIRMAR* — domicilio y crear\\n*3* — agregar otro\\n*EDITAR* — reiniciar\\n*MENU* — inicio';
  const msg = String(mensaje).includes('CONFIRMAR') ? mensaje : (mensaje + extra);
  session.updated_at = Date.now();
  staticData.wa_sessions[telefono] = session;
  return [{ json: { action: 'reply', telefono, telefono_crm: w2.telefono_crm, mensaje_whatsapp: msg, estado: session.estado, session: { ...session }, purpose } }];
}

session.updated_at = Date.now();
staticData.wa_sessions[telefono] = session;
return [{ json: { action: 'reply', telefono, telefono_crm: w2.telefono_crm, mensaje_whatsapp: mensaje, estado: session.estado, session: { ...session }, purpose } }];`;

const prepMantelesQuery = `const w2 = $('W2 Router Session').first().json;
let prev = {};
try { prev = $input.first().json || {}; } catch (e) { prev = {}; }
const session = prev.session || w2.session || {};
const familia = String(
  prev.familia
  || w2.familia
  || session.me_familia
  || ''
).toUpperCase();
if (!familia) {
  throw new Error('Prep Manteles: falta familia de mesa (me_familia).');
}
const w2s = w2.session || {};
return [{
  json: {
    familia,
    fecha: session.fecha_renta || w2s.fecha_renta || '',
    hora_inicio: session.hora_inicio || w2s.hora_inicio || '',
    hora_fin: session.hora_fin || w2s.hora_fin || '',
    telefono: w2.telefono,
    telefono_crm: w2.telefono_crm,
    session: { ...session },
  }
}];`;

const postMantelesList = `const http = $input.first().json;
const prep = $('W2 Router Session').item.json;
const staticData = $getWorkflowStaticData('global');
if (!staticData.wa_sessions) staticData.wa_sessions = {};

const telefono = prep.telefono;
let session = staticData.wa_sessions[telefono] || prep.session || {};
const opciones = Array.isArray(http.opciones) ? http.opciones : [];
const top = opciones.filter((o) => (o.unidades_libres == null || Number(o.unidades_libres) > 0)).slice(0, 12);

const mesas = Math.max(0, Number(session.me_mesa_qty) || 0);
const sillas = Math.max(0, Number(session.si_qty) || 0);
const gift = (!mesas || sillas < 10) ? 0 : Math.min(mesas, Math.floor(sillas / 10));
session.mantel_gift_qty = gift;
session.mt_top = top;
session.estado = 'SHOW_MANTEL_MENU';

let mensaje;
if (!top.length) {
  session.manteles_regalo = [];
  if (gift > 0) session.omitir_promo_mantel = true;
  session.updated_at = Date.now();
  staticData.wa_sessions[telefono] = session;
  return [{
    json: {
      action: 'catalog_search',
      purpose: 'disponibilidad',
      catalog_kind: 'CUBRE',
      tipo: 'MT',
      search: 'cubre',
      solo_disponibles: true,
      limit: 15,
      telefono,
      telefono_crm: prep.telefono_crm,
      session: {
        ...session,
        telefono: session.telefono_crm || telefono,
        fecha_renta: session.fecha_renta,
        hora_inicio: session.hora_inicio,
        hora_fin: session.hora_fin,
      },
    }
  }];
}

const lineas = top.map((o, i) => {
  const color = o.color || o.nombre;
  const stock = o.unidades_libres != null ? \` (\${o.unidades_libres} libres)\` : '';
  const precio = gift > 0 ? '' : \` — $\${o.precio_lista || o.precio || '?'}\`;
  return \`\${i + 1}. *\${color}*\${precio}\${stock}\`;
});

const intro = gift > 0
  ? \`¿Qué *color de mantel* te gusta? (\${gift} de regalo con tu pedido)\`
  : '¿Qué *color de mantel* te gusta?';

mensaje = [intro, '', ...lineas, '', '0. Prefiero sin mantel'].join('\\n');

session.updated_at = Date.now();
staticData.wa_sessions[telefono] = session;
return [{
  json: {
    action: 'reply',
    telefono,
    telefono_crm: prep.telefono_crm,
    mensaje_whatsapp: mensaje,
    estado: session.estado,
    session: { ...session },
  }
}];`;

const postPedidos = `const w2 = $('W2 Router Session').item.json;
const http = $input.first().json;
const staticData = $getWorkflowStaticData('global');
if (!staticData.wa_sessions) staticData.wa_sessions = {};

const telefono = w2.telefono;
let session = staticData.wa_sessions[telefono] || w2.session || {};
session.intent = null;

let rentas = [];
const errMsg = http.error || http.message || http.description || '';
if (Array.isArray(http)) rentas = http;
else if (Array.isArray(http.rentas)) rentas = http.rentas;
else if (http.folio) rentas = [http];
else if (errMsg || http.statusCode === 404) {
  session.estado = 'IDLE';
  session.pedidos_lista = [];
  session.pedido_activo = null;
  session.updated_at = Date.now();
  staticData.wa_sessions[telefono] = session;
  return [{
    json: {
      action: 'reply',
      telefono,
      telefono_crm: w2.telefono_crm,
      mensaje_whatsapp: 'No encontré ese folio.\\nEscribe *MENU* o *2* para ver los pedidos de este número.',
      estado: session.estado,
      session: { ...session },
    }
  }];
}

function fmtHora(h) {
  if (!h) return '';
  return String(h).slice(0, 5);
}

function compact(r) {
  return {
    folio: r.folio,
    fecha_renta: r.fecha_renta,
    hora_inicio: r.hora_inicio,
    hora_fin: r.hora_fin,
    total: r.total,
    saldo_pendiente: r.saldo_pendiente,
    pagado: r.pagado,
    estado_entrega: r.estado_entrega,
    cliente: r.cliente,
    productos: Array.isArray(r.productos) ? r.productos.slice(0, 6) : [],
  };
}

let mensaje;
if (!rentas.length) {
  session.estado = 'IDLE';
  session.pedidos_lista = [];
  session.pedido_activo = null;
  mensaje = [
    'No veo *rentas activas* ligadas a este WhatsApp.',
    '',
    'Si tu pedido está a otro número, escribe el *folio* (ej. R1234…).',
    'O elige *1* para cotizar, o *MENU*.',
  ].join('\\n');
} else if (rentas.length === 1 || w2.folio) {
  const r = compact(rentas[0]);
  session.pedidos_lista = rentas.slice(0, 5).map(compact);
  session.pedido_activo = r.folio;
  session.ultimo_folio = r.folio;
  session.estado = 'SHOW_PEDIDO_MENU';
  const prods = (r.productos || [])
    .slice(0, 4)
    .map((p) => \`  · \${p.cantidad}x \${p.nombre}\${p.es_regalo ? ' (regalo)' : ''}\`)
    .join('\\n');
  const horario = [fmtHora(r.hora_inicio), fmtHora(r.hora_fin)].filter(Boolean).join('-');
  mensaje = [
    '*Tu pedido:*',
    \`*\${r.folio}* — \${r.fecha_renta}\${horario ? ' ' + horario : ''}\`,
    r.cliente ? \`Cliente: \${r.cliente}\` : null,
    prods || null,
    \`Total $\${r.total} · Saldo $\${r.saldo_pendiente}\${r.pagado ? ' · Pagado' : ''}\`,
    r.estado_entrega ? \`Entrega: \${r.estado_entrega}\` : null,
    '',
    '¿Qué te gustaría hacer?',
    '1. Hablar con un asesor',
    '2. Cancelar pedido',
    '3. Cambiar fecha',
    '4. Cambiar productos',
    '',
    '0. Volver a mis pedidos',
  ].filter((x) => x !== null).join('\\n');
} else {
  session.pedidos_lista = rentas.slice(0, 5).map(compact);
  session.pedido_activo = null;
  session.estado = 'SHOW_PEDIDOS_LIST';
  const bloques = session.pedidos_lista.map((r, i) => {
    const horario = [fmtHora(r.hora_inicio), fmtHora(r.hora_fin)].filter(Boolean).join('-');
    return \`*\${i + 1}. \${r.folio}* — \${r.fecha_renta}\${horario ? ' ' + horario : ''}\\nTotal $\${r.total} · Saldo $\${r.saldo_pendiente}\`;
  });
  mensaje = [
    \`*Tus pedidos activos* (\${session.pedidos_lista.length}):\`,
    '',
    ...bloques,
    '',
    'Elige el *número* del pedido para continuar.',
    '_También puedes escribir el folio. *0* / *MENU* para salir._',
  ].join('\\n');
}

session.updated_at = Date.now();
staticData.wa_sessions[telefono] = session;
return [{
  json: {
    action: 'reply',
    telefono,
    telefono_crm: w2.telefono_crm,
    mensaje_whatsapp: mensaje.slice(0, 1500),
    estado: session.estado,
    session: { ...session },
  }
}];`;

const w5Prep = `const input = $input.first().json;
if (!input.telefono) throw new Error('W5: falta telefono');
if (!input.mensaje_whatsapp) throw new Error('W5: falta mensaje_whatsapp');
const forceTwilio = String($env.WA_FORCE_TWILIO || '').trim() === '1';
const crmSendUrl = String($env.META_WA_CRM_SEND_URL || 'https://app.trotacrm.com/v1/bot/whatsapp-meta/send/').trim();
const toDigits = String(input.telefono).replace(/\\D/g, '');
const bodyText = String(input.mensaje_whatsapp).slice(0, 1600);

// Preferir CRM (Django → YCloud o Meta). Twilio solo si WA_FORCE_TWILIO=1.
if (!forceTwilio && crmSendUrl) {
  return [{
    json: {
      provider: 'meta',
      send_url: crmSendUrl,
      send_body: JSON.stringify({ telefono: toDigits, mensaje_whatsapp: bodyText }),
      telefono: toDigits,
      mensaje_whatsapp: bodyText,
    }
  }];
}

const sid = $env.TWILIO_ACCOUNT_SID;
const token = $env.TWILIO_AUTH_TOKEN;
const numeroBotRaw = $env.TWILIO_WHATSAPP_NUMBER;
if (!sid) throw new Error('W5: falta TWILIO_ACCOUNT_SID (o configura META_WA_*)');
if (!token) throw new Error('W5: falta TWILIO_AUTH_TOKEN');
if (!numeroBotRaw) throw new Error('W5: falta TWILIO_WHATSAPP_NUMBER');
const authHeader = 'Basic ' + Buffer.from(\`\${sid}:\${token}\`).toString('base64');
const numeroBot = numeroBotRaw.replace('whatsapp:', '');
const toWhatsapp = toDigits.startsWith('52') || toDigits.length > 10
  ? \`whatsapp:+\${toDigits}\`
  : \`whatsapp:+52\${toDigits}\`;
const fromWhatsapp = \`whatsapp:\${numeroBot.startsWith('+') ? numeroBot : '+' + numeroBot}\`;
const mediaUrl = String(input.media_url || (Array.isArray(input.media_urls) && input.media_urls[0]) || '').trim();
const parts = [
  'To=' + encodeURIComponent(toWhatsapp),
  'From=' + encodeURIComponent(fromWhatsapp),
  'Body=' + encodeURIComponent(bodyText),
];
if (mediaUrl) parts.push('MediaUrl=' + encodeURIComponent(mediaUrl));
return [{
  json: {
    provider: 'twilio',
    twilio_auth_header: authHeader,
    twilio_account_sid: sid,
    to_whatsapp: toWhatsapp,
    from_whatsapp: fromWhatsapp,
    mensaje_whatsapp: bodyText,
    media_url: mediaUrl || null,
    twilio_body: parts.join('&'),
    send_url: \`https://api.twilio.com/2010-04-01/Accounts/\${sid}/Messages.json\`,
    send_body: parts.join('&'),
  }
}];`;

const postComprobante = `const w2 = $('W2 Router Session').first().json;
const http = $input.first().json;
const staticData = $getWorkflowStaticData('global');
if (!staticData.wa_sessions) staticData.wa_sessions = {};

let renta = http;
if (Array.isArray(http.rentas) && http.rentas.length) {
  renta = http.rentas.find((r) => !r.pagado) || http.rentas[0];
}
if (http.error && !(renta && renta.folio)) {
  return [{
    json: {
      action: 'reply',
      telefono: w2.telefono,
      telefono_crm: w2.telefono_crm,
      mensaje_whatsapp: '¡Gracias! Recibimos tu comprobante. No localicé el pedido automáticamente; un asesor te escribe en un momento.\\nSi necesitas otra cosa, escribe *MENU*.',
      media_urls: w2.media_urls || [],
      notify_asesores: true,
      handoff_motivo: 'comprobante',
      folio: w2.folio || '',
      session: w2.session || {},
    }
  }];
}

const folio = String(renta.folio || w2.folio || '').trim();
const telefono = w2.telefono;
let session = staticData.wa_sessions[telefono] || { ...(w2.session || {}) };
if (folio) session.ultimo_folio = folio;
session.estado = 'WAIT_COMPROBANTE';
session.updated_at = Date.now();
staticData.wa_sessions[telefono] = session;

const clientMsg = w2.mensaje_whatsapp || [
  '¡Gracias! Ya recibimos tu *comprobante*.',
  folio ? ('Folio: *' + folio + '*') : null,
  'Un asesor lo revisa y te confirmamos el pago por aquí.',
].filter(Boolean).join('\\n');

return [{
  json: {
    action: 'comprobante_recibido',
    telefono: w2.telefono,
    telefono_crm: w2.telefono_crm,
    profile_name: w2.profile_name,
    asesores: w2.asesores || [],
    notify_asesores: true,
    handoff_motivo: 'comprobante',
    folio,
    total: renta.total != null ? String(renta.total) : '',
    saldo_pendiente: renta.saldo_pendiente != null ? String(renta.saldo_pendiente) : '',
    media_urls: w2.media_urls || [],
    mensaje_whatsapp: clientMsg,
    cliente_nombre_alerta: renta.cliente || session.cliente_nombre || w2.profile_name || 'Cliente',
    telefono_cliente_alerta: String(renta.telefono || w2.telefono_crm || '').replace(/\\D/g, '').slice(-10),
    session: { ...session },
  }
}];`;

const postRegistrarPago = `const w2 = $('W2 Router Session').first().json;
const http = $input.first().json;
const staticData = $getWorkflowStaticData('global');
if (!staticData.wa_sessions) staticData.wa_sessions = {};

const asesorTel = w2.telefono;
const asesorCrm = w2.telefono_crm;

const errMsg = http.error
  || (http.message && !http.ok ? http.message : null)
  || (http.errorMessage)
  || (typeof http === 'object' && http.statusCode >= 400 ? JSON.stringify(http) : null);

if (errMsg || http.ok === false) {
  const err = typeof errMsg === 'string' ? errMsg : (errMsg?.error || errMsg?.message || 'No se pudo registrar el pago.');
  return [{
    json: {
      telefono: asesorTel,
      telefono_crm: asesorCrm,
      mensaje_whatsapp: '❌ ' + String(err).slice(0, 400) + '\\nUsa: *PAGO FOLIO* o *PAGO FOLIO monto*',
    }
  }];
}

const folio = String(http.folio || w2.folio || '').trim();
const monto = String(http.monto || w2.monto || '').trim();
const liquidado = Boolean(http.liquidado);
const saldo = String(http.saldo_pendiente || '0');
const clienteTelRaw = String(http.telefono_cliente || '').replace(/\\D/g, '');
const clienteCrm = clienteTelRaw.length > 10 ? clienteTelRaw.slice(-10) : clienteTelRaw;

const msgAsesor = [
  '✅ Pago registrado',
  folio ? ('Folio: *' + folio + '*') : null,
  monto ? ('Monto: $' + monto) : null,
  liquidado ? 'Estado: *liquidado*' : ('Saldo restante: $' + saldo),
].filter(Boolean).join('\\n');

const items = [{
  json: {
    telefono: asesorTel,
    telefono_crm: asesorCrm,
    mensaje_whatsapp: msgAsesor,
  }
}];

if (clienteCrm) {
  // Actualizar sesión del cliente si existe
  for (const [k, s] of Object.entries(staticData.wa_sessions)) {
    const key = String(s.telefono_crm || k || '').replace(/\\D/g, '').slice(-10);
    if (key === clienteCrm) {
      s.estado = liquidado ? 'IDLE' : 'WAIT_COMPROBANTE';
      if (folio) s.ultimo_folio = folio;
      s.updated_at = Date.now();
      staticData.wa_sessions[k] = s;
    }
  }
  const msgCliente = [
    liquidado
      ? '✅ ¡Confirmamos tu pago! Gracias por confiar en *Trotamundos*.'
      : ('✅ Registramos un abono de $' + (monto || '') + '.'),
    folio ? ('Folio: *' + folio + '*') : null,
    liquidado ? null : ('Saldo pendiente: $' + saldo),
    'Si necesitas otra cosa, escribe *MENU*.',
  ].filter(Boolean).join('\\n');
  items.push({
    json: {
      telefono: clienteTelRaw.length === 10 ? '52' + clienteTelRaw : clienteTelRaw,
      telefono_crm: clienteCrm,
      mensaje_whatsapp: msgCliente,
    }
  });
}

return items;`;

const postCancelarRenta = `const w2 = $('W2 Router Session').first().json;
const http = $input.first().json;
const staticData = $getWorkflowStaticData('global');
if (!staticData.wa_sessions) staticData.wa_sessions = {};

const telefono = w2.telefono;
let session = staticData.wa_sessions[telefono] || { ...(w2.session || {}) };
const folio = String(w2.folio || session.pedido_activo || '').trim();

if (http.error || http.ok === false) {
  const err = http.error || http.message || 'No se pudo cancelar.';
  session.estado = 'SHOW_PEDIDO_MENU';
  session.updated_at = Date.now();
  staticData.wa_sessions[telefono] = session;
  return [{
    json: {
      action: 'reply',
      telefono,
      telefono_crm: w2.telefono_crm,
      mensaje_whatsapp: '❌ ' + String(err).slice(0, 400) + '\\nEscribe *MENU* o elige otra opción y con gusto te ayudo.',
      session: { ...session },
    }
  }];
}

session.estado = 'IDLE';
session.pedido_activo = null;
session.editando_folio = null;
session.pedidos_lista = [];
session.updated_at = Date.now();
staticData.wa_sessions[telefono] = session;

return [{
  json: {
    action: 'reply',
    telefono,
    telefono_crm: w2.telefono_crm,
    mensaje_whatsapp: [
      '✅ Listo: pedido *' + folio + '* cancelado.',
      'Si necesitas otra cosa escribe *MENU*.',
    ].join('\\n'),
    session: { ...session },
  }
}];`;

const postEditarRenta = `const w2 = $('W2 Router Session').first().json;
const http = $input.first().json;
const staticData = $getWorkflowStaticData('global');
if (!staticData.wa_sessions) staticData.wa_sessions = {};

const telefono = w2.telefono;
let session = staticData.wa_sessions[telefono] || { ...(w2.session || {}) };
const folio = String(http.folio || w2.folio || session.editando_folio || '').trim();

if (http.error || http.ok === false) {
  const err = http.error || http.message || 'No se pudo actualizar el pedido.';
  session.estado = session.editando_folio && w2.productos ? 'SHOW_QUOTE' : 'SHOW_PEDIDO_MENU';
  session.updated_at = Date.now();
  staticData.wa_sessions[telefono] = session;
  return [{
    json: {
      action: 'reply',
      telefono,
      telefono_crm: w2.telefono_crm,
      mensaje_whatsapp: '❌ ' + String(err).slice(0, 500) + '\\nPuedes intentar otra fecha u horario, o escribe *MENU*.',
      session: { ...session },
    }
  }];
}

session.ultimo_folio = folio || session.ultimo_folio;
session.pedido_activo = folio || session.pedido_activo;
session.editando_folio = null;
session.productos = [];
session.producto_elegido = null;
session.awaiting_confirm = false;
session.estado = 'SHOW_PEDIDO_MENU';
session.updated_at = Date.now();
staticData.wa_sessions[telefono] = session;

const horario = [String(http.hora_inicio || '').slice(0, 5), String(http.hora_fin || '').slice(0, 5)]
  .filter(Boolean).join('-');
const msg = [
  '✅ Pedido *' + folio + '* actualizado. Listo.',
  http.fecha_renta ? ('Fecha: *' + http.fecha_renta + '*' + (horario ? ' ' + horario : '')) : null,
  http.total != null ? ('Total: $' + http.total) : null,
  '',
  '¿Qué te gustaría hacer?',
  '1. Hablar con un asesor',
  '2. Cancelar pedido',
  '3. Cambiar fecha',
  '4. Cambiar productos',
  '',
  '0. Volver a mis pedidos',
].filter((x) => x !== null).join('\\n');

return [{
  json: {
    action: 'reply',
    telefono,
    telefono_crm: w2.telefono_crm,
    mensaje_whatsapp: msg,
    session: { ...session },
  }
}];`;

const postValidacionLogistica = `const w2 = $('W2 Router Session').first().json;
const http = $input.first().json;
const folio = String(http.folio || w2.folio || '').trim();
const decision = String(w2.decision || '').toLowerCase();

if (http.error || http.ok === false) {
  return [{
    json: {
      telefono: w2.telefono,
      telefono_crm: w2.telefono_crm,
      mensaje_whatsapp: '❌ ' + String(http.error || http.message || 'No se pudo validar').slice(0, 400),
    }
  }];
}

const ok = decision === 'aprobar' || http.validacion_logistica === 'APROBADA' || http.decision === 'aprobada';
const msg = ok
  ? ('✅ Logística *aprobada* para *' + folio + '*.\\nEl cliente ya fue notificado.')
  : ('🛑 Logística *rechazada* para *' + folio + '*.\\nStock liberado. Cliente notificado.');

return [{
  json: {
    telefono: w2.telefono,
    telefono_crm: w2.telefono_crm,
    mensaje_whatsapp: msg,
  }
}];`;

// Fase 1-B: Peek estado + merge intención IA (antes de W2)
const peekEstadoSesion = `const staticData = $getWorkflowStaticData('global');
const telefono = $json.telefono;
const estado_sesion =
  (staticData.wa_sessions && staticData.wa_sessions[telefono] && staticData.wa_sessions[telefono].estado)
  || 'IDLE';
const t = String($json.body_texto || '').trim();
const amerita_ia =
  estado_sesion === 'IDLE'
  && t.length > 2
  && !/^menu$/i.test(t)
  && !/^\\[.*\\]$/.test(t);
return [{ json: { ...$json, estado_sesion, amerita_ia } }];`;

const mergeIntencion = `const orig = $('Peek Estado Sesión').first().json;
let intencion_ia = null;
try {
  const maybeIA = $input.first().json;
  const intencionesOk = ['cotizar', 'pedidos', 'animacion', 'eventos', 'asesor'];
  const confOk = ['alta', 'media', 'baja'];
  if (
    maybeIA
    && confOk.includes(maybeIA.confianza)
    && (maybeIA.intencion == null || intencionesOk.includes(maybeIA.intencion))
  ) {
    intencion_ia = maybeIA;
  }
} catch (e) {}
return [{ json: { ...orig, intencion_ia } }];`;

function codeNode(id, name, jsCode, position) {
  return { parameters: { jsCode }, id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position };
}

function ifBoolTrue(id, name, field, position) {
  return {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{
          id: 'a',
          leftValue: `={{ $json.${field} }}`,
          rightValue: true,
          operator: { type: 'boolean', operation: 'true', singleValue: true },
        }],
        combinator: 'and',
      },
      options: {},
    },
    id,
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position,
  };
}

function ifAction(id, name, value, position) {
  return {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'a',
          leftValue: '={{ $json.action }}',
          rightValue: value,
          operator: { type: 'string', operation: 'equals' },
        }],
        combinator: 'and',
      },
      options: {},
    },
    id,
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position,
  };
}

const workflow = {
  name: 'WhatsApp - W1+W2+W5 (Router)',
  nodes: [
    {
      parameters: {
        httpMethod: 'POST',
        path: 'whatsapp',
        responseMode: 'onReceived',
        responseData: 'noData',
        options: {},
      },
      id: 'wa-0001',
      name: 'W1 Webhook Twilio',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 400],
      webhookId: 'whatsapp',
    },
    codeNode('wa-0002', 'W1 Extraer y Normalizar', w1Normalize, [220, 400]),
    codeNode('wa-0040', 'Check Phones Cache', checkPhonesCache, [420, 400]),
    ifBoolTrue('wa-0041', 'IF Need Fetch Phones?', 'need_fetch_phones', [620, 400]),
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.CRM_API_BASE }}/auth/token/',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={\n  "username": "{{ $env.CRM_BOT_USER || \'bot-whatsapp\' }}",\n  "password": "{{ $env.CRM_BOT_PASSWORD }}"\n}',
        options: {},
      },
      id: 'wa-0042',
      name: 'JWT Empleados',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [820, 260],
    },
    {
      parameters: {
        method: 'GET',
        url: '={{ $env.CRM_API_BASE }}/bot/empleados/telefonos/',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: "=Bearer {{ $('JWT Empleados').item.json.access }}" },
          ],
        },
        options: {},
      },
      id: 'wa-0043',
      name: 'HTTP Empleados Telefonos',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1040, 260],
    },
    codeNode('wa-0044', 'Apply Phones Gate', applyPhonesGate, [1260, 400]),
    ifBoolTrue('wa-0045', 'IF Skip Bot?', 'skip_bot', [1460, 400]),
    // Fase 1-B: intención IA (solo IDLE + texto no trivial)
    codeNode('wa-0046', 'Peek Estado Sesión', peekEstadoSesion, [1580, 280]),
    ifBoolTrue('wa-0047', 'IF Amerita IA?', 'amerita_ia', [1780, 280]),
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.CRM_API_BASE }}/auth/token/',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={\n  "username": "{{ $env.CRM_BOT_USER || \'bot-whatsapp\' }}",\n  "password": "{{ $env.CRM_BOT_PASSWORD }}"\n}',
        options: {},
      },
      id: 'wa-0048',
      name: 'JWT Intención',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1980, 160],
      onError: 'continueRegularOutput',
    },
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.CRM_API_BASE }}/bot/whatsapp/extraer-intencion/',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          "={{ JSON.stringify({ texto: $('Peek Estado Sesión').item.json.body_texto, estado_actual: $('Peek Estado Sesión').item.json.estado_sesion, campos_faltantes: ['fecha_renta','hora_inicio','hora_fin','direccion'], contexto_previo: {} }) }}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: "=Bearer {{ $('JWT Intención').item.json.access }}" },
          ],
        },
        options: {},
      },
      id: 'wa-0049',
      name: 'HTTP Extraer Intención',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2180, 160],
      onError: 'continueRegularOutput',
    },
    codeNode('wa-0050', 'Merge Intención', mergeIntencion, [2380, 280]),
    codeNode('wa-0003', 'W2 Router Session', w2Router, [2580, 520]),
    ifAction('wa-0004', 'IF BR Search?', 'br_search', [2800, 520]),
    ifAction('wa-0060', 'IF Catalog Search?', 'catalog_search', [3020, 520]),
    ifAction('wa-0005', 'IF Motor?', 'motor', [3240, 640]),
    ifAction('wa-0080', 'IF List Manteles?', 'list_manteles', [3460, 300]),
    ifAction('wa-0070', 'IF Lookup Pedidos?', 'lookup_pedidos', [3680, 400]),
    ifAction('wa-0006', 'IF Lookup Cliente?', 'lookup_cliente', [3900, 520]),
    ifAction('wa-0090', 'IF Comprobante?', 'comprobante_recibido', [4010, 640]),
    ifAction('wa-0091', 'IF Registrar Pago?', 'registrar_pago', [4120, 640]),
    ifAction('wa-0100', 'IF Cancelar Renta?', 'cancelar_renta', [4230, 640]),
    ifAction('wa-0101', 'IF Editar Renta?', 'editar_renta', [4340, 640]),
    ifAction('wa-0110', 'IF Validacion Logistica?', 'validacion_logistica', [4450, 640]),
    ifAction('wa-0111', 'IF Alerta Temporada?', 'alerta_temporada', [4560, 640]),
    ifAction('wa-0007', 'IF Handoff?', 'handoff', [4670, 640]),
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.CRM_API_BASE }}/auth/token/',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={\n  "username": "{{ $env.CRM_BOT_USER || \'bot-whatsapp\' }}",\n  "password": "{{ $env.CRM_BOT_PASSWORD }}"\n}',
        options: {},
      },
      id: 'wa-0092',
      name: 'JWT Comprobante',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2560, 1100],
    },
    {
      parameters: {
        method: 'GET',
        url: "={{ $('W2 Router Session').item.json.folio ? ($env.CRM_API_BASE + '/bot/renta/' + $('W2 Router Session').item.json.folio + '/') : ($env.CRM_API_BASE + '/bot/renta/') }}",
        sendQuery: true,
        queryParameters: {
          parameters: [
            {
              name: 'telefono',
              value: "={{ $('W2 Router Session').item.json.folio ? '' : ($('W2 Router Session').item.json.telefono_crm || $('W2 Router Session').item.json.telefono) }}",
            },
          ],
        },
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: "=Bearer {{ $('JWT Comprobante').item.json.access }}" },
          ],
        },
        options: {},
      },
      id: 'wa-0093',
      name: 'HTTP Renta Comprobante',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2780, 1100],
      onError: 'continueRegularOutput',
    },
    codeNode('wa-0094', 'Post Comprobante', postComprobante, [3000, 1100]),
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.CRM_API_BASE }}/auth/token/',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={\n  "username": "{{ $env.CRM_BOT_USER || \'bot-whatsapp\' }}",\n  "password": "{{ $env.CRM_BOT_PASSWORD }}"\n}',
        options: {},
      },
      id: 'wa-0095',
      name: 'JWT Registrar Pago',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2560, 1280],
    },
    {
      parameters: {
        method: 'POST',
        url: "={{ $env.CRM_API_BASE + '/bot/renta/' + $('W2 Router Session').item.json.folio + '/pago/' }}",
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          "={{ (() => { const w = $('W2 Router Session').item.json; const o = { metodo_pago: 'transferencia' }; if (w.monto) o.monto = String(w.monto); return JSON.stringify(o); })() }}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: "=Bearer {{ $('JWT Registrar Pago').item.json.access }}" },
          ],
        },
        options: {},
      },
      id: 'wa-0096',
      name: 'HTTP Registrar Pago',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2780, 1280],
      onError: 'continueRegularOutput',
    },
    codeNode('wa-0097', 'Post Registrar Pago', postRegistrarPago, [3000, 1280]),
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.CRM_API_BASE }}/auth/token/',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={\n  "username": "{{ $env.CRM_BOT_USER || \'bot-whatsapp\' }}",\n  "password": "{{ $env.CRM_BOT_PASSWORD }}"\n}',
        options: {},
      },
      id: 'wa-0102',
      name: 'JWT Cancelar Renta',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2560, 1460],
    },
    {
      parameters: {
        method: 'POST',
        url: "={{ $env.CRM_API_BASE + '/bot/renta/' + $('W2 Router Session').item.json.folio + '/cancelar/' }}",
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          "={{ JSON.stringify({ telefono: $('W2 Router Session').item.json.telefono_crm || $('W2 Router Session').item.json.telefono, motivo: $('W2 Router Session').item.json.motivo || 'Cancelado por cliente vía WhatsApp' }) }}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: "=Bearer {{ $('JWT Cancelar Renta').item.json.access }}" },
          ],
        },
        options: {},
      },
      id: 'wa-0103',
      name: 'HTTP Cancelar Renta',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2780, 1460],
      onError: 'continueRegularOutput',
    },
    codeNode('wa-0104', 'Post Cancelar Renta', postCancelarRenta, [3000, 1460]),
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.CRM_API_BASE }}/auth/token/',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={\n  "username": "{{ $env.CRM_BOT_USER || \'bot-whatsapp\' }}",\n  "password": "{{ $env.CRM_BOT_PASSWORD }}"\n}',
        options: {},
      },
      id: 'wa-0105',
      name: 'JWT Editar Renta',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2560, 1640],
    },
    {
      parameters: {
        method: 'POST',
        url: "={{ $env.CRM_API_BASE + '/bot/renta/' + $('W2 Router Session').item.json.folio + '/editar/' }}",
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          "={{ (() => { const w = $('W2 Router Session').item.json; const o = { telefono: w.telefono_crm || w.telefono }; if (w.fecha_renta) o.fecha_renta = w.fecha_renta; if (w.hora_inicio) o.hora_inicio = w.hora_inicio; if (w.hora_fin) o.hora_fin = w.hora_fin; if (w.productos) o.productos = w.productos; return JSON.stringify(o); })() }}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: "=Bearer {{ $('JWT Editar Renta').item.json.access }}" },
          ],
        },
        options: {},
      },
      id: 'wa-0106',
      name: 'HTTP Editar Renta',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2780, 1640],
      onError: 'continueRegularOutput',
    },
    codeNode('wa-0107', 'Post Editar Renta', postEditarRenta, [3000, 1640]),
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.CRM_API_BASE }}/auth/token/',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={\n  "username": "{{ $env.CRM_BOT_USER || \'bot-whatsapp\' }}",\n  "password": "{{ $env.CRM_BOT_PASSWORD }}"\n}',
        options: {},
      },
      id: 'wa-0112',
      name: 'JWT Validacion',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2560, 1820],
    },
    {
      parameters: {
        method: 'POST',
        url: "={{ $env.CRM_API_BASE + '/bot/renta/' + $('W2 Router Session').item.json.folio + '/validacion/' }}",
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          "={{ (() => { const w = $('W2 Router Session').item.json; return JSON.stringify({ accion: w.decision || 'aprobar', motivo: w.motivo || '', actor: w.actor || 'whatsapp' }); })() }}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: "=Bearer {{ $('JWT Validacion').item.json.access }}" },
          ],
        },
        options: {},
      },
      id: 'wa-0113',
      name: 'HTTP Validacion Logistica',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2780, 1820],
      onError: 'continueRegularOutput',
    },
    codeNode('wa-0114', 'Post Validacion Logistica', postValidacionLogistica, [3000, 1820]),
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.CRM_API_BASE }}/auth/token/',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={\n  "username": "{{ $env.CRM_BOT_USER || \'bot-whatsapp\' }}",\n  "password": "{{ $env.CRM_BOT_PASSWORD }}"\n}',
        options: {},
      },
      id: 'wa-0050',
      name: 'JWT Handoff',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2560, 880],
    },
    {
      parameters: {
        method: 'GET',
        url: '={{ $env.CRM_API_BASE }}/bot/cliente/',
        sendQuery: true,
        queryParameters: {
          parameters: [
            {
              name: 'telefono',
              value: "={{ $('W2 Router Session').item.json.telefono_crm || $('W2 Router Session').item.json.telefono }}",
            },
          ],
        },
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: "=Bearer {{ $('JWT Handoff').item.json.access }}" },
          ],
        },
        options: {},
      },
      id: 'wa-0051',
      name: 'HTTP Cliente Handoff',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2780, 880],
    },
    codeNode('wa-0052', 'Prep Handoff Alert', prepHandoff, [3000, 880]),
    codeNode('wa-0008', 'Expand Handoff', expandHandoff, [3220, 880]),

    // Catalog ME/SI search (sin rewrite BR)
    codeNode('wa-0061', 'Session To CRM Query (Cat)', sessionSrc, [2340, 200]),
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.CRM_API_BASE }}/auth/token/',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={\n  "username": "{{ $env.CRM_BOT_USER || \'bot-whatsapp\' }}",\n  "password": "{{ $env.CRM_BOT_PASSWORD }}"\n}',
        options: {},
      },
      id: 'wa-0062',
      name: 'JWT Catalog',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2560, 200],
    },
    {
      parameters: {
        method: 'GET',
        url: '={{ $env.CRM_API_BASE }}/bot/disponibilidad/',
        sendQuery: true,
        queryParameters: {
          parameters: [
            { name: 'fecha', value: "={{ $('Session To CRM Query (Cat)').item.json.disponibilidad_query.fecha }}" },
            { name: 'hora_inicio', value: "={{ $('Session To CRM Query (Cat)').item.json.disponibilidad_query.hora_inicio }}" },
            { name: 'hora_fin', value: "={{ $('Session To CRM Query (Cat)').item.json.disponibilidad_query.hora_fin }}" },
            { name: 'tipo', value: "={{ $('W2 Router Session').item.json.tipo }}" },
            { name: 'search', value: "={{ $('W2 Router Session').item.json.search || '' }}" },
            { name: 'solo_disponibles', value: 'true' },
            { name: 'limit', value: '15' },
          ],
        },
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: "=Bearer {{ $('JWT Catalog').item.json.access }}" },
          ],
        },
        options: {},
      },
      id: 'wa-0063',
      name: 'HTTP Catalog Disponibilidad',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2780, 200],
    },
    codeNode('wa-0064', 'Post Catalog Search', postCatalogSearch, [3000, 200]),

    // Manteles colores
    codeNode('wa-0080b', 'Prep Manteles Query', prepMantelesQuery, [2680, 0]),
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.CRM_API_BASE }}/auth/token/',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={\n  "username": "{{ $env.CRM_BOT_USER || \'bot-whatsapp\' }}",\n  "password": "{{ $env.CRM_BOT_PASSWORD }}"\n}',
        options: {},
      },
      id: 'wa-0081',
      name: 'JWT Manteles',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2780, 0],
    },
    {
      parameters: {
        method: 'GET',
        url: '={{ $env.CRM_API_BASE }}/bot/manteles-regalo/',
        sendQuery: true,
        queryParameters: {
          parameters: [
            {
              name: 'familia',
              value: "={{ $('Prep Manteles Query').item.json.familia }}",
            },
            {
              name: 'fecha',
              value: "={{ $('Prep Manteles Query').item.json.fecha }}",
            },
            {
              name: 'hora_inicio',
              value: "={{ $('Prep Manteles Query').item.json.hora_inicio }}",
            },
            {
              name: 'hora_fin',
              value: "={{ $('Prep Manteles Query').item.json.hora_fin }}",
            },
          ],
        },
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: "=Bearer {{ $('JWT Manteles').item.json.access }}" },
          ],
        },
        options: {},
      },
      id: 'wa-0082',
      name: 'HTTP Manteles Colores',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [3000, 0],
    },
    codeNode('wa-0083', 'Post Manteles List', postMantelesList, [3220, 0]),

    // Pedidos por teléfono / folio
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.CRM_API_BASE }}/auth/token/',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={\n  "username": "{{ $env.CRM_BOT_USER || \'bot-whatsapp\' }}",\n  "password": "{{ $env.CRM_BOT_PASSWORD }}"\n}',
        options: {},
      },
      id: 'wa-0071',
      name: 'JWT Pedidos',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2780, 100],
    },
    {
      parameters: {
        method: 'GET',
        url: "={{ $('W2 Router Session').item.json.folio ? ($env.CRM_API_BASE + '/bot/renta/' + $('W2 Router Session').item.json.folio + '/') : ($env.CRM_API_BASE + '/bot/renta/') }}",
        sendQuery: true,
        queryParameters: {
          parameters: [
            {
              name: 'telefono',
              value: "={{ $('W2 Router Session').item.json.folio ? '' : ($('W2 Router Session').item.json.telefono_crm || $('W2 Router Session').item.json.telefono) }}",
            },
          ],
        },
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: "=Bearer {{ $('JWT Pedidos').item.json.access }}" },
          ],
        },
        options: {},
      },
      id: 'wa-0072',
      name: 'HTTP Bot Pedidos',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [3000, 100],
      continueOnFail: true,
    },
    codeNode('wa-0073', 'Post Pedidos', postPedidos, [3220, 100]),

    // BR search branch
    codeNode('wa-0010', 'BR Rewrite', brRewrite, [2120, 300]),
    codeNode('wa-0011', 'Session To CRM Query (BR)', sessionSrc, [2340, 300]),
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.CRM_API_BASE }}/auth/token/',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={\n  "username": "{{ $env.CRM_BOT_USER || \'bot-whatsapp\' }}",\n  "password": "{{ $env.CRM_BOT_PASSWORD }}"\n}',
        options: {},
      },
      id: 'wa-0012',
      name: 'Obtener Token JWT',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2560, 300],
    },
    {
      parameters: {
        method: 'GET',
        url: '={{ $env.CRM_API_BASE }}/bot/disponibilidad/',
        sendQuery: true,
        queryParameters: {
          parameters: [
            { name: 'fecha', value: "={{ $('Session To CRM Query (BR)').item.json.disponibilidad_query.fecha }}" },
            { name: 'hora_inicio', value: "={{ $('Session To CRM Query (BR)').item.json.disponibilidad_query.hora_inicio }}" },
            { name: 'hora_fin', value: "={{ $('Session To CRM Query (BR)').item.json.disponibilidad_query.hora_fin }}" },
            { name: 'tipo', value: 'BR' },
            { name: 'search', value: "={{ $('BR Rewrite').item.json.query_crm }}" },
            { name: 'solo_disponibles', value: 'true' },
            { name: 'limit', value: '15' },
          ],
        },
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: "=Bearer {{ $('Obtener Token JWT').item.json.access }}" },
          ],
        },
        options: {},
      },
      id: 'wa-0013',
      name: 'BR HTTP Disponibilidad',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2780, 300],
    },
    codeNode('wa-0014', 'BR Rerank', rerankSrc, [3000, 300]),
    codeNode('wa-0015', 'Post BR Search', postBrSearch, [3220, 300]),

    // Lookup cliente (domicilio)
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.CRM_API_BASE }}/auth/token/',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={\n  "username": "{{ $env.CRM_BOT_USER || \'bot-whatsapp\' }}",\n  "password": "{{ $env.CRM_BOT_PASSWORD }}"\n}',
        options: {},
      },
      id: 'wa-0016',
      name: 'JWT Cliente',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2560, 520],
    },
    {
      parameters: {
        method: 'GET',
        url: '={{ $env.CRM_API_BASE }}/bot/cliente/',
        sendQuery: true,
        queryParameters: {
          parameters: [
            {
              name: 'telefono',
              value: "={{ $('W2 Router Session').item.json.telefono_crm || $('W2 Router Session').item.json.telefono }}",
            },
          ],
        },
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: "=Bearer {{ $('JWT Cliente').item.json.access }}" },
          ],
        },
        options: {},
      },
      id: 'wa-0017',
      name: 'HTTP Bot Cliente',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2780, 520],
    },
    codeNode('wa-0018', 'Post Cliente Lookup', postCliente, [3000, 520]),

    // Motor branch
    codeNode('wa-0020', 'Session To CRM Query (Motor)', sessionSrc, [2340, 760]),
    codeNode('wa-0021', 'Armar Payload Motor', armarMotor, [2560, 760]),
    {
      parameters: {
        method: 'POST',
        url: 'https://bot.app.trotacrm.com/webhook/trotacrm-crear-plan',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json.motor_body) }}',
        options: {},
      },
      id: 'wa-0022',
      name: 'Llamar Motor Crear-Plan',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2780, 760],
    },
    codeNode('wa-0023', 'Post Motor', postMotor, [3000, 760]),

    codeNode('wa-0030', 'W5 Preparar Auth y Payload', w5Prep, [3440, 520]),
    {
      parameters: {
        method: 'POST',
        url: '={{ $json.send_url }}',
        sendBody: true,
        contentType: 'raw',
        rawContentType: '={{ $json.provider === "meta" ? "application/json" : "application/x-www-form-urlencoded" }}',
        body: '={{ $json.send_body }}',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'Authorization',
              value: '={{ $json.provider === "meta" ? "" : $json.twilio_auth_header }}',
            },
            {
              name: 'Content-Type',
              value: '={{ $json.provider === "meta" ? "application/json" : "application/x-www-form-urlencoded" }}',
            },
          ],
        },
        options: {},
      },
      id: 'wa-0031',
      name: 'W5 Enviar a Twilio',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [3660, 520],
    },
    {
      parameters: {
        httpMethod: 'POST',
        path: 'bot-notify-cliente',
        responseMode: 'onReceived',
        responseData: 'noData',
        options: {},
      },
      id: 'wa-0120',
      name: 'Webhook Notify Cliente',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 1200],
      webhookId: 'bot-notify-cliente',
    },
    codeNode(
      'wa-0121',
      'Prep Notify Cliente',
      `const body = $input.first().json.body ?? $input.first().json;
const telefono = String(body.telefono || '').replace(/\\D/g, '');
const mensaje = String(body.mensaje_whatsapp || body.mensaje || '').trim();
if (!telefono) throw new Error('Notify: falta telefono');
if (!mensaje) throw new Error('Notify: falta mensaje_whatsapp');
return [{ json: { telefono, telefono_crm: telefono.slice(-10), mensaje_whatsapp: mensaje } }];`,
      [220, 1200]
    ),
  ],
  connections: {
    'Webhook Notify Cliente': { main: [[{ node: 'Prep Notify Cliente', type: 'main', index: 0 }]] },
    'Prep Notify Cliente': { main: [[{ node: 'W5 Preparar Auth y Payload', type: 'main', index: 0 }]] },
    'W1 Webhook Twilio': { main: [[{ node: 'W1 Extraer y Normalizar', type: 'main', index: 0 }]] },
    'W1 Extraer y Normalizar': { main: [[{ node: 'Check Phones Cache', type: 'main', index: 0 }]] },
    'Check Phones Cache': { main: [[{ node: 'IF Need Fetch Phones?', type: 'main', index: 0 }]] },
    'IF Need Fetch Phones?': {
      main: [
        [{ node: 'JWT Empleados', type: 'main', index: 0 }],
        [{ node: 'Apply Phones Gate', type: 'main', index: 0 }],
      ],
    },
    'JWT Empleados': { main: [[{ node: 'HTTP Empleados Telefonos', type: 'main', index: 0 }]] },
    'HTTP Empleados Telefonos': { main: [[{ node: 'Apply Phones Gate', type: 'main', index: 0 }]] },
    'Apply Phones Gate': { main: [[{ node: 'IF Skip Bot?', type: 'main', index: 0 }]] },
    'IF Skip Bot?': {
      main: [
        [],
        [{ node: 'Peek Estado Sesión', type: 'main', index: 0 }],
      ],
    },
    'Peek Estado Sesión': { main: [[{ node: 'IF Amerita IA?', type: 'main', index: 0 }]] },
    'IF Amerita IA?': {
      main: [
        [{ node: 'JWT Intención', type: 'main', index: 0 }],
        [{ node: 'Merge Intención', type: 'main', index: 0 }],
      ],
    },
    'JWT Intención': { main: [[{ node: 'HTTP Extraer Intención', type: 'main', index: 0 }]] },
    'HTTP Extraer Intención': { main: [[{ node: 'Merge Intención', type: 'main', index: 0 }]] },
    'Merge Intención': { main: [[{ node: 'W2 Router Session', type: 'main', index: 0 }]] },
    'W2 Router Session': { main: [[{ node: 'IF BR Search?', type: 'main', index: 0 }]] },
    'IF BR Search?': {
      main: [
        [{ node: 'BR Rewrite', type: 'main', index: 0 }],
        [{ node: 'IF Catalog Search?', type: 'main', index: 0 }],
      ],
    },
    'IF Catalog Search?': {
      main: [
        [{ node: 'Session To CRM Query (Cat)', type: 'main', index: 0 }],
        [{ node: 'IF List Manteles?', type: 'main', index: 0 }],
      ],
    },
    'Session To CRM Query (Cat)': { main: [[{ node: 'JWT Catalog', type: 'main', index: 0 }]] },
    'JWT Catalog': { main: [[{ node: 'HTTP Catalog Disponibilidad', type: 'main', index: 0 }]] },
    'HTTP Catalog Disponibilidad': { main: [[{ node: 'Post Catalog Search', type: 'main', index: 0 }]] },
    'Post Catalog Search': { main: [[{ node: 'IF List Manteles?', type: 'main', index: 0 }]] },
    'IF List Manteles?': {
      main: [
        [{ node: 'Prep Manteles Query', type: 'main', index: 0 }],
        [{ node: 'IF Motor?', type: 'main', index: 0 }],
      ],
    },
    'Prep Manteles Query': { main: [[{ node: 'JWT Manteles', type: 'main', index: 0 }]] },
    'JWT Manteles': { main: [[{ node: 'HTTP Manteles Colores', type: 'main', index: 0 }]] },
    'HTTP Manteles Colores': { main: [[{ node: 'Post Manteles List', type: 'main', index: 0 }]] },
    'Post Manteles List': { main: [[{ node: 'IF Catalog Search?', type: 'main', index: 0 }]] },
    'IF Motor?': {
      main: [
        [{ node: 'Session To CRM Query (Motor)', type: 'main', index: 0 }],
        [{ node: 'IF Lookup Pedidos?', type: 'main', index: 0 }],
      ],
    },
    'IF Lookup Pedidos?': {
      main: [
        [{ node: 'JWT Pedidos', type: 'main', index: 0 }],
        [{ node: 'IF Lookup Cliente?', type: 'main', index: 0 }],
      ],
    },
    'JWT Pedidos': { main: [[{ node: 'HTTP Bot Pedidos', type: 'main', index: 0 }]] },
    'HTTP Bot Pedidos': { main: [[{ node: 'Post Pedidos', type: 'main', index: 0 }]] },
    'Post Pedidos': { main: [[{ node: 'W5 Preparar Auth y Payload', type: 'main', index: 0 }]] },
    'IF Lookup Cliente?': {
      main: [
        [{ node: 'JWT Cliente', type: 'main', index: 0 }],
        [{ node: 'IF Comprobante?', type: 'main', index: 0 }],
      ],
    },
    'IF Comprobante?': {
      main: [
        [{ node: 'JWT Comprobante', type: 'main', index: 0 }],
        [{ node: 'IF Registrar Pago?', type: 'main', index: 0 }],
      ],
    },
    'JWT Comprobante': { main: [[{ node: 'HTTP Renta Comprobante', type: 'main', index: 0 }]] },
    'HTTP Renta Comprobante': { main: [[{ node: 'Post Comprobante', type: 'main', index: 0 }]] },
    'Post Comprobante': { main: [[{ node: 'Expand Handoff', type: 'main', index: 0 }]] },
    'IF Registrar Pago?': {
      main: [
        [{ node: 'JWT Registrar Pago', type: 'main', index: 0 }],
        [{ node: 'IF Cancelar Renta?', type: 'main', index: 0 }],
      ],
    },
    'JWT Registrar Pago': { main: [[{ node: 'HTTP Registrar Pago', type: 'main', index: 0 }]] },
    'HTTP Registrar Pago': { main: [[{ node: 'Post Registrar Pago', type: 'main', index: 0 }]] },
    'Post Registrar Pago': { main: [[{ node: 'W5 Preparar Auth y Payload', type: 'main', index: 0 }]] },
    'IF Cancelar Renta?': {
      main: [
        [{ node: 'JWT Cancelar Renta', type: 'main', index: 0 }],
        [{ node: 'IF Editar Renta?', type: 'main', index: 0 }],
      ],
    },
    'JWT Cancelar Renta': { main: [[{ node: 'HTTP Cancelar Renta', type: 'main', index: 0 }]] },
    'HTTP Cancelar Renta': { main: [[{ node: 'Post Cancelar Renta', type: 'main', index: 0 }]] },
    'Post Cancelar Renta': { main: [[{ node: 'W5 Preparar Auth y Payload', type: 'main', index: 0 }]] },
    'IF Editar Renta?': {
      main: [
        [{ node: 'JWT Editar Renta', type: 'main', index: 0 }],
        [{ node: 'IF Validacion Logistica?', type: 'main', index: 0 }],
      ],
    },
    'JWT Editar Renta': { main: [[{ node: 'HTTP Editar Renta', type: 'main', index: 0 }]] },
    'HTTP Editar Renta': { main: [[{ node: 'Post Editar Renta', type: 'main', index: 0 }]] },
    'Post Editar Renta': { main: [[{ node: 'W5 Preparar Auth y Payload', type: 'main', index: 0 }]] },
    'IF Validacion Logistica?': {
      main: [
        [{ node: 'JWT Validacion', type: 'main', index: 0 }],
        [{ node: 'IF Alerta Temporada?', type: 'main', index: 0 }],
      ],
    },
    'JWT Validacion': { main: [[{ node: 'HTTP Validacion Logistica', type: 'main', index: 0 }]] },
    'HTTP Validacion Logistica': { main: [[{ node: 'Post Validacion Logistica', type: 'main', index: 0 }]] },
    'Post Validacion Logistica': { main: [[{ node: 'W5 Preparar Auth y Payload', type: 'main', index: 0 }]] },
    'IF Alerta Temporada?': {
      main: [
        [{ node: 'Expand Handoff', type: 'main', index: 0 }],
        [{ node: 'IF Handoff?', type: 'main', index: 0 }],
      ],
    },
    'IF Handoff?': {
      main: [
        [{ node: 'JWT Handoff', type: 'main', index: 0 }],
        [{ node: 'W5 Preparar Auth y Payload', type: 'main', index: 0 }],
      ],
    },
    'JWT Handoff': { main: [[{ node: 'HTTP Cliente Handoff', type: 'main', index: 0 }]] },
    'HTTP Cliente Handoff': { main: [[{ node: 'Prep Handoff Alert', type: 'main', index: 0 }]] },
    'Prep Handoff Alert': { main: [[{ node: 'Expand Handoff', type: 'main', index: 0 }]] },
    'Expand Handoff': { main: [[{ node: 'W5 Preparar Auth y Payload', type: 'main', index: 0 }]] },
    'BR Rewrite': { main: [[{ node: 'Session To CRM Query (BR)', type: 'main', index: 0 }]] },
    'Session To CRM Query (BR)': { main: [[{ node: 'Obtener Token JWT', type: 'main', index: 0 }]] },
    'Obtener Token JWT': { main: [[{ node: 'BR HTTP Disponibilidad', type: 'main', index: 0 }]] },
    'BR HTTP Disponibilidad': { main: [[{ node: 'BR Rerank', type: 'main', index: 0 }]] },
    'BR Rerank': { main: [[{ node: 'Post BR Search', type: 'main', index: 0 }]] },
    'Post BR Search': { main: [[{ node: 'W5 Preparar Auth y Payload', type: 'main', index: 0 }]] },
    'JWT Cliente': { main: [[{ node: 'HTTP Bot Cliente', type: 'main', index: 0 }]] },
    'HTTP Bot Cliente': { main: [[{ node: 'Post Cliente Lookup', type: 'main', index: 0 }]] },
    'Post Cliente Lookup': { main: [[{ node: 'W5 Preparar Auth y Payload', type: 'main', index: 0 }]] },
    'Session To CRM Query (Motor)': { main: [[{ node: 'Armar Payload Motor', type: 'main', index: 0 }]] },
    'Armar Payload Motor': { main: [[{ node: 'Llamar Motor Crear-Plan', type: 'main', index: 0 }]] },
    'Llamar Motor Crear-Plan': { main: [[{ node: 'Post Motor', type: 'main', index: 0 }]] },
    'Post Motor': { main: [[{ node: 'IF Alerta Temporada?', type: 'main', index: 0 }]] },
    'W5 Preparar Auth y Payload': { main: [[{ node: 'W5 Enviar a Twilio', type: 'main', index: 0 }]] },
  },
  pinData: {},
  settings: { executionOrder: 'v1' },
  staticData: null,
  tags: [{ name: 'TROTA' }, { name: 'W2' }, { name: 'WHATSAPP' }],
  meta: { templateCredsSetupCompleted: false },
  id: 's0EchoTwilioW1W5',
  active: true,
};

fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2));
console.log('Wrote', outPath);
console.log('Nodes:', workflow.nodes.length);

// Validate embedded JS
for (const n of workflow.nodes) {
  if (n.type === 'n8n-nodes-base.code') {
    try {
      // eslint-disable-next-line no-new-func
      new Function(n.parameters.jsCode);
    } catch (e) {
      console.error('BAD JS in', n.name, e.message);
      process.exitCode = 1;
    }
  }
}
