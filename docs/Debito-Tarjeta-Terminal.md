# API — Cobro de pasaje con tarjeta en terminal (TPV)

Implementación de la propuesta 2026-11-11.

## Endpoints

| Método | Path | Uso |
|--------|------|-----|
| `POST` | `/transacciones/debito/tarjeta/reserva` | Reserva (tarifa fija, calcula monto) |
| `POST` | `/transacciones/debito/tarjeta` | Confirma abono (no cobra NetPay) |
| `POST` | `/transacciones/debito/tarjeta/reserva/{clave}/cancelar` | Cancela reserva |

Roles: 1, 2, 3, 11. Solo `TipoTarifa = 1`.

## Migración

```bash
npm run migration:run
```

Incluye `ReservasDebitoTarjeta` y columnas TPV / monedero nullable en `TransaccionesDebito`.

## Guía app

`docs/App-Cobro-Pasaje-Tarjeta.md`
