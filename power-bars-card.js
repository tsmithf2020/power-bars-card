/*
 * power-bars-card
 *
 * Muestra muchos sensores numericos como barras horizontales compactas, en el
 * espacio que ocupaban tres gauges. Pensado para consumos electricos: casi
 * todos marcan 0 W casi todo el tiempo, asi que ordena por valor y puede
 * esconder los apagados para que arriba quede siempre lo que si esta gastando.
 *
 * Local: /local/power-bars-card/power-bars-card.js
 */

const VERSION = "1.8.0";

/* ---------- idioma ---------- */

// Textos de la tarjeta y del editor. Español para cualquier `es*` del perfil de
// Home Assistant, ingles para todo lo demas.
const I18N = {
  en: {
    nothingOn: "nothing on",
    loading: "loading…",
    noData: "no data",
    sumOfRows: "Sum of the rows",
    mode: "Mode",
    noEntityForMode: "no entity for this mode",
    notFound: "not found",
    stubTitle: "Power",
    now: "Now",
    group: "Group",
    // editor
    title: "Title",
    sort: "Sort order",
    columns: "Columns",
    layout: "Row layout",
    hide_zero: "Hide rows that are off",
    show_total: "Show total in the header",
    zero_threshold: "Off threshold",
    max: "Max scale (blank = automatic)",
    total: "Total meter (blank = sum the rows)",
    billing_day: "Billing cycle starts on day",
    entities: "Entities",
    sortActive: "Active first (idle rows keep my order)",
    sortValue: "By value (highest first)",
    sortConfig: "My own order (as listed below)",
    sortName: "By name",
    col1: "1 column",
    col2: "2 columns",
    layoutStacked: "Name and value on top, bar below",
    layoutInline: "Name, bar and value on one line",
    groupName: "Group name",
    groupMax: "Max scale (number, or `auto`)",
    inTotal: "Include in total",
    groupEntities: "Group entities",
    modeName: "Button label",
    period: "Reads",
    periodLive: "Live value",
    periodToday: "Total since midnight",
    periodMonth: "Total this calendar month",
    periodBilling: "Total this billing cycle",
    replaceFrom: "Replace in entity id",
    replaceTo: "...with",
    unit: "Unit override",
    modeMax: "Max scale (blank = keep group's, or `auto` to fit the largest)",
    modeTotal: "Total meter for this mode (blank = sum the rows)",
    modeThreshold: "Off threshold in this mode (blank = 0)",
    modes: "Modes",
    moveUp: "Move up",
    moveDown: "Move down",
    remove: "Delete",
    addGroup: "+ Add group",
    useGroups: "Use groups",
    useGroupsHelp: "Groups get their own heading and their own scale. The entities you already have move into the first group.",
    addMode: "+ Add mode",
    addModeHelp: "Modes put buttons in the header to read the same rows a different way — live watts, or kWh over a period.",
  },
  es: {
    nothingOn: "nada encendido",
    loading: "cargando…",
    noData: "sin datos",
    sumOfRows: "Suma de las filas",
    mode: "Modo",
    noEntityForMode: "sin entidad para este modo",
    notFound: "no existe",
    stubTitle: "Consumos",
    now: "Ahora",
    group: "Grupo",
    title: "Título",
    sort: "Orden",
    columns: "Columnas",
    layout: "Diseño de las filas",
    hide_zero: "Esconder las filas apagadas",
    show_total: "Mostrar el total en la cabecera",
    zero_threshold: "Umbral de apagado",
    max: "Escala máxima (vacío = automática)",
    total: "Medidor del total (vacío = suma de las filas)",
    billing_day: "El ciclo de facturación parte el día",
    entities: "Entidades",
    sortActive: "Encendidas primero (las apagadas quedan en mi orden)",
    sortValue: "Por valor (mayor primero)",
    sortConfig: "Mi propio orden (el de la lista)",
    sortName: "Por nombre",
    col1: "1 columna",
    col2: "2 columnas",
    layoutStacked: "Nombre y valor arriba, barra abajo",
    layoutInline: "Nombre, barra y valor en una línea",
    groupName: "Nombre del grupo",
    groupMax: "Escala máxima (número, o `auto`)",
    inTotal: "Sumar en el total",
    groupEntities: "Entidades del grupo",
    modeName: "Texto del botón",
    period: "Lee",
    periodLive: "Valor en vivo",
    periodToday: "Total desde medianoche",
    periodMonth: "Total del mes calendario",
    periodBilling: "Total del ciclo de facturación",
    replaceFrom: "Reemplazar en el entity id",
    replaceTo: "...por",
    unit: "Unidad a mostrar",
    modeMax: "Escala máxima (vacío = la del grupo, o `auto` para ajustar a la mayor)",
    modeTotal: "Medidor del total en este modo (vacío = suma de las filas)",
    modeThreshold: "Umbral de apagado en este modo (vacío = 0)",
    modes: "Modos",
    moveUp: "Subir",
    moveDown: "Bajar",
    remove: "Borrar",
    addGroup: "+ Agregar grupo",
    useGroups: "Usar grupos",
    useGroupsHelp: "Cada grupo tiene su propio título y su propia escala. Las entidades que ya tienes pasan al primer grupo.",
    addMode: "+ Agregar modo",
    addModeHelp: "Los modos ponen botones en la cabecera para leer las mismas filas de otra forma: watts en vivo, o kWh de un período.",
  },
};

function langOf(hass) {
  const l = String((hass && ((hass.locale && hass.locale.language) || hass.language)) || "en");
  return l.toLowerCase().startsWith("es") ? "es" : "en";
}

function txt(hass) {
  return I18N[langOf(hass)];
}

/* ---------- utilidades ---------- */

// Acepta "sensor.x" o {entity: "sensor.x", name: "...", max: 500}
function normEntry(e) {
  if (typeof e === "string") return { entity: e };
  if (e && typeof e === "object" && e.entity) return { ...e };
  return null;
}

// Si la entidad no lleva mas que el id, se guarda como string: el YAML queda
// legible en vez de llenarse de `- entity: sensor.x`.
// El campo de escala acepta un numero o la palabra `auto`. Los formularios
// hacian parseFloat y tiraban lo que no fuera numero, asi que un `max: auto`
// escrito en YAML se BORRABA en cuanto se tocaba cualquier otra cosa en la UI,
// sin avisar. Los tres formularios pasan por aqui.
function parseMax(v) {
  if (v === undefined || v === null) return undefined;
  const t = String(v).trim();
  if (t === "") return undefined;
  if (t.toLowerCase() === "auto") return "auto";
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function simplify(e) {
  return Object.keys(e).length === 1 && e.entity ? e.entity : e;
}

function normEntries(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normEntry).filter(Boolean);
}

// Un config puede venir plano (entities) o agrupado (groups). Se normaliza
// siempre a grupos para no tener dos caminos en el render.
function normGroups(cfg) {
  const out = [];
  if (Array.isArray(cfg.groups) && cfg.groups.length) {
    for (const g of cfg.groups) {
      if (!g) continue;
      const ents = normEntries(g.entities);
      if (!ents.length) continue;
      out.push({
        name: g.name || "",
        max: g.max,
        in_total: g.in_total,   // sin esto el grupo excluido igual sumaba
        severity: g.severity,
        zero_threshold: g.zero_threshold,
        entities: ents,
      });
    }
  }
  const flat = normEntries(cfg.entities);
  if (flat.length) out.push({ name: "", max: cfg.max, entities: flat });
  return out;
}

function numState(hass, id) {
  const st = hass && hass.states ? hass.states[id] : null;
  if (!st) return null;
  const v = parseFloat(st.state);
  return Number.isFinite(v) ? v : null;
}

function unitOf(hass, id) {
  const st = hass && hass.states ? hass.states[id] : null;
  return (st && st.attributes && st.attributes.unit_of_measurement) || "";
}

function nameOf(hass, id, override) {
  if (override) return override;
  const st = hass && hass.states ? hass.states[id] : null;
  return (st && st.attributes && st.attributes.friendly_name) || id;
}

// Cuantos decimales lleva un numero. Si la entidad trae `display_precision`
// (lo que se elige en HA, en la ventana de la entidad), manda esa. Si no:
//   entero o >= 10 -> ninguno   ("8", no "8.0"; "173", "14")
//   >= 0,1         -> uno       ("3.4", "0.2")
//   menor          -> dos       ("0.04", no "0.0")
function decimalsFor(v, precision) {
  if (Number.isInteger(precision) && precision >= 0 && precision <= 6) return precision;
  const a = Math.abs(v);
  if (a === 0 || Number.isInteger(v) || a >= 10) return 0;
  // 9,96 redondeado a un decimal es "10.0": sin decimales, igual que un 10.
  if (a >= 0.1) return Math.abs(Number(v.toFixed(1))) >= 10 ? 0 : 1;
  return 2;
}

