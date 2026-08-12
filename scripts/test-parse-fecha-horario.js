/**
 * Smoke test local de parseFecha / parseHorario (misma lógica que W2).
 * Ejecutar: node scripts/test-parse-fecha-horario.js
 */

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
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
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
  let t = String(raw || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  t = t.replace(/^(para|el|la|del|para el|para la)\s+/i, '').trim();
  t = t.replace(/\s+/g, ' ');
  if (!t) return null;
  const hoy = todayYmdMexico();
  if (/^(hoy)$/.test(t)) return hoy;
  if (/^(manana)$/.test(t)) return addDaysYmd(hoy, 1);
  if (/^(pasado\s*manana)$/.test(t)) return addDaysYmd(hoy, 2);
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const mon = m[2].padStart(2, '0');
    const year = Number(hoy.slice(0, 4));
    let ymd = `${year}-${mon}-${day}`;
    if (ymd < hoy) ymd = `${year + 1}-${mon}-${day}`;
    return ymd;
  }
  const meses = {
    enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4,
    mayo: 5, may: 5, junio: 6, jun: 6, julio: 7, jul: 7, agosto: 8, ago: 8,
    septiembre: 9, setiembre: 9, sep: 9, sept: 9, octubre: 10, oct: 10,
    noviembre: 11, nov: 11, diciembre: 12, dic: 12,
  };
  m = t.match(/^(\d{1,2})\s*(?:de\s+)?([a-z]+)\s*(\d{4})?$/);
  if (m && meses[m[2]]) {
    const day = m[1].padStart(2, '0');
    const mon = String(meses[m[2]]).padStart(2, '0');
    const year = m[3] ? Number(m[3]) : Number(hoy.slice(0, 4));
    let ymd = `${year}-${mon}-${day}`;
    if (!m[3] && ymd < hoy) ymd = `${year + 1}-${mon}-${day}`;
    return ymd;
  }
  const dias = {
    domingo: 0, dom: 0, lunes: 1, lun: 1, martes: 2, mar: 2,
    miercoles: 3, mie: 3, mier: 3, jueves: 4, jue: 4,
    viernes: 5, vie: 5, sabado: 6, sab: 6,
  };
  m = t.match(/^(este|proximo|siguiente|el)?\s*(domingo|dom|lunes|lun|martes|mar|miercoles|mie|mier|jueves|jue|viernes|vie|sabado|sab)$/);
  if (m && dias[m[2]] !== undefined) {
    const excludeToday = m[1] === 'proximo' || m[1] === 'siguiente';
    return nextWeekdayYmd(hoy, dias[m[2]], { excludeToday });
  }
  m = t.match(/^(?:el\s+)?(siguiente|proximo)\s+(domingo|dom|lunes|lun|martes|mar|miercoles|mie|mier|jueves|jue|viernes|vie|sabado|sab)$/);
  if (m && dias[m[2]] !== undefined) {
    return nextWeekdayYmd(hoy, dias[m[2]], { excludeToday: true });
  }
  return null;
}

function parseHoraToken(token) {
  let s = String(token || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/\b(la|las|el|los|al)\b/g, ' ');
  s = s.replace(/\s+/g, '');
  if (!s) return null;
  let ampm = null;
  if (/a\.?m\.?|manana/.test(s)) ampm = 'am';
  if (/p\.?m\.?|tarde|noche/.test(s)) ampm = 'pm';
  s = s.replace(/(a\.?m\.?|p\.?m\.?|manana|tarde|noche|dela|de)/g, '');
  let h;
  let min = 0;
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    h = Number(m[1]);
    min = Number(m[2]);
  } else if (/^\d{1,2}$/.test(s)) h = Number(s);
  else return null;
  if (!Number.isInteger(h) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  if (ampm === 'am') {
    if (h === 12) h = 0;
  } else if (ampm === 'pm') {
    if (h < 12) h += 12;
  }
  return { h, min, ampm };
}

