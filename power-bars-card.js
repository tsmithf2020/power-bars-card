/*
 * power-bars-card 1.0.0
 *
 * Muestra muchos sensores numericos como barras horizontales compactas, en el
 * espacio que ocupaban tres gauges. Pensado para consumos electricos: casi
 * todos marcan 0 W casi todo el tiempo, asi que ordena por valor y puede
 * esconder los apagados para que arriba quede siempre lo que si esta gastando.
 *
 * Local: /local/power-bars-card/power-bars-card.js
 */

const VERSION = "1.5.1";

/* ---------- utilidades ---------- */

// Acepta "sensor.x" o {entity: "sensor.x", name: "...", max: 500}
function normEntry(e) {
  if (typeof e === "string") return { entity: e };
  if (e && typeof e === "object" && e.entity) return { ...e };
  return null;
}

// Si la entidad no lleva mas que el id, se guarda como string: el YAML queda
// legible en vez de llenarse de `- entity: sensor.x`.
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

// 1578 -> "1578", 0.209 -> "0.2", 1578.5 -> "1579"
function fmt(v) {
  if (v === null) return "—";
  const a = Math.abs(v);
  if (a >= 100) return String(Math.round(v));
  if (a >= 10) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  if (a === 0) return "0";
  return v.toFixed(1);
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
  let mx = 0;
  for (const v of vals) if (v !== null && v > mx) mx = v;
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

// Inicio de la ventana de un modo, en hora LOCAL.
//   today   -> medianoche de hoy
//   month   -> dia 1 del mes
//   billing -> el dia de corte (billing_day). Si hoy es 5 y el corte es 10,
//              el ciclo vigente empezo el 10 del mes PASADO.
function periodStart(period, billingDay, now) {
  const d = now || new Date();
  if (period === "today") return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (period === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  if (period === "billing") {
    let day = parseInt(billingDay, 10);
    if (!Number.isFinite(day) || day < 1 || day > 28) day = 1;
    return d.getDate() >= day
      ? new Date(d.getFullYear(), d.getMonth(), day)
      : new Date(d.getFullYear(), d.getMonth() - 1, day);
  }
  return null;
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
function pick(key, entCfg, group, cfg, mode) {
  if (mode && mode[key] !== undefined && mode[key] !== null) return mode[key];
  for (const src of [entCfg, group, cfg]) {
    if (src && src[key] !== undefined && src[key] !== null) return src[key];
  }
  return undefined;
}

function resolveThr(entCfg, group, cfg, mode) {
  const v = pick("zero_threshold", entCfg, group, cfg, mode);
  const n = Number(v);
  return v === undefined || !Number.isFinite(n) ? 1 : n;
}

// Un umbral <= 1 se lee como fraccion del maximo de esa barra; > 1 se lee como
// valor absoluto. Nadie pone un umbral real de 0,8 W, y asi se pueden escribir
// los dos estilos sin una opcion extra que elegir.
function absThr(t, max) {
  return t <= 1 ? t * max : t;
}

function sevColor(value, max, sev) {
  const s = sev || {};
  const y = s.yellow === undefined ? 0.5 : s.yellow;
  const r = s.red === undefined ? 0.8 : s.red;
  const v = Math.abs(value);
  if (v >= absThr(r, max)) return "var(--pbc-red)";
  if (v >= absThr(y, max)) return "var(--pbc-yellow)";
  return "var(--pbc-green)";
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

class PowerBarsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._built = false;
    this._rows = [];
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
    this._cfg = { ...config };
    this._groups = groups;
    this._modes = normModes(config);
    if (this._mi === undefined || this._mi >= this._modes.length)
      this._mi = this._restoreMode();
    this._built = false;
    if (this._hass) this._render();
  }

  // El modo elegido es una comodidad de quien mira, no estado compartido: vive
  // en su navegador. Puede fallar (ventana privada, cookies bloqueadas) y en
  // ese caso simplemente se arranca en el primero.
  get _mkey() {
    return "pbc-mode:" + (this._cfg && this._cfg.title ? this._cfg.title : "-");
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
  async _fetchStats(mode) {
    const hass = this._hass;
    if (!hass || !hass.callWS || !mode || !mode.period) return;
    const start = periodStart(mode.period, this._cfg.billing_day, new Date());
    if (!start) return;

    const ids = new Set();
    for (const g of this._groups)
      for (const e of g.entities) {
        const id = entityFor(e, mode);
        if (id) ids.add(id);
      }
    const tcfg = mode.total !== undefined ? mode.total : this._cfg.total;
    if (typeof tcfg === "string" && tcfg !== "sum") ids.add(tcfg);
    if (!ids.size) return;

    const clave = this._mi + "|" + start.toISOString();
    this._statsKey = clave;
    try {
      const r = await hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: start.toISOString(),
        end_time: new Date().toISOString(),
        statistic_ids: [...ids],
        period: "day",
        types: ["change"],
      });
      const out = {};
      for (const [id, filas] of Object.entries(r || {})) {
        let t = 0;
        for (const f of filas || []) {
          const c = Number(f.change);
          if (Number.isFinite(c)) t += c;
        }
        out[id] = t;
      }
      // Si mientras se esperaba la respuesta cambio el modo, se descarta.
      if (this._statsKey !== clave) return;
      this._stats = out;
      this._statsAt = Date.now();
      this._statsFor = clave;
      if (this._built) this._update();
    } catch (e) {
      if (this._statsKey === clave) {
        this._stats = null;
        this._statsFor = clave;
        this._statsErr = String((e && e.message) || e);
        if (this._built) this._update();
      }
    }
  }

  _maybeFetch() {
    const mode = this._modes[this._mi] || {};
    if (!mode.period) return;
    const start = periodStart(mode.period, this._cfg.billing_day, new Date());
    const clave = this._mi + "|" + (start ? start.toISOString() : "");
    const viejo = !this._statsAt || Date.now() - this._statsAt > 5 * 60 * 1000;
    if (this._statsFor !== clave || viejo) {
      if (this._pidiendo === clave && !viejo) return;
      this._pidiendo = clave;
      this._fetchStats(mode);
    }
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
    let n = 0;
    for (const g of this._groups) n += g.entities.length + (g.name ? 1 : 0);
    return Math.max(2, Math.ceil(n / 2));
  }

  get _style() {
    return `
      :host { display: block; }
      ha-card { padding: 12px 14px 14px; }
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
      .empty {
        font-size: .82rem; color: var(--secondary-text-color);
        padding: 6px 2px; font-style: italic;
      }
      :host {
        --pbc-green: var(--success-color, #4caf50);
        --pbc-yellow: var(--warning-color, #ff9800);
        --pbc-red: var(--error-color, #f44336);
      }
      @media (max-width: 600px) {
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

    if (cfg.name_width)
      this.shadowRoot.host.style.setProperty("--pbc-name-w", cfg.name_width);

    this._modes.forEach((m, i) => {
      const b = this.shadowRoot.getElementById("m" + i);
      if (b) b.onclick = () => this._setMode(i);
    });

    this._built = true;
    this._update();
  }

  _update() {
    const hass = this._hass;
    const cfg = this._cfg;
    if (!hass || !this.shadowRoot) return;

    const hideZero = cfg.hide_zero === true;
    const sort = cfg.sort || "value";
    // `total` puede ser el entity_id de un medidor. Sumar todas las filas solo
    // es correcto si son circuitos independientes; cuando unos cuelgan de otros
    // (un tablero general y sus enchufes) la suma cuenta dos veces lo mismo.
    const mode = this._modes[this._mi] || {};
    const usaStats = !!mode.period;
    const pendiente = usaStats && !this._stats;
    const statVal = (id) => {
      if (!this._stats) return null;
      const v = this._stats[id];
      return Number.isFinite(v) ? v : null;
    };
    const tcfg = mode.total !== undefined ? mode.total : cfg.total;
    const totalEnt = typeof tcfg === "string" && tcfg !== "sum" ? tcfg : null;
    let grand = 0;
    let unit = mode.unit || cfg.unit || "";

    this._groups.forEach((g, gi) => {
      const wrap = this.shadowRoot.getElementById("w" + gi);
      const empty = this.shadowRoot.getElementById("e" + gi);
      const head = this.shadowRoot.getElementById("g" + gi);
      if (!wrap) return;

      // 1. leer
      let items = g.entities.map((e, i) => {
        const id = entityFor(e, mode);           // la entidad de ESTE modo
        const bruto = id ? (usaStats ? statVal(id) : numState(hass, id)) : null;
        const uOrig = id ? unitOf(hass, id) : "";
        const v = mode.unit ? convert(bruto, uOrig, mode.unit) : bruto;
        const thr = resolveThr(e, g, cfg, mode);
        return {
          cfg: e,
          id,
          v,
          i,                                     // orden original, para 'active'
          thr,
          on: v !== null && Math.abs(v) >= thr,
          // El nombre sale SIEMPRE de la entidad base: el friendly_name del
          // sensor de energia suele ser "... Energy Daily" y ensuciaria la
          // columna al cambiar de modo.
          name: nameOf(hass, e.entity, e.name),
          unit: mode.unit || uOrig,
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
      const val = (x) => (x.v === null ? -1 : x.v);
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
          const frac = it.v === null ? 0 : Math.max(0, Math.min(1, it.v / own));
          const col =
            it.cfg.color ||
            sevColor(it.v || 0, own, pick("severity", it.cfg, g, cfg, mode));
          const cls = "row" + (it.v === null ? " na" : it.on ? "" : " off");
          const u = it.unit || unit;
          // Dos formas de no tener dato en este modo, y conviene distinguirlas:
          // no se pudo derivar ninguna entidad, o se derivo una que no existe.
          // La segunda es la habitual (el enchufe no lleva sensor de energia)
          // y sin el nombre derivado no hay por donde empezar a mirar.
          const tip = !it.id
            ? it.name + " — no entity for this mode"
            : it.existe
            ? it.name
            : it.name + " — " + it.id + " not found";
          return (
            `<div class="${cls}" data-e="${esc(it.id || it.cfg.entity)}">` +
            `<div class="nm" title="${esc(tip)}">${esc(it.name)}</div>` +
            `<div class="track"><div class="fill" style="width:${(frac * 100).toFixed(1)}%;background:${col}"></div></div>` +
            `<div class="val">${fmt(it.v)}<span class="u">${esc(u)}</span></div>` +
            `</div>`
          );
        })
        .join("");

      wrap.innerHTML = html;
      if (empty) empty.style.display = ordered.length ? "none" : "";
      if (head) head.style.display = items.length ? "" : "none";

      wrap.querySelectorAll(".row").forEach((r) => {
        r.onclick = () => moreInfo(this, r.dataset.e);
      });
    });

    const tot = this.shadowRoot.getElementById("tot");
    if (tot) {
      let v = totalEnt
        ? usaStats
          ? statVal(totalEnt)
          : numState(hass, totalEnt)
        : grand;
      if (totalEnt && mode.unit) v = convert(v, unitOf(hass, totalEnt), mode.unit);
      const u = cfg.unit || (totalEnt ? unitOf(hass, totalEnt) : "") || unit;
      tot.innerHTML = pendiente
        ? `<span class="u">${esc(this._statsErr ? "no data" : "loading…")}</span>`
        : `${fmt(v)}<span class="u">${esc(u)}</span>`;
      tot.title = this._statsErr
        ? this._statsErr
        : totalEnt
        ? nameOf(hass, totalEnt)
        : "Sum of the rows";
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
  { name: "billing_day", selector: { number: { min: 1, max: 28, step: 1, mode: "box" } } },
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
  max: "Max scale (blank = automatic)",
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
];

const MODE_LABELS = {
  name: "Button label",
  period: "Reads",
  replace_from: "Replace in entity id",
  replace_to: "...with",
  unit: "Unit override",
  max: "Max scale (blank = automatic)",
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
    if (j < 0 || j >= list.length) return null;
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
    };
  }

  _modeFromForm(v, prev) {
    const out = {};
    if (v.name) out.name = v.name;
    if (v.period) out.period = v.period;
    const f = (v.replace_from || "").trim();
    const t = (v.replace_to || "").trim();
    if (f) out.replace = [f, t];
    if (v.unit) out.unit = v.unit;
    if (v.max !== undefined && String(v.max).trim() !== "") {
      const n = parseFloat(v.max);
      if (Number.isFinite(n)) out.max = n;
    }
    // `key`, `severity`, `zero_threshold` y `total` del modo son solo YAML:
    // se conservan tal cual al guardar desde la UI.
    for (const k of ["key", "severity", "zero_threshold", "total"])
      if (prev && prev[k] !== undefined) out[k] = prev[k];
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
    const out = {};
    if (v.name) out.name = v.name;
    if (v.max !== undefined && String(v.max).trim() !== "") {
      const n = parseFloat(v.max);
      if (Number.isFinite(n)) out.max = n;
    }
    if (v.zero_threshold !== undefined && v.zero_threshold !== null)
      out.zero_threshold = Number(v.zero_threshold);
    if (v.in_total === false) out.in_total = false;
    if (prev && prev.severity) out.severity = prev.severity;   // solo por YAML
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
    const out = { type: "custom:power-bars-card" };
    if (v.title) out.title = v.title;
    if (v.sort && v.sort !== "value") out.sort = v.sort;
    if (String(v.columns) === "2") out.columns = 2;
    if (v.hide_zero) out.hide_zero = true;
    if (v.show_total === false) out.show_total = false;
    if (v.zero_threshold !== undefined && Number(v.zero_threshold) !== 1)
      out.zero_threshold = Number(v.zero_threshold);
    if (v.max !== undefined && String(v.max).trim() !== "") {
      const n = parseFloat(v.max);
      if (Number.isFinite(n)) out.max = n;
    }

    if (typeof v.total === "string" && v.total.trim() !== "") out.total = v.total;
    if (v.billing_day !== undefined && v.billing_day !== null && Number(v.billing_day) !== 1)
      out.billing_day = Number(v.billing_day);
    if (Array.isArray(this._cfg.modes) && this._cfg.modes.length) out.modes = this._cfg.modes;

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
    }
    this._buildButtons();
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
    normGroups,
    normModes,
    entityFor,
    periodStart,
    convert,
    numState,
    unitOf,
    nameOf,
    fmt,
    scaleFor,
    sevColor,
    pick,
    resolveThr,
    absThr,
    esc,
    PowerBarsCard,
    PowerBarsCardEditor,
    VERSION,
  };
}