// 1578 -> "1578", 0.209 -> "0.2", 8 -> "8". Con `opt.locale` usa el formato
// de numeros elegido en el perfil de Home Assistant (coma decimal en español).
function fmt(v, opt) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const o = opt || {};
  const d = decimalsFor(v, o.precision);
  let n = Number(v.toFixed(d));
  if (Object.is(n, -0)) n = 0;          // "-0.0" no existe
  if (!o.locale) return n.toFixed(d);
  try {
    return new Intl.NumberFormat(o.locale, {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
      useGrouping: o.grouping !== false,
    }).format(n);
  } catch (e) {
    return n.toFixed(d);
  }
}

// Traduce la opcion "Formato de numeros" del perfil de HA a un locale de Intl,
// igual que el propio frontend.
function numberLocale(hass) {
  const l = hass && hass.locale;
  const lang = (l && l.language) || (hass && hass.language) || null;
  if (!l && !lang) return null;
  const nav = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
  switch (l && l.number_format) {
    case "comma_decimal": return { locale: ["en-US", "en"] };
    case "decimal_comma": return { locale: ["de", "es", "it"] };
    case "space_comma": return { locale: ["fr", "sv", "cs"] };
    case "system": return { locale: nav };
    case "none": return { locale: lang || nav, grouping: false };
    default: return { locale: lang || nav };
  }
}

function precisionOf(hass, id) {
  const e = hass && hass.entities && id ? hass.entities[id] : null;
  return e && Number.isInteger(e.display_precision) ? e.display_precision : undefined;
}

// La escala compartida es lo que hace comparables las barras. Si no se fija un
// max, se usa el mayor valor presente para que siempre haya una barra llena.
function scaleFor(group, vals, cfgMax, modeMax) {
  // El max del modo pisa al del grupo: en kWh las escalas de watts no sirven.
  const m =
    modeMax !== undefined && modeMax !== null
      ? modeMax
      : group.max !== undefined
      ? group.max
      : cfgMax;
  if (m !== undefined && m !== null && m !== "auto") {
    const n = parseFloat(m);
    if (Number.isFinite(n) && n > 0) return n;
  }
  // En valor absoluto: una exportacion solar de -3000 W tambien llena la barra.
  let mx = 0;
  for (const v of vals) if (v !== null && Math.abs(v) > mx) mx = Math.abs(v);
  return mx > 0 ? mx : 1;
}

// Un "modo" es otra lectura de las mismas filas: potencia ahora, energia de
// hoy, energia del mes. Cada fila resuelve a OTRA entidad segun el modo.
//   - `key`     : la fila trae el entity_id escrito a mano (p.ej. `energy:`)
//   - `replace` : [de, a] para derivarlo del nombre (`_power` -> `_energy_daily`)
// Si el modo tiene regla y la fila no la cumple, devuelve null y la fila sale
// como no disponible. NO cae de vuelta a la entidad base a proposito: eso
// mezclaria watts dentro de una columna de kWh sin que se note.
function normModes(cfg) {
  const m = Array.isArray(cfg.modes) ? cfg.modes.filter(Boolean) : [];
  return m.length ? m : [{}];
}

const PERIODS = ["today", "month", "billing"];

// Un modo que lee OTRA entidad (energia en vez de potencia) cambia la magnitud:
// el medidor total, los umbrales y las escalas escritos para watts no le sirven.
function changesQuantity(mode) {
  return !!(mode && (mode.period || mode.key || mode.replace));
}

// El total de un modo: el suyo, o el de la tarjeta solo si el modo sigue
// leyendo la misma magnitud. Sin esto un modo en kWh tomaba el medidor de
// watts de la tarjeta y la cabecera decia "0 W".
function totalEntityFor(mode, cfg) {
  const t = mode && mode.total !== undefined
    ? mode.total
    : changesQuantity(mode) ? undefined : cfg.total;
  return typeof t === "string" && t !== "" && t !== "sum" ? t : null;
}

// Si un modo declara `unit` y la entidad viene en otra unidad de la misma
// familia, se convierte. Sin esto un sensor en Wh dentro de una columna de kWh
// da un numero 1000 veces mas grande sin ninguna senal de que algo va mal.
const UNIDADES = { W: 1, kW: 1000, Wh: 1, kWh: 1000, MWh: 1000000 };
const FAMILIA = { W: "p", kW: "p", Wh: "e", kWh: "e", MWh: "e" };

function convert(v, de, a) {
  if (v === null || v === undefined || !de || !a || de === a) return v;
  if (FAMILIA[de] === undefined || FAMILIA[de] !== FAMILIA[a]) return v;
  return (v * UNIDADES[de]) / UNIDADES[a];
}

// Año, mes (0-11) y dia de un instante, en la zona horaria pedida. Sin zona,
// la del navegador.
function partsIn(d, tz) {
  if (tz) {
    try {
      const f = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, year: "numeric", month: "numeric", day: "numeric",
      });
      const o = {};
      for (const x of f.formatToParts(d)) o[x.type] = Number(x.value);
      if (o.year && o.month && o.day) return { y: o.year, m: o.month - 1, day: o.day };
    } catch (e) {}
  }
  return { y: d.getFullYear(), m: d.getMonth(), day: d.getDate() };
}

// Cuanto adelanta (ms) la zona `tz` a UTC en ese instante.
function tzOffset(utcMs, tz) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
  });
  const o = {};
  for (const x of f.formatToParts(new Date(utcMs))) o[x.type] = Number(x.value);
  const comoUtc = Date.UTC(o.year, o.month - 1, o.day, o.hour % 24, o.minute, o.second);
  return comoUtc - Math.floor(utcMs / 1000) * 1000;
}

// Medianoche de ese dia en la zona `tz`. Se ajusta dos veces por si justo ese
// dia cambia la hora de verano.
function midnight(y, m, day, tz) {
  if (tz) {
    try {
      const base = Date.UTC(y, m, day);
      let t = base - tzOffset(base, tz);
      t = base - tzOffset(t, tz);
      // Donde el cambio de hora es justo a medianoche (Chile: 23:59:59 salta
      // a 01:00) las 00:00 no existen y el calculo cae en las 23:00 del dia
      // anterior. En ese caso el dia empieza con su primer instante valido.
      const p = partsIn(new Date(t), tz);
      if (p.y !== y || p.m !== m || p.day !== day) t += 3600000;
      return new Date(t);
    } catch (e) {}
  }
  return new Date(y, m, day);
}

const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

// Inicio de la ventana de un modo.
//   today   -> medianoche de hoy
//   month   -> dia 1 del mes
//   billing -> el dia de corte (billing_day). Si hoy es 5 y el corte es 10,
//              el ciclo vigente empezo el 10 del mes PASADO. Un corte 29-31 en
//              un mes mas corto cae en su ultimo dia (antes se volvia dia 1).
// `tz`: la zona horaria que usa Home Assistant para ese usuario; sin ella, la
// del navegador.
function periodStart(period, billingDay, now, tz) {
  const p = partsIn(now || new Date(), tz);
  if (period === "today") return midnight(p.y, p.m, p.day, tz);
  if (period === "month") return midnight(p.y, p.m, 1, tz);
  if (period === "billing") {
    let day = parseInt(billingDay, 10);
    if (!Number.isFinite(day) || day < 1 || day > 31) day = 1;
    const corteEste = Math.min(day, daysIn(p.y, p.m));
    if (p.day >= corteEste) return midnight(p.y, p.m, corteEste, tz);
    const py = p.m === 0 ? p.y - 1 : p.y;
    const pm = p.m === 0 ? 11 : p.m - 1;
    return midnight(py, pm, Math.min(day, daysIn(py, pm)), tz);
  }
  return null;
}

// La zona que usa HA para mostrarle horas a este usuario: la del servidor si
// asi lo eligio en su perfil, si no la del navegador.
function haTimeZone(hass) {
  const l = hass && hass.locale;
  if (l && l.time_zone === "server" && hass.config && hass.config.time_zone) return hass.config.time_zone;
  return undefined;
}

function entityFor(e, mode) {
  if (!mode || (!mode.key && !mode.replace)) return e.entity;
  if (mode.key && e[mode.key]) return e[mode.key];
  const r = mode.replace;
  if (Array.isArray(r) && r.length === 2 && typeof e.entity === "string" && e.entity.includes(r[0]))
    return e.entity.replace(r[0], r[1]);
  return null;
}

// El umbral mas especifico gana: entidad, luego grupo, luego tarjeta.
// Si el MODO define la clave, gana a todos: cambio la magnitud, y los umbrales
// escritos para watts no valen para kWh.
// Si el modo cambia de magnitud (lee energia en vez de potencia), NO hereda:
// un umbral de 5 escrito para watts escondia todo enchufe bajo 5 kWh al dia.
function pick(key, entCfg, group, cfg, mode) {
  if (mode && mode[key] !== undefined && mode[key] !== null) return mode[key];
  if (changesQuantity(mode)) return undefined;
  for (const src of [entCfg, group, cfg]) {
    if (src && src[key] !== undefined && src[key] !== null) return src[key];
  }
  return undefined;
}

