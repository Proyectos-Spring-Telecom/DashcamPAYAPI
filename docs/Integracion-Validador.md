# Integración de un nuevo validador — APIs DashCamPay

Guía de las APIs remotas que consume la app Flutter **DashcamValidadorApp**. Sirve para implementar un cliente nuevo (otro firmware, otra app o un emulador) sin reinventar contratos.

Fuente de verdad del cliente actual: `lib/config/app_config.dart` y los servicios en `lib/services/` / `lib/app/auth.dart`.

---

## 1. Base URL y autenticación

| Entorno | Base URL |
|---------|----------|
| Debug | `https://dashcampay.com/apidev` |
| Release | `https://dashcampay.com/api` |
| Override | `--dart-define=API_BASE_URL=https://tu-host/api` |

Todas las rutas de abajo son relativas a esa base.

### Headers

| Header | Cuándo |
|--------|--------|
| `Content-Type: application/json` | Siempre |
| `Authorization: Bearer <accessToken>` | Todas las rutas **excepto** login, login PIN y refresh |

Timeouts típicos del cliente: 30 s connect / receive / send. Reintentos: hasta 3 ante timeout, error de red o 5xx. **No** se reintenta un 401 (ahí se hace refresh).

### Roles que usa el validador

El operador de unidad es el **rol 3**. El login PIN (`/login/operador/login`) y los cobros en ruta asumen ese perfil.

### Identificador del dispositivo

El cliente obtiene un ID de equipo (Android ID / serie del validador) y lo envía como:

- `validadorId` en el login (reasigna el camión al operador autenticado)
- `numeroSerieValidador` en turno, GPS, recarga y débito de viaje

**Importante:** si el operador inicia sesión en un validador que no era el suyo, el API **reasigna** ese serial al usuario que acaba de autenticarse (comportamiento de producto). No hay que llamar `PATCH /usuarios/actualizar/validador` desde el validador; esa ruta existe para administración web.

---

## 2. Flujo operativo recomendado

```
1. Obtener ID del dispositivo (local)
2. POST /login  ó  POST /login/operador/login   → token + refreshToken
3. GET  /login/me                               → perfil, validadorId, turno/viaje activos
4. (Opcional) PATCH /usuarios/generar/pin       → alta/cambio de PIN (solo si hace falta)
5. POST /turnos                                 → abrir turno
6. GET  /zonas/list → /rutas/by-zona/{id} → /variantes/by-ruta/{id}
7. POST /viajes                                 → abrir viaje
8. Loop de cobro (siempre el mismo POST; el API decide si abre o cierra):
     NFC/QR → GET /monederos/numero/serie/{serie} (opcional)
             → POST /transacciones/debito
9. POST /posiciones cada ~3 minutos (en paralelo)
10. PATCH /viajes/{id}  → cerrar viaje
11. PATCH /turnos/{id}  → cerrar turno
12. Ante 401: POST /login/refresh y reintentar la petición original una vez
```

Modos alternos:

- **Recarga:** `POST /transacciones/recarga`
- **Actividad:** `GET /viajes/viajes-ultima-semana/{numeroSerieValidador}`

Tarifa fija, dinámica (abierta) y por estaciones se cobran **solo** con `POST /transacciones/debito`. No existe `PATCH /transacciones/debito`.

---

## 3. Auth

### 3.1 Login con contraseña

`POST /login` — **público**

```json
{
  "userName": "operador@cliente.com",
  "password": "********",
  "validadorId": "SERIAL-DEL-DISPOSITIVO"
}
```

`validadorId` se omite solo si el dispositivo aún no tiene ID. Si viene, el API puede reasignar ese validador al operador.

**Respuesta (200):**

```json
{
  "token": "<jwt access>",
  "refreshToken": "<jwt refresh>"
}
```

### 3.2 Login con PIN (código de operador)

`POST /login/operador/login` — **público**

Requiere haber guardado antes el `userName` (tras un login con contraseña).

```json
{
  "userName": "operador@cliente.com",
  "codigohash": "123456",
  "validadorId": "SERIAL-DEL-DISPOSITIVO"
}
```

Notas:

- `codigohash` viaja en claro; el servidor lo hashea. Longitudes típicas del cliente: 6 u 8 dígitos.
- `validadorId` va **siempre** en este flujo.

**Respuesta:** igual que el login con contraseña (`token`, `refreshToken`).

### 3.3 Perfil de sesión

`GET /login/me` — **JWT**

Sin body. Campos que el cliente actual lee (entre otros):

