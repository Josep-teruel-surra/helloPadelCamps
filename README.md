# HELLO PADEL — Camps

Configurador público de campus de pádel en Calella. El cliente elige jugadores, días, horas, pistas, entrenadores y extras, y ve al momento un presupuesto orientativo (por persona y total).

HTML + CSS + JS vanilla, sin build ni dependencias. Para trabajar en local solo hace falta Node 18 o superior.

```
index.html        Página
css/styles.css    Estilos (incluye la vista de impresión / PDF)
js/config.js      ← Precios, límites y email de contacto
js/pricing.js     Lógica de precios y reglas (módulo puro, sin DOM)
js/i18n.js        Textos ES / EN
js/app.js         Interfaz
tests/            Tests del módulo de precios
```

## Cambiar precios y límites

Todo está en [`js/config.js`](js/config.js). Precios en euros, IVA incluido.

| Qué | Dónde |
|---|---|
| Pista por hora, entrenador por hora | `pricing.courtPerCourtHour`, `pricing.coachPerCoachHour` |
| Partido / preparación física (por día y grupo) | `pricing.matchPerDay`, `pricing.physicalPerDay` |
| Welcome packs (por persona) | `pricing.welcomePacks.<id>.pricePerPlayer` |
| Mín. / máx. jugadores | `players.min`, `players.max` |
| Jugadores por pista, pistas fijas desde | `courts.*` |
| Días, horas por día, máx. horas por sesión | `schedule.*` |
| Selección inicial al abrir | `defaults` |

Después de cambiar algo, ejecuta los tests:

```bash
npm test
```

Los tests 1–11 del enunciado usan los precios actuales. Si cambias un precio, los importes esperados de esos tests dejarán de cuadrar y habrá que actualizarlos.

Para cambiar qué incluye cada pack o cualquier texto, edita [`js/i18n.js`](js/i18n.js) (`pack.basic.items`, etc.). Para añadir un welcome pack nuevo, añádelo en `config.js` y crea sus textos `pack.<id>.title` y `pack.<id>.items` en cada idioma.

## Cambiar el email de contacto

`contact.email` en `js/config.js`. Se usa en el botón "Solicitar este campus" (mailto), en el pie y en el PDF.

## Añadir un idioma

En `js/i18n.js`: copia el bloque `en`, tradúcelo con otra clave (p. ej. `fr`), añádelo a `STRINGS` y a `LANGUAGES`.

## Probar en local

Los módulos JS necesitan servirse por HTTP (no funcionan abriendo el archivo con doble clic):

```bash
npx serve .
```

## Desplegar

Es una web estática en Cloudflare, igual que el resto de webs de HELLO PADEL. El dominio está en `wrangler.jsonc` (`camps.hellopadelacademy.com`, pendiente de confirmar).

```bash
npx wrangler deploy
```

`.assetsignore` evita publicar los tests, el README y los archivos de configuración.