// Por defecto 1 (el consumo en espera de un enchufe). En un modo que cambia de
// magnitud, 0: cualquier energia gastada cuenta.
function resolveThr(entCfg, group, cfg, mode) {
  const v = pick("zero_threshold", entCfg, group, cfg, mode);
  const n = Number(v);
  return v === undefined || !Number.isFinite(n) ? (changesQuantity(mode) ? 0 : 1) : n;
}

// Con umbral 0 cuenta como encendido todo lo que no sea exactamente cero.
function isOn(v, thr) {
  if (v === null) return false;
  const a = Math.abs(v);
  return thr > 0 ? a >= thr : a > 0;
}

// Un umbral <= 1 se lee como fraccion del maximo de esa barra; > 1 se lee como
// valor absoluto.
function absThr(t, max) {
  return t <= 1 ? t * max : t;
}

// Los limites de color, ya en la unidad de la barra. La regla fraccion/absoluto
// se decide para el objeto ENTERO, no por umbral: `{yellow: 1, red: 3}` en kWh
// hacia amarillo = 100% del maximo y rojo = 3 kWh. Solo si todos los numeros
// escritos son <= 1 se leen como fracciones. "50%" es siempre fraccion.
function sevLimits(sev, max) {
  const s = sev || {};
  const leer = (x, porDefecto) => {
    if (x === undefined || x === null || x === "") return { v: porDefecto, pct: true };
    const t = String(x).trim();
    if (t.endsWith("%")) return { v: parseFloat(t) / 100, pct: true };
    return { v: Number(t), pct: null };
  };
  const y = leer(s.yellow, 0.5);
  const r = leer(s.red, 0.8);
  const escritos = [y, r].filter((p) => p.pct === null && Number.isFinite(p.v));
  const fraccion = escritos.every((p) => p.v <= 1);
  const abs = (p) => (p.pct === true || fraccion ? p.v * max : p.v);
  return { yellow: abs(y), red: abs(r) };
}

function sevColor(value, max, sev) {
  const l = sevLimits(sev, max);
  const v = Math.abs(value);
  if (v >= l.red) return "var(--pbc-red)";
  if (v >= l.yellow) return "var(--pbc-yellow)";
  return "var(--pbc-green)";
}

// Conversion a una unidad comun. Con `unit` en el modo o en la tarjeta, esa; si
// no, la de la primera fila con unidad conocida. Asi un enchufe en kW no queda
// dibujado como si fueran watts al lado de los demas.
function targetUnit(hass, groups, mode, cfg) {
  if (mode && mode.unit) return mode.unit;
  if (cfg && cfg.unit) return cfg.unit;
  for (const g of groups)
    for (const e of g.entities) {
      const id = entityFor(e, mode);
      const u = id ? unitOf(hass, id) : "";
      if (FAMILIA[u]) return u;
    }
  return "";
}

// Hash corto y estable de un texto, para claves de localStorage.
function shortHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function moreInfo(el, entityId) {
  el.dispatchEvent(
    new CustomEvent("hass-more-info", {
      detail: { entityId },
      bubbles: true,
      composed: true, // sin esto el evento no sale del shadow DOM
    })
  );
}

/* ---------- tarjeta ---------- */

const STATS_TTL = 5 * 60 * 1000;          // se vuelven a pedir cada 5 minutos
const STATS_RETRY_BASE = 15 * 1000;       // tras un error: 15 s, 30 s, 60 s...
const STATS_RETRY_MAX = 10 * 60 * 1000;   // ...hasta 10 minutos
const STATS_CACHE_MAX_AGE = 60 * 60 * 1000;

class PowerBarsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._built = false;
    this._rows = [];
    this._cache = {};      // clave del plan -> {data, at, err, fails, retryAt}
    this._inflight = {};   // clave del plan -> true mientras hay una consulta
  }

  static getConfigElement() {
    return document.createElement("power-bars-card-editor");
  }

  static getStubConfig(hass) {
    const ids = Object.keys((hass && hass.states) || {})
      .filter(
        (id) =>
          id.startsWith("sensor.") &&
          hass.states[id].attributes &&
          hass.states[id].attributes.device_class === "power"
      )
      .slice(0, 6);
    return { type: "custom:power-bars-card", title: "Consumos", entities: ids };
  }

  setConfig(config) {
    if (!config) throw new Error("Missing configuration");
    const groups = normGroups(config);
    if (!groups.length)
      throw new Error("Define at least one entity in `entities` or `groups`");
    const modes = normModes(config);
    for (const m of modes)
      if (m.period && !PERIODS.includes(m.period))
        throw new Error(
          `Unknown period "${m.period}" in mode "${m.name || ""}". Use ${PERIODS.join(", ")}.`
        );
    this._cfg = { ...config };
    this._groups = groups;
    this._modes = modes;
    if (this._mi === undefined || this._mi >= this._modes.length)
      this._mi = this._restoreMode();
    this._built = false;
    if (this._hass) {
      this._maybeFetch();
      this._render();
    }
  }

  // El modo elegido es una comodidad de quien mira, no estado compartido: vive
  // en su navegador. Puede fallar (ventana privada, cookies bloqueadas) y en
  // ese caso simplemente se arranca en el primero.
  // La clave lleva un hash de las filas y los modos: con solo el titulo, todas
  // las tarjetas sin titulo compartian `pbc-mode:-` y se pisaban el modo.
  get _mkey() {
    const c = this._cfg || {};
    const firma = JSON.stringify([
      (this._groups || []).map((g) => g.entities.map((e) => e.entity)),
      (this._modes || []).map((m) => m.name || ""),
    ]);
    return "pbc-mode:" + (c.title || "") + ":" + shortHash(firma);
  }
  _restoreMode() {
    try {
      const v = parseInt(window.localStorage.getItem(this._mkey), 10);
      if (Number.isFinite(v) && v >= 0 && v < this._modes.length) return v;
    } catch (e) {}
    return 0;
  }
  _saveMode() {
    try {
      window.localStorage.setItem(this._mkey, String(this._mi));
    } catch (e) {}
  }
  // Un modo con `period` no lee el estado actual: suma la energia de la ventana
  // desde las estadisticas de largo plazo, igual que el panel de Energia. Asi
  // funciona desde el primer dia y sin crear un utility_meter por enchufe.
  // Que estadisticas hay que pedir para el modo en curso, y bajo que clave se
  // guardan. La clave lleva el modo, el inicio de la ventana y las entidades:
  // cambiar cualquiera de las tres es otra consulta.
  _statsPlan() {
    const mode = this._modes[this._mi] || {};
    if (!mode.period || !this._hass) return null;
    const start = periodStart(mode.period, this._cfg.billing_day, new Date(), haTimeZone(this._hass));
    if (!start) return null;
    const ids = new Set();
    for (const g of this._groups)
      for (const e of g.entities) {
        const id = entityFor(e, mode);
        if (id) ids.add(id);
      }
    const t = totalEntityFor(mode, this._cfg);
    if (t) ids.add(t);
    if (!ids.size) return null;
    const lista = [...ids].sort();
    return { start, ids: lista, key: this._mi + "|" + start.toISOString() + "|" + lista.join(",") };
  }

  // Un modo con `period` no lee el estado actual: suma la energia de la ventana
  // desde las estadisticas, igual que el panel de Energia. Asi funciona sin
  // crear un utility_meter por enchufe.
  //
  // Dos consultas: las horas cerradas salen de la tabla de largo plazo, y lo
  // mas reciente de la de 5 minutos. Con solo la primera los valores iban
  // hasta una hora atrasados.
  //
  // El corte va UNA hora antes de la hora en curso: HA escribe la estadistica
  // horaria unos segundos despues de que la hora termina, y con el corte justo
  // en la hora en punto, en esos primeros minutos la hora recien cerrada no
  // estaba en ninguna de las dos consultas.
  async _fetchStats(plan) {
    const hass = this._hass;
    const key = plan.key;
    this._inflight[key] = true;
    const prev = this._cache[key];
    try {
      const ahora = Date.now();
      const hora = new Date(Math.floor(ahora / 3600000) * 3600000 - 3600000);
      const corte = hora > plan.start ? hora : plan.start;
      const pedir = (desde, hasta, period) =>
        hass.callWS({
          type: "recorder/statistics_during_period",
          start_time: desde.toISOString(),
          end_time: hasta.toISOString(),
          statistic_ids: plan.ids,
          period,
          types: ["change"],
        });
      const [largo, corto] = await Promise.all([
        corte > plan.start ? pedir(plan.start, corte, "day") : Promise.resolve({}),
        pedir(corte, new Date(ahora), "5minute"),
      ]);
      // id -> suma de los cambios. Un id que viene pero con todos los cambios
      // nulos no es energia (p. ej. una `key` que apunta a un sensor de
      // potencia): queda null, no 0.
      const data = {};
      for (const r of [largo, corto])
        for (const [id, filas] of Object.entries(r || {})) {
          if (!(id in data)) data[id] = null;
          for (const f of filas || []) {
            if (f.change === null || f.change === undefined) continue;
            const c = Number(f.change);
            if (Number.isFinite(c)) data[id] = (data[id] || 0) + c;
          }
        }
      this._cache[key] = { data, at: Date.now(), err: null, fails: 0 };
      // Un tablero abierto por meses juntaria una entrada por dia o por ciclo:
      // se bota lo que no se ha tocado en una hora.
      for (const [k, c] of Object.entries(this._cache))
        if (k !== key && !this._inflight[k] && Date.now() - (c.at || 0) > STATS_CACHE_MAX_AGE)
          delete this._cache[k];
    } catch (e) {
      // Se conserva lo ultimo bueno, y se reintenta con espera creciente: antes
      // un error hacia pedir de nuevo en CADA cambio de estado de la casa.
      const fails = (prev && prev.fails ? prev.fails : 0) + 1;
      this._cache[key] = {
        data: prev ? prev.data : null,
        at: prev ? prev.at : 0,
        err: String((e && e.message) || e),
        fails,
        retryAt: Date.now() + Math.min(STATS_RETRY_MAX, STATS_RETRY_BASE * 2 ** (fails - 1)),
      };
    } finally {
      delete this._inflight[key];
      this._statsAt = Date.now();
      if (this._built && this._plan && this._plan.key === key) this._update(true);
    }
  }

  _maybeFetch() {
    this._plan = this._statsPlan();
    const plan = this._plan;
    if (!plan || !this._hass.callWS) return;
    // Una sola consulta en vuelo por clave. Antes el candado no aplicaba
    // mientras los datos estuvieran "viejos", y al abrir la tarjeta se pedia
    // otra vez con cada cambio de estado hasta que llegaba la primera respuesta.
    if (this._inflight[plan.key]) return;
    const c = this._cache[plan.key];
    const ahora = Date.now();
    if (c && c.err && ahora < c.retryAt) return;
    if (c && !c.err && ahora - c.at < STATS_TTL) return;
    this._fetchStats(plan);
  }

  // Lo que hay para el modo en curso: {data, err} o null si todavia no llega.
  _statsNow() {
    const plan = this._plan;
    const c = plan ? this._cache[plan.key] : null;
    return c && (c.data || c.err) ? c : null;
  }

  _setMode(i) {
    if (i === this._mi || i < 0 || i >= this._modes.length) return;
    this._mi = i;
    this._saveMode();
    this._maybeFetch();
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._cfg) return;
    this._maybeFetch();
    if (!this._built) this._render();
    else this._update();
  }

  getCardSize() {
    if (!this._groups) return 3;
    const two = this._cfg && String(this._cfg.columns) === "2";
    let n = 0;
    for (const g of this._groups)
      n += (two ? Math.ceil(g.entities.length / 2) : g.entities.length) + (g.name ? 1 : 0);
    return Math.max(2, Math.ceil(n / 2));
  }

  // Vista de secciones: nunca mas angosta que media seccion, o la barra no cabe.
  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  get _style() {
    return `
      :host { display: block; }
      ha-card { padding: 12px 14px 14px; container-type: inline-size; }
      .title {
        font-size: 1.15rem; font-weight: 500;
        margin: 0 0 10px; color: var(--primary-text-color);
        display: flex; align-items: baseline; gap: 8px;
      }
      .total {
        margin-left: auto; font-size: 1rem; font-weight: 500;
        color: var(--primary-text-color); font-variant-numeric: tabular-nums;
      }
      .total .u { font-size: .78em; color: var(--secondary-text-color); margin-left: 2px; }
      .modes { display: flex; gap: 4px; margin-left: 8px; }
      .modes button {
        font: inherit; font-size: .72rem; padding: 2px 8px; cursor: pointer;
        border: 1px solid var(--divider-color); border-radius: 999px;
        background: transparent; color: var(--secondary-text-color);
      }
      .modes button.sel {
        background: var(--primary-color); border-color: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }
      .grp {
        font-size: .74rem; font-weight: 600; letter-spacing: .07em;
        text-transform: uppercase; color: var(--secondary-text-color);
        margin: 12px 0 5px; padding-bottom: 3px;
        border-bottom: 1px solid var(--divider-color);
      }
      .grp:first-of-type { margin-top: 2px; }
      .wrap { display: grid; grid-template-columns: 1fr; gap: 1px; }
      .wrap.two { grid-template-columns: 1fr 1fr; column-gap: 18px; }
      .row {
        display: grid; align-items: center;
        grid-template-columns: var(--pbc-name-w, 8.5em) 1fr auto;
        gap: 8px; padding: 3px 2px; border-radius: 5px;
        cursor: pointer; min-height: 22px;
      }
      .row:hover { background: var(--secondary-background-color); }
      .nm {
        font-size: .82rem; color: var(--primary-text-color);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .track {
        position: relative; height: 8px; border-radius: 4px;
        background: var(--divider-color); overflow: hidden;
      }
      .fill {
        position: absolute; inset: 0 auto 0 0; width: 0%;
        border-radius: 4px; background: var(--pbc-green);
        transition: width .35s ease, background-color .35s ease;
      }
      .val {
        font-size: .82rem; font-variant-numeric: tabular-nums;
        color: var(--primary-text-color); text-align: right;
        min-width: 3.6em;
      }
      .val .u { font-size: .76em; color: var(--secondary-text-color); margin-left: 1px; }
      .row.off .nm, .row.off .val { color: var(--secondary-text-color); opacity: .65; }
      .row.na .val { color: var(--error-color); }
      .row.wait .val { color: var(--secondary-text-color); }
      .row:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
      .empty {
        font-size: .82rem; color: var(--secondary-text-color);
        padding: 6px 2px; font-style: italic;
      }
      :host {
        --pbc-green: var(--success-color, #4caf50);
        --pbc-yellow: var(--warning-color, #ff9800);
        --pbc-red: var(--error-color, #f44336);
      }
      /* Segun el ancho de la TARJETA, no de la pantalla: en la vista de
         secciones una tarjeta angosta en un escritorio seguia a 2 columnas y
         la barra quedaba en 0 px. */
      @container (max-width: 400px) {
        .wrap.two { grid-template-columns: 1fr; column-gap: 0; }
        .row { grid-template-columns: var(--pbc-name-w-s, 7.5em) 1fr auto; }
        .nm, .val { font-size: .78rem; }
      }
    `;
  }

  _render() {
    const cfg = this._cfg;
    const two = cfg.columns === 2 || cfg.columns === "2";
    const parts = [];

    const varios = this._modes.length > 1;
    parts.push(`<ha-card>`);
    if (cfg.title || cfg.show_total !== false || varios) {
      parts.push(`<div class="title"><span>${esc(cfg.title || "")}</span>`);
      if (varios) {
        parts.push(`<span class="modes">`);
        this._modes.forEach((m, i) => {
          parts.push(
            `<button id="m${i}" class="${i === this._mi ? "sel" : ""}">${esc(
              m.name || "Mode " + (i + 1)
            )}</button>`
          );
        });
        parts.push(`</span>`);
      }
      if (cfg.show_total !== false)
        parts.push(`<span class="total" id="tot"></span>`);
      parts.push(`</div>`);
    }

    this._rows = [];
    this._groups.forEach((g, gi) => {
      if (g.name) parts.push(`<div class="grp" id="g${gi}">${esc(g.name)}</div>`);
      parts.push(`<div class="wrap${two ? " two" : ""}" id="w${gi}"></div>`);
      parts.push(`<div class="empty" id="e${gi}" style="display:none">nothing on</div>`);
    });
    parts.push(`</ha-card>`);

    this.shadowRoot.innerHTML = `<style>${this._style}</style>${parts.join("")}`;

    // Las dos variables: la angosta es la que se usa en tarjetas estrechas, y
    // antes `name_width` no llegaba ahi. Sin la opcion se borran, o quedaba
    // pegado el valor anterior.
    const hostStyle = this.shadowRoot.host.style;
    for (const v of ["--pbc-name-w", "--pbc-name-w-s"]) {
      if (cfg.name_width) hostStyle.setProperty(v, cfg.name_width);
      else if (hostStyle.removeProperty) hostStyle.removeProperty(v);
    }

    this._modes.forEach((m, i) => {
      const b = this.shadowRoot.getElementById("m" + i);
      if (b) b.onclick = () => this._setMode(i);
    });

    this._built = true;
    this._ultimaFirma = null;
    this._update(true);
  }

  /* Home Assistant llama a `set hass` en CADA cambio de estado de toda la
     instalacion, no solo de lo que esta tarjeta muestra. Con inversores y
     decenas de sensores de potencia eso son muchas llamadas por segundo, y
     rehacer el HTML de cada grupo en todas ellas castiga al navegador. Esta
     firma resume lo unico que el dibujo usa. */
  _firma() {
    const h = this._hass;
    if (!h) return "";
    const mode = this._modes[this._mi] || {};
    const usaStats = !!mode.period;
    const s = this._statsNow();
    const l = h.locale || {};
    const out = [this._mi, this._statsAt || 0, s ? s.at + (s.err ? "e" : "") : "-",
                 [l.language, l.number_format, l.time_zone].join(",")];
    const ver = (id, conEstado) => {
      if (!id) return;
      const st = h.states[id];
      if (!st) { out.push(id + "|-"); return; }
      const a = st.attributes || {};
      const p = precisionOf(h, id);
      out.push(id + "|" + (conEstado ? st.state : "") + "|" + (a.unit_of_measurement || "") +
               "|" + (a.friendly_name || "") + "|" + (p === undefined ? "" : p));
    };
    for (const g of this._groups)
      for (const e of g.entities) {
        const id = entityFor(e, mode);
        // En un modo por periodo el numero sale de las estadisticas: que el
        // contador avance en vivo no cambia nada de lo que se dibuja, y antes
        // cada tick de cada medidor redibujaba todos los grupos.
        ver(id, !usaStats);
        // El nombre sale siempre de la entidad base, aunque se lea otra.
        if (id !== e.entity) ver(e.entity, false);
      }
    ver(totalEntityFor(mode, this._cfg), !usaStats);
    return out.join(";");
  }

  _update(forzar) {
    const hass = this._hass;
    const cfg = this._cfg;
    if (!hass || !this.shadowRoot) return;

    const firma = this._firma();
    if (!forzar && firma === this._ultimaFirma) return;
    this._ultimaFirma = firma;

    const hideZero = cfg.hide_zero === true;
    const sort = cfg.sort || "value";
    // `total` puede ser el entity_id de un medidor. Sumar todas las filas solo
    // es correcto si son circuitos independientes; cuando unos cuelgan de otros
    // (un tablero general y sus enchufes) la suma cuenta dos veces lo mismo.
    const mode = this._modes[this._mi] || {};
    const usaStats = !!mode.period;
    const stats = usaStats ? this._statsNow() : null;
    // Todavia no llega nada para ESTE modo y ventana. Se dibuja como "cargando",
    // no con los numeros de otro periodo ni como error.
    const pendiente = usaStats && !stats;
    const nf = numberLocale(hass) || {};
    const statVal = (id) => {
      if (!stats || !stats.data) return null;
      if (id in stats.data) {
        const v = stats.data[id];
        return Number.isFinite(v) ? v : null;
      }
      // No vino en la respuesta: la ventana no tiene filas todavia (recien
      // empieza el dia o el ciclo, o el enchufe es nuevo). Un contador de
      // energia que existe gasto 0; cualquier otra cosa queda sin dato.
      const st = hass.states[id];
      const sc = st && st.attributes ? st.attributes.state_class : null;
      return sc === "total" || sc === "total_increasing" ? 0 : null;
    };
    const totalEnt = totalEntityFor(mode, cfg);
    const target = targetUnit(hass, this._groups, mode, cfg);
    let grand = 0;
    let unit = target;

    this._groups.forEach((g, gi) => {
      const wrap = this.shadowRoot.getElementById("w" + gi);
      const empty = this.shadowRoot.getElementById("e" + gi);
      const head = this.shadowRoot.getElementById("g" + gi);
      if (!wrap) return;

      // 1. leer
      let items = g.entities.map((e, i) => {
        const id = entityFor(e, mode);           // la entidad de ESTE modo
        const bruto = id && !pendiente ? (usaStats ? statVal(id) : numState(hass, id)) : null;
        const uOrig = id ? unitOf(hass, id) : "";
        // Todo a la unidad comun si es de la misma familia (W/kW, Wh/kWh/MWh).
        const convierte = !!(target && FAMILIA[uOrig] && FAMILIA[uOrig] === FAMILIA[target]);
        const v = convierte ? convert(bruto, uOrig, target) : bruto;
        const u = convierte ? target : mode.unit || uOrig;
        const thr = resolveThr(e, g, cfg, mode);
        return {
          cfg: e,
          id,
          v,
          i,                                     // orden original, para 'active'
          thr,
          on: isOn(v, thr),
          // El nombre sale SIEMPRE de la entidad base: el friendly_name del
          // sensor de energia suele ser "... Energy Daily" y ensuciaria la
          // columna al cambiar de modo.
          name: nameOf(hass, e.entity, e.name),
          unit: u,
          // La precision elegida en HA vale para la unidad de la entidad; si se
          // convirtio a otra, se vuelve a la regla por magnitud.
          precision: u === uOrig ? precisionOf(hass, id) : undefined,
          existe: !!(id && hass.states && hass.states[id]),
        };
      });
      for (const it of items) if (it.unit && !unit) unit = it.unit;
      if (!totalEnt && g.in_total !== false)
        for (const it of items) if (it.v !== null) grand += it.v;

      // 2. filtrar
      const shown = hideZero ? items.filter((it) => it.v === null || it.on) : items;

      // 3. ordenar
      const ordered = shown.slice();
      // En valor absoluto: una exportacion de -3000 W es de lo mas grande que
      // hay, no algo menor que una fila sin dato.
      const val = (x) => (x.v === null ? -1 : Math.abs(x.v));
      if (sort === "value") ordered.sort((a, b) => val(b) - val(a));
      else if (sort === "name") ordered.sort((a, b) => a.name.localeCompare(b.name));
      else if (sort === "active")
        // Los que consumen suben, ordenados entre ellos por consumo. Los
        // apagados se quedan en el orden escrito: asi solo se mueve lo que
        // cambia de estado, en vez de barajarse la lista entera.
        ordered.sort((a, b) => {
          if (a.on !== b.on) return a.on ? -1 : 1;
          return a.on ? val(b) - val(a) : a.i - b.i;
        });

      // 4. escala compartida del grupo: se calcula sobre TODO el grupo, no solo
      //    sobre lo visible, para que esconder los apagados no reescale nada.
      const scale = scaleFor(g, items.map((i) => i.v), cfg.max, mode.max);

      // 5. pintar
      const html = ordered
        .map((it) => {
          // En un modo con escala propia, el max por entidad tampoco aplica.
          const own =
            mode.max === undefined && it.cfg.max !== undefined && Number(it.cfg.max) > 0
              ? Number(it.cfg.max)
              : scale;
          const frac = it.v === null ? 0 : Math.min(1, Math.abs(it.v) / own);
          const col =
            it.cfg.color ||
            sevColor(it.v || 0, own, pick("severity", it.cfg, g, cfg, mode));
          const cls = "row" + (pendiente ? " wait" : it.v === null ? " na" : it.on ? "" : " off");
          const u = it.unit || unit;
          const texto = pendiente
            ? "…"
            : fmt(it.v, { locale: nf.locale, grouping: nf.grouping, precision: it.precision });
          // Dos formas de no tener dato en este modo, y conviene distinguirlas:
          // no se pudo derivar ninguna entidad, o se derivo una que no existe.
          // La segunda es la habitual (el enchufe no lleva sensor de energia)
          // y sin el nombre derivado no hay por donde empezar a mirar.
          const tip = !it.id
            ? it.name + " — no entity for this mode"
            : it.existe
            ? it.name
            : it.name + " — " + it.id + " not found";
          // Si la entidad de este modo no existe, el click abre la base: abrir
          // el dialogo de una entidad inexistente no sirve de nada.
          const destino = it.id && it.existe ? it.id : it.cfg.entity;
          return (
            `<div class="${cls}" data-e="${esc(destino)}" tabindex="0" role="button" ` +
            `aria-label="${esc(it.name + ": " + texto + " " + u)}">` +
            `<div class="nm" title="${esc(tip)}">${esc(it.name)}</div>` +
            `<div class="track"><div class="fill" style="width:${(frac * 100).toFixed(1)}%;background:${esc(col)}"></div></div>` +
            `<div class="val">${esc(texto)}<span class="u">${esc(u)}</span></div>` +
            `</div>`
          );
        })
        .join("");

      wrap.innerHTML = html;
      if (empty) empty.style.display = ordered.length ? "none" : "";
      if (head) head.style.display = items.length ? "" : "none";

      wrap.querySelectorAll(".row").forEach((r) => {
        r.onclick = () => moreInfo(this, r.dataset.e);
        // Con teclado: Enter o espacio hacen lo mismo que el click.
        r.onkeydown = (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            if (ev.preventDefault) ev.preventDefault();
            moreInfo(this, r.dataset.e);
          }
        };
      });
    });

    const tot = this.shadowRoot.getElementById("tot");
    if (tot) {
      let v, u, prec;
      if (totalEnt) {
        const uT = unitOf(hass, totalEnt);
        const bruto = pendiente ? null : usaStats ? statVal(totalEnt) : numState(hass, totalEnt);
        const mismo = !!(target && FAMILIA[uT] && FAMILIA[uT] === FAMILIA[target]);
        v = mismo ? convert(bruto, uT, target) : bruto;
        // La etiqueta sigue a la conversion: antes un total en Wh convertido
        // a kWh salia rotulado "Wh".
        u = mismo ? target : uT || target;
        prec = u === uT ? precisionOf(hass, totalEnt) : undefined;
      } else {
        v = grand;
        u = unit;
      }
      const err = stats && stats.err;
      tot.innerHTML = pendiente
        ? `<span class="u">loading…</span>`
        : err && !stats.data
        ? `<span class="u">no data</span>`
        : `${esc(fmt(v, { locale: nf.locale, grouping: nf.grouping, precision: prec }))}<span class="u">${esc(u)}</span>`;
      tot.title = err ? err : totalEnt ? nameOf(hass, totalEnt) : "Sum of the rows";
    }
  }
}

