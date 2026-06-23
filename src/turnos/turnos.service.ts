import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
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
import { EnumModulos, EstatusEnum } from 'src/common/estatus.enum';
import { Operadores } from 'src/entities/Operadores';
import { Instalaciones } from 'src/entities/Instalaciones';

@Injectable()
export class TurnosService {
  constructor(
    @InjectRepository(Turnos)
    private readonly turnosRepository: Repository<Turnos>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    @InjectRepository(Operadores)
    private readonly operadoresRepository: Repository<Operadores>,
    @InjectRepository(Instalaciones)
    private readonly instalacionesRepository: Repository<Instalaciones>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) { }

  async create(
    idUser: number,
    cliente: number,
    idOperador: number,
    createTurnoDto: CreateTurnoDto,
  ): Promise<ApiCrudResponse> {
    try {
      //validamos que el usuario sea rol operador
      if (!idOperador) {
        throw new UnauthorizedException(`El usuario no está autorizado para generar un turno.`)
      }

      // Validar que el operador no tenga 2 turnos activos al mismo tiempo
      const turnosActivos = await this.turnosRepository.find({
        where: {
          idOperador: idOperador,
          estatus: EstatusEnum.ACTIVO,
        },
      });

      // Verificar si hay turnos activos sin fecha de fin (aún en curso)
      const turnosActivosSinFin = turnosActivos.filter(turno => turno.fin === null);

      if (turnosActivosSinFin.length > 0) {
        throw new BadRequestException(
          `El operador ya tiene un turno activo. No se puede crear otro turno hasta que se finalice el turno actual (ID: ${turnosActivosSinFin[0].id}).`
        );
      }

      //Creamos el turno
      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }
      const ahora = new Date();
      const desfaseMs = -6 * 60 * 60 * 1000; // -6 horas
      const fechaDesfasada = new Date(ahora.getTime() + desfaseMs);
      const fechaActual = `${fechaDesfasada.getFullYear()}-${pad(fechaDesfasada.getMonth() + 1)}-${pad(fechaDesfasada.getDate())} ${pad(fechaDesfasada.getHours())}:${pad(fechaDesfasada.getMinutes())}:${pad(fechaDesfasada.getSeconds())}`;


      const { numeroSerieValidador } = createTurnoDto

      const query = `
      SELECT
	i.Id 
FROM Validadores d
LEFT JOIN Instalaciones i ON i.idValidador = d.Id
WHERE d.NumeroSerie = '${numeroSerieValidador}'
AND i.Estatus = 1
      `

      const instalacion = await this.turnosRepository.query(query);
      if (instalacion.length === 0) {
        throw new NotFoundException('No se ha encontrado la instalación asignada al validador.');
      }

      const body = {
        estatus: EstatusEnum.ACTIVO,
        idCliente: cliente,
        idOperador: idOperador,
        idInstalacion: instalacion[0].Id
      }

      const newTurno = await this.turnosRepository.create(body);
      const turnoSave = await this.turnosRepository.save(newTurno);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createTurnoDto };
      await this.bitacoraLogger.logToBitacora(
        'Turnos',
        `El turno con ID: ${turnoSave.id} fue creado correctamente.`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.TURNOS,
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
        EnumModulos.TURNOS,
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

  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,
  -- Para compatibilidad con código antiguo (primer contador)
  MIN(b.Id) AS idContador,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContador,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContador,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContador,

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
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
INNER JOIN Clientes c ON t.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

GROUP BY t.Id, t.Inicio, t.Fin, t.FechaCreacion, t.FechaActualizacion, t.Estatus,
         i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         d.Id, d.NumeroSerie, d.Marca, d.Modelo,
         v.Id, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico,
         c.Id, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus,
         o.Id, o.FechaNacimiento, u.Nombre, u.ApellidoPaterno, u.ApellidoMaterno

ORDER BY t.Id DESC
  LIMIT ? OFFSET ?;
   `;
    return this.turnosRepository.query(query, [...ids, limit, offset]);
  }

  private async consultarTotalTurnosPaginados(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `  
  SELECT COUNT(DISTINCT t.Id) AS total
FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
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

  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,
  -- Para compatibilidad con código antiguo (primer contador)
  MIN(b.Id) AS idContador,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContador,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContador,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContador,

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
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
INNER JOIN Clientes c ON t.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id

GROUP BY t.Id, t.Inicio, t.Fin, t.FechaCreacion, t.FechaActualizacion, t.Estatus,
         i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         d.Id, d.NumeroSerie, d.Marca, d.Modelo,
         v.Id, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico,
         c.Id, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus,
         o.Id, o.FechaNacimiento, u.Nombre, u.ApellidoPaterno, u.ApellidoMaterno

ORDER BY t.Id DESC
  LIMIT ? OFFSET ?;
            `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.turnosRepository.query(
            `
  SELECT COUNT(DISTINCT t.Id) AS total
FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
INNER JOIN Clientes c ON t.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
  `,
          );
          break;

        case 2:
          turnos = await this.consultarTurnoPaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalTurnosPaginados(cliente);
          break;

        case 8:
          turnos = await this.consultarTurnoPaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalTurnosPaginados(cliente);
          break;

        case 10:
          turnos = await this.consultarTurnoPaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalTurnosPaginados(cliente);
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

  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,
  -- Para compatibilidad con código antiguo (primer contador)
  MIN(b.Id) AS idContador,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContador,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContador,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContador,

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
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM UsuariosInstalaciones ui
INNER JOIN Instalaciones i ON ui.IdInstalacion = i.Id
INNER JOIN Turnos t ON t.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
LEFT JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
LEFT JOIN Operadores o ON t.IdOperador = o.Id
LEFT JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE 
  ui.IdUsuario = ?        -- 🔹 filtra por usuario
  AND ui.Estatus = 1
  AND i.Estatus = 1

GROUP BY t.Id, t.Inicio, t.Fin, t.FechaCreacion, t.FechaActualizacion, t.Estatus,
         i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         d.Id, d.NumeroSerie, d.Marca, d.Modelo,
         v.Id, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico,
         c.Id, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus,
         o.Id, o.FechaNacimiento, u.Nombre, u.ApellidoPaterno, u.ApellidoMaterno

ORDER BY t.Inicio DESC

  LIMIT ? OFFSET ?;
            `,
            [idUser, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.turnosRepository.query(
            `
  SELECT COUNT(DISTINCT t.Id) AS total
FROM UsuariosInstalaciones ui
INNER JOIN Instalaciones i ON ui.IdInstalacion = i.Id
INNER JOIN Turnos t ON t.IdInstalacion = i.Id AND t.IdCliente = i.IdCliente
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE ui.IdUsuario = ?
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

  private async consultarTurnoListado(cliente: number) {
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

  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,
  -- Para compatibilidad con código antiguo (primer contador)
  MIN(b.Id) AS idContador,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContador,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContador,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContador,

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
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
INNER JOIN Clientes c ON t.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE t.Estatus = 1
AND c.Estatus = 1
AND c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

GROUP BY t.Id, t.Inicio, t.Fin, t.FechaCreacion, t.FechaActualizacion, t.Estatus,
         i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         d.Id, d.NumeroSerie, d.Marca, d.Modelo,
         v.Id, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico,
         c.Id, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus,
         o.Id, o.FechaNacimiento, u.Nombre, u.ApellidoPaterno, u.ApellidoMaterno

ORDER BY t.Id DESC;
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

  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,
  -- Para compatibilidad con código antiguo (primer contador)
  MIN(b.Id) AS idContador,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContador,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContador,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContador,

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
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
INNER JOIN Clientes c ON t.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE t.Estatus = 1
AND c.Estatus = 1

GROUP BY t.Id, t.Inicio, t.Fin, t.FechaCreacion, t.FechaActualizacion, t.Estatus,
         i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         d.Id, d.NumeroSerie, d.Marca, d.Modelo,
         v.Id, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico,
         c.Id, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus,
         o.Id, o.FechaNacimiento, u.Nombre, u.ApellidoPaterno, u.ApellidoMaterno

ORDER BY t.Id DESC;
            `,
          );
          break;

        case 2:
          turnos = await this.consultarTurnoListado(cliente);
          break;

        case 8:
          turnos = await this.consultarTurnoListado(cliente);
          break;

        case 10:
          turnos = await this.consultarTurnoListado(cliente);
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

  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,
  -- Para compatibilidad con código antiguo (primer contador)
  MIN(b.Id) AS idContador,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContador,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContador,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContador,

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
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM UsuariosInstalaciones ui
INNER JOIN Instalaciones i ON ui.IdInstalacion = i.Id
INNER JOIN Turnos t ON t.IdInstalacion = i.Id AND t.IdCliente = i.IdCliente
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE ui.IdUsuario = ?
  AND ui.Estatus = 1
  AND i.Estatus = 1
  AND t.Estatus = 1
  AND c.Estatus = 1

GROUP BY t.Id, t.Inicio, t.Fin, t.FechaCreacion, t.FechaActualizacion, t.Estatus,
         i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         d.Id, d.NumeroSerie, d.Marca, d.Modelo,
         v.Id, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico,
         c.Id, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus,
         o.Id, o.FechaNacimiento, u.Nombre, u.ApellidoPaterno, u.ApellidoMaterno

ORDER BY t.Id DESC;
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

  private async consultarTurnoOne(cliente: number, id: number) {
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

  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,
  -- Para compatibilidad con código antiguo (primer contador)
  MIN(b.Id) AS idContador,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContador,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContador,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContador,

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
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
INNER JOIN Clientes c ON t.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND t.Id = ?

GROUP BY t.Id, t.Inicio, t.Fin, t.FechaCreacion, t.FechaActualizacion, t.Estatus,
         i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         d.Id, d.NumeroSerie, d.Marca, d.Modelo,
         v.Id, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico,
         c.Id, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus,
         o.Id, o.FechaNacimiento, u.Nombre, u.ApellidoPaterno, u.ApellidoMaterno

ORDER BY t.Id DESC;
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

  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,
  -- Para compatibilidad con código antiguo (primer contador)
  MIN(b.Id) AS idContador,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContador,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContador,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContador,

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
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id
INNER JOIN Clientes c ON t.IdCliente = c.Id
INNER JOIN Operadores o ON t.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE t.Id = ?

GROUP BY t.Id, t.Inicio, t.Fin, t.FechaCreacion, t.FechaActualizacion, t.Estatus,
         i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         d.Id, d.NumeroSerie, d.Marca, d.Modelo,
         v.Id, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico,
         c.Id, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus,
         o.Id, o.FechaNacimiento, u.Nombre, u.ApellidoPaterno, u.ApellidoMaterno

ORDER BY t.Id DESC;
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

  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,
  -- Para compatibilidad con código antiguo (primer contador)
  MIN(b.Id) AS idContador,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContador,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContador,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContador,

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
  o.FechaNacimiento AS fechaNacimientoOperador,
  u.Nombre AS nombreOperador,
  u.ApellidoPaterno AS apellidoPaternoOperador,
  u.ApellidoMaterno AS apellidoMaternoOperador

FROM Turnos t
INNER JOIN Instalaciones i ON t.IdInstalacion = i.Id
INNER JOIN Clientes c ON t.IdCliente = c.Id
LEFT JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
LEFT JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
LEFT JOIN Operadores o ON t.IdOperador = o.Id
LEFT JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE 
  t.Id = ?              -- 🔹 filtra por cliente
 
  AND EXISTS (                -- 🔹 asegura que el usuario está asignado a la instalación
    SELECT 1 
    FROM UsuariosInstalaciones ui
    WHERE ui.IdInstalacion = i.Id 
      AND ui.IdUsuario = ?
      AND ui.Estatus = 1
  )

GROUP BY t.Id, t.Inicio, t.Fin, t.FechaCreacion, t.FechaActualizacion, t.Estatus,
         i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         d.Id, d.NumeroSerie, d.Marca, d.Modelo,
         v.Id, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico,
         c.Id, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus,
         o.Id, o.FechaNacimiento, u.Nombre, u.ApellidoPaterno, u.ApellidoMaterno

ORDER BY t.Inicio DESC;
            `,
            [id, idUser],
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
        EnumModulos.TURNOS,
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
        EnumModulos.TURNOS,
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

  async update(id: number, idUser: number,
    cliente: number,
    idOperador: number,
    updateTurnoDto: UpdateTurnoDto) {
    try {
      //validamos que el usuario sea rol operador
      if (!idOperador) {
        throw new UnauthorizedException(`El usuario no está autorizado para actualizar un turno.`)
      }
      const { numeroSerieValidador } = updateTurnoDto

      const query = `
      SELECT
	i.Id 
FROM Validadores d
LEFT JOIN Instalaciones i ON i.idValidador = d.Id
WHERE d.NumeroSerie = '${numeroSerieValidador}'
AND i.Estatus = 1
      `

      const instalacion = await this.turnosRepository.query(query);
      if (instalacion.length === 0) {
        throw new NotFoundException('No se ha encontrado la instalación asignada al validador.');
      }
      const idInstalacion = instalacion[0].Id
      //Generamos el desfase de horarios
      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }
      const ahora = new Date();
      const desfaseMs = -6 * 60 * 60 * 1000; // -6 horas
      const fechaDesfasada = new Date(ahora.getTime() + desfaseMs);
      const fechaActual = `${fechaDesfasada.getFullYear()}-${pad(fechaDesfasada.getMonth() + 1)}-${pad(fechaDesfasada.getDate())} ${pad(fechaDesfasada.getHours())}:${pad(fechaDesfasada.getMinutes())}:${pad(fechaDesfasada.getSeconds())}`;
      // buscamos el turno
      const turnoFind = await this.turnosRepository.findOne({ where: { id: id } })

      if (!turnoFind) {
        throw new NotFoundException(`El turno con ID: ${id} no fue encontrado.`)
      }

      if (cliente != turnoFind.idCliente || idOperador != turnoFind.idOperador || idInstalacion != turnoFind.idInstalacion) {
        throw new BadRequestException(`El turno con ID: ${id} no coincide los valores del turno con el del usuario.`)
      }
      const body = {
        fin: fechaDesfasada,
        estatus: EstatusEnum.INACTIVO,
      }

      //actualizamos
      await this.turnosRepository.update(id, body);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateTurnoDto };
      await this.bitacoraLogger.logToBitacora(
        'Turnos',
        `El turno con ID: ${id} fue actualizado correctamente.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.TURNOS,
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
        EnumModulos.TURNOS,
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
        EnumModulos.TURNOS,
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
        EnumModulos.TURNOS,
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
