/**
 * Nodo Code n8n — nombre FIJO: "Session To CRM Query"
 *
 * Único convertidor Session → payloads CRM.
 * Shapes SEPARADOS a propósito (no mezclar GET y POST):
 *
 *   disponibilidad_query / disponibilidad_qs
 *     → SOLO para GET /v1/bot/disponibilidad/
 *     → Nunca incluye productos, dirección ni cliente
 *
 *   cotizacion_body
 *     → SOLO para POST /v1/bot/cotizacion/
 *     → horario (fecha_renta) + productos + manteles_regalo?
 *
 *   renta_crear_body
 *     → SOLO para POST /v1/bot/renta/crear/
 *     → body completo (cliente, dirección, productos, horario, anticipo…)
 *
 * Input:
 *   $json.purpose = "disponibilidad" | "cotizacion" | "renta_crear"
 *   (default: "disponibilidad")
 *   + session en $json / $json.session / nodo "Session"
 *   + extras: tipo, search|query_crm, solo_disponibles, limit, accion…
 *
 * Si falta un campo requerido para el purpose → THROW ruidoso
 * (no dejar que el CRM conteste 400 genérico dos nodos después).
 */

const SESSION_NODE = 'Session';
const PURPOSE = String(($input.first().json || {}).purpose || 'disponibilidad').toLowerCase();

function loadSession() {
  const direct = $input.first().json || {};
  if (direct.session && typeof direct.session === 'object') {
    return { ...direct.session };
  }
  try {
    return { ...$(SESSION_NODE).first().json };
  } catch (_) {
    return { ...direct };
  }
}

function requireFields(obj, fields, ctx) {
  const missing = fields.filter((f) => {
    const v = obj[f];
    if (v === undefined || v === null) return true;
    if (typeof v === 'string' && !v.trim()) return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  });
  if (missing.length) {
    throw new Error(
      `session_to_crm_query: falta ${missing.join(', ')} en session ` +
      `(purpose=${ctx}). No llames al CRM hasta completar el flujo conversacional.`
    );
  }
}

const extras = $input.first().json || {};
const session = loadSession();

// Horario: canónico en session es fecha_renta (no fecha)
const fecha_renta = session.fecha_renta || extras.fecha_renta;
const hora_inicio = session.hora_inicio || extras.hora_inicio;
const hora_fin = session.hora_fin || extras.hora_fin;

const horario = {
  fecha_renta: fecha_renta ? String(fecha_renta) : '',
  hora_inicio: hora_inicio ? String(hora_inicio) : '',
  hora_fin: hora_fin ? String(hora_fin) : '',
};

// ─── GET /bot/disponibilidad/ ─────────────────────────────────────────
requireFields(horario, ['fecha_renta', 'hora_inicio', 'hora_fin'], PURPOSE === 'disponibilidad' ? 'disponibilidad' : `${PURPOSE}/horario`);

const tipo = extras.tipo || session.tipo_busqueda || '';
const search = extras.search ?? extras.query_crm ?? session.query_crm ?? '';
const solo_disponibles = extras.solo_disponibles ?? true;
const limit = extras.limit ?? 15;

const disponibilidad_query = {
  fecha: horario.fecha_renta, // RENAME session.fecha_renta → ?fecha=
  hora_inicio: horario.hora_inicio,
  hora_fin: horario.hora_fin,
  solo_disponibles: solo_disponibles ? 'true' : 'false',
  limit: String(limit),
};
if (tipo) disponibilidad_query.tipo = String(tipo);
if (search) disponibilidad_query.search = String(search);

const disponibilidad_qs = Object.entries(disponibilidad_query)
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  .join('&');

// ─── POST /bot/cotizacion/ ────────────────────────────────────────────
let cotizacion_body = null;
if (PURPOSE === 'cotizacion' || PURPOSE === 'renta_crear') {
  const productos = session.productos || extras.productos;
  requireFields({ ...horario, productos }, ['fecha_renta', 'hora_inicio', 'hora_fin', 'productos'], 'cotizacion');
  cotizacion_body = {
    fecha_renta: horario.fecha_renta,
    hora_inicio: horario.hora_inicio,
    hora_fin: horario.hora_fin,
    productos,
    manteles_regalo: session.manteles_regalo || extras.manteles_regalo || [],
  };
}

// ─── POST /bot/renta/crear/ ───────────────────────────────────────────
let renta_crear_body = null;
if (PURPOSE === 'renta_crear') {
  const telefono = session.telefono || extras.telefono;
  const productos = session.productos || extras.productos;
  requireFields(
    { ...horario, telefono, productos },
    ['fecha_renta', 'hora_inicio', 'hora_fin', 'telefono', 'productos'],
    'renta_crear'
  );

  renta_crear_body = {
    telefono: String(telefono).replace(/\D/g, ''),
    cliente_nombre: session.cliente_nombre || session.nombre || extras.nombre || '',
    calle_y_numero: session.direccion || session.calle_y_numero || extras.direccion || '',
    colonia: session.colonia || extras.colonia || '',
    ciudad_o_municipio: session.ciudad || session.ciudad_o_municipio || extras.ciudad || '',
    mismo_domicilio: session.mismo_domicilio ?? extras.mismo_domicilio ?? true,
    fecha_renta: horario.fecha_renta,
    hora_inicio: horario.hora_inicio,
    hora_fin: horario.hora_fin,
    productos,
    manteles_regalo: session.manteles_regalo || extras.manteles_regalo || [],
    anticipo: session.anticipo ?? extras.anticipo ?? 0,
    notas: session.notas || extras.notas || '',
    accion: 'crear',
  };
}

// Salida: shapes hermanos, no un mega-objeto ambiguo
const out = {
  purpose: PURPOSE,
  // GET only
  disponibilidad_query,
  disponibilidad_qs,
  // POST cotizacion only (null si purpose=disponibilidad)
  cotizacion_body,
  // POST renta/crear only (null si purpose≠renta_crear)
  renta_crear_body,
  _map: {
    'session.fecha_renta → GET': 'disponibilidad_query.fecha',
    'session.fecha_renta → POST': 'cotizacion_body.fecha_renta | renta_crear_body.fecha_renta',
  },
};

if (PURPOSE === 'disponibilidad') {
  // No exponer bodies POST parcialmente construidos por accidente
  out.cotizacion_body = null;
  out.renta_crear_body = null;
}
if (PURPOSE === 'cotizacion') {
  out.renta_crear_body = null;
}

return [{ json: out }];