function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---------- editor ---------- */

const SCHEMA = [
  { name: "title", selector: { text: {} } },
  {
    type: "grid",
    schema: [
      {
        name: "sort",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "active", label: "Active first (idle rows keep my order)" },
              { value: "value", label: "By value (highest first)" },
              { value: "config", label: "My own order (as listed below)" },
              { value: "name", label: "By name" },
            ],
          },
        },
      },
      {
        name: "columns",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "1", label: "1 column" },
              { value: "2", label: "2 columns" },
            ],
          },
        },
      },
    ],
  },
  {
    type: "grid",
    schema: [
      { name: "hide_zero", selector: { boolean: {} } },
      { name: "show_total", selector: { boolean: {} } },
    ],
  },
  {
    type: "grid",
    schema: [
      { name: "zero_threshold", selector: { number: { min: 0, max: 100, step: 0.5, mode: "box" } } },
      { name: "max", selector: { text: {} } },
    ],
  },
  { name: "total", selector: { entity: { filter: [{ domain: "sensor" }] } } },
  { name: "billing_day", selector: { number: { min: 1, max: 31, step: 1, mode: "box" } } },
  {
    name: "entities",
    selector: { entity: { multiple: true, filter: [{ domain: "sensor" }] } },
  },
];

const LABELS = {
  title: "Title",
  sort: "Sort order",
  columns: "Columns",
  hide_zero: "Hide rows that are off",
  show_total: "Show total in the header",
  zero_threshold: "Off threshold",
  max: "Max scale (blank = automatic)",
  total: "Total meter (blank = sum the rows)",
  billing_day: "Billing cycle starts on day",
  entities: "Entities",
};

