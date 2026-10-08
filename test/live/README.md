# Pruebas en vivo (WP-0.2)

Atacan la API corriendo y verifican el resultado en la base de datos. Cubren los
PoCs del documento de validación y la concurrencia de dinero.

```bash
npm run start                 # API en http://localhost:3000 (o LIVE_API_URL)
npm run test:live             # todos los casos
npm run test:live -- R3 H-08  # solo esos grupos
```

- Usan la base del `.env` (hoy DashCamDev). Crean usuarios `qa.rem.<corrida>.*@dashcam.test`,
  monederos `QA-REM-*` y pasajeros QA, y los borran al terminar.
- No mandan correos: el OTP se siembra con el mismo HMAC (`OTP_PEPPER`) y el token de
  reset se firma con `JWT_PURPOSE_SECRET`.
- Cada caso usa una IP propia en `X-Forwarded-For`: el throttler cuenta por IP.
- El resultado queda en `test/live/last-run.json`.
- Los débitos usan un viaje abierto de prueba (`viajeAbierto()`) que se borra al final:
  el débito ya no cobra en viajes cerrados.
- Algunos casos tocan datos reales y los restauran al final (ruta 1 en N-07,
  `PermiteRegistroPublico` del cliente 5 en H-64).

## Usuario para revisar la WebApp a mano

`node test/live/crear-demo.mjs` (con `npx dotenvx run -q --`) crea
`qa.rem.demo.admin@dashcam.test`: administrador del cliente 6 con los permisos del
admin real de ese cliente. La contraseña es la constante `PASSWORD` de `harness.mjs`.
`--borrar` lo elimina.

WebApp contra la API local: `npm start -- --configuration local` en DashcampayWebApp.

## Recorridos sobre el cliente de la prueba E2E (cliente 7)

Necesitan los datos que se dieron de alta desde la WebApp ("QA E2E Transportes").

- `e2e-operador.mjs`: login del operador en el validador, turno, viaje, débito y
  reintento idempotente.
- `e2e-tarifas.mjs`: cobros con tarifa abierta y por estaciones sobre las variantes
  "QA E2E Abierta" y "QA E2E Estaciones" (subida y bajada con tarjeta y QR, viaje
  corto, saldo insuficiente, doble validación, cambio de camión). Calcula aparte el
  monto esperado y lo compara con lo cobrado. Para simular el tiempo de viaje atrasa
  `FechaHoraInicio` de la transacción abierta. Crea monederos `QAE2E-TAR-*`.
- `e2e-reglas.mjs`: el validador no cierra un turno con viaje activo, no se cobra en
  un viaje cerrado, el cobro usa la tarifa activa (una por variante) y `/dashboard/kpi`
  y `/permisos/permisosAgrupados` responden. Crea monederos `QAE2E-REG-*` y cierra el turno.

```bash
npx dotenvx run -q -- node test/live/e2e-tarifas.mjs
npx dotenvx run -q -- node test/live/e2e-reglas.mjs
```
