import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateViajeDto } from './dto/create-viaje.dto';
import { Viajes } from 'src/entities/Viajes';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';

@Injectable()
export class ViajesService {
  constructor(
    @InjectRepository(Viajes)
    private readonly viajesRepository: Repository<Viajes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  async create(
    idUser: number,
    createViajeDto: CreateViajeDto,
  ): Promise<ApiCrudResponse> {
    try {
      const newViaje = await this.viajesRepository.create(createViajeDto);
      const viajeSave = await this.viajesRepository.save(newViaje);

      // Registro en la bitácora SUCCESS
      const querylogger = { createViajeDto };
      await this.bitacoraLogger.logToBitacora(
        'Viajes',
        `Se creó un viaje con ID: ${viajeSave.id}`,
        'CREATE',
        querylogger,
        idUser,
        15,
        EstatusEnumBitcora.SUCCESS,
      );

      // API response SUCCESS
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Viaje creado correctamente',
        data: {
          id: Number(viajeSave.id),
          nombre: `Cliente ID: ${viajeSave.idCliente}, Turno ID: ${viajeSave.idTurno}, Variante ID: ${viajeSave.idVariante}, Operador ID: ${viajeSave.idOperador}`,
        },
      };

      return result;
    } catch (error) {
      // Registro en la bitácora SUCCESS
      const querylogger = { createViajeDto };
      await this.bitacoraLogger.logToBitacora(
        'Viajes',
        `Se creó un viaje con client ID: ${createViajeDto.idCliente} Turno ID: ${createViajeDto.idTurno}, Variante ID: ${createViajeDto.idvariante}, Operador ID: ${createViajeDto.idOperador}`,
        'CREATE',
        querylogger,
        idUser,
        15,
        EstatusEnumBitcora.SUCCESS,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al crear un viaje',
        error: error.message,
      });
    }
  }

  private async consultarViajesListado(cliente: number) {
    const query = `
SELECT
  -- Viaje
  v.Id AS id,
  v.Inicio AS inicio,
  v.Fin AS fin,
  v.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,

  -- Turno
  t.Id AS idTurno,
  t.Inicio AS inicioTurno,
  t.IdInstalacion AS idInstalacion,

  -- Instalación
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  i.IdContador AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  i.IdVehiculo AS idVehiculo,
  vh.Placa AS placaVehiculo,

  -- Operador
  o.Id AS idOperador,
  o.NumeroLicencia AS numeroLicenciaOperador,
  o.IdUsuario AS idUsuario,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador,

  -- Variante
  var.Id AS idVariante,
  var.Nombre AS nombreVariante,
  var.PuntoInicio AS puntoInicioVariante,
  var.PuntoFin AS puntoFinVariante,
  var.DistanciaKm AS distanciaKmVariante,

  -- Ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.IdZona AS idZona,
  zonaInicio.Nombre AS nombreZonaInicio,
  ru.IdZonaFin AS idZonaFin,
  zonaFin.Nombre AS nombreZonaFin

FROM Viajes v
JOIN Clientes c ON v.IdCliente = c.Id
JOIN Turnos t ON v.IdTurno = t.Id
JOIN Instalaciones i ON t.IdInstalacion = i.Id
JOIN Validadores d ON i.IdCliente = d.IdCliente AND i.IdValidador = d.Id
JOIN Contadores b ON i.IdCliente = b.IdCliente AND i.IdContador = b.Id
JOIN Vehiculos vh ON i.IdCliente = vh.IdCliente AND i.IdVehiculo = vh.Id
JOIN Operadores o ON v.IdOperador = o.Id
JOIN Usuarios u ON o.IdUsuario = u.Id
JOIN Variantes var ON v.IdVariante = var.Id
JOIN Rutas ru ON var.IdRuta = ru.Id
LEFT JOIN Zonas zonaInicio ON ru.IdZona = zonaInicio.Id
LEFT JOIN Zonas zonaFin ON ru.IdZonaFin = zonaFin.Id

WHERE v.Estatus = 1
  AND c.Id = ?
  AND c.Estatus = 1

ORDER BY v.Id DESC


    `;
    return this.viajesRepository.query(query, [cliente]);
  }

  async findAllList(cliente: number, rol: number) {
    try {
      let viajes;
      switch (rol) {
        case 1:
          viajes = await this.viajesRepository.query(
            `
SELECT
  -- Viaje
  v.Id AS id,
  v.Inicio AS inicio,
  v.Fin AS fin,
  v.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,

  -- Turno
  t.Id AS idTurno,
  t.Inicio AS inicioTurno,
  t.IdInstalacion AS idInstalacion,

  -- Instalación
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  i.IdContador AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  i.IdVehiculo AS idVehiculo,
  vh.Placa AS placaVehiculo,

  -- Operador
  o.Id AS idOperador,
  o.NumeroLicencia AS numeroLicenciaOperador,
  o.IdUsuario AS idUsuario,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador,

  -- Variante
  var.Id AS idVariante,
  var.Nombre AS nombreVariante,
  var.PuntoInicio AS puntoInicioVariante,
  var.PuntoFin AS puntoFinVariante,
  var.DistanciaKm AS distanciaKmVariante,

  -- Ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.IdZona AS idZona,
  zonaInicio.Nombre AS nombreZonaInicio,
  ru.IdZonaFin AS idZonaFin,
  zonaFin.Nombre AS nombreZonaFin

FROM Viajes v
JOIN Clientes c ON v.IdCliente = c.Id
JOIN Turnos t ON v.IdTurno = t.Id
JOIN Instalaciones i ON t.IdInstalacion = i.Id
JOIN Validadores d ON i.IdCliente = d.IdCliente AND i.IdValidador = d.Id
JOIN Contadores b ON i.IdCliente = b.IdCliente AND i.IdContador = b.Id
JOIN Vehiculos vh ON i.IdCliente = vh.IdCliente AND i.IdVehiculo = vh.Id
JOIN Operadores o ON v.IdOperador = o.Id
JOIN Usuarios u ON o.IdUsuario = u.Id
JOIN Variantes var ON v.IdVariante = var.Id
JOIN Rutas ru ON var.IdRuta = ru.Id
LEFT JOIN Zonas zonaInicio ON ru.IdZona = zonaInicio.Id
LEFT JOIN Zonas zonaFin ON ru.IdZonaFin = zonaFin.Id

WHERE v.Estatus = 1
AND c.Estatus = 1


ORDER BY v.Id DESC
            `,
          );
          break;

        default:
          viajes = await this.consultarViajesListado(cliente);
          break;
      }

      const data = viajes.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
        idTurno: Number(item.idTurno),
        idInstalacion: Number(item.idInstalacion),
        idValidador: Number(item.idValidador),
        idContador: Number(item.idContador),
        idVehiculo: Number(item.idVehiculo),
        idOperador: Number(item.idOperador),
        idUsuario: Number(item.idUsuario),
        idVariante: Number(item.idVariante),
        distanciaKmVariante:
          item.distanciaKmVariante !== null
            ? Number(item.distanciaKmVariante)
            : null,
        idRuta: Number(item.idRuta),
        idZona: Number(item.idZona),
        idZonaFin:
          item.idZonaFin !== null ? Number(item.idZonaFin) : null,
      }));

      //APi response
      const result: ApiResponseCommon = {
        data: data,
      };

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener paginado viajes',
        error: error.message,
      });
    }
  }

  private async consultarViajesPaginado(
    cliente: number,
    limit: number,
    offset: number,
  ) {
    const query = `
SELECT
  -- Viaje
  v.Id AS id,
  v.Inicio AS inicio,
  v.Fin AS fin,
  v.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,

  -- Turno
  t.Id AS idTurno,
  t.Inicio AS inicioTurno,
  t.IdInstalacion AS idInstalacion,

  -- Instalación
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  i.IdContador AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  i.IdVehiculo AS idVehiculo,
  vh.Placa AS placaVehiculo,

  -- Operador
  o.Id AS idOperador,
  o.NumeroLicencia AS numeroLicenciaOperador,
  o.IdUsuario AS idUsuario,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador,

  -- Variante
  var.Id AS idVariante,
  var.Nombre AS nombreVariante,
  var.PuntoInicio AS puntoInicioVariante,
  var.PuntoFin AS puntoFinVariante,
  var.DistanciaKm AS distanciaKmVariante,

  -- Ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.IdZona AS idZona,
  zonaInicio.Nombre AS nombreZonaInicio,
  ru.IdZonaFin AS idZonaFin,
  zonaFin.Nombre AS nombreZonaFin

FROM Viajes v
JOIN Clientes c ON v.IdCliente = c.Id
JOIN Turnos t ON v.IdTurno = t.Id
JOIN Instalaciones i ON t.IdInstalacion = i.Id
JOIN Validadores d ON i.IdCliente = d.IdCliente AND i.IdValidador = d.Id
JOIN Contadores b ON i.IdCliente = b.IdCliente AND i.IdContador = b.Id
JOIN Vehiculos vh ON i.IdCliente = vh.IdCliente AND i.IdVehiculo = vh.Id
JOIN Operadores o ON v.IdOperador = o.Id
JOIN Usuarios u ON o.IdUsuario = u.Id
JOIN Variantes var ON v.IdVariante = var.Id
JOIN Rutas ru ON var.IdRuta = ru.Id
LEFT JOIN Zonas zonaInicio ON ru.IdZona = zonaInicio.Id
LEFT JOIN Zonas zonaFin ON ru.IdZonaFin = zonaFin.Id

WHERE c.Id = ?
  AND c.Estatus = 1

ORDER BY v.Id DESC

  LIMIT ? OFFSET ?;
    `;
    return this.viajesRepository.query(query, [cliente, limit, offset]);
  }

  private async consultarTotalRutasPaginados(cliente: number) {
    const query = `  
SELECT COUNT(*) AS total
FROM Viajes v
JOIN Clientes c ON v.IdCliente = c.Id
JOIN Turnos t ON v.IdTurno = t.Id
JOIN Instalaciones i ON t.IdInstalacion = i.Id
JOIN Validadores d ON i.IdCliente = d.IdCliente AND i.IdValidador = d.Id
JOIN Contadores b ON i.IdCliente = b.IdCliente AND i.IdContador = b.Id
JOIN Vehiculos vh ON i.IdCliente = vh.IdCliente AND i.IdVehiculo = vh.Id
JOIN Operadores o ON v.IdOperador = o.Id
JOIN Usuarios u ON o.IdUsuario = u.Id
JOIN Variantes var ON v.IdVariante = var.Id
JOIN Rutas ru ON var.IdRuta = ru.Id
LEFT JOIN Zonas zonaInicio ON ru.IdZona = zonaInicio.Id
LEFT JOIN Zonas zonaFin ON ru.IdZonaFin = zonaFin.Id

WHERE c.Id = ?
  AND c.Estatus = 1
`;
    return await this.viajesRepository.query(query, [cliente]);
  }

  async findAll(
    cliente: number,
    rol: number,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let totalResult;
      let viajes;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          viajes = await this.viajesRepository.query(
            `
SELECT
  -- Viaje
  v.Id AS id,
  v.Inicio AS inicio,
  v.Fin AS fin,
  v.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,

  -- Turno
  t.Id AS idTurno,
  t.Inicio AS inicioTurno,
  t.IdInstalacion AS idInstalacion,

  -- Instalación
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  i.IdContador AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  i.IdVehiculo AS idVehiculo,
  vh.Placa AS placaVehiculo,

  -- Operador
  o.Id AS idOperador,
  o.NumeroLicencia AS numeroLicenciaOperador,
  o.IdUsuario AS idUsuario,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador,

  -- Variante
  var.Id AS idVariante,
  var.Nombre AS nombreVariante,
  var.PuntoInicio AS puntoInicioVariante,
  var.PuntoFin AS puntoFinVariante,
  var.DistanciaKm AS distanciaKmVariante,

  -- Ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.IdZona AS idZona,
  zonaInicio.Nombre AS nombreZonaInicio,
  ru.IdZonaFin AS idZonaFin,
  zonaFin.Nombre AS nombreZonaFin

FROM Viajes v
JOIN Clientes c ON v.IdCliente = c.Id
JOIN Turnos t ON v.IdTurno = t.Id
JOIN Instalaciones i ON t.IdInstalacion = i.Id
JOIN Validadores d ON i.IdCliente = d.IdCliente AND i.IdValidador = d.Id
JOIN Contadores b ON i.IdCliente = b.IdCliente AND i.IdContador = b.Id
JOIN Vehiculos vh ON i.IdCliente = vh.IdCliente AND i.IdVehiculo = vh.Id
JOIN Operadores o ON v.IdOperador = o.Id
JOIN Usuarios u ON o.IdUsuario = u.Id
JOIN Variantes var ON v.IdVariante = var.Id
JOIN Rutas ru ON var.IdRuta = ru.Id
LEFT JOIN Zonas zonaInicio ON ru.IdZona = zonaInicio.Id
LEFT JOIN Zonas zonaFin ON ru.IdZonaFin = zonaFin.Id

WHERE c.Estatus = 1

ORDER BY v.Id DESC

  LIMIT ? OFFSET ?;
            `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.viajesRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Viajes v
JOIN Clientes c ON v.IdCliente = c.Id
JOIN Turnos t ON v.IdTurno = t.Id
JOIN Instalaciones i ON t.IdInstalacion = i.Id
JOIN Validadores d ON i.IdCliente = d.IdCliente AND i.IdValidador = d.Id
JOIN Contadores b ON i.IdCliente = b.IdCliente AND i.IdContador = b.Id
JOIN Vehiculos vh ON i.IdCliente = vh.IdCliente AND i.IdVehiculo = vh.Id
JOIN Operadores o ON v.IdOperador = o.Id
JOIN Usuarios u ON o.IdUsuario = u.Id
JOIN Variantes var ON v.IdVariante = var.Id
JOIN Rutas ru ON var.IdRuta = ru.Id
LEFT JOIN Zonas zonaInicio ON ru.IdZona = zonaInicio.Id
LEFT JOIN Zonas zonaFin ON ru.IdZonaFin = zonaFin.Id

WHERE c.Estatus = 1
  `,
          );
          break;

        default:
          // Consulta de datos paginados Usuario Administrador
          viajes = await this.consultarViajesPaginado(cliente, limit, offset);

          totalResult = await this.consultarTotalRutasPaginados(cliente);
          break;
      }

      const data = viajes.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
        idTurno: Number(item.idTurno),
        idInstalacion: Number(item.idInstalacion),
        idValidador: Number(item.idValidador),
        idContador: Number(item.idContador),
        idVehiculo: Number(item.idVehiculo),
        idOperador: Number(item.idOperador),
        idUsuario: Number(item.idUsuario),
        idVariante: Number(item.idVariante),
        distanciaKmVariante:
          item.distanciaKmVariante !== null
            ? Number(item.distanciaKmVariante)
            : null,
        idRuta: Number(item.idRuta),
        idZona: Number(item.idZona),
        idZonaFin:
          item.idZonaFin !== null ? Number(item.idZonaFin) : null,
      }));

      const total = Number(totalResult[0]?.total || 0);

      //APi response
      const result: ApiResponseCommon = {
        data: data,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener paginado de viajes',
        error: error.message,
      });
    }
  }

  private async consultarViajesOne(cliente: number, id: number) {
    const query = `
SELECT
  -- Viaje
  v.Id AS id,
  v.Inicio AS inicio,
  v.Fin AS fin,
  v.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,

  -- Turno
  t.Id AS idTurno,
  t.Inicio AS inicioTurno,
  t.IdInstalacion AS idInstalacion,

  -- Instalación
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  i.IdContador AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  i.IdVehiculo AS idVehiculo,
  vh.Placa AS placaVehiculo,

  -- Operador
  o.Id AS idOperador,
  o.NumeroLicencia AS numeroLicenciaOperador,
  o.IdUsuario AS idUsuario,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador,

  -- Variante
  var.Id AS idVariante,
  var.Nombre AS nombreVariante,
  var.PuntoInicio AS puntoInicioVariante,
  var.PuntoFin AS puntoFinVariante,
  var.DistanciaKm AS distanciaKmVariante,

  -- Ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.IdZona AS idZona,
  zonaInicio.Nombre AS nombreZonaInicio,
  ru.IdZonaFin AS idZonaFin,
  zonaFin.Nombre AS nombreZonaFin

FROM Viajes v
JOIN Clientes c ON v.IdCliente = c.Id
JOIN Turnos t ON v.IdTurno = t.Id
JOIN Instalaciones i ON t.IdInstalacion = i.Id
JOIN Validadores d ON i.IdCliente = d.IdCliente AND i.IdValidador = d.Id
JOIN Contadores b ON i.IdCliente = b.IdCliente AND i.IdContador = b.Id
JOIN Vehiculos vh ON i.IdCliente = vh.IdCliente AND i.IdVehiculo = vh.Id
JOIN Operadores o ON v.IdOperador = o.Id
JOIN Usuarios u ON o.IdUsuario = u.Id
JOIN Variantes var ON v.IdVariante = var.Id
JOIN Rutas ru ON var.IdRuta = ru.Id
LEFT JOIN Zonas zonaInicio ON ru.IdZona = zonaInicio.Id
LEFT JOIN Zonas zonaFin ON ru.IdZonaFin = zonaFin.Id

WHERE c.Id = ?
  AND c.Estatus = 1
  AND v.Id = ?

ORDER BY v.Id DESC
    `;
    return this.viajesRepository.query(query, [cliente, id]);
  }

  async findOne(id: number, cliente: number, rol: number) {
    try {
      let viajes;
      switch (rol) {
        case 1:
          viajes = await this.viajesRepository.query(
            `
SELECT
  -- Viaje
  v.Id AS id,
  v.Inicio AS inicio,
  v.Fin AS fin,
  v.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,

  -- Turno
  t.Id AS idTurno,
  t.Inicio AS inicioTurno,
  t.IdInstalacion AS idInstalacion,

  -- Instalación
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  i.IdContador AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  i.IdVehiculo AS idVehiculo,
  vh.Placa AS placaVehiculo,

  -- Operador
  o.Id AS idOperador,
  o.NumeroLicencia AS numeroLicenciaOperador,
  o.IdUsuario AS idUsuario,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador,

  -- Variante
  var.Id AS idVariante,
  var.Nombre AS nombreVariante,
  var.PuntoInicio AS puntoInicioVariante,
  var.PuntoFin AS puntoFinVariante,
  var.DistanciaKm AS distanciaKmVariante,

  -- Ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.IdZona AS idZona,
  zonaInicio.Nombre AS nombreZonaInicio,
  ru.IdZonaFin AS idZonaFin,
  zonaFin.Nombre AS nombreZonaFin

FROM Viajes v
JOIN Clientes c ON v.IdCliente = c.Id
JOIN Turnos t ON v.IdTurno = t.Id
JOIN Instalaciones i ON t.IdInstalacion = i.Id
JOIN Validadores d ON i.IdCliente = d.IdCliente AND i.IdValidador = d.Id
JOIN Contadores b ON i.IdCliente = b.IdCliente AND i.IdContador = b.Id
JOIN Vehiculos vh ON i.IdCliente = vh.IdCliente AND i.IdVehiculo = vh.Id
JOIN Operadores o ON v.IdOperador = o.Id
JOIN Usuarios u ON o.IdUsuario = u.Id
JOIN Variantes var ON v.IdVariante = var.Id
JOIN Rutas ru ON var.IdRuta = ru.Id
LEFT JOIN Zonas zonaInicio ON ru.IdZona = zonaInicio.Id
LEFT JOIN Zonas zonaFin ON ru.IdZonaFin = zonaFin.Id

WHERE c.Estatus = 1
  AND v.Id = ?

ORDER BY v.Id DESC
            `,
            [id],
          );
          break;

        default:
          viajes = await this.consultarViajesOne(cliente, id)
          break;
      }

      if (viajes.length === 0) {
        throw new NotFoundException('No se encontraron viajes.');
      }

      const viaje = viajes[0];

      const data = {
        ...viaje,
        id: Number(viaje.id),
        idCliente: Number(viaje.idCliente),
        idTurno: Number(viaje.idTurno),
        idInstalacion: Number(viaje.idInstalacion),
        idValidador: Number(viaje.idValidador),
        idContador: Number(viaje.idContador),
        idVehiculo: Number(viaje.idVehiculo),
        idOperador: Number(viaje.idOperador),
        idUsuario: Number(viaje.idUsuario),
        idVariante: Number(viaje.idVariante),
        distanciaKmVariante:
          viaje.distanciaKmVariante !== null
            ? Number(viaje.distanciaKmVariante)
            : null,
        idRuta: Number(viaje.idRuta),
        idZona: Number(viaje.idZona),
        idZonaFin:
          viaje.idZonaFin !== null ? Number(viaje.idZonaFin) : null,
      };

      //APi response
      const result: ApiResponseCommon = {
        data: data,
      };

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener un viaje',
        error: error.message,
      });
    }
  }
}