const GROUP_SCHEMA = [
  {
    type: "grid",
    schema: [
      { name: "name", selector: { text: {} } },
      { name: "max", selector: { text: {} } },
    ],
  },
  {
    type: "grid",
    schema: [
      { name: "zero_threshold", selector: { number: { min: 0, max: 1000, step: 0.5, mode: "box" } } },
      { name: "in_total", selector: { boolean: {} } },
    ],
  },
  {
    name: "entities",
    selector: { entity: { multiple: true, filter: [{ domain: "sensor" }] } },
  },
];

const GROUP_LABELS = {
  name: "Group name",
  max: "Max scale (number, or `auto`)",
  zero_threshold: "Off threshold",
  in_total: "Include in total",
  entities: "Group entities",
};

const MODE_SCHEMA = [
  {
    type: "grid",
    schema: [
      { name: "name", selector: { text: {} } },
      {
        name: "period",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "", label: "Live value" },
              { value: "today", label: "Total since midnight" },
              { value: "month", label: "Total this calendar month" },
              { value: "billing", label: "Total this billing cycle" },
            ],
          },
        },
      },
    ],
  },
  {
    type: "grid",
    schema: [
      { name: "replace_from", selector: { text: {} } },
      { name: "replace_to", selector: { text: {} } },
    ],
  },
  {
    type: "grid",
    schema: [
      { name: "unit", selector: { text: {} } },
      { name: "max", selector: { text: {} } },
    ],
  },
  {
    type: "grid",
    schema: [
      { name: "total", selector: { entity: { filter: [{ domain: "sensor" }] } } },
      { name: "zero_threshold", selector: { number: { min: 0, max: 100000, step: 0.1, mode: "box" } } },
    ],
  },
];

const MODE_LABELS = {
  name: "Button label",
  period: "Reads",
  replace_from: "Replace in entity id",
  replace_to: "...with",
  unit: "Unit override",
  max: "Max scale (blank = keep group's, or `auto` to fit the largest)",
  total: "Total meter for this mode (blank = sum the rows)",
  zero_threshold: "Off threshold in this mode (blank = 0)",
};

const BTN =
  "padding:4px 10px;margin-right:6px;border:1px solid var(--divider-color);" +
  "border-radius:6px;background:var(--card-background-color);" +
  "color:var(--primary-text-color);cursor:pointer;font-size:.8rem";

class PowerBarsCardEditor extends HTMLElement {
  setConfig(config) {
    this._cfg = config || {};
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    for (const f of this._gforms || []) f.hass = hass;
    for (const f of this._mforms || []) f.hass = hass;
  }

  get _hasGroups() {
    return Array.isArray(this._cfg.groups) && this._cfg.groups.length > 0;
  }

