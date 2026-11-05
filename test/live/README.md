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
- Algunos casos tocan datos reales y los restauran al final (ruta 1 y la última
  verificación del cliente 6 en N-07, `PermiteRegistroPublico` del cliente 5 en H-64).
- Un caso que no tiene datos para correr se marca `○ omitido` con el motivo; no cuenta
  como fallo (`omitir(motivo)` en `harness.mjs`).

## Casos de la vuelta 3 (WP-0.2 / criterios de WP-1.6)

| Grupo | Archivo | Qué verifica |
|---|---|---|
| H-08 | `casos/debito.mjs` | 15 débitos en paralelo con saldo para uno: exactamente 1 aceptado, saldo = inicial − cobrado, nunca negativo |
| H-08 | `casos/debito.mjs` | 5 recargas en efectivo + 5 débitos simultáneos: saldo = inicial + recargado − cobrado (sin lost-update) |
| D-15 | `casos/tarifa-dinamica.mjs` | Tarifa dinámica: lectura repetida al subir (< 1 min, mismo viaje) no cobra ni abre otro viaje. Bajada vs. nuevo abordaje depende del tiempo y del tipo de tarifa (regla de negocio) |
| V2-06 | `casos/tarifa-dinamica.mjs` | Tarifa dinámica: dos taps simultáneos sobre una ABIERTA cobran lo mismo que un solo tap de referencia y no dejan ABIERTA |
| N-01 | `casos/jwt.mjs` | Token `email_confirm` y token `pwd_reset` (secreto de propósito) como Bearer → 401 en `/login/me`, `/transacciones/list`, `/usuarios/list`; también un `email_confirm` firmado con `JWT_SECRET` e iss/aud válidos |
| H-03 | `casos/auth-otp.mjs` | `cambiar/accesso` sin Bearer: misma respuesta (401 "Token inválido o expirado") con usuario existente e inexistente |
| H-03 | `casos/auth-otp.mjs` | `verify`: usuario inexistente y existente con código erróneo → mismo status y mensaje |
| Tenant | `casos/tenant-fk.mjs` | Admin del cliente 6 pide por `:id` vehículo, instalación y monedero de un cliente fuera de su jerarquía (`spGetClientes`) → 404 (con control: su propio vehículo → 200) |
| N-07 | `casos/tenant-fk.mjs` | `PATCH /verificaciones/:id` con `idInstalacion` de otro cliente → 404 y la fila no cambia |
| N-02 | `casos/recarga-idempotencia.mjs` | Recarga en efectivo con monto negativo → 400 y saldo intacto |
| CORS | `casos/cors.mjs` | HTTP (preflight y GET) y handshake de Socket.IO (`/socket.io/?EIO=4&transport=polling`) con Origin no permitido → sin `Access-Control-Allow-Origin`; control con el primer origen de `CORS_ORIGINS` |

Ya cubiertos antes (no se duplicaron): misma clave en débitos paralelos (H-08, 5 en
paralelo), clave de otro monedero → 409 (V2-15), recargas paralelas con la misma clave
(R3, 5 en paralelo), `rutas.idZonaFin` de otro cliente (N-07).

### Tarifa dinámica (D-15)

`viajeAbiertoDinamico()` copia turno, operador y variante del último viaje cuya variante
tiene tarifa activa abierta (2) o por estaciones (3), `RecorridoDetallado` y un validador
activo del mismo cliente; sube en el punto 1 del recorrido y baja en el 4. Con
`LIVE_CLIENTE_DINAMICO` se fija el cliente. Si la BD no tiene ninguno, los casos D-15 y
V2-06 se omiten. Para crearlo: dar de alta desde la WebApp una variante con recorrido
trazado y una tarifa abierta activa (como "QA E2E Abierta" del cliente 7), un validador
activo e instalado, y abrir al menos un viaje sobre esa variante (p. ej. corriendo
`e2e-tarifas.mjs` una vez).

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
