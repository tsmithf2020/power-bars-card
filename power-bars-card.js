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

const VERSION = "1.3.0";

/* ---------- utilidades ---------- */

// Acepta "sensor.x" o {entity: "sensor.x", name: "...", max: 500}
function normEntry(e) {
  if (typeof e === "string") return { entity: e };
  if (e && typeof e === "object" && e.entity) return { ...e };
  return null;
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
function scaleFor(group, vals, cfgMax) {
  const m = group.max !== undefined ? group.max : cfgMax;
  if (m !== undefined && m !== null && m !== "auto") {
    const n = parseFloat(m);
    if (Number.isFinite(n) && n > 0) return n;
  }
  let mx = 0;
  for (const v of vals) if (v !== null && v > mx) mx = v;
  return mx > 0 ? mx : 1;
}

// El umbral mas especifico gana: entidad, luego grupo, luego tarjeta.
function pick(key, entCfg, group, cfg) {
  for (const src of [entCfg, group, cfg]) {
    if (src && src[key] !== undefined && src[key] !== null) return src[key];
  }
  return undefined;
}

function resolveThr(entCfg, group, cfg) {
  const v = pick("zero_threshold", entCfg, group, cfg);
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
    this._built = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._cfg) return;
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

    parts.push(`<ha-card>`);
    if (cfg.title || cfg.show_total !== false) {
      parts.push(`<div class="title"><span>${esc(cfg.title || "")}</span>`);
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
    const totalEnt =
      typeof cfg.total === "string" && cfg.total !== "sum" ? cfg.total : null;
    let grand = 0;
    let unit = cfg.unit || "";

    this._groups.forEach((g, gi) => {
      const wrap = this.shadowRoot.getElementById("w" + gi);
      const empty = this.shadowRoot.getElementById("e" + gi);
      const head = this.shadowRoot.getElementById("g" + gi);
      if (!wrap) return;

      // 1. leer
      let items = g.entities.map((e, i) => {
        const v = numState(hass, e.entity);
        const thr = resolveThr(e, g, cfg);
        return {
          cfg: e,
          v,
          i,                                     // orden original, para 'active'
          thr,
          on: v !== null && Math.abs(v) >= thr,
          name: nameOf(hass, e.entity, e.name),
          unit: unitOf(hass, e.entity),
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
      const scale = scaleFor(g, items.map((i) => i.v), cfg.max);

      // 5. pintar
      const html = ordered
        .map((it) => {
          const own =
            it.cfg.max !== undefined && Number(it.cfg.max) > 0
              ? Number(it.cfg.max)
              : scale;
          const frac = it.v === null ? 0 : Math.max(0, Math.min(1, it.v / own));
          const col =
            it.cfg.color ||
            sevColor(it.v || 0, own, pick("severity", it.cfg, g, cfg));
          const cls = "row" + (it.v === null ? " na" : it.on ? "" : " off");
          const u = it.unit || unit;
          return (
            `<div class="${cls}" data-e="${esc(it.cfg.entity)}">` +
            `<div class="nm" title="${esc(it.name)}">${esc(it.name)}</div>` +
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
      const v = totalEnt ? numState(hass, totalEnt) : grand;
      const u = cfg.unit || (totalEnt ? unitOf(hass, totalEnt) : "") || unit;
      tot.innerHTML = `${fmt(v)}<span class="u">${esc(u)}</span>`;
      tot.title = totalEnt ? nameOf(hass, totalEnt) : "Sum of the rows";
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
              { value: "active", label: "Active first" },
              { value: "value", label: "By value (highest first)" },
              { value: "config", label: "As configured" },
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
        `<div id="gwrap"></div>` +
        `<div id="gbtns" style="margin-top:10px"></div>`;
      this._form = this.querySelector("#main");
      this._gwrap = this.querySelector("#gwrap");
      this._gbtns = this.querySelector("#gbtns");
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

    const sig = this._groups().length;
    if (rehacerGrupos || sig !== this._sig) {
      this._sig = sig;
      this._buildGroups();
    }
    this._buildButtons();
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
          `</div><ha-form id="gf${i}"></ha-form></div>`
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
    normGroups,
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
