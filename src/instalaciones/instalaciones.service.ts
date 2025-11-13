import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { CreateInstalacionesDto } from "./dto/create-instalacione.dto";
import { UpdateInstalacioneDto } from "./dto/update-instalacione.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Instalaciones } from "src/entities/Instalaciones";
import { Repository } from "typeorm";
import { BitacoraLoggerService } from "src/bitacora/bitacora.service";
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from "src/common/ApiResponse";
import { UpdateInstalacioneEstatusDto } from "./dto/update-instalacione-estatus.dto";
import { UsuariosInstalaciones } from "src/entities/UsuariosInstalaciones";
import { Validadores } from "src/entities/Validadores";
import { Contadores } from "src/entities/Contadores";
import { Vehiculos } from "src/entities/Vehiculos";
import { Clientes } from "src/entities/Clientes";
import {
  EstadoComponente,
  EstatusEnum,
} from "src/common/estado-componente.enum";
import { HistoricoinstalacionesService } from "src/historicoinstalaciones/historicoinstalaciones.service";

@Injectable()
export class InstalacionesService {
  constructor(
    @InjectRepository(Instalaciones)
    private readonly instalacionesRepository: Repository<Instalaciones>,
    @InjectRepository(Validadores)
    private readonly validadoresRepository: Repository<Validadores>,
    @InjectRepository(Contadores)
    private readonly contadoresRepository: Repository<Contadores>,
    @InjectRepository(Vehiculos)
    private readonly vehiculosRepository: Repository<Vehiculos>,
    @InjectRepository(UsuariosInstalaciones)
    private readonly usuariosinstalacionesRepository: Repository<UsuariosInstalaciones>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly historicoinstalacionesService: HistoricoinstalacionesService
  ) {}

