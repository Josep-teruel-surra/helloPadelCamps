// Lógica de presupuesto. Módulo puro: sin DOM, sin estado.
// Todas las funciones aceptan `cfg` como último argumento (por defecto CONFIG) para poder testear con otros valores.
import { CONFIG } from "./config.js";

const isInt = (n) => Number.isInteger(n);

const nearest = (options, target) =>
  options.reduce((best, o) => (Math.abs(o - target) < Math.abs(best - target) ? o : best), options[0]);

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// ── Jugadores ────────────────────────────────────────────────

/** "ok" | "tooFew" | "tooMany" | "invalid" */
export function playersStatus(players, cfg = CONFIG) {
  if (!isInt(players)) return "invalid";
  if (players < cfg.players.min) return "tooFew";
  if (players > cfg.players.max) return "tooMany";
  return "ok";
}

// ── Pistas ───────────────────────────────────────────────────

export function minCourts(players, cfg = CONFIG) {
  return Math.ceil(players / cfg.courts.maxPlayersPerCourt);
}

export function maxCourts(players, cfg = CONFIG) {
  if (isCourtsFixed(players, cfg)) return minCourts(players, cfg);
  return Math.floor(players / cfg.courts.minPlayersPerCourt);
}

export function isCourtsFixed(players, cfg = CONFIG) {
  return players >= cfg.courts.fixedFromPlayers;
}

/** Reparto lo más equilibrado posible, de mayor a menor. 18 en 5 → [4,4,4,3,3] */
export function distributePlayers(players, courts) {
  const base = Math.floor(players / courts);
  const extra = players % courts;
  return Array.from({ length: courts }, (_, i) => base + (i < extra ? 1 : 0));
}

/** [{ courts, distribution }] para los jugadores dados. Vacío si los jugadores están fuera de rango. */
export function courtOptions(players, cfg = CONFIG) {
  if (playersStatus(players, cfg) !== "ok") return [];
  const out = [];
  for (let c = minCourts(players, cfg); c <= maxCourts(players, cfg); c++) {
    out.push({ courts: c, distribution: distributePlayers(players, c) });
  }
  return out;
}

// ── Entrenadores y turnos ────────────────────────────────────

export function splitCoaches(courts) {
  return Math.ceil(courts / 2);
}

/**
 * Las dos únicas opciones: un entrenador por pista ("full") o grupo dividido en 2 turnos ("split").
 * El grupo dividido se desactiva si las horas por jugador superan la sesión máxima.
 */
export function coachOptions(courts, hoursPerDay, cfg = CONFIG) {
  const splitAllowed = hoursPerDay <= cfg.schedule.maxHoursPerSession;
  return [
    { coaches: courts, mode: "full", enabled: true, reason: null },
    {
      coaches: splitCoaches(courts),
      mode: "split",
      enabled: splitAllowed,
      reason: splitAllowed ? null : "splitOverMaxHours",
    },
  ];
}

/** Pistas por turno en grupo dividido: 5 → [3, 2] */
export function splitTurns(courts) {
  return [Math.ceil(courts / 2), Math.floor(courts / 2)];
}

/**
 * Organización que resulta de entrenadores + horas.
 * type: "single" (todo el grupo a la vez) | "twoSessions" (2 sesiones al día) | "split" (2 turnos seguidos)
 * Devuelve null si la combinación no es válida.
 */
export function scheduleFor(courts, coaches, hoursPerDay, cfg = CONFIG) {
  const overSession = hoursPerDay > cfg.schedule.maxHoursPerSession;
  if (coaches === courts) {
    return overSession
      ? { type: "twoSessions", sessionsPerDay: 2 }
      : { type: "single", sessionsPerDay: 1 };
  }
  if (coaches === splitCoaches(courts) && !overSession) {
    return { type: "split", sessionsPerDay: 2, turns: splitTurns(courts) };
  }
  return null;
}

// ── Selección: validación y ajuste en cascada ────────────────

