# Guía para el app — Recarga de monedero con tarjeta en terminal

Qué debe implementar la app del validador (PAX IM30 / NetPay Smart SDK) para cobrar con tarjeta presencial y abonar el monedero. El API ya expone estos contratos en apidev.

**Pantalla:** Recargar monedero (`/recharge`). Sin rediseño visual: solo cambia el paso de cobro (antes efectivo → ahora cobro TPV + confirmación).

---

## 1. Flujo que debe seguir la app

```
1. Usuario elige monto (20 / 50 / 100 / 200 u otro)
2. Lee monedero por NFC → GET /monederos/numero/serie/{uid}
3. Genera claveIdempotencia (UUID v4) y la guarda en SecureStorage
4. POST /transacciones/recarga/reserva
   └─ Si 4xx → mostrar message y TERMINAR (no cobrar)
5. Guardar pendiente local: { claveIdempotencia, folio, monto, serie }
6. SaleRequest(amount = monto, folio = folio)  ← NetPay Smart SDK
7a. Aprobado → POST /transacciones/recarga (idMetodoPago: 5 + pagoTerminal)
    └─ Reintentar con la MISMA clave si falla red/5xx
7b. Rechazado / cancelado → POST …/reserva/{clave}/cancelar
    └─ Borrar pendiente local
```

Regla de oro: **nunca cobrar la tarjeta si la reserva falló**. **Nunca inventar un `orderId`**: solo el que devolvió el SDK.

---

## 2. Prerrequisitos

| Requisito | Detalle |
|-----------|---------|
| JWT de operador | Roles 1, 2, 3 u 11 (mismo login del validador) |
| `numeroSerieValidador` | Device ID / serie del equipo (como en débitos) |
| NetPay Smart SDK | V1.1.9 (o la versión del proyecto IM30) |
| Base URL | Misma del API (`apidev` / `api`) |
| Headers | `Authorization: Bearer …` + `Content-Type: application/json` |

---

## 3. Paso a paso con contratos

### 3.1 Consultar monedero

`GET /monederos/numero/serie/{uid}` — JWT

- `{uid}` = UID NFC / serie leída.
- Si 404 o monedero inactivo → no continuar.
- Mostrar saldo y confirmar monto.

### 3.2 Reservar (antes de cobrar)

`POST /transacciones/recarga/reserva` — JWT

```json
{
  "claveIdempotencia": "550e8400-e29b-41d4-a716-446655440000",
  "numeroSerieMonedero": "MON-670484-5477",
  "monto": 100.00,
  "numeroSerieValidador": "a22108bc025bea7f",
  "idMetodoPago": 5
}
```

| Campo | Regla |
|-------|--------|
| `claveIdempotencia` | UUID v4 nuevo por intento de cobro. Reutilizar solo en reintentos del **mismo** cobro. |
| `monto` | \> 0, máx. 2 decimales, ≤ tope (10000). |
| `idMetodoPago` | Siempre `5`. |

**200:**

```json
{
  "data": {
    "claveIdempotencia": "550e8400-…",
    "folio": "R1A2B3C4D5E6F7",
    "monto": 100.00,
    "expiraEn": "2026-11-11T22:10:00.000Z"
  }
}
```

- Usar **`data.folio`** en el `SaleRequest` (alfanumérico, ≤ 20). No inventar folio.
- Misma clave otra vez → misma respuesta (idempotente).
- **4xx** → mostrar `message`, **no** llamar al SDK.

### 3.3 Cobro en la TPV (sin API)

```text
SaleRequest(
  packageName = <del proyecto>,
  amount      = monto de la reserva,
  folio       = data.folio
)
```

Antes de llamar al SDK, persistir en SecureStorage:

```json
{
  "claveIdempotencia": "…",
  "folio": "…",
  "monto": 100.00,
  "numeroSerieMonedero": "…",
  "numeroSerieValidador": "…",
  "estado": "COBRANDO"
}
```

Al terminar el SDK, guardar también el `SaleResponse` (o al menos `orderId`, `authCode`, etc.).

| Resultado SDK | Acción |
|---------------|--------|
| Aprobado | Paso 3.4 (confirmar abono) |
| Rechazado / cancelado usuario | Paso 3.5 (cancelar reserva) |
| Timeout / sin respuesta | `CheckStatusRequest(folio)` del SDK → si aprobado, 3.4; si no, 3.5 |

### 3.4 Confirmar abono

`POST /transacciones/recarga` — JWT

```json
{
  "idTipoTransaccion": 1,
  "monto": 100.00,
  "latitudInicial": 18.953314,
  "longitudInicial": -99.235904,
  "numeroSerieMonedero": "MON-670484-5477",
  "numeroSerieValidador": "a22108bc025bea7f",
  "idMetodoPago": 5,
  "claveIdempotencia": "550e8400-e29b-41d4-a716-446655440000",
  "pagoTerminal": {
    "folio": "R1A2B3C4D5E6F7",
    "orderId": "<SaleResponse.orderId>",
    "transactionId": "<SaleResponse.transactionId>",
    "authCode": "<SaleResponse.authCode>",
    "rrn": "<SaleResponse.rrnNumber>",
    "montoCobrado": "100.00",
    "naturalezaTarjeta": "CREDITO",
    "marca": "<SaleResponse.cardTypeName>",
    "bin": "<SaleResponse.bin>",
    "ultimos4": "1234",
    "fechaTransaccion": "<SaleResponse.transDate>",
    "storeId": "<SaleResponse.storeId>",
    "afiliacion": "<SaleResponse.affiliation>",
    "terminal": "<SaleResponse.moduleTerminal>"
  }
}
```

