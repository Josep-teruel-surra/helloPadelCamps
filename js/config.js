// ─────────────────────────────────────────────────────────────
// HELLO PADEL — CAMPS · Configuración de precios y límites
// Todo lo editable está aquí. Precios en euros, IVA incluido.
// ─────────────────────────────────────────────────────────────

const deepFreeze = (obj) => {
  Object.values(obj).forEach((v) => {
    if (v && typeof v === "object") deepFreeze(v);
  });
  return Object.freeze(obj);
};

export const CONFIG = deepFreeze({
  currency: "EUR",
  vatIncluded: true,

  pricing: {
    courtPerCourtHour: 5,  // pista entera por hora (tarifa de mañana; nunca se entrena después de las 17:00)
    coachPerCoachHour: 15, // entrenador por hora
    matchPerDay: 50,       // por día con partido organizado, por grupo (no por persona)
    physicalPerDay: 15,    // por día con preparación física (30 min), por grupo
    welcomePacks: {
      // Precio por persona que paga el cliente. El orden aquí es el orden en pantalla.
      none: { pricePerPlayer: 0 },
      basic: { pricePerPlayer: 10 },
      premium: { pricePerPlayer: 20 },
    },
  },

  players: { min: 8, max: 20 },

  courts: {
    maxPlayersPerCourt: 4,
    minPlayersPerCourt: 2,
    fixedFromPlayers: 16, // desde este nº de jugadores, pistas = mínimo (sin elección)
  },

  schedule: {
    days: { min: 1, max: 7 },                  // max PENDIENTE DE CONFIRMAR
    hoursPerDayOptions: [1, 1.5, 2, 3, 3.5, 4], // horas de entreno por jugador y día
    maxHoursPerSession: 2,                      // un entrenador nunca pasa más de 2 h seguidas con el mismo grupo
    maxSessionsPerDay: 2,
    latestEndTime: "17:00",
  },

  // Selección inicial al abrir la página
  defaults: {
    players: 12,
    days: 3,
    hoursPerDay: 2,
    welcomePack: "basic",
    matchDays: 1,
    physicalDays: 0,
  },

  contact: {
    email: "hellopadel@gmail.com", // PENDIENTE DE CONFIRMAR
    location: "Calella, Barcelona",
  },
});
