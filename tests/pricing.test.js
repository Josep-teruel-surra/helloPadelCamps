import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../js/config.js";
import {
  playersStatus,
  courtOptions,
  isCourtsFixed,
  distributePlayers,
  coachOptions,
  scheduleFor,
  validateSelection,
  normalizeSelection,
  computeQuote,
} from "../js/pricing.js";

const round2 = (n) => Math.round(n * 100) / 100;

const base = {
  players: 16,
  days: 5,
  hoursPerDay: 2,
  courts: 4,
  coaches: 4,
  welcomePack: "basic",
  matchDays: 5,
  physicalDays: 0,
};

describe("tests obligatorios", () => {
  test("1 · 16 jug., 5 días, 2 h, 4 pistas, 4 entr., Basic, 5 partidos → 1210 €, 75,63 €/p, 1 turno", () => {
    const q = computeQuote(base);
    assert.equal(q.valid, true);
    assert.deepEqual(q.lines, { courts: 200, coaches: 600, welcomePack: 160, matches: 250, physical: 0 });
    assert.equal(q.total, 1210);
    assert.equal(round2(q.perPerson), 75.63);
    assert.equal(q.organization.schedule.type, "single");
  });

  test("2 · igual que el 1 con 2 entrenadores → 1210 €, grupo dividido 2+2", () => {
    const q = computeQuote({ ...base, coaches: 2 });
    assert.equal(q.valid, true);
    assert.equal(q.total, 1210);
    assert.equal(q.organization.schedule.type, "split");
    assert.deepEqual(q.organization.schedule.turns, [2, 2]);
  });

  test("3 · 14 jug., 3 días, 1,5 h, 4 pistas, 2 entr., Premium, 1 partido, 3 física → 735 €, 52,50 €/p", () => {
    const q = computeQuote({
      players: 14, days: 3, hoursPerDay: 1.5, courts: 4, coaches: 2,
      welcomePack: "premium", matchDays: 1, physicalDays: 3,
    });
    assert.equal(q.valid, true);
    assert.deepEqual(q.lines, { courts: 90, coaches: 270, welcomePack: 280, matches: 50, physical: 45 });
    assert.equal(q.total, 735);
    assert.equal(round2(q.perPerson), 52.5);
  });

  test("4 · 8 jug., 5 días, 4 h, 4 pistas, 4 entr., sin pack → 1600 €, 200 €/p, 2 sesiones", () => {
    const q = computeQuote({
      players: 8, days: 5, hoursPerDay: 4, courts: 4, coaches: 4,
      welcomePack: "none", matchDays: 0, physicalDays: 0,
    });
    assert.equal(q.valid, true);
    assert.equal(q.lines.courts, 400);
    assert.equal(q.lines.coaches, 1200);
    assert.equal(q.total, 1600);
    assert.equal(q.perPerson, 200);
    assert.equal(q.organization.schedule.type, "twoSessions");
  });

  test("5 · 18 jug., 2 días, 2 h, 3 entr., Basic → pistas forzadas a 5 (4-4-4-3-3), 580 €, 32,22 €/p, turnos 3+2", () => {
    const sel = normalizeSelection({
      players: 18, days: 2, hoursPerDay: 2, coaches: 3,
      welcomePack: "basic", matchDays: 0, physicalDays: 0,
    });
    assert.equal(sel.courts, 5);
    assert.equal(sel.coaches, 3);
    const q = computeQuote(sel);
    assert.equal(q.valid, true);
    assert.deepEqual(q.organization.distribution, [4, 4, 4, 3, 3]);
    assert.equal(q.lines.courts, 100);
    assert.equal(q.lines.coaches, 300);
    assert.equal(q.lines.welcomePack, 180);
    assert.equal(q.total, 580);
    assert.equal(round2(q.perPerson), 32.22);
    assert.deepEqual(q.organization.schedule.turns, [3, 2]);
  });

  test("6 · 16 jug., 3 h, 2 entr. → inválido (grupo dividido con más de 2 h)", () => {
    const q = computeQuote({ ...base, hoursPerDay: 3, coaches: 2 });
    assert.equal(q.valid, false);
    assert.deepEqual(q.errors, ["splitOverMaxHours"]);
    assert.equal(scheduleFor(4, 2, 3), null);
  });

  test("7 · 7 o 21 jugadores → bloqueado", () => {
    for (const [players, status] of [[7, "tooFew"], [21, "tooMany"]]) {
      assert.equal(playersStatus(players), status);
      const q = computeQuote({ ...base, players });
      assert.equal(q.valid, false);
      assert.equal(q.blocked, true);
      assert.deepEqual(courtOptions(players), []);
    }
  });

  test("8 · 10 jug. → opciones de pistas 3, 4 y 5", () => {
    assert.deepEqual(courtOptions(10).map((o) => o.courts), [3, 4, 5]);
  });

  test("9 · 16 o 20 jug. → sin elección de pistas (4 y 5)", () => {
    assert.equal(isCourtsFixed(16), true);
    assert.equal(isCourtsFixed(20), true);
    assert.deepEqual(courtOptions(16).map((o) => o.courts), [4]);
    assert.deepEqual(courtOptions(20).map((o) => o.courts), [5]);
  });

  test("10 · 4 pistas → entrenadores 4 y 2; 5 pistas → 5 y 3", () => {
    assert.deepEqual(coachOptions(4, 2).map((o) => o.coaches), [4, 2]);
    assert.deepEqual(coachOptions(5, 2).map((o) => o.coaches), [5, 3]);
    assert.deepEqual(validateSelection({ ...base, coaches: 3 }), ["coaches"]);
  });

  test("11 · partidos y física se ajustan al bajar los días", () => {
    const sel = normalizeSelection({ ...base, days: 2, matchDays: 5, physicalDays: 4 });
    assert.equal(sel.matchDays, 2);
    assert.equal(sel.physicalDays, 2);
    assert.deepEqual(validateSelection({ ...base, days: 2 }), ["matchDays"]);
  });
});

