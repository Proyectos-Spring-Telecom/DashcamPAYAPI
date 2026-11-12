# Guía para el app — Cobro de pasaje con tarjeta en terminal

Qué debe implementar el validador (PAX IM30 / NetPay Smart SDK) para cobrar el **pasaje** con tarjeta presencial. Solo aplica a rutas de **tarifa fija** (`tipoTarifa = 1`). NFC/QR siguen con `POST /transacciones/debito` sin cambios.

Patrón igual que la recarga TPV: **reserva → SaleRequest → registro / cancelar**.

---

## 1. Cuándo habilitar el botón

Con viaje activo:

1. `GET /viajes/{idViaje}` → `data.idVariante`
2. `GET /tarifas/variante/{idVariante}` → `data[0].tipoTarifa`, `data[0].tarifaBase`

| `tipoTarifa` | Cobro con tarjeta |
|---|---|
| **1 Fija** | Habilitado |
| **2 Dinámica / 3 Estaciones** | Deshabilitado (“solo tarifa fija”) |

El API vuelve a validar: si no es fija → 400 `"El cobro con tarjeta solo aplica a rutas de tarifa fija"`.

---

## 2. Flujo

```
1. Operador elige cantidad de pasajes (1–10)
2. Genera claveIdempotencia (UUID) y la guarda en SecureStorage
3. POST /transacciones/debito/tarjeta/reserva
   └─ 4xx → mostrar message y NO cobrar
4. Guardar pendiente { clave, folio, monto, idViaje, cantidad }
5. SaleRequest(amount = data.monto, folio = data.folio)
6a. Aprobado → POST /transacciones/debito/tarjeta (+ pagoTerminal)
6b. Rechazo/cancel → POST …/reserva/{clave}/cancelar
```

Timeout del SDK → `CheckStatusRequest(folio)` → aprobado: registrar; si no: cancelar.

---

## 3. Endpoints

### 3.1 Reserva

`POST /transacciones/debito/tarjeta/reserva` — JWT (roles 1, 2, 3, 11)

```json
{
  "claveIdempotencia": "550e8400-e29b-41d4-a716-446655440000",
  "idViaje": 123,
  "numeroSerieValidador": "a22108bc025bea7f",
  "cantidadPasajes": 1,
  "idMetodoPago": 5
}
```

**El monto lo calcula el API** (`tarifaBase × cantidadPasajes`). La app no lo envía.

**200:**

```json
{
  "data": {
    "claveIdempotencia": "550e8400-…",
    "folio": "P1A2B3C4D5E6F7",
    "monto": 12.00,
    "expiraEn": "2026-11-11T22:10:00.000Z"
  }
}
```

Usar `data.folio` y `data.monto` en el `SaleRequest`.

### 3.2 Confirmar

`POST /transacciones/debito/tarjeta` — JWT

```json
{
  "claveIdempotencia": "550e8400-…",
  "idViaje": 123,
  "numeroSerieValidador": "a22108bc025bea7f",
  "cantidadPasajes": 1,
  "monto": 12.00,
  "latitud": 18.953314,
  "longitud": -99.235904,
  "idMetodoPago": 5,
  "pagoTerminal": {
    "folio": "P1A2B3C4D5E6F7",
    "orderId": "<SaleResponse.orderId>",
    "transactionId": "<SaleResponse.transactionId>",
    "authCode": "<SaleResponse.authCode>",
    "rrn": "<SaleResponse.rrnNumber>",
    "montoCobrado": "12.00",
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

- Sin monedero / `idCard`.
- `pagoTerminal` igual que en recarga (sin PAN/CVV/track/PIN).
- `monto` y `pagoTerminal.montoCobrado` = monto de la reserva.
- Idempotente: misma clave → 200 sin registrar dos veces.
- Si el viaje se cerró entre reserva y confirmación, el API **igual acepta** el registro.

**200:** `{ data: { id, monto, cantidadPasajes }, message: "Pasaje cobrado con tarjeta" }`

### 3.3 Cancelar

`POST /transacciones/debito/tarjeta/reserva/{claveIdempotencia}/cancelar`

- 200 cancelada (idempotente).
- 409 si ya `COMPLETADA`.

---

## 4. Pendiente local

Igual que recarga: persistir antes del SDK; si el cobro aprueba y el `POST` falla, reintentar confirmación con la **misma** clave al reabrir. **Nunca** repetir `SaleRequest` con ese folio.

---

## 5. Checklist

- [ ] Mostrar “Cobro con tarjeta” solo si `tipoTarifa === 1`
- [ ] Reserva antes de cobrar; 4xx sin SDK
- [ ] `SaleRequest` con folio y monto del API
- [ ] Confirmar con `pagoTerminal` / cancelar si falla
- [ ] SecureStorage + recuperación de pendientes
- [ ] No usar `POST /transacciones/debito` (NFC) para este flujo

---

## 6. Referencias API

- Migración: `1737900016000-DebitoTarjetaTerminal`
- Recarga TPV (mismo `pagoTerminal`): `docs/App-Recarga-Tarjeta-Terminal.md`