  async create(
    idUser: number,
    cliente: number,
    rol: number,
    createInstalacioneDto: CreateInstalacionesDto
  ): Promise<ApiCrudResponse> {
    try {
      let permiso;
      // ✅ VALIDACIÓN MEJORADA: Verificar todos los conflictos con relaciones
      const errores: string[] = [];

      // Verificar Validadores CON relaciones
      const ValidadoresEnUso = await this.instalacionesRepository.findOne({
        where: {
          idValidador: createInstalacioneDto.idValidador,
          estatus: 1,
        },
        relations: ["validadores"],
      });
      if (ValidadoresEnUso) {
        errores.push(
          ` Validador ${ValidadoresEnUso.idValidador} ya está en uso.`
        );
      }

      // Verificar Contadores CON relaciones
      const ContadoresEnUso = await this.instalacionesRepository.findOne({
        where: { idContador: createInstalacioneDto.idContador, estatus: 1 },
        relations: ["contadores"],
      });
      if (ContadoresEnUso) {
        errores.push(` Contador ${ContadoresEnUso.idContador} ya está en uso.`);
      }

      // Verificar Vehículo CON relaciones
      const vehiculoEnUso = await this.instalacionesRepository.findOne({
        where: { idVehiculo: createInstalacioneDto.idVehiculo, estatus: 1 },
        relations: ["vehiculos"],
      });
      if (vehiculoEnUso) {
        errores.push(
          ` Vehículo con placa ${vehiculoEnUso.idVehiculo} ya está en uso.`
        );
      }

      // Si hay conflictos, lanzar error con todos los detalles
      if (errores.length > 0) {
        throw new BadRequestException({
          message: `No se puede crear la instalación debido a los siguientes conflictos: ${errores[0]}`,
          errors: errores,
          conflictsCount: errores.length,
        });
      }

      // Crear instalación y guardarla en la base de datos
      const newInstalaciones = await this.instalacionesRepository.create(
        createInstalacioneDto
      );
      const instalacionSave =
        await this.instalacionesRepository.save(newInstalaciones);

      //Asignamos a root la
      switch (rol) {
        case 1:
          permiso = {
            estatus: 1,
            idUsuario: 1, //Se asigna al usuario supremo
            idInstalacion: instalacionSave.id,
          };
          await this.usuariosinstalacionesRepository.save(permiso);
          break;

        case 2:
          permiso = {
            estatus: 1,
            idUsuario: 1, //Se asigna al usuario supremo
            idInstalacion: instalacionSave.id,
          };
          await this.usuariosinstalacionesRepository.save(permiso);
          permiso = {
            estatus: 1,
            idUsuario: idUser, //Se asigna al Administrador
            idInstalacion: instalacionSave.id,
          };
          await this.usuariosinstalacionesRepository.save(permiso);
          break;

        default:
          permiso = {
            estatus: 1,
            idUsuario: 1, //Se asigna al usuario supremo SuperAdministrador
            idInstalacion: instalacionSave.id,
          };
          await this.usuariosinstalacionesRepository.save(permiso);
          break;
      }
      const body = { estadoActual: EstadoComponente.ASIGNADO };

      //actualizamos estatus de los componentes de la instalacion
      await this.validadoresRepository.update(
        createInstalacioneDto.idValidador,
        body
      );
      await this.contadoresRepository.update(
        createInstalacioneDto.idContador,
        body
      );
      await this.vehiculosRepository.update(
        createInstalacioneDto.idVehiculo,
        body
      );

      // Registro en la bitácora SUCCESS
      const querylogger = { createInstalacioneDto };
      await this.bitacoraLogger.logToBitacora(
        "Instalaciones",
        `La instalación con ID: ${instalacionSave.id} ha sido creada exitosamente.`,
        "CREATE",
        querylogger,
        idUser,
        13,
        EstatusEnumBitcora.SUCCESS
      );

      //Registro historico
      await this.historicoinstalacionesService.createHistorico(
        instalacionSave.id,
        instalacionSave.idValidador,
        instalacionSave.idContador,
        instalacionSave.idVehiculo,
        instalacionSave.idCliente,
        idUser
      );

      // API response (con mensajes corregidos)
      const result: ApiCrudResponse = {
        status: "success",
        message: "La instalación ha sido creada correctamente.",
        data: {
          id: Number(instalacionSave.id),
          nombre: `Instalación ${instalacionSave.id} registrada con los siguientes detalles: Validadores: ${instalacionSave.idValidador}, Contadores: ${instalacionSave.idContador}, Vehículo: ${instalacionSave.idVehiculo}.`, // ✅ Mejorado
        },
      };

      return result;
    } catch (error) {
      console.log(error)
      // Registro en la bitácora ERROR
      const querylogger = { createInstalacioneDto };
      await this.bitacoraLogger.logToBitacora(
        "Instalaciones",
        `Se creó una Instalación con `, // ✅ Corregido
        "CREATE",
        querylogger,
        idUser,
        13,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }

      // ✅ Manejo específico para errores de FK (del error original que tenías)
      if (error.code === "ER_NO_REFERENCED_ROW_2") {
        throw new BadRequestException({
          message: "Error de referencia en la base de datos",
          details:
            "Verifica que los IDs de Cliente, Validadores, Contadores y Vehículo sean válidos y existan en el sistema",
          sqlError: "La combinación Cliente-Validadores no es válida",
        });
      }

      throw new InternalServerErrorException({
        message: "Error al crear Instalación",
        error: error.message,
      });
    }
  }

  //funcion para obtener los clientes hijos
  private async clienteHijos(cliente: number) {
    const clientesFiltrado = await this.clienteRepository.query(
      `CALL spGetClientes(?);`,
      [cliente]
    );

    const idsFiltrados = clientesFiltrado[0]; // El primer índice contiene los resultados
    const ids = idsFiltrados
      .map((clientesFiltrado: any) => Number(clientesFiltrado.Id))
      .filter(Boolean);
    if (ids.length === 0) {
      return { data: [] }; // No hay clientes que consultar
    }

    // 3. Construir el query dinámico con los IDs
    const placeholders = ids.map(() => "?").join(", ");
    return { ids, placeholders };
  }

  private async consultarInstalacionesPaginado(
    cliente: number,
    limit: number,
    offset: number
  ) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT
  -- Instalación
  i.Id AS id,
  i.FechaCreacion AS fechaCreacion,
  i.FechaActualizacion AS fechaActualizacion,
  i.Estatus AS estatus,