| Campo | Uso |
|-------|-----|
| `id`, `nombre`, `apellidoPaterno`, `apellidoMaterno` | UI operador |
| `userName`, `telefono`, `fotoPerfil`, `logotipo` | UI |
| `idCliente`, nombres del cliente | Tenant |
| `rol` (`id`, `nombre`, …) | Autorización local |
| `permisos[]` | Menú / capacidades |
| `pinExist` | Si ya tiene PIN |
| `validadorId` | Guardar como `numeroSerieValidador` |
| `idTurno`, `idViaje` | Restaurar turno/viaje abiertos |
| `estatusOperador`, `Licencias[]` | Validaciones de operador |

Tras login exitoso el cliente guarda `validadorId` de esta respuesta como serie del validador en storage.

### 3.4 Refresh de token

`POST /login/refresh` — **público** (sin Bearer)

```json
{ "refreshToken": "<jwt refresh>" }
```

**Respuesta:**

```json
{
  "token": "<nuevo access>",
  "refreshToken": "<nuevo refresh opcional>"
}
```

Si `refreshToken` viene vacío, el cliente conserva el anterior. Ante 401 en cualquier ruta autenticada: un solo refresh en cola y un reintento de la petición original.

---

## 4. PIN del operador

### 4.1 Generar / actualizar PIN

`PATCH /usuarios/generar/pin` — **JWT** (roles admin en API; el validador lo usa en setup de código)

```json
{
  "userName": "operador@cliente.com",
  "codigohash": "123456"
}
```

Éxito = HTTP 2xx. El servidor hashea el valor.

> En administración web también existe `PATCH /usuarios/actualizar/validador`. **El validador no lo llama**; la reasignación va por el login.

---

## 5. Turno

### 5.1 Abrir turno

`POST /turnos` — **JWT**

```json
{ "numeroSerieValidador": "SERIAL-DEL-DISPOSITIVO" }
```

**Respuesta:** objeto con `data.id` (int). Guardar como `turnId`.

### 5.2 Cerrar turno

`PATCH /turnos/{turnId}` — **JWT**

```json
{ "numeroSerieValidador": "SERIAL-DEL-DISPOSITIVO" }
```

Éxito = HTTP 2xx. Limpiar `turnId` local.

---

## 6. Catálogo de viaje (zona → ruta → variante)

Todas con **JWT**.

| Método | Path | Respuesta que usa el cliente |
|--------|------|------------------------------|
| `GET` | `/zonas/list` | Lista o `data[]` con `id`, `nombre` |
| `GET` | `/rutas/by-zona/{idZona}` | `id`, `nombre` |
| `GET` | `/variantes/by-ruta/{idRuta}` | `id`, `nombreVariante` o `nombre` |

---

## 7. Viaje de ruta fija

### 7.1 Abrir viaje

`POST /viajes` — **JWT**

Requiere turno activo.

```json
{
  "idTurno": 123,
  "idVariante": 45
}
```

**Respuesta:** `data.id` → guardar como `viajeId`.

### 7.2 Cerrar viaje

`PATCH /viajes/{viajeId}` — **JWT**

Sin body. Éxito = HTTP 2xx. Limpiar `viajeId` local.

---

## 8. Monedero, pasajero, recarga y débito

### 8.1 Consultar monedero por serie / UID

`GET /monederos/numero/serie/{serie}` — **JWT**

`{serie}` puede ser número de serie del monedero o UID de tarjeta, según cómo lo resuelva el API.

**Respuesta (`data`):** el cliente lee al menos:

| Campo | Tipo / notas |
|-------|----------------|
| `id` | number |
| `numeroSerie` | string |
| `saldo` | number |
| `estatus` | number |
| `idPasajero` | number (`0` se trata como null) |
| `idCliente` | number |
| `idTipoPasajero` | number (si viene) |

Contacto / NetPay / `idCard` pueden venir null para roles que no son caja ni el dueño; el operador (rol 3) no debe depender de correo o teléfono.

### 8.2 Datos del pasajero

`GET /pasajeros/{id}` — **JWT**

Lee de `data`: `id`, `nombre`, `apellidoPaterno`, `apellidoMaterno`.

### 8.3 Recarga de monedero

`POST /transacciones/recarga` — **JWT**

```json
{
  "idTipoTransaccion": 1,
  "monto": 100,
  "latitudInicial": 19.432600,
  "longitudInicial": -99.133200,
  "numeroSerieMonedero": "SERIE-MONEDERO",
  "numeroSerieValidador": "SERIAL-VALIDADOR",
  "idMetodoPago": 1,
  "claveIdempotencia": "550e8400-e29b-41d4-a716-446655440000"
}
```

