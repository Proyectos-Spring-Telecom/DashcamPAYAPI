export enum EstadoComponente {
  INACTIVO = 0,
  DISPONIBLE = 1,
  ASIGNADO = 2,
  MANTENIMIENTO = 3,
  DANADO = 4,
  RETIRADO = 5,
}

export enum EstatusEnum {
  ACTIVO = 1, //activo o no usado
  INACTIVO = 0, //inactivo usado
}

export enum TipoCodigoAutenticacion {
  CONFIRMACION_CORREO = 0,
  RECUPERACION_CONTRASENA = 1,
}

export enum TipoTransaccion {
  DEBITO = "DEBITO",
  RECARGA = "RECARGA",
}