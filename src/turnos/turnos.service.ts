import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateTurnoDto } from './dto/create-turno.dto';
import { UpdateTurnoDto } from './dto/update-turno.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Turnos } from 'src/entities/Turnos';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { UpdateTurnosEstatusDto } from './dto/update-turno-estatus.dto';
import { Clientes } from 'src/entities/Clientes';

@Injectable()
export class TurnosService {
  constructor(
    @InjectRepository(Turnos)
    private readonly turnosRepository: Repository<Turnos>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  async create(
    idUser: number,
    createTurnoDto: CreateTurnoDto,
  ): Promise<ApiCrudResponse> {
    try {
      //Creamos el turno
      const newTurno = await this.turnosRepository.create(createTurnoDto);
      const turnoSave = await this.turnosRepository.save(newTurno);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createTurnoDto };
      await this.bitacoraLogger.logToBitacora(
        'Turnos',
        `El turno con ID: ${turnoSave.id} fue creado correctamente.`,
        'CREATE',
        querylogger,
        idUser,
        14,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El turno ha sido creado con éxito.',
        data: {
          id: Number(turnoSave.id),
          nombre:
            `id turno: ${turnoSave.id}, IdCliente: ${turnoSave.idCliente},  IdOperador: ${turnoSave.idOperador}, IdInstalacion: ${turnoSave.idInstalacion} ` ||
            '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createTurnoDto };
      await this.bitacoraLogger.logToBitacora(
        'Turnos',
        `El turno con ID fue creado correctamente.`,
        'CREATE',
        querylogger,
        idUser,
        14,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Hubo un problema al crear el turno.`,
        error: error.message,
      });
    }
  }

  //funcion para obtener los clientes hijos
  private async clienteHijos(cliente: number) {
    const clientesFiltrado = await this.clienteRepository.query(
      `CALL spGetClientes(?);`,
      [cliente],
    );

    const idsFiltrados = clientesFiltrado[0]; // El primer índice contiene los resultados
    const ids = idsFiltrados
      .map((clientesFiltrado: any) => Number(clientesFiltrado.Id))
      .filter(Boolean);
    if (ids.length === 0) {
      return { data: [] }; // No hay clientes que consultar
    }

    // 3. Construir el query dinámico con los IDs
    const placeholders = ids.map(() => '?').join(', ');
    return { ids, placeholders };
  }

    private async consultarTurnoPaginado(
    cliente: number,
    limit: number,
    offset: number,
  ) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT
  -- Turno
  t.Id AS id,
  t.Inicio AS inicio,
  t.Fin AS fin,
  t.FechaCreacion AS fechaCreacion,
  t.FechaActualizacion AS fechaActualizacion,
  t.Estatus AS estatus,

  -- Instalación
  i.Id AS idInstalacion,
  i.FechaCreacion AS fechaCreacionInstalacion,
  i.FechaActualizacion AS fechaActualizacionInstalacion,
  i.Estatus AS estatusInstalacion,

  -- Validador
  d.Id AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contador
  b.Id AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  b.Marca AS marcaContador,
  b.Modelo AS modeloContador,

  -- Vehículo
  v.Id AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,

  -- Operador
  o.Id AS idOperador,
  o.NumeroLicencia AS numeroLicencia,
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id
INNER JOIN Contadores b ON i.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
INNER JOIN Clientes c ON t.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

ORDER BY t.Id DESC
  LIMIT ? OFFSET ?;
   `;
    return this.turnosRepository.query(query, [...ids, limit, offset]);
  }

  private async consultarTotalTurnosPaginados(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `  
  SELECT COUNT(*) AS total
FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id
INNER JOIN Contadores b ON i.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
INNER JOIN Clientes c ON t.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  
`;
    return await this.turnosRepository.query(query, [...ids]);
  }

  async findAll(
    idUser: number,
    cliente: number,
    rol: number,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let totalResult;
      let turnos;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador
          turnos = await this.turnosRepository.query(
            `
SELECT
  -- Turno
  t.Id AS id,
  t.Inicio AS inicio,
  t.Fin AS fin,
  t.FechaCreacion AS fechaCreacion,
  t.FechaActualizacion AS fechaActualizacion,
  t.Estatus AS estatus,

  -- Instalación
  i.Id AS idInstalacion,
  i.FechaCreacion AS fechaCreacionInstalacion,
  i.FechaActualizacion AS fechaActualizacionInstalacion,
  i.Estatus AS estatusInstalacion,

  -- Validador
  d.Id AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contador
  b.Id AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  b.Marca AS marcaContador,
  b.Modelo AS modeloContador,

  -- Vehículo
  v.Id AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,

  -- Operador
  o.Id AS idOperador,
  o.NumeroLicencia AS numeroLicencia,
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id
INNER JOIN Contadores b ON i.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
INNER JOIN Clientes c ON t.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id



ORDER BY t.Id DESC
  LIMIT ? OFFSET ?;
            `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.turnosRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id
INNER JOIN Contadores b ON i.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
INNER JOIN Clientes c ON t.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id


  `,
          );
          break;

        case 2:
          // Usuario SuperAdministrador
          turnos = await this.consultarTurnoPaginado(cliente,limit,offset)

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalTurnosPaginados(cliente)
          break;

        case 8:
          // Usuario 
          turnos = await this.consultarTurnoPaginado(cliente,limit,offset)

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalTurnosPaginados(cliente)
          break;
        
        case 10:
          // Usuario 
          turnos = await this.consultarTurnoPaginado(cliente,limit,offset)

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalTurnosPaginados(cliente)
          break;

        default:
          turnos = await this.turnosRepository.query(
            `
SELECT
  -- Turno
  t.Id AS id,
  t.Inicio AS inicio,
  t.Fin AS fin,
  t.FechaCreacion AS fechaCreacion,
  t.FechaActualizacion AS fechaActualizacion,
  t.Estatus AS estatus,

  -- Instalación
  i.Id AS idInstalacion,
  i.FechaCreacion AS fechaCreacionInstalacion,
  i.FechaActualizacion AS fechaActualizacionInstalacion,
  i.Estatus AS estatusInstalacion,

  -- Validador
  d.Id AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contador
  b.Id AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  b.Marca AS marcaContador,
  b.Modelo AS modeloContador,

  -- Vehículo
  v.Id AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,

  -- Operador
  o.Id AS idOperador,
  o.NumeroLicencia AS numeroLicencia,
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM UsuariosInstalaciones ui
INNER JOIN Instalaciones i ON ui.IdInstalacion = i.Id
INNER JOIN Turnos t ON t.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN Contadores b ON i.IdContador = b.Id AND i.IdCliente = b.IdCliente
LEFT JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
LEFT JOIN Operadores o ON t.IdOperador = o.Id
LEFT JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE 
  ui.IdUsuario = ?        -- 🔹 filtra por usuario
  AND ui.Estatus = 1
  AND i.Estatus = 1

ORDER BY t.Inicio DESC

  LIMIT ? OFFSET ?;
            `,
            [idUser, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.turnosRepository.query(
            `
  SELECT COUNT(*) AS total
FROM UsuariosInstalaciones ui
INNER JOIN Instalaciones i ON ui.IdInstalacion = i.Id
INNER JOIN Turnos t ON t.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN Contadores b ON i.IdContador = b.Id AND i.IdCliente = b.IdCliente
LEFT JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
LEFT JOIN Operadores o ON t.IdOperador = o.Id
LEFT JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE 
  ui.IdUsuario = ?        -- 🔹 filtra por usuario
  AND ui.Estatus = 1
  AND i.Estatus = 1
  `,
            [idUser],
          );
          break;
      }


      const total = Number(totalResult[0]?.total || 0);

      // 🔥 Transformación con map
      const data = turnos.map((item) => ({
        ...item,
        id: Number(item.id),
        idInstalacion: Number(item.idInstalacion),
        idValidador: Number(item.idValidador),
        idContador: Number(item.idContador),
        idVehiculo: Number(item.idVehiculo),
        idCliente: Number(item.idCliente),
        idOperador: Number(item.idOperador),
      }));

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
        message: `No fue posible obtener la paginación de turnos.`,
        error: error.message,
      });
    }
  }

      private async consultarTurnoListado(
    cliente: number
  ) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT
  -- Turno
  t.Id AS id,
  t.Inicio AS inicio,
  t.Fin AS fin,
  t.FechaCreacion AS fechaCreacion,
  t.FechaActualizacion AS fechaActualizacion,
  t.Estatus AS estatus,

  -- Instalación
  i.Id AS idInstalacion,
  i.FechaCreacion AS fechaCreacionInstalacion,
  i.FechaActualizacion AS fechaActualizacionInstalacion,
  i.Estatus AS estatusInstalacion,

  -- Validador
  d.Id AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contador
  b.Id AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  b.Marca AS marcaContador,
  b.Modelo AS modeloContador,

  -- Vehículo
  v.Id AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,

  -- Operador
  o.Id AS idOperador,
  o.NumeroLicencia AS numeroLicencia,
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id
INNER JOIN Contadores b ON i.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
INNER JOIN Clientes c ON t.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND c.Estatus = 1
AND t.Estatus = 1

ORDER BY t.Id DESC
   `;
    return this.turnosRepository.query(query, [...ids]);
  }

  async findAllList(idUser: number, cliente: number, rol: number) {
    try {
      let turnos;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador
          turnos = await this.turnosRepository.query(
            `
SELECT
  -- Turno
  t.Id AS id,
  t.Inicio AS inicio,
  t.Fin AS fin,
  t.FechaCreacion AS fechaCreacion,
  t.FechaActualizacion AS fechaActualizacion,
  t.Estatus AS estatus,

  -- Instalación
  i.Id AS idInstalacion,
  i.FechaCreacion AS fechaCreacionInstalacion,
  i.FechaActualizacion AS fechaActualizacionInstalacion,
  i.Estatus AS estatusInstalacion,

  -- Validador
  d.Id AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contador
  b.Id AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  b.Marca AS marcaContador,
  b.Modelo AS modeloContador,

  -- Vehículo
  v.Id AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,

  -- Operador
  o.Id AS idOperador,
  o.NumeroLicencia AS numeroLicencia,
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id
INNER JOIN Contadores b ON i.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
INNER JOIN Clientes c ON t.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE c.Estatus = 1
AND t.Estatus = 1

ORDER BY t.Id DESC
            `,
          );
          break;

        case 2:
          turnos = await this.consultarTurnoListado(cliente)
          break;

        case 8:
          turnos = await this.consultarTurnoListado(cliente)
          break;

        case 10:
          turnos = await this.consultarTurnoListado(cliente)
          break;


        default:
          turnos = await this.turnosRepository.query(
            `
SELECT
  -- Turno
  t.Id AS id,
  t.Inicio AS inicio,
  t.Fin AS fin,
  t.FechaCreacion AS fechaCreacion,
  t.FechaActualizacion AS fechaActualizacion,
  t.Estatus AS estatus,

  -- Instalación
  i.Id AS idInstalacion,
  i.FechaCreacion AS fechaCreacionInstalacion,
  i.FechaActualizacion AS fechaActualizacionInstalacion,
  i.Estatus AS estatusInstalacion,

  -- Validador
  d.Id AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contador
  b.Id AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  b.Marca AS marcaContador,
  b.Modelo AS modeloContador,

  -- Vehículo
  v.Id AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,

  -- Operador
  o.Id AS idOperador,
  o.NumeroLicencia AS numeroLicencia,
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM UsuariosInstalaciones ui
INNER JOIN Instalaciones i ON ui.IdInstalacion = i.Id
INNER JOIN Turnos t ON t.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN Contadores b ON i.IdContador = b.Id AND i.IdCliente = b.IdCliente
LEFT JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
LEFT JOIN Operadores o ON t.IdOperador = o.Id
LEFT JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE 
  ui.IdUsuario = ?        -- 🔹 filtra por usuario
  AND ui.Estatus = 1
  AND c.Estatus = 1
  AND t.Estatus = 1
  AND i.Estatus = 1

ORDER BY t.Inicio DESC
            `,
            [idUser],
          );
          break;
      }


      // 🔥 Transformación con map
      const data = turnos.map((item) => ({
        ...item,
        id: Number(item.id),
        idInstalacion: Number(item.idInstalacion),
        idValidador: Number(item.idValidador),
        idContador: Number(item.idContador),
        idVehiculo: Number(item.idVehiculo),
        idCliente: Number(item.idCliente),
        idOperador: Number(item.idOperador),
      }));

      const result: ApiResponseCommon = { data: data };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Ocurrió un inconveniente al intentar cargar el listado de turnos.`,
        error: error.message,
      });
    }
  }

        private async consultarTurnoOne(
    cliente: number,
    id: number
  ) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT
  -- Turno
  t.Id AS id,
  t.Inicio AS inicio,
  t.Fin AS fin,
  t.FechaCreacion AS fechaCreacion,
  t.FechaActualizacion AS fechaActualizacion,
  t.Estatus AS estatus,

  -- Instalación
  i.Id AS idInstalacion,
  i.FechaCreacion AS fechaCreacionInstalacion,
  i.FechaActualizacion AS fechaActualizacionInstalacion,
  i.Estatus AS estatusInstalacion,

  -- Validador
  d.Id AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contador
  b.Id AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  b.Marca AS marcaContador,
  b.Modelo AS modeloContador,

  -- Vehículo
  v.Id AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,

  -- Operador
  o.Id AS idOperador,
  o.NumeroLicencia AS numeroLicencia,
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id
INNER JOIN Contadores b ON i.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
INNER JOIN Clientes c ON t.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND t.Id = ?

ORDER BY t.Id DESC
   `;
    return this.turnosRepository.query(query, [...ids, id]);
  }

  async findOne(id: number, idUser: number, cliente: number, rol: number) {
    try {
      let turnos;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador
          turnos = await this.turnosRepository.query(
            `
SELECT
  -- Turno
  t.Id AS id,
  t.Inicio AS inicio,
  t.Fin AS fin,
  t.FechaCreacion AS fechaCreacion,
  t.FechaActualizacion AS fechaActualizacion,
  t.Estatus AS estatus,

  -- Instalación
  i.Id AS idInstalacion,
  i.FechaCreacion AS fechaCreacionInstalacion,
  i.FechaActualizacion AS fechaActualizacionInstalacion,
  i.Estatus AS estatusInstalacion,

  -- Validador
  d.Id AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contador
  b.Id AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  b.Marca AS marcaContador,
  b.Modelo AS modeloContador,

  -- Vehículo
  v.Id AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,

  -- Operador
  o.Id AS idOperador,
  o.NumeroLicencia AS numeroLicencia,
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id
INNER JOIN Contadores b ON i.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
INNER JOIN Clientes c ON t.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE t.Id = ?

ORDER BY t.Id DESC
            `,
            [id],
          );
          break;

        case 2:
          turnos = await this.consultarTurnoOne(cliente, id)
          break;

        case 8:
          turnos = await this.consultarTurnoOne(cliente, id)
          break;

        case 10:
          turnos = await this.consultarTurnoOne(cliente, id)
          break;

        default:
          turnos = await this.turnosRepository.query(
            `
SELECT
  -- Turno
  t.Id AS id,
  t.Inicio AS inicio,
  t.Fin AS fin,
  t.FechaCreacion AS fechaCreacion,
  t.FechaActualizacion AS fechaActualizacion,
  t.Estatus AS estatus,

  -- Instalación
  i.Id AS idInstalacion,
  i.FechaCreacion AS fechaCreacionInstalacion,
  i.FechaActualizacion AS fechaActualizacionInstalacion,
  i.Estatus AS estatusInstalacion,

  -- Validador
  d.Id AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contador
  b.Id AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  b.Marca AS marcaContador,
  b.Modelo AS modeloContador,

  -- Vehículo
  v.Id AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,

  -- Operador
  o.Id AS idOperador,
  o.NumeroLicencia AS numeroLicencia,
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM UsuariosInstalaciones ui
INNER JOIN Instalaciones i ON ui.IdInstalacion = i.Id
INNER JOIN Turnos t ON t.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN Contadores b ON i.IdContador = b.Id AND i.IdCliente = b.IdCliente
LEFT JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
LEFT JOIN Operadores o ON t.IdOperador = o.Id
LEFT JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE 
  ui.IdUsuario = ?        -- 🔹 filtra por usuario
  AND ui.Estatus = 1
  AND t.Id = ?

ORDER BY t.Inicio DESC
            `,
            [idUser, id],
          );
          break;
      }

      if (turnos.length === 0) {
        throw new NotFoundException(
          'No fue posible localizar turnos, o los datos son nulos.',
        );
      }

      // 🔥 Transformación con map
      const data = turnos.map((item) => ({
        ...item,
        id: Number(item.id),
        idInstalacion: Number(item.idInstalacion),
        idValidador: Number(item.idValidador),
        idContador: Number(item.idContador),
        idVehiculo: Number(item.idVehiculo),
        idCliente: Number(item.idCliente),
        idOperador: Number(item.idOperador),
      }));

      return { data };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Ocurrió un problema al consultar el turno.`,
        error: error,
      });
    }
  }

  async updateEstatus(
    id: number,
    idUser: number,
    updateTurnosEstatusDto: UpdateTurnosEstatusDto,
  ): Promise<ApiCrudResponse> {
    try {
      //obtenemos estatus
      const estatus = updateTurnosEstatusDto.estatus;

      //actualizamos
      await this.turnosRepository.update(id, { estatus: estatus });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateTurnosEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Turnos',
        `El estatus del turno con ID: ${id} fue actualizado a: ${estatus}.`,
        'UPDATE',
        querylogger,
        idUser,
        14,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El estatus del turno se actualizó correctamente.',
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre: `id turno:${id} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateTurnosEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Turnos',
        `El estatus del turno con ID: ${id} fue actualizado a: ${updateTurnosEstatusDto.estatus}.`,
        'UPDATE',
        querylogger,
        idUser,
        14,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Hubo un problema al actualizar el estatus del turno.`,
        error,
      });
    }
  }

  async update(id: number, idUser: number, updateTurnoDto: UpdateTurnoDto) {
    try {
      //actualizamos
      await this.turnosRepository.update(id, updateTurnoDto);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateTurnoDto };
      await this.bitacoraLogger.logToBitacora(
        'Turnos',
        `El turno con ID: ${id} fue actualizado correctamente.`,
        'UPDATE',
        querylogger,
        idUser,
        14,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El turno fue actualizado con éxito.',
        data: {
          id: id,
          nombre: `id turno:${id} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateTurnoDto };
      await this.bitacoraLogger.logToBitacora(
        'Turnos',
        `El turno con ID: ${id} fue actualizado correctamente.`,
        'UPDATE',
        querylogger,
        idUser,
        14,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Hubo un problema al actualizar el turno.`,
        error: error.message,
      });
    }
  }

  async remove(id: number, idUser: number) {
    try {
      //actualizamos
      await this.turnosRepository.update(id, { estatus: 0 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Turnos',
        `El turno con ID: ${id} fue eliminado correctamente.`,
        'UPDATE',
        querylogger,
        idUser,
        14,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El turno fue eliminado con éxito.',
        data: {
          id: id,
          nombre: `id turno:${id} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Turnos',
        `El turno con ID: ${id} fue eliminado correctamente.`,
        'UPDATE',
        querylogger,
        idUser,
        14,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Hubo un problema al eliminar el turno.`,
        error: error.message,
      });
    }
  }
}