describe("pistas y reparto", () => {
  test("8 jugadores → 2, 3 o 4 pistas", () => {
    assert.deepEqual(courtOptions(8).map((o) => o.courts), [2, 3, 4]);
  });

  test("15 jugadores (justo debajo del fijo) → 4 a 7 pistas", () => {
    assert.deepEqual(courtOptions(15).map((o) => o.courts), [4, 5, 6, 7]);
  });

  test("17 jugadores → fijo en 5", () => {
    assert.deepEqual(courtOptions(17).map((o) => o.courts), [5]);
  });

  test("reparto equilibrado", () => {
    assert.deepEqual(distributePlayers(10, 3), [4, 3, 3]);
    assert.deepEqual(distributePlayers(8, 4), [2, 2, 2, 2]);
    assert.deepEqual(distributePlayers(13, 4), [4, 3, 3, 3]);
  });

  test("ningún reparto supera 4 ni baja de 2 por pista", () => {
    for (let p = CONFIG.players.min; p <= CONFIG.players.max; p++) {
      for (const { distribution } of courtOptions(p)) {
        assert.ok(Math.max(...distribution) <= 4, `${p}: ${distribution}`);
        assert.ok(Math.min(...distribution) >= 2, `${p}: ${distribution}`);
        assert.equal(distribution.reduce((a, b) => a + b), p);
      }
    }
  });
});

describe("entrenadores y turnos", () => {
  test("2 pistas → 2 o 1 entrenador", () => {
    assert.deepEqual(coachOptions(2, 1.5).map((o) => o.coaches), [2, 1]);
    assert.deepEqual(scheduleFor(2, 1, 1.5).turns, [1, 1]);
  });

  test("más de 2 h desactiva el grupo dividido con motivo", () => {
    for (const h of [3, 3.5, 4]) {
      const split = coachOptions(4, h).find((o) => o.mode === "split");
      assert.equal(split.enabled, false);
      assert.equal(split.reason, "splitOverMaxHours");
    }
    assert.equal(coachOptions(4, 2).find((o) => o.mode === "split").enabled, true);
  });

  test("entrenadores = pistas con ≤ 2 h → 1 turno; con > 2 h → 2 sesiones", () => {
    assert.equal(scheduleFor(3, 3, 1).type, "single");
    assert.equal(scheduleFor(3, 3, 3.5).type, "twoSessions");
  });

  test("dividir el grupo cuesta lo mismo que entrenar todos a la vez", () => {
    for (const courts of [2, 3, 4, 5]) {
      const sel = { ...base, players: courts * 4, courts, hoursPerDay: 1.5 };
      const full = computeQuote({ ...sel, coaches: courts });
      const split = computeQuote({ ...sel, coaches: Math.ceil(courts / 2) });
      assert.equal(full.valid && split.valid, true);
      assert.equal(full.total, split.total);
    }
  });
});

describe("cascada", () => {
  test("al bajar jugadores, las pistas pasan a la opción válida más cercana", () => {
    // 12 jugadores con 6 pistas → bajar a 9 jugadores (máx. 4 pistas)
    const sel = normalizeSelection({ ...base, players: 9, courts: 6, coaches: 6, matchDays: 0 });
    assert.equal(sel.courts, 4);
    assert.equal(sel.coaches, 4);
  });

  test("al subir a 16+ jugadores, las pistas quedan fijas en el mínimo", () => {
    const sel = normalizeSelection({ ...base, players: 18, courts: 7, coaches: 7 });
    assert.equal(sel.courts, 5);
    assert.equal(sel.coaches, 5);
  });

  test("al cambiar pistas se conserva el modo del entrenador", () => {
    // grupo dividido con 4 pistas (2 entr.) → 5 pistas: 3 entr. (sigue dividido)
    assert.equal(normalizeSelection({ ...base, players: 14, courts: 5, coaches: 2 }).coaches, 3);
    // todo el grupo con 4 pistas (4 entr.) → 3 pistas: 3 entr.
    assert.equal(normalizeSelection({ ...base, players: 12, courts: 3, coaches: 4 }).coaches, 3);
  });

  test("al subir las horas por encima de 2 h, el grupo dividido pasa a entrenadores = pistas", () => {
    const sel = normalizeSelection({ ...base, hoursPerDay: 3, coaches: 2 });
    assert.equal(sel.coaches, 4);
    assert.equal(computeQuote(sel).organization.schedule.type, "twoSessions");
  });

  test("horas y días fuera de opciones se ajustan", () => {
    const sel = normalizeSelection({ ...base, hoursPerDay: 2.4, days: 12 });
    assert.equal(sel.hoursPerDay, 2);
    assert.equal(sel.days, CONFIG.schedule.days.max);
  });

  test("con jugadores fuera de rango no se toca el resto", () => {
    const sel = { ...base, players: 21 };
    assert.deepEqual(normalizeSelection(sel), sel);
  });

  test("toda selección normalizada es válida", () => {
    for (let players = CONFIG.players.min; players <= CONFIG.players.max; players++) {
      for (const hoursPerDay of CONFIG.schedule.hoursPerDayOptions) {
        for (const coaches of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
          const sel = normalizeSelection({ ...base, players, hoursPerDay, coaches, courts: 99 });
          assert.deepEqual(validateSelection(sel), [], JSON.stringify(sel));
        }
      }
    }
  });
});
