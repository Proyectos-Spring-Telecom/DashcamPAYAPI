export enum EstadoTransaccion {
  INICIADA = 'INICIADA',
  VALIDANDO_SALDO = 'VALIDANDO_SALDO',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
  FINALIZADA = 'FINALIZADA',
  ERROR = 'ERROR',
}

export enum EventoTransaccion {
  CREAR = 'CREAR',
  SALDO_OK = 'SALDO_OK',
  SALDO_INSUFICIENTE = 'SALDO_INSUFICIENTE',
  FINALIZAR = 'FINALIZAR',
  FALLA = 'FALLA',
}

export function transicionarEstado(
  estadoActual: EstadoTransaccion,
  evento: EventoTransaccion,
): EstadoTransaccion {
  switch (estadoActual) {
    case EstadoTransaccion.INICIADA:
      if (evento === EventoTransaccion.CREAR) return EstadoTransaccion.VALIDANDO_SALDO;
      break;
    case EstadoTransaccion.VALIDANDO_SALDO:
      if (evento === EventoTransaccion.SALDO_OK) return EstadoTransaccion.APROBADA;
      if (evento === EventoTransaccion.SALDO_INSUFICIENTE) return EstadoTransaccion.RECHAZADA;
      break;
    case EstadoTransaccion.APROBADA:
    case EstadoTransaccion.RECHAZADA:
      if (evento === EventoTransaccion.FINALIZAR) return EstadoTransaccion.FINALIZADA;
      break;
    case EstadoTransaccion.ERROR:
      return EstadoTransaccion.ERROR;
  }
  return EstadoTransaccion.ERROR;
}