| Campo | Regla |
|-------|--------|
| `idMetodoPago` | `5` (no 3 ni 4) |
| `monto` | Igual al de la reserva |
| `pagoTerminal.folio` | Igual al `folio` de la reserva |
| `pagoTerminal.montoCobrado` | String numérico igual al monto (`"100.00"`) |
| `naturalezaTarjeta` | `"CREDITO"` o `"DEBITO"` |
| PAN / CVV / track / PIN | **Nunca** enviar |

**200:** éxito; leer `data.id` y `data.saldo`. Borrar pendiente local.

**Reintentos:** si falla por red o 5xx, reenviar el **mismo** body (misma `claveIdempotencia`). El API no abona dos veces.

**409 / 4xx de negocio:** mostrar `message`. Si la reserva fue cancelada o el folio no coincide, no inventar otro cobro con la misma clave.

### 3.5 Cancelar reserva

`POST /transacciones/recarga/reserva/{claveIdempotencia}/cancelar` — JWT

- Path: URL-encode de la clave si hace falta.
- **200:** cancelada (o ya estaba cancelada).
- **409:** ya estaba `COMPLETADA` → no cancelar; revisar si el abono ya quedó.
- Tras cancelar, borrar pendiente local.

---

## 4. Pendiente local (obligatorio)

Si el SDK aprueba y el `POST` de confirmación falla (o la app se cierra):

1. Al abrir la app / la pantalla de recarga, leer SecureStorage.
2. Si hay pendiente con `estado = COBRADO_PENDIENTE_ABONO` (o equivalente):
   - Reintentar `POST /transacciones/recarga` con los mismos datos.
   - Si 200 → limpiar y mostrar “Abono completado”.
   - Si sigue fallando → mostrar **“Cobro aprobado, abono pendiente”** con el `folio` para soporte.
3. No volver a ejecutar `SaleRequest` con ese folio/clave.

Estados sugeridos del pendiente:

| Estado | Significado |
|--------|-------------|
| `COBRANDO` | Reserva hecha, SDK en curso |
| `COBRADO_PENDIENTE_ABONO` | SDK OK, falta confirmar en API |
| `COMPLETADO` | Abono OK (borrar) |
| `CANCELADO` | SDK falló / cancelado (borrar tras llamar cancelar) |

---

## 5. Qué no debe hacer la app

- Usar `idMetodoPago` 3 o 4 para este flujo (eso es e-commerce con token).
- Llamar a NetPay e-commerce desde el servidor o enviar `tokenCardNetPay`.
- Cobrar si la reserva respondió 4xx.
- Generar un `folio` propio (siempre el del API).
- Regenerar `claveIdempotencia` al reintentar el mismo cobro.
- Enviar PAN completo, CVV, track o PIN en `pagoTerminal`.

---

## 6. Checklist de implementación

- [ ] Generar y persistir `claveIdempotencia` (UUID) por intento de cobro
- [ ] `GET` monedero por serie/UID antes de reservar
- [ ] `POST …/recarga/reserva` y manejar 4xx sin cobrar
- [ ] Guardar pendiente en SecureStorage **antes** del `SaleRequest`
- [ ] `SaleRequest` con `amount` y `folio` del API
- [ ] Mapear `SaleResponse` → `pagoTerminal` (sin datos sensibles)
- [ ] `POST /transacciones/recarga` con `idMetodoPago: 5`
- [ ] Reintentos idempotentes + recuperación al reabrir la app
- [ ] `…/cancelar` en rechazo/cancelación/timeout negativo
- [ ] Mensajes UX: error de reserva, cobro rechazado, abono pendiente con folio
- [ ] GPS opcional pero recomendado (`latitudInicial` / `longitudInicial`)

---

## 7. Errores frecuentes

| Síntoma | Qué revisar |
|---------|-------------|
| 403 en reserva/confirmación | Rol del JWT no es 1, 2, 3 u 11 |
| 400 monedero / validador | Serie incorrecta, monedero inactivo, cliente distinto |
| 400 folio no coincide | Se alteró el folio entre reserva y confirmación |
| 400 montoCobrado | String distinto al `monto` (usar mismos decimales) |
| 409 al cancelar | La confirmación ya había abonado |
| Doble cobro en TPV | No reintentar `SaleRequest`; solo reintentar el `POST` de abono |

---

## 8. Referencias

- Contrato de API: `docs/Recarga-Tarjeta-Terminal.md`
- Integración general del validador: `docs/Integracion-Validador.md`
- SDK: NetPay Smart SDK (SaleRequest / SaleResponse / CheckStatusRequest)