function parseHorarioOne(raw) {
  let t = String(raw || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  t = t.replace(/^(de|desde)\s+/, '');
  t = t.replace(/\ba\s+las\b/g, 'a');
  t = t.replace(/\ba\s+la\b/g, 'a');
  t = t.replace(/\b(la|las|el|los|al)\b/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  let parts = t.split(/\s*(?:-|–|—|hasta|\/)\s*|\s+a\s+/);
  if (parts.length !== 2) parts = t.split(/[-–—]/);
  if (parts.length !== 2) return null;
  let start = parseHoraToken(parts[0]);
  let end = parseHoraToken(parts[1]);
  if (!start || !end) return null;
  // 24h explícito = hora >= 13 SIN am/pm (no confundir con "10 pm" → 22)
  const formato24hExplicito =
    (!start.ampm && start.h >= 13) || (!end.ampm && end.h >= 13);
  if (!formato24hExplicito) {
    if (!start.ampm && end.ampm === 'pm' && start.h >= 1 && start.h <= 11) {
      start = { ...start, h: start.h < 12 ? start.h + 12 : start.h, ampm: 'pm' };
    }
    if (!start.ampm && start.h >= 1 && start.h <= 11) start = { ...start, h: start.h + 12 };
    if (!end.ampm && end.h >= 1 && end.h <= 11) end = { ...end, h: end.h + 12 };
  }
  if (start.h > 23 || end.h > 23) return null;
  const hi = start.h * 60 + start.min;
  const hf = end.h * 60 + end.min;
  if (hf <= hi) return { ambiguo: true };
  return {
    hora_inicio: `${String(start.h).padStart(2, '0')}:${String(start.min).padStart(2, '0')}`,
    hora_fin: `${String(end.h).padStart(2, '0')}:${String(end.min).padStart(2, '0')}`,
  };
}

function parseHorario(raw) {
  const full = String(raw || '').trim();
  if (!full) return null;
  const lines = full.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const got = parseHorarioOne(lines[i]);
      if (got) return got;
    }
    return null;
  }
  return parseHorarioOne(full);
}

const hoy = todayYmdMexico();
const cases = [
  ['mañana', addDaysYmd(hoy, 1)],
  ['para mañana', addDaysYmd(hoy, 1)],
  ['hoy', hoy],
  ['pasado mañana', addDaysYmd(hoy, 2)],
  ['15/08/2026', '2026-08-15'],
  ['15/08', null], // dynamic
  ['15 de agosto', null],
  ['viernes', nextWeekdayYmd(hoy, 5, { excludeToday: false })],
  ['próximo viernes', nextWeekdayYmd(hoy, 5, { excludeToday: true })],
  ['el siguiente viernes', nextWeekdayYmd(hoy, 5, { excludeToday: true })],
  ['para el siguiente sábado', nextWeekdayYmd(hoy, 6, { excludeToday: true })],
];

console.log('Hoy MX:', hoy);
let failed = 0;
for (const [input, expected] of cases) {
  const got = parseFecha(input);
  const ok = expected === null ? !!got : got === expected;
  if (!ok) failed++;
  console.log(ok ? 'OK' : 'FAIL', JSON.stringify(input), '→', got, expected ? `(want ${expected})` : '');
}

const horarios = [
  ['14:00-22:00', '14:00', '22:00'],
  ['2 a 10 pm', '14:00', '22:00'],
  ['de 14 a 22', '14:00', '22:00'],
  ['14 a 22', '14:00', '22:00'],
  ['1 a 8', '13:00', '20:00'],
  ['De 1 a 5 pm', '13:00', '17:00'],
  ['De la 1 pm a las 5 pm', '13:00', '17:00'],
  ['2pm-10pm', '14:00', '22:00'],
  ['de 2 a 10', '14:00', '22:00'],
  ['10am a 2pm', '10:00', '14:00'],
  ['14:22\n14 a 22', '14:00', '22:00'],
  // Bug prod: 24h explícito no debe heredar tarde
  ['08:00 a 13:00', '08:00', '13:00'],
  ['8:00 a 13:00', '08:00', '13:00'],
  ['08:00-13:00', '08:00', '13:00'],
];
for (const [input, a, b] of horarios) {
  const got = parseHorario(input);
  const ok = got && !got.ambiguo && got.hora_inicio === a && got.hora_fin === b;
  if (!ok) failed++;
  console.log(ok ? 'OK' : 'FAIL', JSON.stringify(input), '→', got);
}

const horariosAmbiguos = ['8 a 1'];
for (const input of horariosAmbiguos) {
  const got = parseHorario(input);
  const ok = got && got.ambiguo === true;
  if (!ok) failed++;
  console.log(ok ? 'OK' : 'FAIL', JSON.stringify(input), '→ ambiguo', got);
}

const horariosNull = ['Menu', 'hola', 'xyz'];
for (const input of horariosNull) {
  const got = parseHorario(input);
  const ok = got === null;
  if (!ok) failed++;
  console.log(ok ? 'OK' : 'FAIL', JSON.stringify(input), '→ null', got);
}

if (failed) {
  console.error('Failed:', failed);
  process.exit(1);
}
console.log('All good');
