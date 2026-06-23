export enum EstatusEnum {
  ACTIVO = 1, //activo o no usado
  INACTIVO = 0, //inactivo usado
}

export enum TipoCodigoAutenticacion {
  CONFIRMACION_CORREO = 0,
  RECUPERACION_CONTRASENA = 1,
}

export enum EstadoComponente {
  INACTIVO = 0,
  DISPONIBLE = 1,
  ASIGNADO = 2,
  MANTENIMIENTO = 3,
  DANADO = 4,
  RETIRADO = 5,
}

export enum EnumTipoTransaccion {
  RECARGA = 1,
  DEBITO = 2,
  RECHAZO = 3,
}

export enum EnumModulos {
  CLIENTES = 1,
  USUARIOS = 2,
  ROLES = 3,
  PERMISOS = 4,
  MODULOS = 5,
  USUARIOSPERMISOS = 6,
  USUARIOSZONAS = 7,
  USUARIOSINSTALACIONES = 8,
  OPERADORES = 9,
  VEHICULOS = 10,
  VALIDADORES = 11,
  CONTADORES = 12,
  INSTALACIONES = 13,
  TURNOS = 14,
  VIAJES = 15,
  ZONAS = 16,
  RUTAS = 17,
  VARIANTES = 18,
  TARIFAS = 19,
  MONEDEROS = 20,
  PASAJEROS = 21,
  BITACORA = 0,
  CONTEOPASAJEROS = 23,
  POSICIONES = 24,
  TRANSACCIONES = 25,
  ADMINISTRACION = 26,
  MONITOREO = 27,
  VIAJESCONTEOS = 28,
  VIAJESTRANSACCIONES = 29,
  HISTORICOTRANSACCIONES = 30,
  CATALOGOPASAJERO = 31,
  CATMETODOSPAGO = 37
}

export enum EnumSolicitudPasajero {
  NOSOLICITADO = 0,
  SOLICITADO = 1,
  APROBADO = 2,
  RECHAZADO = 3,
}

export enum EnumTipoDescuento {
  PORCENTAJE = 1,
  MONETARIO = 2,
  NULO = 3,
}

export enum EnumEstatusMonederos {
  INACTIVO = 0,
  ACTIVO = 1,
  SUSPENDIDO = 2,
  EXTRAVIADO = 3,
  BLOQUEADO = 4,
}

export enum EnumTipoTarifa {
  ESTACIONARIA = 0,
  INCREMENTAL = 1,
}

export enum EstatusConteo {
  INACTIVO = 0,
  ACTIVO = 1,
}

export enum EnumCategoriaLicencia {
  FEDERAL = 1,
  ESTATAL = 2,
}

export enum EnumTipoLicencia {
  A = 1,
  B = 2,
  C = 3,
  D = 4,
  E = 5,
  F = 6,
}

export enum EnumFiltros {
  ALDIA = 1,
  SEMANA = 2,
  MES = 3,
}

export enum EnumControlTransacciones {
  PAGADO = 0,
  ABIERTA = 1,
}

export enum EnumTipoTarifa {
  FIJA = 1,
  ABIERTA = 2,
  ESTACIONES = 3,
}

export enum EnumTipoDescuentoTransbordo {
  MONETARIO = 1,
  PORCENTAJE = 2,
}

export enum EnumMetodoPago {
  EFECTIVO = 1,
  TRANSFERENCIA = 2,
  TARJETA_CREDITO = 3,
  TARJETA_DEBITO = 4,
}