  _emit(cfg) {
    this._cfg = cfg;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: cfg },
        bubbles: true,
        composed: true,
      })
    );
  }

  /* --- grupos --- */

  _groups() {
    return this._hasGroups ? this._cfg.groups.map((g) => ({ ...g })) : [];
  }

  // Guardar grupos rehace la lista de arriba a abajo, asi que el render se
  // repite solo cuando cambia la ESTRUCTURA (cuantos hay y en que orden). Si
  // se rehiciera en cada tecla, el campo perderia el foco al escribir.
  _saveGroups(groups, estructural) {
    const cfg = { ...this._cfg };
    if (groups.length) cfg.groups = groups;
    else delete cfg.groups;
    this._emit(cfg);
    if (estructural) this._render(true);
  }

  _addGroup() {
    const g = this._groups();
    g.push({ name: "Group " + (g.length + 1), entities: [] });
    this._saveGroups(g, true);
  }

  _delGroup(i) {
    const g = this._groups();
    g.splice(i, 1);
    this._saveGroups(g, true);
  }

  _moveGroup(i, d) {
    const g = this._groups();
    const j = i + d;
    if (j < 0 || j >= g.length) return;
    [g[i], g[j]] = [g[j], g[i]];
    this._saveGroups(g, true);
  }

  // Pasa las entidades sueltas a un primer grupo, para no perderlas.
  _toGroups() {
    const flat = normEntries(this._cfg.entities);
    const cfg = { ...this._cfg };
    delete cfg.entities;
    cfg.groups = (this._cfg.groups || []).concat(
      flat.length ? [{ name: "Group 1", entities: flat }] : [{ name: "Group 1", entities: [] }]
    );
    this._emit(cfg);
    this._render(true);
  }

  /* --- reordenar entidades --- */

  // El selector de entidades de HA no deja reordenar: para cambiar el orden
  // habria que borrarlas todas y volver a ponerlas. Estas flechas mueven una
  // fila sin tocar el resto. Solo se muestran con `sort: config` o `active`,
  // que son los unicos ordenes donde el orden escrito se nota.
  get _ordenImporta() {
    const s = this._cfg.sort || "value";
    return s === "config" || s === "active";
  }

  _entListHtml(pref, ents) {
    if (!this._ordenImporta || ents.length < 2) return "";
    const st = this._hass && this._hass.states;
    return (
      `<div style="margin:2px 0 6px">` +
      ents
        .map((e, i) => {
          const id = e.entity;
          const fn = (st && st[id] && st[id].attributes.friendly_name) || "";
          const txt = e.name || fn || id;
          return (
            `<div style="display:flex;align-items:center;gap:4px;padding:1px 0">` +
            `<span style="width:1.6em;text-align:right;font-size:.72rem;` +
            `color:var(--secondary-text-color)">${i + 1}.</span>` +
            `<span title="${esc(id)}" style="flex:1;font-size:.8rem;overflow:hidden;` +
            `text-overflow:ellipsis;white-space:nowrap">${esc(txt)}</span>` +
            `<button id="${pref}u${i}" style="${BTN}"${i === 0 ? " disabled" : ""} ` +
            `title="Move up">&#9650;</button>` +
            `<button id="${pref}d${i}" style="${BTN}"${
              i === ents.length - 1 ? " disabled" : ""
            } title="Move down">&#9660;</button>` +
            `</div>`
          );
        })
        .join("") +
      `</div>`
    );
  }

  _bindEntList(root, pref, n, mover) {
    for (let i = 0; i < n; i++) {
      const u = root.querySelector("#" + pref + "u" + i);
      const d = root.querySelector("#" + pref + "d" + i);
      if (u) u.onclick = () => mover(i, -1);
      if (d) d.onclick = () => mover(i, 1);
    }
  }

  static _swap(list, i, d) {
    const j = i + d;
    if (i < 0 || i >= list.length || j < 0 || j >= list.length) return null;
    const out = list.slice();
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  }

  _moveEntity(i, d) {
    const ents = normEntries(this._cfg.entities);
    const out = PowerBarsCardEditor._swap(ents, i, d);
    if (!out) return;
    const cfg = { ...this._cfg, entities: out.map(simplify) };
    this._emit(cfg);
    this._render(true);
  }

  _moveGroupEntity(gi, i, d) {
    const gs = this._groups();
    if (!gs[gi]) return;
    const out = PowerBarsCardEditor._swap(normEntries(gs[gi].entities), i, d);
    if (!out) return;
    gs[gi] = { ...gs[gi], entities: out.map(simplify) };
    this._saveGroups(gs, true);
  }

  /* --- modos --- */

  _modeList() {
    return Array.isArray(this._cfg.modes) ? this._cfg.modes.map((m) => ({ ...m })) : [];
  }

  _saveModes(modes, estructural) {
    const cfg = { ...this._cfg };
    if (modes.length) cfg.modes = modes;
    else delete cfg.modes;
    this._emit(cfg);
    if (estructural) this._render(true);
  }

  // El primer modo se crea vacio a proposito: "Now" tiene que leer la entidad
  // tal cual esta escrita, o al activar modos se romperia la tarjeta entera.
  _addMode() {
    const m = this._modeList();
    if (!m.length) m.push({ name: "Now" });
    m.push({ name: "Mode " + (m.length + 1) });
    this._saveModes(m, true);
  }

  _delMode(i) {
    const m = this._modeList();
    m.splice(i, 1);
    this._saveModes(m.length === 1 ? [] : m, true);
  }

  _moveMode(i, d) {
    const m = this._modeList();
    const j = i + d;
    if (j < 0 || j >= m.length) return;
    [m[i], m[j]] = [m[j], m[i]];
    this._saveModes(m, true);
  }

  _modeToForm(m) {
    const r = Array.isArray(m.replace) ? m.replace : ["", ""];
    return {
      name: m.name || "",
      period: m.period || "",
      replace_from: r[0] || "",
      replace_to: r[1] || "",
      unit: m.unit || "",
      max: m.max === undefined || m.max === null ? "" : String(m.max),
      total: typeof m.total === "string" ? m.total : "",
      zero_threshold: m.zero_threshold,
    };
  }

  _modeFromForm(v, prev) {
    // Parte del modo anterior: lo que el formulario no maneja (`key`,
    // `severity`, lo que venga del YAML) no se pierde al guardar.
    const out = { ...(prev || {}) };
    for (const k of ["name", "period", "replace", "unit", "max"]) delete out[k];
    if (v.name) out.name = v.name;
    if (v.period) out.period = v.period;
    const f = (v.replace_from || "").trim();
    const t = (v.replace_to || "").trim();
    if (f) out.replace = [f, t];
    if (v.unit) out.unit = v.unit;
    const mx = parseMax(v.max);
    if (mx !== undefined) out.max = mx;
    // total y umbral: si el formulario los trae, mandan; si no vienen, se deja
    // lo que habia.
    if ("total" in v) {
      if (typeof v.total === "string" && v.total.trim() !== "") out.total = v.total;
      else delete out.total;
    }
    if ("zero_threshold" in v) {
      const n = Number(v.zero_threshold);
      if (v.zero_threshold !== undefined && v.zero_threshold !== null && v.zero_threshold !== "" && Number.isFinite(n))
        out.zero_threshold = n;
      else delete out.zero_threshold;
    }
    return out;
  }

  _groupToForm(g) {
    return {
      name: g.name || "",
      max: g.max === undefined || g.max === null ? "" : String(g.max),
      zero_threshold: g.zero_threshold,
      in_total: g.in_total !== false,
      entities: normEntries(g.entities).map((e) => e.entity),
    };
  }

  _groupFromForm(v, prev) {
    // Igual que en la tarjeta: lo que no maneja el formulario (severity y lo
    // que venga del YAML) se conserva.
    const out = { ...(prev || {}) };
    for (const k of ["name", "max", "zero_threshold", "in_total", "entities"]) delete out[k];
    if (v.name) out.name = v.name;
    const mx = parseMax(v.max);
    if (mx !== undefined) out.max = mx;
    if (v.zero_threshold !== undefined && v.zero_threshold !== null && v.zero_threshold !== "")
      out.zero_threshold = Number(v.zero_threshold);
    if (v.in_total === false) out.in_total = false;
    const old = {};
    for (const e of normEntries(prev && prev.entities)) old[e.entity] = e;
    out.entities = (v.entities || []).map((id) => {
      const p = old[id];
      return p && Object.keys(p).length > 1 ? p : id;
    });
    return out;
  }

  _toForm() {
    const c = this._cfg;
    return {
      title: c.title || "",
      sort: c.sort || "value",
      columns: String(c.columns || 1),
      hide_zero: c.hide_zero === true,
      show_total: c.show_total !== false,
      zero_threshold: c.zero_threshold === undefined ? 1 : c.zero_threshold,
      max: c.max === undefined || c.max === null ? "" : String(c.max),
      total: typeof c.total === "string" && c.total !== "sum" ? c.total : "",
      billing_day: c.billing_day,
      entities: normEntries(c.entities).map((e) => e.entity),
    };
  }

  _fromForm(v) {
    // Parte de la config actual y solo toca las claves de este formulario.
    // Antes se rearmaba desde cero y cambiar el titulo borraba `severity`,
    // `unit`, `name_width`, `card_mod` o el `grid_options`/`visibility` que
    // pone la propia vista de secciones.
    const out = { ...this._cfg, type: this._cfg.type || "custom:power-bars-card" };
    for (const k of ["title", "sort", "columns", "hide_zero", "show_total", "zero_threshold",
                     "max", "total", "billing_day"])
      delete out[k];
    if (v.title) out.title = v.title;
    if (v.sort && v.sort !== "value") out.sort = v.sort;
    if (String(v.columns) === "2") out.columns = 2;
    if (v.hide_zero) out.hide_zero = true;
    if (v.show_total === false) out.show_total = false;
    // Vaciar el campo es volver al valor por defecto, no poner 0: Number("")
    // es 0, y un umbral 0 dejaba toda fila distinta de cero como encendida.
    if (v.zero_threshold !== undefined && v.zero_threshold !== null && v.zero_threshold !== "" &&
        Number.isFinite(Number(v.zero_threshold)) && Number(v.zero_threshold) !== 1)
      out.zero_threshold = Number(v.zero_threshold);
    const mx = parseMax(v.max);
    if (mx !== undefined) out.max = mx;

    if (typeof v.total === "string" && v.total.trim() !== "") out.total = v.total;
    if (v.billing_day !== undefined && v.billing_day !== null && Number(v.billing_day) !== 1)
      out.billing_day = Number(v.billing_day);
    if (Array.isArray(this._cfg.modes) && this._cfg.modes.length) out.modes = this._cfg.modes;
    else delete out.modes;

    // Conserva name/max/color/severity por entidad al reordenar en el selector.
    const prev = {};
    for (const e of normEntries(this._cfg.entities)) prev[e.entity] = e;
    const ents = (v.entities || []).map((id) => {
      const p = prev[id];
      return p && Object.keys(p).length > 1 ? p : id;
    });

    if (this._hasGroups) {
      out.groups = this._cfg.groups;
      // Con grupos, el formulario de arriba no muestra `entities`: si igual
      // hubiera sueltas en el YAML, se dejan como estaban.
      if (normEntries(this._cfg.entities).length) out.entities = this._cfg.entities;
    } else {
      out.entities = ents;
    }
    return out;
  }

  _render(rehacerGrupos) {
    if (!this._built) {
      this.innerHTML =
        `<ha-form id="main"></ha-form>` +
        `<div id="elist"></div>` +
        `<div id="gwrap"></div>` +
        `<div id="gbtns" style="margin-top:10px"></div>` +
        `<div id="mwrap"></div>` +
        `<div id="mbtns" style="margin-top:10px"></div>`;
      this._form = this.querySelector("#main");
      this._elist = this.querySelector("#elist");
      this._gwrap = this.querySelector("#gwrap");
      this._gbtns = this.querySelector("#gbtns");
      this._mwrap = this.querySelector("#mwrap");
      this._mbtns = this.querySelector("#mbtns");
      if (this._form) {
        this._form.computeLabel = (s) => LABELS[s.name] || s.name;
        this._form.addEventListener("value-changed", (ev) => {
          ev.stopPropagation();
          this._emit(this._fromForm(ev.detail.value));
        });
      }
      this._built = true;
      rehacerGrupos = true;
    }

    if (this._form) {
      this._form.schema = this._hasGroups
        ? SCHEMA.filter((x) => x.name !== "entities")   // las entidades van por grupo
        : SCHEMA;
      this._form.data = this._toForm();
      if (this._hass) this._form.hass = this._hass;
    }

    if (this._elist) {
      const ents = this._hasGroups ? [] : normEntries(this._cfg.entities);
      this._elist.innerHTML = this._entListHtml("e", ents);
      this._bindEntList(this._elist, "e", ents.length, (i, d) => this._moveEntity(i, d));
    }

    const sig = this._groups().length + ":" + this._modeList().length;
    if (rehacerGrupos || sig !== this._sig) {
      this._sig = sig;
      this._buildGroups();
      this._buildModes();
    } else {
      this._refreshSubforms();
    }
    this._buildButtons();
  }

  // Con la misma cantidad de grupos y modos no se rehacen (el campo perderia
  // el foco al escribir), pero sus datos SI se ponen al dia. Antes quedaban
  // con lo que habia al construirlos: si el YAML cambiaba por fuera, guardar
  // desde el formulario viejo borraba lo nuevo, y las flechas de reordenar
  // apuntaban a filas que ya no estaban.
  // Solo se toca lo que cambio: reasignar `data` identica o rehacer la lista
  // en cada tecla podia mover el cursor del campo que se esta escribiendo.
  _refreshSubforms() {
    const poner = (f, data) => {
      const j = JSON.stringify(data);
      if (f._pbcData === j) return;
      f._pbcData = j;
      f.data = data;
    };
    const groups = this._groups();
    (this._gforms || []).forEach((f, i) => {
      if (groups[i]) poner(f, this._groupToForm(groups[i]));
    });
    if (this._gwrap)
      groups.forEach((g, i) => {
        const lista = this._gwrap.querySelector("#gl" + i);
        if (!lista) return;
        const ents = normEntries(g.entities);
        const html = this._entListHtml("ge" + i + "_", ents);
        if (lista._pbcHtml === html) return;
        lista._pbcHtml = html;
        lista.innerHTML = html;
        this._bindEntList(lista, "ge" + i + "_", ents.length, (k, d) => this._moveGroupEntity(i, k, d));
      });
    const modes = this._modeList();
    (this._mforms || []).forEach((f, i) => {
      if (modes[i]) poner(f, this._modeToForm(modes[i]));
    });
  }

  _buildModes() {
    if (!this._mwrap) return;
    this._mforms = [];
    const modes = this._modeList();
    this._mwrap.innerHTML = modes.length
      ? `<div style="margin-top:16px;font-size:.8rem;font-weight:600;` +
        `text-transform:uppercase;letter-spacing:.06em;color:var(--secondary-text-color)">Modes</div>` +
        modes
          .map(
            (m, i) =>
              `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--divider-color)">` +
              `<div style="display:flex;align-items:center;margin-bottom:6px">` +
              `<b style="flex:1;font-size:.85rem">${esc(m.name || "Mode " + (i + 1))}</b>` +
              `<button id="mup${i}" style="${BTN}" title="Move up">&#9650;</button>` +
              `<button id="mdn${i}" style="${BTN}" title="Move down">&#9660;</button>` +
              `<button id="mrm${i}" style="${BTN}" title="Delete">&#10005;</button>` +
              `</div><ha-form id="mf${i}"></ha-form></div>`
          )
          .join("")
      : "";

    modes.forEach((m, i) => {
      const f = this._mwrap.querySelector("#mf" + i);
      if (f) {
        f.computeLabel = (x) => MODE_LABELS[x.name] || x.name;
        f.schema = MODE_SCHEMA;
        f.data = this._modeToForm(m);
        if (this._hass) f.hass = this._hass;
        f.addEventListener("value-changed", (ev) => {
          ev.stopPropagation();
          const ms = this._modeList();
          ms[i] = this._modeFromForm(ev.detail.value, ms[i]);
          this._saveModes(ms, false);
        });
        this._mforms.push(f);
      }
      const bind = (id, fn) => {
        const b = this._mwrap.querySelector("#" + id + i);
        if (b) b.onclick = fn;
      };
      bind("mup", () => this._moveMode(i, -1));
      bind("mdn", () => this._moveMode(i, 1));
      bind("mrm", () => this._delMode(i));
    });
  }

  _buildGroups() {
    if (!this._gwrap) return;
    this._gforms = [];
    const groups = this._groups();
    this._gwrap.innerHTML = groups
      .map(
        (g, i) =>
          `<div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--divider-color)">` +
          `<div style="display:flex;align-items:center;margin-bottom:6px">` +
          `<b style="flex:1;font-size:.85rem">${esc(g.name || "Group " + (i + 1))}</b>` +
          `<button id="up${i}" style="${BTN}" title="Move up">&#9650;</button>` +
          `<button id="dn${i}" style="${BTN}" title="Move down">&#9660;</button>` +
          `<button id="rm${i}" style="${BTN}" title="Delete">&#10005;</button>` +
          `</div><ha-form id="gf${i}"></ha-form><div id="gl${i}"></div></div>`
      )
      .join("");

    groups.forEach((g, i) => {
      const f = this._gwrap.querySelector("#gf" + i);
      if (f) {
        f.computeLabel = (s) => GROUP_LABELS[s.name] || s.name;
        f.schema = GROUP_SCHEMA;
        f.data = this._groupToForm(g);
        if (this._hass) f.hass = this._hass;
        f.addEventListener("value-changed", (ev) => {
          ev.stopPropagation();
          const gs = this._groups();
          gs[i] = this._groupFromForm(ev.detail.value, gs[i]);
          this._saveGroups(gs, false);
        });
        this._gforms.push(f);
      }
      const lista = this._gwrap.querySelector("#gl" + i);
      if (lista) {
        const ents = normEntries(g.entities);
        lista.innerHTML = this._entListHtml("ge" + i + "_", ents);
        this._bindEntList(lista, "ge" + i + "_", ents.length, (k, d) =>
          this._moveGroupEntity(i, k, d)
        );
      }
      const bind = (id, fn) => {
        const b = this._gwrap.querySelector("#" + id + i);
        if (b) b.onclick = fn;
      };
      bind("up", () => this._moveGroup(i, -1));
      bind("dn", () => this._moveGroup(i, 1));
      bind("rm", () => this._delGroup(i));
    });
  }

  _buildButtons() {
    if (!this._gbtns) return;
    this._gbtns.innerHTML = this._hasGroups
      ? `<button id="add" style="${BTN}">+ Add group</button>`
      : `<button id="conv" style="${BTN}">Use groups</button>` +
        `<div style="font-size:.78rem;color:var(--secondary-text-color);margin-top:6px">` +
        `Groups get their own heading and their own scale. The entities you ` +
        `already have move into the first group.</div>`;
    const add = this._gbtns.querySelector("#add");
    if (add) add.onclick = () => this._addGroup();
    const conv = this._gbtns.querySelector("#conv");
    if (conv) conv.onclick = () => this._toGroups();

    if (this._mbtns) {
      this._mbtns.innerHTML =
        `<button id="madd" style="${BTN}">+ Add mode</button>` +
        (this._modeList().length
          ? ""
          : `<div style="font-size:.78rem;color:var(--secondary-text-color);margin-top:6px">` +
            `Modes put buttons in the header to read the same rows a different ` +
            `way — live watts, or kWh over a period.</div>`);
      const ma = this._mbtns.querySelector("#madd");
      if (ma) ma.onclick = () => this._addMode();
    }
  }
}

