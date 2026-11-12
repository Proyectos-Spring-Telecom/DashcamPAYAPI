# Recarga de monedero con tarjeta en terminal (TPV)

Contrato implementado en el API según la propuesta del 2026-11-11.

## Flujo

1. `POST /transacciones/recarga/reserva` → valida monedero/tope/validador, crea `ReservasRecarga` `EN_PROCESO` con `folio`.
2. La app cobra en la TPV con `SaleRequest(monto, folio)` (NetPay Smart SDK). **El API no cobra.**
3. Si aprueba → `POST /transacciones/recarga` con `idMetodoPago: 5` + `pagoTerminal`.
4. Si rechaza/cancela → `POST /transacciones/recarga/reserva/{claveIdempotencia}/cancelar`.

## Método de pago

`EnumMetodoPago.TARJETA_TERMINAL = 5` — “Tarjeta presencial (TPV)”. Roles: 1, 2, 3, 11.

## Endpoints

### Reserva

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

**200:** `{ data: { claveIdempotencia, folio, monto, expiraEn } }`

### Confirmación

`POST /transacciones/recarga` — JWT, `idMetodoPago: 5` + `pagoTerminal` (folio, orderId, montoCobrado, naturalezaTarjeta, …). Idempotente por `claveIdempotencia`.

### Cancelación

`POST /transacciones/recarga/reserva/{claveIdempotencia}/cancelar` — JWT. 409 si ya `COMPLETADA`.

## Migración

Correr `1737900015000-RecargaTarjetaTerminal` antes de desplegar:

```bash
npm run migration:run
```

Agrega catálogo id 5, columnas de reserva (`Folio`, `Origen`, …) y evidencia TPV en `TransaccionesRecarga`.

## Conciliación

El job cada 5 min sigue barrendo `EN_PROCESO` vencidas y `PENDIENTE_CONCILIAR`. Para TPV, sin consulta NetPay por `folio` todavía, una reserva vencida sin abono queda en `PENDIENTE_CONCILIAR` (revisión manual), no se cancela sola.
