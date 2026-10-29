// Interfaz del configurador. Toda la lógica de precios vive en pricing.js.
import { CONFIG } from "./config.js";
import { LANGUAGES, translate } from "./i18n.js";
import * as P from "./pricing.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const LANG_KEY = "hp-camps-lang";
const PACKS = Object.keys(CONFIG.pricing.welcomePacks);

const STATIC_VARS = {
  pMin: CONFIG.players.min,
  pMax: CONFIG.players.max,
  min: CONFIG.players.min,
  max: CONFIG.players.max,
  dMin: CONFIG.schedule.days.min,
  dMax: CONFIG.schedule.days.max,
  hMin: Math.min(...CONFIG.schedule.hoursPerDayOptions),
  hMax: Math.max(...CONFIG.schedule.hoursPerDayOptions),
  perCourt: CONFIG.courts.maxPlayersPerCourt,
  maxSession: CONFIG.schedule.maxHoursPerSession,
  end: CONFIG.schedule.latestEndTime,
  email: CONFIG.contact.email,
};

let lang = detectLang();
let sel = P.normalizeSelection({ ...CONFIG.defaults });
let lastAnnounced = null;
let announceTimer = null;

// ── Idioma y formato ─────────────────────────────────────────

function detectLang() {
  const codes = LANGUAGES.map((l) => l.code);
  const fromUrl = new URLSearchParams(location.search).get("lang");
  if (codes.includes(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (codes.includes(saved)) return saved;
  } catch {}
  const nav = (navigator.languages || [navigator.language]).map((l) => l.slice(0, 2));
  return nav.find((l) => codes.includes(l)) || codes[0];
}

const t = (key, vars = {}) => translate(lang, key, { ...STATIC_VARS, ...vars });
const locale = () => LANGUAGES.find((l) => l.code === lang).locale;
const money = (n) =>
  new Intl.NumberFormat(locale(), { style: "currency", currency: CONFIG.currency, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Math.round(n));
const hours = (h) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(h) + " h";
const dist = (d) => d.join("-");

function applyStatic() {
  document.documentElement.lang = lang;
  $$("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  $$("[data-i18n-content]").forEach((el) => el.setAttribute("content", t(el.dataset.i18nContent)));
  $$("[data-i18n-placeholder]").forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
  $$("[data-i18n-aria-label]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel)));

  const select = $("#lang");
  select.innerHTML = LANGUAGES.map((l) => `<option value="${l.code}"${l.code === lang ? " selected" : ""}>${l.label}</option>`).join("");

  $("#footer-location").textContent = CONFIG.contact.location;
  const mail = $("#footer-email");
  mail.textContent = CONFIG.contact.email;
  mail.href = `mailto:${CONFIG.contact.email}`;
}

// ── Grupos de opciones (radios) ──────────────────────────────

/**
 * Pinta un grupo de radios. Solo reconstruye el HTML si cambian las opciones;
 * si no, actualiza checked/disabled para no perder el foco del teclado.
 * items: [{ value, html, disabled }]
 */
function radioGroup(container, name, items, current, variant) {
  const key = lang + "|" + JSON.stringify(items);
  if (container.dataset.key !== key) {
    const hadFocus = container.contains(document.activeElement);
    container.innerHTML = items
      .map(
        (it, i) => `
        <div class="choice">
          <input type="radio" name="${name}" id="${name}-${i}" value="${esc(it.value)}"${it.disabled ? " disabled" : ""}>
          <label class="${variant}" for="${name}-${i}">${it.html}</label>
        </div>`
      )
      .join("");
    container.dataset.key = key;
    if (hadFocus) requestAnimationFrame(() => $(`input:checked`, container)?.focus());
  }
  $$("input", container).forEach((input) => {
    input.checked = input.value === String(current);
  });
}

// ── Render ───────────────────────────────────────────────────

function render() {
  const status = P.playersStatus(sel.players);
  const ok = status === "ok";

  setNumber("players", sel.players);
  stepperBounds("players", CONFIG.players.min - 1, CONFIG.players.max + 1, sel.players);

  const msg = $("#players-msg");
  if (ok) {
    msg.hidden = true;
  } else {
    msg.hidden = false;
    msg.innerHTML = `${esc(t("players." + status))} <a href="mailto:${CONFIG.contact.email}">${esc(t("players.contact"))} →</a>`;
  }
  $$(".step.dependent").forEach((fs) => (fs.disabled = !ok));

  if (ok) renderControls();
  renderSummary(P.computeQuote(sel));
}

function renderControls() {
  const d = CONFIG.schedule.days;
  setNumber("days", sel.days);
  stepperBounds("days", d.min, d.max, sel.days);

  radioGroup(
    $("#hours-options"),
    "hoursPerDay",
    CONFIG.schedule.hoursPerDayOptions.map((h) => ({ value: h, html: esc(hours(h)) })),
    sel.hoursPerDay,
    "pill"
  );

  const courtOpts = P.courtOptions(sel.players);
  const fixed = P.isCourtsFixed(sel.players);
  const courtsBox = $("#courts-options");
  const fixedBox = $("#courts-fixed");
  courtsBox.hidden = fixed;
  fixedBox.hidden = !fixed;
  if (fixed) {
    fixedBox.innerHTML = `${esc(t("courts.fixed", { players: sel.players, courts: sel.courts }))} <strong>${esc(
      t("courts.distribution", { dist: dist(courtOpts[0].distribution) })
    )}</strong>`;
  } else {
    radioGroup(
      courtsBox,
      "courts",
      courtOpts.map((o) => ({
        value: o.courts,
        html: `${esc(t("courts.option", { n: o.courts }))}<small>${esc(t("courts.distribution", { dist: dist(o.distribution) }))}</small>`,
      })),
      sel.courts,
      "pill"
    );
  }

  const [a, b] = P.splitTurns(sel.courts);
  radioGroup(
    $("#coaches-options"),
    "coaches",
    P.coachOptions(sel.courts, sel.hoursPerDay).map((o) => ({
      value: o.coaches,
      disabled: !o.enabled,
      html: `
        <span class="card-title">${esc(t(`coaches.${o.mode}.title`))}</span>
        <span class="card-desc">${esc(t(`coaches.${o.mode}.desc`, { n: o.coaches, a, b }))}</span>
        ${o.enabled ? "" : `<span class="card-note">${esc(t("coaches.split.disabled"))}</span>`}`,
    })),
    sel.coaches,
    "card"
  );

  radioGroup(
    $("#pack-options"),
    "welcomePack",
    PACKS.map((id) => {
      const price = CONFIG.pricing.welcomePacks[id].pricePerPlayer;
      return {
        value: id,
        html: `
          <span class="card-title">${esc(t(`pack.${id}.title`))}
            <span class="card-price">${esc(price ? t("pack.perPerson", { price: money(price) }) : t("pack.free"))}</span></span>
          <span class="card-desc">${esc(t(`pack.${id}.items`))}</span>`,
      };
    }),
    sel.welcomePack,
    "card"
  );

  setNumber("matchDays", sel.matchDays);
  stepperBounds("matchDays", 0, sel.days, sel.matchDays);
  $("#matchDays").max = sel.days;
  setNumber("physicalDays", sel.physicalDays);
  stepperBounds("physicalDays", 0, sel.days, sel.physicalDays);
  $("#physicalDays").max = sel.days;
}

function setNumber(id, value) {
  const input = $("#" + id);
  // No pisar lo que el usuario está escribiendo
  if (document.activeElement === input && Number.parseInt(input.value, 10) === value) return;
  input.value = Number.isFinite(value) ? value : "";
}

function stepperBounds(field, min, max, value) {
  const box = $(`.stepper[data-field="${field}"]`);
  $('[data-delta="-1"]', box).disabled = !(value > min);
  $('[data-delta="1"]', box).disabled = !(value < max) && Number.isFinite(value);
}

function scheduleText(o) {
  const s = o.schedule;
  if (s.type === "split") return t("schedule.split", { a: s.turns[0], b: s.turns[1] });
  return t("schedule." + s.type);
}

/** Filas de desglose y organización, compartidas por resumen, email y PDF. */
function quoteRows(q) {
  const o = q.organization;
  const lines = [
    { label: t("line.courts"), detail: t("line.courts.detail", { courts: o.courts, hours: hours(o.hoursPerDay), days: t("unit.days", { n: o.days }) }), value: q.lines.courts },
    {
      label: t("line.coaches"),
      detail: t(o.schedule.type === "split" ? "line.coaches.detail.split" : "line.coaches.detail", {
        n: o.coaches,
        coachHours: new Intl.NumberFormat(locale()).format(o.courts * o.hoursPerDay * o.days),
      }),
      value: q.lines.coaches,
    },
  ];
  if (q.lines.welcomePack) lines.push({ label: t("line.welcomePack"), detail: t("line.welcomePack.detail", { pack: t(`pack.${o.welcomePack}.title`), players: o.players }), value: q.lines.welcomePack });
  if (q.lines.matches) lines.push({ label: t("line.matches"), detail: t("unit.days", { n: o.matchDays }), value: q.lines.matches });
  if (q.lines.physical) lines.push({ label: t("line.physical"), detail: t("line.physical.detail", { n: t("unit.days", { n: o.physicalDays }) }), value: q.lines.physical });

  const org = [
    { label: t("org.players"), value: String(o.players) },
    { label: t("org.days"), value: t("unit.days", { n: o.days }) },
    { label: t("org.hours"), value: hours(o.hoursPerDay) },
    { label: t("org.courts"), value: String(o.courts) },
    { label: t("org.distribution"), value: dist(o.distribution) },
    { label: t("org.coaches"), value: String(o.coaches) },
    { label: t("org.schedule"), value: scheduleText(o) },
    { label: t("pack.label"), value: t(`pack.${o.welcomePack}.title`) },
    { label: t("line.matches"), value: t("unit.days", { n: o.matchDays }) },
    { label: t("line.physical"), value: t("unit.days", { n: o.physicalDays }) },
  ];
  return { lines, org };
}

function renderSummary(q) {
  const body = $("#summary-body");
  const bar = $("#mobile-bar-price");
  $$('[data-action="pdf"]').forEach((b) => (b.disabled = !q.valid));

  if (!q.valid) {
    body.innerHTML = `<p class="summary-blocked">${esc(t("summary.blocked"))}</p>`;
    bar.innerHTML = `<span class="mb-total">${esc(t("summary.blocked"))}</span>`;
    announce(t("announce.blocked"));
    return;
  }

  const { lines, org } = quoteRows(q);
  const row = (r, withDetail) =>
    `<div class="sum-row"><dt>${esc(r.label)}${withDetail && r.detail ? `<small>${esc(r.detail)}</small>` : ""}</dt><dd>${esc(
      typeof r.value === "number" ? money(r.value) : r.value
    )}</dd></div>`;

  body.innerHTML = `
    <div class="price-main">
      <span class="price-approx">${esc(t("summary.approx"))}</span>
      <span class="price-value">${esc(money(q.perPerson))}</span>
      <span class="price-unit">${esc(t("summary.perPerson"))}</span>
    </div>
    <div class="price-total"><span>${esc(t("summary.total"))}</span><strong>${esc(money(q.total))}</strong></div>
    <div class="sum-block">
      <p class="sum-title">${esc(t("summary.breakdown"))}</p>
      <dl class="sum-list">${lines.map((r) => row(r, true)).join("")}</dl>
    </div>
    <div class="sum-block sum-org">
      <p class="sum-title">${esc(t("summary.organization"))}</p>
      <dl class="sum-list">${org.slice(0, 7).map((r) => row(r)).join("")}</dl>
    </div>`;

  bar.innerHTML = `
    <span class="mb-pp">${esc(money(q.perPerson))} <small>${esc(t("summary.perPerson"))} · ${esc(t("summary.approx"))}</small></span>
    <span class="mb-total">${esc(t("summary.total"))} ${esc(money(q.total))}</span>`;

  announce(t("announce", { pp: money(q.perPerson), total: money(q.total) }));
}

function announce(text) {
  if (text === lastAnnounced) return;
  const first = lastAnnounced === null;
  lastAnnounced = text;
  if (first) return; // no anunciar el estado inicial
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => ($("#live").textContent = text), 600);
}

// ── Estado ───────────────────────────────────────────────────

function update(patch) {
  sel = P.normalizeSelection({ ...sel, ...patch });
  render();
}

function bindEvents() {
  const form = $("#config-form");
  form.addEventListener("submit", (e) => e.preventDefault());

  form.addEventListener("change", (e) => {
    const el = e.target;
    if (el.type === "radio") {
      update({ [el.name]: el.name === "welcomePack" ? el.value : Number(el.value) });
    } else if (el.type === "number") {
      render(); // al salir del campo, muestra el valor ya ajustado
    }
  });

  form.addEventListener("input", (e) => {
    const el = e.target;
    if (el.type !== "number") return;
    const n = Number.parseInt(el.value, 10);
    if (el.id === "players") update({ players: Number.isNaN(n) ? NaN : n });
    else if (!Number.isNaN(n)) update({ [el.id]: n });
  });

  form.addEventListener("click", (e) => {
    const btn = e.target.closest(".stepper-btn");
    if (!btn) return;
    const field = btn.closest(".stepper").dataset.field;
    const delta = Number(btn.dataset.delta);
    const cur = Number.isFinite(sel[field]) ? sel[field] : CONFIG.defaults[field];
    let next = cur + delta;
    if (field === "players") next = Math.min(CONFIG.players.max + 1, Math.max(CONFIG.players.min - 1, next));
    update({ [field]: next });
  });

  $("#lang").addEventListener("change", (e) => {
    lang = e.target.value;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {}
    applyStatic();
    render();
  });

  $$('[data-action="request"]').forEach((b) => b.addEventListener("click", requestCamp));
  $$('[data-action="pdf"]').forEach((b) => b.addEventListener("click", () => window.print()));
  window.addEventListener("beforeprint", buildPrintSheet);

  // Ocultar la barra móvil cuando el resumen ya está a la vista
  const bar = $("#mobile-bar");
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => bar.classList.toggle("is-hidden", entry.isIntersecting), { threshold: 0.15 }).observe($("#summary"));
  }
}

// ── Solicitud (mailto) ───────────────────────────────────────

function contactData() {
  const v = (id) => $("#" + id).value.trim();
  return { group: v("c-group"), person: v("c-person"), email: v("c-email"), phone: v("c-phone"), dates: v("c-dates"), comments: v("c-comments") };
}

function validateContact() {
  const invalid = [];
  for (const id of ["c-group", "c-person", "c-email"]) {
    const input = $("#" + id);
    const bad = !input.value.trim() || !input.checkValidity();
    input.setAttribute("aria-invalid", bad ? "true" : "false");
    if (bad) invalid.push(input);
  }
  return invalid;
}

function requestCamp() {
  const msg = $("#request-msg");
  const invalid = validateContact();
  if (invalid.length) {
    msg.hidden = false;
    msg.className = "notice notice-error";
    msg.textContent = t("contact.error");
    invalid[0].focus();
    return;
  }

  const c = contactData();
  const q = P.computeQuote(sel);
  const out = [t("mail.intro"), "", t("mail.client")];
  const pairs = [
    ["contact.group", c.group],
    ["contact.person", c.person],
    ["contact.email", c.email],
    ["contact.phone", c.phone],
    ["contact.dates", c.dates],
    ["contact.comments", c.comments],
  ];
  pairs.forEach(([k, v]) => v && out.push(`${t(k).replace(" *", "")}: ${v}`));
  out.push("", t("mail.config"));

  if (q.valid) {
    const { lines, org } = quoteRows(q);
    org.forEach((r) => out.push(`${r.label}: ${r.value}`));
    out.push("", t("mail.quote"));
    lines.forEach((r) => out.push(`${r.label} (${r.detail}): ${money(r.value)}`));
    out.push(`${t("summary.total")}: ${money(q.total)}`, `${t("summary.perPerson")}: ${money(q.perPerson)} (${t("summary.approx")})`);
  } else {
    out.push(`${t("org.players")}: ${Number.isFinite(sel.players) ? sel.players : "—"}`, t("summary.blocked"));
  }
  out.push("", t("disclaimer"));

  const subject = t("mail.subject", { group: c.group });
  location.href = `mailto:${CONFIG.contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(out.join("\r\n"))}`;

  msg.hidden = false;
  msg.className = "notice";
  msg.textContent = t("contact.sent");
}

// ── PDF (vista de impresión) ─────────────────────────────────

function buildPrintSheet() {
  const q = P.computeQuote(sel);
  const sheet = $("#print-sheet");
  if (!q.valid) {
    sheet.innerHTML = "";
    return;
  }
  const { lines, org } = quoteRows(q);
  const c = contactData();
  const date = new Intl.DateTimeFormat(locale(), { dateStyle: "long" }).format(new Date());
  const tr = (a, b) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`;

  sheet.innerHTML = `
    <div class="ps-head">
      <div class="ps-brand"><span class="h">H</span>HELLO PADEL — Camps</div>
      <div class="ps-meta">${esc(t("print.date"))}: ${esc(date)}<br>${esc(CONFIG.contact.location)}</div>
    </div>
    <h1>${esc(t("print.title"))}</h1>
    ${c.group || c.person ? `<p>${esc(t("print.client"))}: <strong>${esc([c.group, c.person].filter(Boolean).join(" · "))}</strong>${c.dates ? ` — ${esc(c.dates)}` : ""}</p>` : ""}
    <div class="ps-price">
      <div><span>${esc(t("summary.perPerson"))} (${esc(t("summary.approx"))})</span><strong>${esc(money(q.perPerson))}</strong></div>
      <div><span>${esc(t("summary.total"))}</span><strong>${esc(money(q.total))}</strong></div>
    </div>
    <div class="ps-grid">
      <div>
        <h2>${esc(t("print.config"))}</h2>
        <table>${org.map((r) => tr(r.label, r.value)).join("")}</table>
      </div>
      <div>
        <h2>${esc(t("summary.breakdown"))}</h2>
        <table>
          ${lines.map((r) => tr(`${r.label} — ${r.detail}`, money(r.value))).join("")}
          <tr class="ps-total"><td>${esc(t("summary.total"))}</td><td>${esc(money(q.total))}</td></tr>
        </table>
      </div>
    </div>
    <p class="ps-note">${esc(t("disclaimer"))}</p>
    <p class="ps-foot">${esc(t("print.contact"))}: ${esc(CONFIG.contact.email)} · ${esc(CONFIG.contact.location)}</p>`;
}

// ── Inicio ───────────────────────────────────────────────────

applyStatic();
bindEvents();
render();