/* ---------- registro ---------- */

if (!customElements.get("power-bars-card"))
  customElements.define("power-bars-card", PowerBarsCard);
if (!customElements.get("power-bars-card-editor"))
  customElements.define("power-bars-card-editor", PowerBarsCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "power-bars-card")) {
  window.customCards.push({
    type: "power-bars-card",
    name: "Power Bars Card",
    description:
      "Many numeric sensors as compact bars, grouped and sorted by value.",
    preview: false,
    documentationURL: "https://github.com/tsmithf2020/power-bars-card",
  });
}

console.info(
  `%c POWER-BARS-CARD %c ${VERSION} `,
  "color:#fff;background:#03a9f4;font-weight:700",
  "color:#03a9f4;background:#fff;font-weight:700"
);

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normEntry,
    normEntries,
    simplify,
    parseMax,
    normGroups,
    normModes,
    entityFor,
    periodStart,
    convert,
    numState,
    unitOf,
    nameOf,
    fmt,
    decimalsFor,
    numberLocale,
    scaleFor,
    sevColor,
    sevLimits,
    pick,
    resolveThr,
    absThr,
    isOn,
    changesQuantity,
    totalEntityFor,
    targetUnit,
    haTimeZone,
    esc,
    PowerBarsCard,
    PowerBarsCardEditor,
    VERSION,
  };
}
