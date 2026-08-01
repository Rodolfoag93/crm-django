/**
 * Nodo Code n8n — nombre sugerido: "Session To CRM Query"
 *
 * ÚNICO punto de conversión Session → query params CRM.
 * Todos los handlers (BR, ME, SI, LZ, MT) deben usar este nodo
 * antes de llamar GET /v1/bot/disponibilidad/ (u otros GETs con horario).
 *
 * Session (canónico conversacional):
 *   fecha_renta, hora_inicio, hora_fin, telefono, productos, ...
 *
 * CRM GET disponibilidad (canónico API):
 *   fecha, hora_inicio, hora_fin, tipo?, search?, solo_disponibles?, limit?
 *
 * CRM POST cotizacion/renta (canónico API body):
 *   fecha_renta, hora_inicio, hora_fin  ← aquí SÍ se usa fecha_renta
 */

const SESSION_NODE = 'Session'; // o pasar session en $json

function loadSession() {
  const direct = $input.first().json || {};
  if (direct.fecha_renta || direct.hora_inicio) {
    return direct.session || direct;
  }
  try {
    return $(SESSION_NODE).first().json;
  } catch (_) {
    return direct.session || direct;
  }
}

const session = loadSession();
const extras = $input.first().json || {};

const fecha_renta = session.fecha_renta || session.fecha || extras.fecha_renta || extras.fecha;
const hora_inicio = session.hora_inicio || extras.hora_inicio;
const hora_fin = session.hora_fin || extras.hora_fin;

const missing = [];
if (!fecha_renta) missing.push('fecha_renta');
if (!hora_inicio) missing.push('hora_inicio');
if (!hora_fin) missing.push('hora_fin');
if (missing.length) {
  throw new Error(
    `Session To CRM Query: faltan campos de sesión: ${missing.join(', ')}`
  );
}

const tipo = extras.tipo || session.tipo_busqueda || '';
const search = extras.search ?? extras.query_crm ?? '';
const solo_disponibles = extras.solo_disponibles ?? true;
const limit = extras.limit ?? 15;

// Query string params para GET /bot/disponibilidad/
const disponibilidad_query = {
  fecha: String(fecha_renta),          // RENAME: session.fecha_renta → ?fecha=
  hora_inicio: String(hora_inicio),    // mismo nombre
  hora_fin: String(hora_fin),          // mismo nombre
  solo_disponibles: solo_disponibles ? 'true' : 'false',
  limit: String(limit),
};
if (tipo) disponibilidad_query.tipo = String(tipo);
if (search) disponibilidad_query.search = String(search);

// Body fields para POST /bot/cotizacion/ y /bot/renta/crear/
const renta_body_horario = {
  fecha_renta: String(fecha_renta),    // POST usa fecha_renta (no fecha)
  hora_inicio: String(hora_inicio),
  hora_fin: String(hora_fin),
};

// URLSearchParams helper (sin encoding manual en expressions)
const qs = Object.entries(disponibilidad_query)
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  .join('&');

return [{
  json: {
    // Passthrough sesión
    session: {
      fecha_renta: String(fecha_renta),
      hora_inicio: String(hora_inicio),
      hora_fin: String(hora_fin),
      telefono: session.telefono || extras.telefono || null,
    },
    // Listo para HTTP GET
    disponibilidad_query,
    disponibilidad_qs: qs,
    // Listo para HTTP POST body merge
    renta_body_horario,
    // Debug naming
    _map: {
      'session.fecha_renta': 'disponibilidad_query.fecha',
      'session.hora_inicio': 'disponibilidad_query.hora_inicio',
      'session.hora_fin': 'disponibilidad_query.hora_fin',
      'session.fecha_renta (POST)': 'renta_body_horario.fecha_renta',
    },
  },
}];