  -- Validadores
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contadores
  i.IdContador AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  b.Marca AS marcaContador,
  b.Modelo AS modeloContador,

  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,

  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
INNER JOIN Contadores b ON i.IdContador = b.Id AND i.IdCliente = b.IdCliente
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  

ORDER BY i.Id DESC
LIMIT ? OFFSET ?;
   `;
    return this.instalacionesRepository.query(query, [...ids, limit, offset]);
  }

  private async consultarTotalInstalacionesPaginados(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `  
  SELECT COUNT(*) AS total
FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
INNER JOIN Contadores b ON i.IdContador = b.Id AND i.IdCliente = b.IdCliente
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  
`;
    return await this.instalacionesRepository.query(query, [...ids]);
  }

  async findAll(
    idUser: number,
    cliente: number,
    rol: number,
    page: number,
    limit: number
  ): Promise<ApiResponseCommon> {
    try {
      let instalaciones;
      let totalResult;
      const offset = (page - 1) * limit;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          instalaciones = await this.usuariosinstalacionesRepository.query(
            `
SELECT
  -- Instalación
  i.Id AS id,
  i.FechaCreacion AS fechaCreacion,
  i.FechaActualizacion AS fechaActualizacion,
  i.Estatus AS estatus,

  -- Validadores
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contadores
  i.IdContador AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  b.Marca AS marcaContador,
  b.Modelo AS modeloContador,

  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,

  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
INNER JOIN Contadores b ON i.IdContador = b.Id AND i.IdCliente = b.IdCliente
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id


  

ORDER BY i.Id DESC
  LIMIT ? OFFSET ?;