- Coordenadas con 6 decimales.
- GPS válido es obligatorio en el cliente actual.
- **`claveIdempotencia` requerida.** Usar UUID v4 y **reutilizar la misma clave** si el usuario reintenta el mismo tap (`recarga|<serie>|<monto>`).

### 8.4 Débito en viaje activo (NFC / QR)

`POST /transacciones/debito` — **JWT**

```json
{
  "latitud": 19.432600,
  "longitud": -99.133200,
  "numeroSerieMonedero": "",
  "idCard": "04A1B2C3D4",
  "numeroSerieValidador": "SERIAL-VALIDADOR",
  "idViaje": 123,
  "esQR": false,
  "esMultiple": false,
  "cantidadPasajes": 0,
  "claveIdempotencia": "550e8400-e29b-41d4-a716-446655440001"
}
```

| Campo | Notas |
|-------|--------|
| `idCard` | UID NFC (o dato equivalente del QR) |
| `numeroSerieMonedero` | Serie si ya se resolvió; puede ir vacío |
| `esQR` | `true` si el cobro viene de QR |
| `esMultiple` / `cantidadPasajes` | Cobro múltiple |
| `claveIdempotencia` | **Requerida.** Fingerprint tipico: `debito\|idCard\|idViaje\|esQR\|esMultiple\|cantidadPasajes` |

**Éxito:** HTTP 2xx y, si el body trae `success`, debe ser `true`. Si trae `result` numérico, debe ser `0`. Ante fallo el cliente mira `message` / `error` / `errorMessage`.

### 8.5 Cómo el API decide abrir o debitar (fija / dinámica / estaciones)

El Validador **siempre** envía el mismo `POST /transacciones/debito` del §8.4. El API mira el `TipoTarifa` de la variante del viaje activo del validador:

| `TipoTarifa` | 1ª validación (sube) | 2ª validación (baja) |
|---|---|---|
| **1 Fija** | Cobra ya (`controlTransaccion = 0` PAGADO) | — |
| **2 Abierta / dinámica** | Solo abre (`= 1` ABIERTA), **no** descuenta saldo | Cierra, calcula por distancia y descuenta |
| **3 Estaciones** | Solo abre (`= 1` ABIERTA), **no** descuenta saldo | Cierra, calcula por estaciones y descuenta |

Detección en el API:

1. Si el monedero ya tiene una débito `ABIERTA` sin lat/lon final → esta validación es **bajada**: cierra y cobra.
2. Si no hay abierta y la tarifa es 2 o 3 → es **subida**: crea ABIERTA con tarifa base.
3. Misma tarjeta otra vez en &lt; 1 min en el mismo viaje → responde “Viaje ya iniciado” sin cobrar de nuevo.
4. Si había una ABIERTA de **otro** viaje (olvidó bajar) → la cierra y abre la nueva.

**No hay `PATCH /transacciones/debito`.** Un 404 en PATCH es esperado: esa ruta no forma parte del contrato.

---

## 9. Posiciones GPS

`POST /posiciones` — **JWT**

Intervalo del cliente actual: ~cada 3 minutos (con delay inicial ~5 s). Exactitud máxima aceptada en cliente: 500 m.

```json
{
  "exactitud": 12.5,
  "estado": 1,
  "velocidad": 34.20,
  "direccion": 180.00,
  "latitud": 19.432600,
  "longitud": -99.133200,
  "fechaHora": "2026-11-11T19:05:00Z",
  "numeroSerieValidador": "SERIAL-VALIDADOR"
}
```

Éxito = HTTP 2xx. Los fallos se registran y se reintenta en el siguiente ciclo (no tumbar la sesión).

---

## 10. Actividad / historial

`GET /viajes/viajes-ultima-semana/{numeroSerieValidador}` — **JWT**

**Respuesta esperada:**

```json
{
  "data": {
    "viajes": [
      {
        "idViaje": 1,
        "fechaInicio": "...",
        "fechaFin": "...",
        "nombreVariante": "...",
        "turno": { },
        "instalacion": {
          "vehiculo": { }
        }
      }
    ],
    "ultimaPosicion": {
      "id": 1,
      "latitud": 19.43,
      "longitud": -99.13,
      "velocidad": 0,
      "direccion": 0,
      "fechaHora": "...",
      "exactitud": 10,
      "estado": 1
    }
  }
}
```

---

## 11. Tabla resumen (APIs remotas que sí usa el validador)