/** Lista de códigos de error. Vacía = selección válida. */
export function validateSelection(sel, cfg = CONFIG) {
  const errors = [];
  const pStatus = playersStatus(sel.players, cfg);
  if (pStatus !== "ok") return ["players:" + pStatus];

  const { days, hoursPerDay, courts, coaches } = sel;
  if (!isInt(days) || days < cfg.schedule.days.min || days > cfg.schedule.days.max) errors.push("days");
  if (!cfg.schedule.hoursPerDayOptions.includes(hoursPerDay)) errors.push("hoursPerDay");
  if (!courtOptions(sel.players, cfg).some((o) => o.courts === courts)) errors.push("courts");
  if (!errors.includes("courts") && !errors.includes("hoursPerDay")) {
    const opt = coachOptions(courts, hoursPerDay, cfg).find((o) => o.coaches === coaches);
    if (!opt) errors.push("coaches");
    else if (!opt.enabled) errors.push(opt.reason);
  }
  if (!(sel.welcomePack in cfg.pricing.welcomePacks)) errors.push("welcomePack");
  if (!isInt(sel.matchDays) || sel.matchDays < 0 || sel.matchDays > days) errors.push("matchDays");
  if (!isInt(sel.physicalDays) || sel.physicalDays < 0 || sel.physicalDays > days) errors.push("physicalDays");
  return errors;
}

/**
 * Ajusta una selección para que sea válida, llevando cada campo a la opción válida más cercana.
 * Cascada: jugadores → pistas → (pistas, horas) → entrenadores; días → partidos y física.
 * Si los jugadores están fuera de rango, no se toca nada más (el cálculo queda bloqueado).
 */
export function normalizeSelection(sel, cfg = CONFIG) {
  const out = { ...sel };
  if (playersStatus(out.players, cfg) !== "ok") return out;

  const d = cfg.schedule.days;
  out.days = clamp(Math.round(out.days ?? d.min), d.min, d.max);
  out.hoursPerDay = nearest(cfg.schedule.hoursPerDayOptions, out.hoursPerDay ?? cfg.defaults.hoursPerDay);

  const courts = courtOptions(out.players, cfg).map((o) => o.courts);
  out.courts = nearest(courts, out.courts ?? courts[0]);

  const coaches = coachOptions(out.courts, out.hoursPerDay, cfg).filter((o) => o.enabled).map((o) => o.coaches);
  out.coaches = nearest(coaches, out.coaches ?? out.courts);

  if (!(out.welcomePack in cfg.pricing.welcomePacks)) out.welcomePack = cfg.defaults.welcomePack;
  out.matchDays = clamp(Math.round(out.matchDays ?? 0), 0, out.days);
  out.physicalDays = clamp(Math.round(out.physicalDays ?? 0), 0, out.days);
  return out;
}

// ── Presupuesto ──────────────────────────────────────────────

/**
 * Calcula el presupuesto de una selección válida.
 * Importes sin redondear; la UI redondea al euro al mostrarlos.
 * Si la selección no es válida: { valid: false, errors }.
 */
export function computeQuote(sel, cfg = CONFIG) {
  const errors = validateSelection(sel, cfg);
  if (errors.length) return { valid: false, blocked: errors[0].startsWith("players:"), errors };

  const p = cfg.pricing;
  const { players, days, hoursPerDay, courts, coaches } = sel;
  // Se paga por hora de pista y por hora de entrenador: dividir el grupo cuesta lo mismo.
  const courtHours = courts * hoursPerDay * days;

  const lines = {
    courts: courtHours * p.courtPerCourtHour,
    coaches: courtHours * p.coachPerCoachHour,
    welcomePack: players * p.welcomePacks[sel.welcomePack].pricePerPlayer,
    matches: sel.matchDays * p.matchPerDay,
    physical: sel.physicalDays * p.physicalPerDay,
  };
  const total = Object.values(lines).reduce((a, b) => a + b, 0);

  return {
    valid: true,
    lines,
    total,
    perPerson: total / players,
    organization: {
      players,
      days,
      hoursPerDay,
      courts,
      coaches,
      distribution: distributePlayers(players, courts),
      schedule: scheduleFor(courts, coaches, hoursPerDay, cfg),
      matchDays: sel.matchDays,
      physicalDays: sel.physicalDays,
      welcomePack: sel.welcomePack,
    },
  };
}