  `,
            [limit, offset]
          );
          // Query para total (sin paginación)
          totalResult = await this.instalacionesRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
INNER JOIN Contadores b ON i.IdContador = b.Id AND i.IdCliente = b.IdCliente
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id


		
  `
          );
          break;

        case 2:
          // Consulta de datos paginados Usuario Administrador
          instalaciones = await this.consultarInstalacionesPaginado(
            cliente,
            limit,
            offset
          );
          // Query para total (sin paginación)
          totalResult =
            await this.consultarTotalInstalacionesPaginados(cliente);
          break;

        case 8:
          // Consulta de datos paginados Usuario Reportes
          instalaciones = await this.consultarInstalacionesPaginado(
            cliente,
            limit,
            offset
          );
          // Query para total (sin paginación)
          totalResult =
            await this.consultarTotalInstalacionesPaginados(cliente);
          break;

        case 10:
          // Consulta de datos paginados Usuario Capturista
          instalaciones = await this.consultarInstalacionesPaginado(
            cliente,
            limit,
            offset
          );
          // Query para total (sin paginación)
          totalResult =
            await this.consultarTotalInstalacionesPaginados(cliente);
          break;

        default:
          // Usuarios normales - solo sus instalaciones asignadas
          instalaciones = await this.usuariosinstalacionesRepository.query(
            `
SELECT
  -- Instalación
  i.Id AS id,
  i.FechaCreacion AS fechaCreacion,
  i.FechaActualizacion AS fechaActualizacion,
  i.Estatus AS estatus,
  
  -- Validadores
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,
  
  -- Contadores
  i.IdContador AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  b.Marca AS marcaContador,
  b.Modelo AS modeloContador,
  
  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,
  
  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM UsuariosInstalaciones ui
INNER JOIN Instalaciones i ON ui.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
INNER JOIN Contadores b ON i.IdContador = b.Id AND i.IdCliente = b.IdCliente
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE ui.IdUsuario = ?
  AND ui.Estatus = 1

ORDER BY i.Id DESC
  LIMIT ? OFFSET ?;

  `,
            [idUser, limit, offset]
          );
          // Query para total (sin paginación)
          totalResult = await this.instalacionesRepository.query(
            `
    SELECT COUNT(*) AS total
FROM UsuariosInstalaciones ui
INNER JOIN Instalaciones i ON ui.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
INNER JOIN Contadores b ON i.IdContador = b.Id AND i.IdCliente = b.IdCliente
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE ui.IdUsuario = ?
  AND ui.Estatus = 1
  `,
            [idUser]
          );
          break;
      }

      const total = Number(totalResult[0]?.total || 0);

      // 🔥 Transformación de datos (ids → number, nombreCompleto)
      const data = instalaciones.map((item) => ({
        ...item,
        id: Number(item.id),
        idValidador: Number(item.idValidador),
        idContador: Number(item.idContador),
        idVehiculo: Number(item.idVehiculo),
        idCliente: Number(item.idCliente),
      }));

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
        message:
          "Ocurrió un problema al intentar cargar la paginación de instalaciones.",
        error: error.message,
      });
    }
  }

  private async consultarInstalacionesListado(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT
  -- Instalación
  i.Id AS id,
  i.FechaCreacion AS fechaCreacion,
  i.FechaActualizacion AS fechaActualizacion,
  i.Estatus AS estatus,

  -- Validadores
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contadores
  i.IdContador AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  b.Marca AS marcaContador,
  b.Modelo AS modeloContador,

  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,

  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
INNER JOIN Contadores b ON i.IdContador = b.Id AND i.IdCliente = b.IdCliente
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE c.Estatus = 1
AND i.Estatus = 1
AND c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  

ORDER BY i.Id DESC
   `;
    return this.instalacionesRepository.query(query, [...ids]);
  }

  async findAllList(
    idUser: number,
    cliente: number,
    rol: number
  ): Promise<ApiResponseCommon> {
    try {
      let instalaciones;

      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las instalaciones
          instalaciones = await this.usuariosinstalacionesRepository.query(
            `
SELECT
  -- Instalación
  i.Id AS id,
  i.FechaCreacion AS fechaCreacion,
  i.FechaActualizacion AS fechaActualizacion,
  i.Estatus AS estatus,

  -- Validadores
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contadores
  i.IdContador AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  b.Marca AS marcaContador,
  b.Modelo AS modeloContador,

  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,

  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
INNER JOIN Contadores b ON i.IdContador = b.Id AND i.IdCliente = b.IdCliente
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE c.Estatus = 1
AND i.Estatus = 1
  

ORDER BY i.Id DESC

  `
          );
          break;

        case 2:
          // Consulta de datos paginados Usuario Administrador
          instalaciones = await this.consultarInstalacionesListado(cliente);
          break;

        case 8:
          // Consulta de datos paginados Usuario Reportes
          instalaciones = await this.consultarInstalacionesListado(cliente);
          break;

        case 10:
          // Consulta de datos paginados Usuario Capturista
          instalaciones = await this.consultarInstalacionesListado(cliente);
          break;

        default:
          // Usuarios normales - solo sus instalaciones asignadas
          instalaciones = await this.usuariosinstalacionesRepository.query(
            `
SELECT
  -- Instalación
  i.Id AS id,
  i.FechaCreacion AS fechaCreacion,
  i.FechaActualizacion AS fechaActualizacion,
  i.Estatus AS estatus,
  
  -- Validadores
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,
  
  -- Contadores
  i.IdContador AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  b.Marca AS marcaContador,
  b.Modelo AS modeloContador,
  
  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,
  
  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM UsuariosInstalaciones ui
INNER JOIN Instalaciones i ON ui.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
INNER JOIN Contadores b ON i.IdContador = b.Id AND i.IdCliente = b.IdCliente
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE ui.IdUsuario = ?
  AND ui.Estatus = 1
  AND c.Estatus = 1
  AND i.Estatus = 1

ORDER BY i.Id DESC

  `,
            [idUser]
          );
          break;
      }

      // 🔥 Transformación de datos (ids → number, nombreCompleto)
      const data = instalaciones.map((item) => ({
        ...item,
        id: Number(item.id),
        idValidadores: Number(item.idValidadores),
        idContadores: Number(item.idContadores),
        idVehiculo: Number(item.idVehiculo),
        idCliente: Number(item.idCliente),
      }));

      const result: ApiResponseCommon = {
        data: data,
      };

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "No fue posible obtener el listado de instalaciones.",
        error,
      });
    }
  }

  private async consultarInstalacionesOne(cliente: number, id: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT
  -- Instalación
  i.Id AS id,
  i.FechaCreacion AS fechaCreacion,
  i.FechaActualizacion AS fechaActualizacion,
  i.Estatus AS estatus,

  -- Validadores
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidadores,
  d.Marca AS marcaValidadores,
  d.Modelo AS modeloValidadores,

  -- Contadores
  i.IdContador AS idContador,
  b.NumeroSerie AS numeroSerieContadores,
  b.Marca AS marcaContadores,
  b.Modelo AS modeloContadores,

  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,

  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
INNER JOIN Contadores b ON i.IdContador = b.Id AND i.IdCliente = b.IdCliente
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND i.Id = ?
  

ORDER BY i.Id DESC
   `;
    return this.instalacionesRepository.query(query, [...ids, id]);
  }

  async findOne(id: number, idUser: number, cliente: number, rol: number) {
    try {
      let instalaciones;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las instalaciones
          instalaciones = await this.usuariosinstalacionesRepository.query(
            `
SELECT
  -- Instalación
  i.Id AS id,
  i.FechaCreacion AS fechaCreacion,
  i.FechaActualizacion AS fechaActualizacion,
  i.Estatus AS estatus,

  -- Validadores
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidadores,
  d.Marca AS marcaValidadores,
  d.Modelo AS modeloValidadores,

  -- Contadores
  i.IdContador AS idContador,
  b.NumeroSerie AS numeroSerieContadores,
  b.Marca AS marcaContadores,
  b.Modelo AS modeloContadores,

  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,

  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
INNER JOIN Contadores b ON i.IdContador = b.Id AND i.IdCliente = b.IdCliente
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE c.Estatus = 1
AND i.Id = ?
  

ORDER BY i.Id DESC

  `,
            [id]
          );
          break;

        case 2:
          // Consulta de datos paginados Usuario Administrador
          instalaciones = await this.consultarInstalacionesOne(cliente, id);
          break;

        case 8:
          // Consulta de datos paginados Usuario Reportes
          instalaciones = await this.consultarInstalacionesOne(cliente, id);
          break;

        case 10:
          // Consulta de datos paginados Usuario Capturista
          instalaciones = await this.consultarInstalacionesOne(cliente, id);
          break;

        default:
          // Usuarios normales - solo sus instalaciones asignadas
          instalaciones = await this.usuariosinstalacionesRepository.query(
            `
SELECT
  -- Instalación
  i.Id AS id,
  i.FechaCreacion AS fechaCreacion,
  i.FechaActualizacion AS fechaActualizacion,
  i.Estatus AS estatus,
  
  -- Validadores
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,
  
  -- Contadores
  i.IdContador AS idContador,
  b.NumeroSerie AS numeroSerieContador,
  b.Marca AS marcaContador,
  b.Modelo AS modeloContador,
  
  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,
  
  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM UsuariosInstalaciones ui
INNER JOIN Instalaciones i ON ui.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
INNER JOIN Contadores b ON i.IdContador = b.Id AND i.IdCliente = b.IdCliente
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE ui.IdUsuario = ?
  AND ui.Estatus = 1
  AND i.Id = ?

ORDER BY i.Id DESC

  `,
            [idUser, id]
          );
          break;
      }

      if (instalaciones.length === 0) {
        throw new NotFoundException("No se encontraron instalaciones.");
      }

      // 🔥 Transformamos ids a number y añadimos nombreCompleto
      const data = instalaciones.map((item) => ({
        ...item,
        id: Number(item.id),
        idValidadores: Number(item.idValidadores),
        idContadores: Number(item.idContadores),
        idVehiculo: Number(item.idVehiculo),
        idCliente: Number(item.idCliente),
      }));

      return { data: data };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message:
          "Ocurrió un problema al intentar acceder a las instalaciones por ID.",
        error: error.message,
      });
    }
  }

  async updateEstatus(
    id: number,
    idUser: number,
    cliente: number,
    rol: number,
    updateInstalacioneEstatusDto: UpdateInstalacioneEstatusDto
  ) {
    try {
      const instalacion = await this.instalacionesRepository.findOne({
        where: { id: id },
      });

      if (!instalacion) {
        throw new NotFoundException(
          `Instalaciones con id: ${id} no encontrado`
        );
      }

      //Actualizamos el estatus
      const estatus = updateInstalacioneEstatusDto.estatus;
      if (estatus === 1) {
        // ✅  Verificar todos los conflictos con relaciones
        const errores: string[] = [];

        // Verificar Validador CON relaciones
        const validadorEnUso = await this.instalacionesRepository.findOne({
          where: {
            idValidador: instalacion.idValidador,
            estatus: 1,
          },
        });
        if (validadorEnUso) {
          errores.push(
            `Validador "${validadorEnUso.idValidador}" ya está en uso`
          );
        }

        // Verificar Contador CON relaciones
        const contadoresEnUso = await this.instalacionesRepository.findOne({
          where: { idContador: instalacion.idContador, estatus: 1 },
        });
        if (contadoresEnUso) {
          errores.push(
            `Contador "${contadoresEnUso.idContador}" ya está en uso`
          );
        }

        // Verificar Vehículo CON relaciones
        const vehiculoEnUso = await this.instalacionesRepository.findOne({
          where: { idVehiculo: instalacion.idVehiculo, estatus: 1 },
        });
        if (vehiculoEnUso) {
          errores.push(
            `Vehículo con placa "${vehiculoEnUso.idVehiculo}" ya está en uso`
          );
        }

        // Si hay conflictos, lanzar error con todos los detalles
        if (errores.length > 0) {
          throw new BadRequestException({
            message: `No se puede crear la instalación debido a los siguientes conflictos ${errores[0]}`,
            errors: errores,
            conflictsCount: errores.length,
          });
        }

        // ✅ Verificar todos los componentes esten disponibles
        const erroresEstado: string[] = [];

        // Verificar Validador este disponible
        const validadorEstado = await this.validadoresRepository.findOne({
          where: {
            id: instalacion.idValidador,
            estatus: EstatusEnum.ACTIVO,
            estadoActual: EstadoComponente.DISPONIBLE,
          },
        });
        if (!validadorEstado) {
          erroresEstado.push(
            `Validador "${instalacion.idValidador}" ya está en uso o no se encuentra en estado disponible.`
          );
        }

        // Verificar Contador este disponible
        const contadoresEstado = await this.contadoresRepository.findOne({
          where: {
            id: instalacion.idContador,
            estatus: EstatusEnum.ACTIVO,
            estadoActual: EstadoComponente.DISPONIBLE,
          },
        });
        if (!contadoresEstado) {
          erroresEstado.push(
            `Contador "${instalacion.idContador}" ya está en uso o no se encuentra en estado disponible.`
          );
        }

        // Verificar Vehículo este disponible
        const vehiculoEstado = await this.vehiculosRepository.findOne({
          where: {
            id: instalacion.idVehiculo,
            estatus: EstatusEnum.ACTIVO,
            estadoActual: EstadoComponente.DISPONIBLE,
          },
        });
        if (!vehiculoEstado) {
          erroresEstado.push(
            `Vehículo con placa "${instalacion.idVehiculo}" ya está en uso o no se encuentra en estado disponible.`
          );
        }

        // Si hay conflictos, lanzar error con todos los detalles
        if (erroresEstado.length > 0) {
          throw new BadRequestException({
            message: `No se puede crear la instalación debido a los siguientes conflictos ${erroresEstado[0]}`,
            errors: erroresEstado,
            conflictsCount: erroresEstado.length,
          });
        }

        // Cambiar estatus de componentes a 2 (Asignado)
        const body = { estadoActual: EstadoComponente.ASIGNADO };
        await this.validadoresRepository.update(instalacion.idValidador, body);
        await this.contadoresRepository.update(instalacion.idContador, body);
        await this.vehiculosRepository.update(instalacion.idVehiculo, body);
      } else if (estatus === 0) {
        // Desactivar instalación → activar componentes a 1(Disponible)
        const body = { estadoActual: EstadoComponente.DISPONIBLE };
        await this.validadoresRepository.update(instalacion.idValidador, body);
        await this.contadoresRepository.update(instalacion.idContador, body);
        await this.vehiculosRepository.update(instalacion.idVehiculo, body);
      }

      await this.instalacionesRepository.update(id, { estatus: estatus });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateInstalacioneEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Instalaciones",
        `Se actualizó el estatus de la instalación con ID: ${instalacion.id}.`,
        "UPDATE",
        querylogger,
        idUser,
        13,
        EstatusEnumBitcora.SUCCESS
      );

      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: `El estatus de las instalaciones ha sido actualizado con éxito.`,
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre:
            `${instalacion.id} Validadores:${instalacion.idValidador} Contadores: ${instalacion.idContador} vehiculo: ${instalacion.idVehiculo}` ||
            "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateInstalacioneEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Instalaciones",
        `Se cambio el estatus de instalacion con id: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        13,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Ocurrió un problema al intentar modificar el estatus de la instalación con ID: ${id}.`,
        error: error.message,
      });
    }
  }

  async update(
    id: number,
    idUser: number,
    cliente: number,
    rol: number,
    updateInstalacioneDto: UpdateInstalacioneDto
  ): Promise<ApiCrudResponse> {
    try {
      const instalacion = await this.instalacionesRepository.findOne({
        where: { id: id },
      });

      if (!instalacion) {
        throw new NotFoundException(
          `No se encontró la instalación con ID: ${id}.`
        );
      }

      //verificamos que exista el validador a actualizar
      if (updateInstalacioneDto.idValidador) {
        //Actualizamos el estado del validador anterior
        await this.validadoresRepository.update(instalacion.idValidador, {
          estadoActual: updateInstalacioneDto.estatusValidadorAnterior,
        });
        //Actualizamos el validador en la instalacion
        await this.instalacionesRepository.update(id, {
          idValidador: updateInstalacioneDto.idValidador,
        });
      }

      //verificamos que exista el contador a actualizar
      if (updateInstalacioneDto.idContador) {
        //Actualizamos el estado del contador anterior
        await this.contadoresRepository.update(instalacion.idContador, {
          estadoActual: updateInstalacioneDto.estatusContadorAnterior,
        });
        //Actualizamos el contador en la instalacion
        await this.instalacionesRepository.update(id, {
          idContador: updateInstalacioneDto.idContador,
        });
      }

      const instalacionActualizada = await this.instalacionesRepository.findOne(
        {
          where: { id: id },
        }
      );

      const body = {
        idInstalacion: id,
        idValidador: instalacion.idValidador,
        idContador: instalacion.idContador,
        idVehiculo: instalacion.idVehiculo,
        idCliente: instalacion.idCliente,
      };

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateInstalacioneDto };
      await this.bitacoraLogger.logToBitacora(
        "Instalaciones",
        `Se actualizo instalacion con id: ${instalacion.id}`,
        "UPDATE",
        querylogger,
        idUser,
        13,
        EstatusEnumBitcora.SUCCESS
      );

      const comentario = `${updateInstalacioneDto.comentariosContador ?? ''}  ${updateInstalacioneDto.comentariosValidador ?? ''}`

      //Registro historico
      await this.historicoinstalacionesService.updateHistorico(
        body,
        Number(instalacionActualizada?.idValidador),
        Number(instalacionActualizada?.idContador),
        Number(instalacionActualizada?.idVehiculo),
        Number(instalacionActualizada?.idCliente),
        idUser,
        comentario
      );

      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Las instalaciones se actualizaron con éxito.",
        data: {
          id: id,
          nombre:
            `Instalación ${instalacion.id} asociada a Validadores: ${instalacion.idValidador}, Contadores: ${instalacion.idContador} y Vehículo: ${instalacion.idVehiculo}.` ||
            "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateInstalacioneDto };
      await this.bitacoraLogger.logToBitacora(
        "Instalaciones",
        `Se actualizo instalacion con id: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        13,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar Instalación",
        error: error, // ✅ Solo el mensaje, no todo el objeto
      });
    }
  }

  async remove(
    id: number,
    cliente: number,
    idUser: number,
    rol: number
  ): Promise<ApiCrudResponse> {
    try {
      let instalacion;
      instalacion = await this.instalacionesRepository.findOne({
        where: { id: id },
      });

      if (!instalacion) {
        throw new NotFoundException(
          `La instalación con ID: ${id} no está disponible.`
        );
      }

      //Actualizamos datos
      await this.instalacionesRepository.update(id, {
        estatus: EstatusEnum.INACTIVO,
      });

      // Desactivar instalación → activar componentes
      const body = { estadoActual: EstadoComponente.DISPONIBLE };
      await this.validadoresRepository.update(instalacion.idValidador, body);
      await this.contadoresRepository.update(instalacion.idContador, body);
      await this.vehiculosRepository.update(instalacion.idVehiculo, body);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Instalaciones",
        `La instalación con ID: ${instalacion.id} ha sido eliminada exitosamente.`,
        "UPDATE",
        querylogger,
        idUser,
        13,
        EstatusEnumBitcora.SUCCESS
      );

      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Instalaciones eliminado correctamente",
        data: {
          id: id,
          nombre:
            `${instalacion.id} Validadores:${instalacion.idValidador} Contadores: ${instalacion.idContador} vehiculo: ${instalacion.idVehiculo}` ||
            "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Instalaciones",
        `La instalación con ID: ${id} ha sido eliminada exitosamente.`,
        "UPDATE",
        querylogger,
        idUser,
        13,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error al eliminar de instalaciones con id: ${id}`
      );
    }
  }
}