| # | Método | Path | Auth | Idempotencia |
|---|--------|------|------|--------------|
| 1 | `POST` | `/login` | No | — |
| 2 | `POST` | `/login/operador/login` | No | — |
| 3 | `GET` | `/login/me` | Bearer | — |
| 4 | `POST` | `/login/refresh` | No | — |
| 5 | `PATCH` | `/usuarios/generar/pin` | Bearer | — |
| 6 | `POST` | `/turnos` | Bearer | — |
| 7 | `PATCH` | `/turnos/{id}` | Bearer | — |
| 8 | `GET` | `/zonas/list` | Bearer | — |
| 9 | `GET` | `/rutas/by-zona/{idZona}` | Bearer | — |
| 10 | `GET` | `/variantes/by-ruta/{idRuta}` | Bearer | — |
| 11 | `POST` | `/viajes` | Bearer | — |
| 12 | `PATCH` | `/viajes/{id}` | Bearer | — |
| 13 | `GET` | `/monederos/numero/serie/{serie}` | Bearer | — |
| 14 | `GET` | `/pasajeros/{id}` | Bearer | — |
| 15 | `POST` | `/transacciones/recarga` | Bearer | `claveIdempotencia` en body |
| 16 | `POST` | `/transacciones/debito` | Bearer | `claveIdempotencia` en body (abre o cierra según `TipoTarifa`) |
| 17 | `POST` | `/posiciones` | Bearer | — |
| 18 | `GET` | `/viajes/viajes-ultima-semana/{serie}` | Bearer | — |

### Constantes definidas en el cliente pero **sin llamada** en runtime

| Path | Nota |
|------|------|
| `PATCH /usuarios/actualizar/validador` | Solo admin / WebApp. El validador reasigna por login. |
| `GET /usuarios/list/rol/operador/{cliente}` | Declarada en config; no se usa. |

---

## 12. API local del dispositivo (no es el backend)

Base: `http://127.0.0.1:8080` — servicio nativo en el hardware del validador. **Sin JWT.**

| Método | Path | Uso |
|--------|------|-----|
| `GET` | `/nfc/m1` | Lectura de tarjeta → `result`, `cardUid` |
| `GET` | `/device/android-id` | Android ID |
| `GET` | `/device/validador-serie` | Serie del validador (`numeroSerieValidador` / `serie`) |

Un integrador de software puro puede mockear estos tres endpoints o inyectar el serial / UID por otra vía.

---

## 13. Checklist para un validador nuevo

1. Resolver `API_BASE_URL` (dev vs prod).
2. Tener un operador rol 3 activo, con cliente y (opcional) PIN.
3. Enviar `validadorId` / `numeroSerieValidador` consistente en login, turno, GPS y cobros.
4. Guardar `token` + `refreshToken` y refrescar ante 401.
5. Abrir turno → elegir variante → abrir viaje antes de débitos de ruta.
6. Enviar GPS usable (coordenadas válidas) en recarga y débito de viaje.
7. Mandar `claveIdempotencia` (UUID) en recarga y en débito; no regenerarla en reintentos del mismo cobro.
8. Para dinámica/estaciones: enviar el **mismo** `POST /transacciones/debito` al subir y al bajar; el API detecta si abre o cobra. No usar PATCH.
9. No depender de correo / teléfono / NetPay en respuestas de monedero para el operador.
10. Migraciones del API al día (en particular `HashAnterior` en bitácora y checks de saldo) antes de apuntar a un entorno nuevo.

---

## 14. Errores frecuentes

| Síntoma | Causa habitual |
|---------|----------------|
| `401 Credenciales invalidas` en login con password correcta | `validadorId` inexistente, inactivo o de otro cliente |
| `401` tras un rato de uso | Access token vencido; falta refresh |
| Recarga / débito rechazados | Falta `claveIdempotencia` o GPS inválido |
| No abre viaje | No hay `turnId` activo |
| Cobro de ruta falla | No hay viaje activo en el validador o la variante no tiene tarifa |
| Segunda validación no cobra | No hay ABIERTA previa, o es el mismo viaje en &lt; 1 min (“Viaje ya iniciado”) |
| `PATCH /transacciones/debito` → 404 | Esperado: esa ruta no existe; el cierre es otro `POST` |
| Insert de bitácora falla en servidor | Falta migración `AddBitacoraHashAnterior` en ese esquema |

---

*Documento generado a partir del consumo real de DashcamValidadorApp. Si el API agrega campos, mantener compatibilidad hacia atrás en los bodies listados arriba.*
