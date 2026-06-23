import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateInstalacionesDto } from './dto/create-instalacione.dto';
import { UpdateInstalacioneDto } from './dto/update-instalacione.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { UpdateInstalacioneEstatusDto } from './dto/update-instalacione-estatus.dto';
import { UsuariosInstalaciones } from 'src/entities/UsuariosInstalaciones';
import { Validadores } from 'src/entities/Validadores';
import { Contadores } from 'src/entities/Contadores';
import { Vehiculos } from 'src/entities/Vehiculos';
import { Clientes } from 'src/entities/Clientes';
import { HistoricoInstalaciones } from 'src/entities/historico-instalaciones';
import { HistoricoinstalacionesService } from 'src/historicoinstalaciones/historicoinstalaciones.service';
import { InstalacionContadores } from 'src/entities/InstalacionContadores';
import { EnumModulos, EstadoComponente, EstatusEnum } from 'src/common/estatus.enum';

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
    @InjectRepository(InstalacionContadores)
    private readonly instalacionContadoresRepository: Repository<InstalacionContadores>,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly historicoinstalacionesService: HistoricoinstalacionesService,
  ) { }

  // ========================================
  // 🔹 CREAR UN INSTALACION
  // ========================================
  async create(
    idUser: number,
    cliente: number,
    rol: number,
    createInstalacioneDto: CreateInstalacionesDto,
  ): Promise<ApiCrudResponse> {
    try {
      let permiso;
      // ✅ VALIDACIÓN MEJORADA: Verificar todos los conflictos con relaciones
      const errores: string[] = [];

      // Verificar validador CON relaciones
      const validadorEnUso = await this.instalacionesRepository.findOne({
        where: {
          idValidador: createInstalacioneDto.idValidador,
          estatus: 1,
        },
        relations: ['validadores'],
      });
      if (validadorEnUso) {
        errores.push(
          ` Validador ${validadorEnUso.validadores.numeroSerie} ya está en uso.`,
        );
      }

      // Verificar Contadores CON relaciones
      for (const idContador of createInstalacioneDto.idContadores) {
        const contadorEnUso = await this.instalacionContadoresRepository.findOne({
          where: { idContador: idContador, estatus: 1 },
          relations: ['contador'],
        });
        if (contadorEnUso) {
          errores.push(
            ` Contador ${contadorEnUso.contador.numeroSerie} ya está en uso.`,
          );
        }
      }

      // Verificar Vehículo CON relaciones
      const vehiculoEnUso = await this.instalacionesRepository.findOne({
        where: { idVehiculo: createInstalacioneDto.idVehiculo, estatus: 1 },
        relations: ['vehiculos'],
      });
      if (vehiculoEnUso) {
        errores.push(
          ` Vehículo con placa ${vehiculoEnUso.vehiculos.placa} ya está en uso.`,
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
        createInstalacioneDto,
      );
      const instalacionSave =
        await this.instalacionesRepository.save(newInstalaciones);

      //Asignamos a root la zona
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
        body,
      );
      
      // Crear registros en InstalacionContadores para cada contador
      for (const idContador of createInstalacioneDto.idContadores) {
        await this.contadoresRepository.update(idContador, body);
        const instalacionContador = this.instalacionContadoresRepository.create({
          idInstalacion: instalacionSave.id,
          idContador: idContador,
          estatus: 1,
        });
        await this.instalacionContadoresRepository.save(instalacionContador);
      }
      
      await this.vehiculosRepository.update(
        createInstalacioneDto.idVehiculo,
        body,
      );

      // Registro en la bitácora SUCCESS
      const querylogger = { createInstalacioneDto };
      await this.bitacoraLogger.logToBitacora(
        'Instalaciones',
        `La instalación con ID: ${instalacionSave.id} ha sido creada exitosamente.`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.INSTALACIONES,
        EstatusEnumBitcora.SUCCESS,
      );

      //Registro historico (usando el primer contador para compatibilidad)
      await this.historicoinstalacionesService.createHistorico(
        instalacionSave.id,
        instalacionSave.idValidador,
        createInstalacioneDto.idContadores[0] || 0,
        instalacionSave.idVehiculo,
        instalacionSave.idCliente,
        idUser,
      );

      // API response (con mensajes corregidos)
      const contadoresStr = createInstalacioneDto.idContadores.join(', ');
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'La instalación ha sido creada correctamente.',
        data: {
          id: Number(instalacionSave.id),
          nombre: `Instalación ${instalacionSave.id} registrada con los siguientes detalles: Validador: ${instalacionSave.idValidador}, Contadores: ${contadoresStr}, Vehículo: ${instalacionSave.idVehiculo}.`, // ✅ Mejorado
        },
      };

      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { createInstalacioneDto };
      await this.bitacoraLogger.logToBitacora(
        'Instalaciones',
        `Se creó una Instalación con `, // ✅ Corregido
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.INSTALACIONES,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }

      // ✅ Manejo específico para errores de FK (del error original que tenías)
      if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        throw new BadRequestException({
          message: 'Error de referencia en la base de datos',
          details:
            'Verifica que los IDs de Cliente, Validador, Contador y Vehículo sean válidos y existan en el sistema',
          sqlError: 'La combinación Cliente-Validador no es válida',
        });
      }

      throw new InternalServerErrorException({
        message: 'Error al crear Instalación',
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

  private async consultarInstalacionesPaginado(
    cliente: number,
    limit: number,
    offset: number,
  ) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT
  -- Instalación
  i.Id AS id,
  i.FechaCreacion AS fechaCreacion,
  i.FechaActualizacion AS fechaActualizacion,
  i.Estatus AS estatus,

  -- Validador
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,

  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,
  v.CantidadPuertas AS cantidadPuertas,

  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  

GROUP BY i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         i.IdValidador, d.NumeroSerie, d.Marca, d.Modelo,
         i.IdVehiculo, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico, v.CantidadPuertas,
         i.IdCliente, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus

ORDER BY i.Id DESC
LIMIT ? OFFSET ?;
   `;
    return this.instalacionesRepository.query(query, [...ids, limit, offset]);
  }

  private async consultarTotalInstalacionesPaginados(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `  
  SELECT COUNT(DISTINCT i.Id) AS total
  FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  
`;
    return await this.instalacionesRepository.query(query, [...ids]);
  }

  // ========================================
  // 🔹 OBTENER PAGINADO DE INSTALACIONES
  // ========================================
  async findAll(
    idUser: number,
    cliente: number,
    rol: number,
    page: number,
    limit: number,
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

  -- Validador
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,

  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,
  v.CantidadPuertas AS cantidadPuertas,

  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

GROUP BY i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         i.IdValidador, d.NumeroSerie, d.Marca, d.Modelo,
         i.IdVehiculo, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico, v.CantidadPuertas,
         i.IdCliente, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus

ORDER BY i.Id DESC
  LIMIT ? OFFSET ?;

  `,
            [limit, offset],
          );
          // Query para total (sin paginación)
          totalResult = await this.instalacionesRepository.query(
            `
  SELECT COUNT(DISTINCT i.Id) AS total
  FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id


		
  `,
          );
          break;

        case 2:
          // Consulta de datos paginados Usuario Administrador
          instalaciones = await this.consultarInstalacionesPaginado(
            cliente,
            limit,
            offset,
          );
          // Query para total (sin paginación)
          totalResult =
            await this.consultarTotalInstalacionesPaginados(cliente);
          break;

        case 3:
          // Consulta de datos paginados Usuario Operador
          instalaciones = await this.consultarInstalacionesPaginado(
            cliente,
            limit,
            offset,
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
            offset,
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
            offset,
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
  -- Instalación */*/*/* para resto Usuarios
  i.Id AS id,
  i.FechaCreacion AS fechaCreacion,
  i.FechaActualizacion AS fechaActualizacion,
  i.Estatus AS estatus,
  
  -- Validador
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,
  
  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,
  
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
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE ui.IdUsuario = ?
  AND ui.Estatus = 1

GROUP BY i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         i.IdValidador, d.NumeroSerie, d.Marca, d.Modelo,
         i.IdVehiculo, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico, v.CantidadPuertas,
         i.IdCliente, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus

ORDER BY i.Id DESC
  LIMIT ? OFFSET ?;

  `,
            [idUser, limit, offset],
          );
          // Query para total (sin paginación)
          totalResult = await this.instalacionesRepository.query(
            `
    SELECT COUNT(DISTINCT i.Id) AS total
  FROM UsuariosInstalaciones ui
INNER JOIN Instalaciones i ON ui.IdInstalacion = i.Id
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id
	WHERE ui.IdUsuario = ?
	AND ui.Estatus = 1
  `,
            [idUser],
          );
          break;
      }

      const total = Number(totalResult[0]?.total || 0);

      // 🔥 Transformación de datos (ids → number, contadores como array)
      const data = instalaciones.map((item) => ({
        ...item,
        id: Number(item.id),
        idValidador: Number(item.idValidador),
        idContadores: item.idContadores ? item.idContadores.split(',').map(id => Number(id)) : [],
        numeroSerieContadores: item.numeroSerieContadores ? item.numeroSerieContadores.split(', ') : [],
        marcaContadores: item.marcaContadores ? item.marcaContadores.split(', ') : [],
        modeloContadores: item.modeloContadores ? item.modeloContadores.split(', ') : [],
        // Mantener compatibilidad con código antiguo (concatenados con coma)
        idContador: item.idContadores ? Number(item.idContadores.split(',')[0]) : null,
        numeroSerieContador: item.numeroSerieContadores || null,
        marcaContador: item.marcaContadores || null,
        modeloContador: item.modeloContadores || null,
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
          'Ocurrió un problema al intentar cargar la paginación de instalaciones.',
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

  -- Validador
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contador (múltiples contadores concatenados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,
  -- Para compatibilidad con código antiguo (todos los contadores concatenados)
  MIN(b.Id) AS idContador,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContador,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContador,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContador,

  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,
  v.CantidadPuertas AS cantidadPuertas,

  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN InstalacionContadores ic ON ic.IdInstalacion = i.Id AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE c.Estatus = 1
AND c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND i.Estatus = 1

GROUP BY i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         i.IdValidador, d.NumeroSerie, d.Marca, d.Modelo,
         i.IdVehiculo, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico, v.CantidadPuertas,
         i.IdCliente, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus

ORDER BY i.Id DESC
   `;
    return this.instalacionesRepository.query(query, [...ids]);
  }

  // ========================================
  // 🔹 OBTENER LISTADO DE INSTALACIONES
  // ========================================
  async findAllList(
    idUser: number,
    cliente: number,
    rol: number,
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

  -- Validador
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contador (múltiples contadores concatenados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,
  -- Para compatibilidad con código antiguo (todos los contadores concatenados)
  MIN(b.Id) AS idContador,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContador,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContador,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContador,

  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,
  v.CantidadPuertas AS cantidadPuertas,

  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN InstalacionContadores ic ON ic.IdInstalacion = i.Id AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE i.Estatus = 1
AND c.Estatus = 1

GROUP BY i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         i.IdValidador, d.NumeroSerie, d.Marca, d.Modelo,
         i.IdVehiculo, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico, v.CantidadPuertas,
         i.IdCliente, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus

ORDER BY i.Id DESC;

  `,
          );
          break;

        case 2:
          // Consulta de datos paginados Usuario Administrador
          instalaciones = await this.consultarInstalacionesListado(cliente);
          break;

        case 3:
          // Consulta de datos paginados Usuario Operador
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
  -- Instalación */*/*/* para resto Usuarios
  i.Id AS id,
  i.FechaCreacion AS fechaCreacion,
  i.FechaActualizacion AS fechaActualizacion,
  i.Estatus AS estatus,
  
  -- Validador
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,
  
  -- Contador (múltiples contadores concatenados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,
  -- Para compatibilidad con código antiguo (todos los contadores concatenados)
  MIN(b.Id) AS idContador,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContador,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContador,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContador,
  
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
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE ui.IdUsuario = ?
  AND ui.Estatus = 1
  AND i.Estatus = 1
  AND c.Estatus = 1

GROUP BY i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         i.IdValidador, d.NumeroSerie, d.Marca, d.Modelo,
         i.IdVehiculo, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico, v.CantidadPuertas,
         i.IdCliente, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus

ORDER BY i.Id DESC;

  `,
            [idUser],
          );
          break;
      }

      // 🔥 Transformación de datos (ids → number, nombreCompleto)
      const data = instalaciones.map((item) => ({
        ...item,
        id: Number(item.id),
        idValidador: Number(item.idValidador),
        idContador: Number(item.idContador),
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
        message: 'No fue posible obtener el listado de instalaciones.',
        error,
      });
    }
  }

  async findByValidador(idValidador: number, idUser: number, cliente: number, rol: number) {
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

  -- Validador
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,

  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,
  v.CantidadPuertas AS cantidadPuertas,

  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE i.IdValidador = ?
  AND i.Estatus = 1

GROUP BY i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         i.IdValidador, d.NumeroSerie, d.Marca, d.Modelo,
         i.IdVehiculo, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico, v.CantidadPuertas,
         i.IdCliente, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus

ORDER BY i.Id DESC;

  `,
            [idValidador],
          );
          break;

        default:
          // Usuarios normales - solo instalaciones de su cliente
          const { ids, placeholders } = await this.clienteHijos(cliente);
          instalaciones = await this.instalacionesRepository.query(
            `
SELECT
  -- Instalación
  i.Id AS id,
  i.FechaCreacion AS fechaCreacion,
  i.FechaActualizacion AS fechaActualizacion,
  i.Estatus AS estatus,

  -- Validador
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,

  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,
  v.CantidadPuertas AS cantidadPuertas,

  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE i.IdValidador = ?
  AND i.IdCliente IN (${placeholders})
  AND i.Estatus = 1

GROUP BY i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         i.IdValidador, d.NumeroSerie, d.Marca, d.Modelo,
         i.IdVehiculo, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico, v.CantidadPuertas,
         i.IdCliente, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus

ORDER BY i.Id DESC;
   `,
            [idValidador, ...ids],
          );
          break;
      }

      if (instalaciones.length === 0) {
        return { data: [] };
      }

      // Transformamos ids a number y convertimos idContadores a array
      const data = instalaciones.map((item) => {
        // Asegurar que idContadores sea un array de números
        let idContadoresArray: number[] = [];
        if (item.idContadores) {
          // Manejar tanto string como null/undefined
          const idsStr = String(item.idContadores).trim();
          if (idsStr) {
            idContadoresArray = idsStr.split(',').map(id => {
              const numId = Number(id.trim());
              return isNaN(numId) ? null : numId;
            }).filter(id => id !== null) as number[];
          }
        }

        return {
          ...item,
          id: Number(item.id),
          idValidador: Number(item.idValidador),
          idContadores: idContadoresArray, // Array de IDs de contadores
          numeroSerieContadores: item.numeroSerieContadores ? item.numeroSerieContadores.split(', ') : [],
          marcaContadores: item.marcaContadores ? item.marcaContadores.split(', ') : [],
          modeloContadores: item.modeloContadores ? item.modeloContadores.split(', ') : [],
          // Mantener compatibilidad con código antiguo (primer contador)
          idContador: idContadoresArray.length > 0 ? idContadoresArray[0] : null,
          numeroSerieContador: item.numeroSerieContadores ? item.numeroSerieContadores.split(', ')[0] : null,
          marcaContador: item.marcaContadores ? item.marcaContadores.split(', ')[0] : null,
          modeloContador: item.modeloContadores ? item.modeloContadores.split(', ')[0] : null,
          idVehiculo: Number(item.idVehiculo),
          cantidadPuertas: item.cantidadPuertas ? Number(item.cantidadPuertas) : null,
          idCliente: Number(item.idCliente),
        };
      });

      return { data: data };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener instalaciones por validador',
        error: error.message,
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

  -- Validador
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,

  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,
  v.CantidadPuertas AS cantidadPuertas,

  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE i.Id = ?
AND i.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

GROUP BY i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         i.IdValidador, d.NumeroSerie, d.Marca, d.Modelo,
         i.IdVehiculo, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico, v.CantidadPuertas,
         i.IdCliente, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus

ORDER BY i.Id DESC;
   `;
    return this.instalacionesRepository.query(query, [id, ...ids]);
  }

  // ========================================
  // 🔹 OBTENER UNA INSTALACION
  // ========================================
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

  -- Validador
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,

  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,

  -- Vehículo
  i.IdVehiculo AS idVehiculo,
  v.Marca AS marcaVehiculo,
  v.Modelo AS modeloVehiculo,
  v.Placa AS placaVehiculo,
  v.NumeroEconomico AS numeroEconomicoVehiculo,
  v.CantidadPuertas AS cantidadPuertas,

  -- Cliente
  i.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Instalaciones i
INNER JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE i.Id = ?

GROUP BY i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         i.IdValidador, d.NumeroSerie, d.Marca, d.Modelo,
         i.IdVehiculo, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico, v.CantidadPuertas,
         i.IdCliente, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus

ORDER BY i.Id DESC;

  `,
            [id],
          );
          break;

        case 2:
          // Consulta de datos paginados Usuario Administrador
          instalaciones = await this.consultarInstalacionesOne(cliente, id);
          break;

        case 3:
          // Consulta de datos paginados Usuario Operador
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
  -- Instalación */*/*/* para resto Usuarios
  i.Id AS id,
  i.FechaCreacion AS fechaCreacion,
  i.FechaActualizacion AS fechaActualizacion,
  i.Estatus AS estatus,
  
  -- Validador
  i.IdValidador AS idValidador,
  d.NumeroSerie AS numeroSerieValidador,
  d.Marca AS marcaValidador,
  d.Modelo AS modeloValidador,
  
  -- Contadores (agregados)
  GROUP_CONCAT(DISTINCT b.Id ORDER BY b.Id SEPARATOR ',') AS idContadores,
  GROUP_CONCAT(DISTINCT b.NumeroSerie ORDER BY b.Id SEPARATOR ', ') AS numeroSerieContadores,
  GROUP_CONCAT(DISTINCT b.Marca ORDER BY b.Id SEPARATOR ', ') AS marcaContadores,
  GROUP_CONCAT(DISTINCT b.Modelo ORDER BY b.Id SEPARATOR ', ') AS modeloContadores,
  
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
LEFT JOIN InstalacionContadores ic ON i.Id = ic.IdInstalacion AND ic.Estatus = 1
LEFT JOIN Contadores b ON ic.IdContador = b.Id
INNER JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
INNER JOIN Clientes c ON i.IdCliente = c.Id

WHERE ui.IdUsuario = ?
  AND ui.Estatus = 1
  AND i.Id = ?

GROUP BY i.Id, i.FechaCreacion, i.FechaActualizacion, i.Estatus,
         i.IdValidador, d.NumeroSerie, d.Marca, d.Modelo,
         i.IdVehiculo, v.Marca, v.Modelo, v.Placa, v.NumeroEconomico, v.CantidadPuertas,
         i.IdCliente, c.Nombre, c.ApellidoPaterno, c.ApellidoMaterno, c.Estatus

ORDER BY i.Id DESC;

  `,
            [idUser, id],
          );
          break;
      }

      if (instalaciones.length === 0) {
        throw new NotFoundException('No se encontraron instalaciones.');
      }

      // 🔥 Transformamos ids a number y convertimos idContadores a array
      const data = instalaciones.map((item) => {
        // Asegurar que idContadores sea un array de números
        let idContadoresArray: number[] = [];
        if (item.idContadores) {
          // Manejar tanto string como null/undefined
          const idsStr = String(item.idContadores).trim();
          if (idsStr) {
            idContadoresArray = idsStr.split(',').map(id => {
              const numId = Number(id.trim());
              return isNaN(numId) ? null : numId;
            }).filter(id => id !== null) as number[];
          }
        }

        return {
          ...item,
          id: Number(item.id),
          idValidador: Number(item.idValidador),
          idContadores: idContadoresArray, // Array de IDs de contadores
          numeroSerieContadores: item.numeroSerieContadores ? item.numeroSerieContadores.split(', ') : [],
          marcaContadores: item.marcaContadores ? item.marcaContadores.split(', ') : [],
          modeloContadores: item.modeloContadores ? item.modeloContadores.split(', ') : [],
          // Mantener compatibilidad con código antiguo (primer contador)
          idContador: idContadoresArray.length > 0 ? idContadoresArray[0] : null,
          numeroSerieContador: item.numeroSerieContadores ? item.numeroSerieContadores.split(', ')[0] : null,
          marcaContador: item.marcaContadores ? item.marcaContadores.split(', ')[0] : null,
          modeloContador: item.modeloContadores ? item.modeloContadores.split(', ')[0] : null,
          idVehiculo: Number(item.idVehiculo),
          cantidadPuertas: item.cantidadPuertas ? Number(item.cantidadPuertas) : null,
          idCliente: Number(item.idCliente),
        };
      });

      return { data: data };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message:
          'Ocurrió un problema al intentar acceder a las instalaciones por ID.',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 ACTUALIZAR ESTATUS
  // ========================================
  async updateEstatus(
    id: number,
    idUser: number,
    cliente: number,
    rol: number,
    updateInstalacioneEstatusDto: UpdateInstalacioneEstatusDto,
  ) {
    try {
      const instalacion = await this.instalacionesRepository.findOne({
        where: { id: id },
      });

      if (!instalacion) {
        throw new NotFoundException(
          `Instalaciones con id: ${id} no encontrado`,
        );
      }

      //Actualizamos el estatus
      const estatus = updateInstalacioneEstatusDto.estatus;
      if (estatus === 1) {
        // ✅ VALIDACIÓN MEJORADA: Verificar todos los conflictos con relaciones
        const errores: string[] = [];

        // Verificar validador CON relaciones
        const validadorEnUso = await this.instalacionesRepository.findOne({
          where: {
            idValidador: instalacion.idValidador,
            estatus: 1,
          },
          relations: ['validadores'],
        });
        if (validadorEnUso) {
          errores.push(
            `Validador "${validadorEnUso.validadores.numeroSerie}" ya está en uso`,
          );
        }

        // Obtener contadores de la instalación una sola vez para reutilizar
        const contadoresInstalacion = await this.instalacionContadoresRepository.find({
          where: { idInstalacion: instalacion.id, estatus: 1 },
          relations: ['contador'],
        });
        
        // Verificar Contadores CON relaciones
        for (const ic of contadoresInstalacion) {
          if (ic.idContador === null) continue;
          const contadorEnUso = await this.instalacionContadoresRepository.findOne({
            where: { idContador: ic.idContador, estatus: 1 },
            relations: ['contador', 'instalacion'],
          });
          if (contadorEnUso && contadorEnUso.idInstalacion !== instalacion.id) {
            errores.push(
              `Contador "${contadorEnUso.contador.numeroSerie}" ya está en uso`,
            );
          }
        }

        // Verificar Vehículo CON relaciones
        const vehiculoEnUso = await this.instalacionesRepository.findOne({
          where: { idVehiculo: instalacion.idVehiculo, estatus: 1 },
          relations: ['vehiculos'],
        });
        if (vehiculoEnUso) {
          errores.push(
            `Vehículo con placa "${vehiculoEnUso.vehiculos.placa}" ya está en uso`,
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

        // ✅ Verificar todos los componentes esten disponibles
        const erroresEstado: string[] = [];
        // Verificar validador este disponible
        const validadorEstado = await this.validadoresRepository.findOne({
          where: {
            id: instalacion.idValidador,
            estatus: 1,
            estadoActual: 1,
          },
        });
        if (!validadorEstado) {
          erroresEstado.push(
            `Validador "${instalacion.idValidador}" su estado actual, no esta disponible`,
          );
        }

        // Verificar Contadores estén disponibles (reutilizar contadoresInstalacion ya obtenidos)
        for (const ic of contadoresInstalacion) {
          if (ic.idContador === null) continue;
          const contadorEstado = await this.contadoresRepository.findOne({
            where: { id: ic.idContador, estatus: 1, estadoActual: 1 },
          });
          if (!contadorEstado) {
            erroresEstado.push(
              `Contador "${ic.contador.numeroSerie}" su estado actual, no esta disponible`,
            );
          }
        }

        // Verificar Vehículo este disponible
        const vehiculoEstado = await this.vehiculosRepository.findOne({
          where: { id: instalacion.idVehiculo, estatus: 1, estadoActual: 1 },
        });
        if (!vehiculoEstado) {
          erroresEstado.push(
            `Vehículo con placa "${instalacion.idVehiculo}" su estado actual, no esta disponible`,
          );
        }

        // Si hay conflictos, lanzar error con todos los detalles
        if (erroresEstado.length > 0) {
          throw new BadRequestException({
            message: `No se puede crear la instalación debido a los siguientes conflictos: ${erroresEstado[0]}`,
            errors: erroresEstado,
            conflictsCount: erroresEstado.length,
          });
        }

        // Cambiar estatus de componentes a 2 (Asignado)
        const body = { estadoActual: EstadoComponente.ASIGNADO };
        await this.validadoresRepository.update(
          instalacion.idValidador,
          body,
        );
        // Actualizar todos los contadores de la instalación (reutilizar contadoresInstalacion ya obtenidos)
        for (const ic of contadoresInstalacion) {
          if (ic.idContador !== null) {
            await this.contadoresRepository.update(ic.idContador, body);
          }
        }
        await this.vehiculosRepository.update(instalacion.idVehiculo, body);
      } else if (estatus === 0) {
        // Desactivar instalación → activar componentes a 1(Disponible)
        const body = { estadoActual: EstadoComponente.DISPONIBLE };
        await this.validadoresRepository.update(
          instalacion.idValidador,
          body,
        );
        // Actualizar todos los contadores de la instalación
        const contadoresInstalacion = await this.instalacionContadoresRepository.find({
          where: { idInstalacion: instalacion.id, estatus: 1 },
        });
        for (const ic of contadoresInstalacion) {
          if (ic.idContador !== null) {
            await this.contadoresRepository.update(ic.idContador, body);
          }
        }
        await this.vehiculosRepository.update(instalacion.idVehiculo, body);
      }

      await this.instalacionesRepository.update(id, { estatus: estatus });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateInstalacioneEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Instalaciones',
        `Se actualizó el estatus de la instalación con ID: ${instalacion.id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.INSTALACIONES,
        EstatusEnumBitcora.SUCCESS,
      );

      // Obtener contadores para el mensaje
      const contadoresInstalacion = await this.instalacionContadoresRepository.find({
        where: { idInstalacion: instalacion.id, estatus: 1 },
      });
      const idContadores = contadoresInstalacion
        .filter(ic => ic.idContador !== null)
        .map(ic => ic.idContador)
        .join(', ');

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message:
          'El estatus de las instalaciones ha sido actualizado con éxito.',
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre:
            `${instalacion.id} validador:${instalacion.idValidador} contadores: ${idContadores} vehiculo: ${instalacion.idVehiculo}` ||
            '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateInstalacioneEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Instalaciones',
        `Se cambio el estatus de instalacion con id: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.INSTALACIONES,
        EstatusEnumBitcora.ERROR,
        error.message,
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

  // ========================================
  // 🔹 ACTUALIZAR INSTALACION
  // ========================================
  async update(
    id: number,
    idUser: number,
    cliente: number,
    rol: number,
    updateInstalacioneDto: UpdateInstalacioneDto,
  ): Promise<ApiCrudResponse> {
    try {
      const instalacion = await this.instalacionesRepository.findOne({
        where: { id: id },
      });

      if (!instalacion) {
        throw new NotFoundException(
          `No se encontró la instalación con ID: ${id}.`,
        );
      }

      //verificamos que exista el dispositivo a actualizar
      if (updateInstalacioneDto.estatusValidadorAnterior) {
        //Actualizamos el estado del dispositivo anterior
        const estadoViejoDispositivo =
          updateInstalacioneDto.estatusValidadorAnterior;
        await this.validadoresRepository.update(instalacion.idValidador, {
          estadoActual: estadoViejoDispositivo,
        });
        //Actualizamos el estado del dispositivo nuevo a asignado
        await this.validadoresRepository.update(
          Number(updateInstalacioneDto.idValidador),
          { estadoActual: EstadoComponente.ASIGNADO },
        );
        //Actualizamos el dispositivo en la instalacion
        await this.instalacionesRepository.update(id, {
          idValidador: updateInstalacioneDto.idValidador,
        });
      }

      //verificamos que exista el contadores a actualizar
      if (updateInstalacioneDto.idContadores && updateInstalacioneDto.idContadores.length > 0) {
        // Si hay contadores anteriores a actualizar (con su estatus específico)
        if (updateInstalacioneDto.contadoresAnteriores && updateInstalacioneDto.contadoresAnteriores.length > 0) {
          // Actualizar estado de cada contador anterior con su estatus específico
          for (const contadorAnterior of updateInstalacioneDto.contadoresAnteriores) {
            await this.contadoresRepository.update(contadorAnterior.idContador, {
              estadoActual: contadorAnterior.estatusAnterior,
            });
            // Desactivar relación anterior
            await this.instalacionContadoresRepository.update(
              { idInstalacion: id, idContador: contadorAnterior.idContador },
              { estatus: 0 },
            );
          }
        }

        // Agregar nuevos contadores
        for (const idContador of updateInstalacioneDto.idContadores) {
          // Verificar si ya existe la relación activa
          const existeRelacion = await this.instalacionContadoresRepository.findOne({
            where: { idInstalacion: id, idContador: idContador, estatus: 1 },
          });

          if (!existeRelacion) {
            // Actualizar estado del contador nuevo a asignado
            await this.contadoresRepository.update(idContador, {
              estadoActual: EstadoComponente.ASIGNADO,
            });
            // Crear nueva relación
            const nuevaRelacion = this.instalacionContadoresRepository.create({
              idInstalacion: id,
              idContador: idContador,
              estatus: 1,
            });
            await this.instalacionContadoresRepository.save(nuevaRelacion);
          }
        }
      }

      const instalacionActualizada = await this.instalacionesRepository.findOne(
        {
          where: { id: id },
        },
      );

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateInstalacioneDto };
      await this.bitacoraLogger.logToBitacora(
        'Instalaciones',
        `Se actualizo instalacion con id: ${instalacion.id}`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.INSTALACIONES,
        EstatusEnumBitcora.SUCCESS,
      );

      // Obtener contadores actuales
      const contadoresActuales = await this.instalacionContadoresRepository.find({
        where: { idInstalacion: id, estatus: 1 },
        relations: ['contador'],
      });
      const idContadores = contadoresActuales
        .filter(ic => ic.idContador !== null)
        .map(ic => ic.idContador as number);
      const primerContador = idContadores[0] || null;

      const body = {
        idInstalacion: id,
        idValidador: instalacion.idValidador,
        idContador: primerContador ?? undefined, // Para compatibilidad con histórico
        idVehiculo: instalacion.idVehiculo,
        idCliente: instalacion.idCliente,
      };
      const comentario = `${updateInstalacioneDto.comentariosContador ?? ''} ${updateInstalacioneDto.comentariosValidador ?? ''}`

      //Registro historico
      await this.historicoinstalacionesService.updateHistorico(
        body,
        Number(instalacionActualizada?.idValidador),
        primerContador ?? 0,
        Number(instalacionActualizada?.idVehiculo),
        Number(instalacionActualizada?.idCliente),
        idUser,
        comentario,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Las instalaciones se actualizaron con éxito.',
        data: {
          id: id,
          nombre:
            `Instalación ${instalacion.id} asociada a Validador: ${instalacion.idValidador}, Contadores: ${idContadores.join(', ')} y Vehículo: ${instalacion.idVehiculo}.` ||
            '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateInstalacioneDto };
      await this.bitacoraLogger.logToBitacora(
        'Instalaciones',
        `Se actualizo instalacion con id: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.INSTALACIONES,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar Instalación',
        error: error, // ✅ Solo el mensaje, no todo el objeto
      });
    }
  }

  // ========================================
  // 🔹 ELIMINADO LOGICO
  // ========================================
  async remove(
    id: number,
    cliente: number,
    idUser: number,
    rol: number,
  ): Promise<ApiCrudResponse> {
    try {
      let instalacion;
      instalacion = await this.instalacionesRepository.findOne({
        where: { id: id },
      });

      if (!instalacion) {
        throw new NotFoundException(
          `La instalación con ID: ${id} no está disponible.`,
        );
      }

      //Actualizamos datos
      await this.instalacionesRepository.update(id, {
        estatus: EstatusEnum.INACTIVO,
      });

      // Desactivar instalación → activar componentes
      const body = { estadoActual: EstadoComponente.DISPONIBLE };
      await this.validadoresRepository.update(instalacion.idValidador, body);
      // Actualizar todos los contadores de la instalación
      const contadoresInstalacion = await this.instalacionContadoresRepository.find({
        where: { idInstalacion: instalacion.id, estatus: 1 },
      });
      for (const ic of contadoresInstalacion) {
        if (ic.idContador !== null) {
          await this.contadoresRepository.update(ic.idContador, body);
        }
      }
      await this.vehiculosRepository.update(instalacion.idVehiculo, body);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Instalaciones',
        `La instalación con ID: ${instalacion.id} ha sido eliminada exitosamente.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.INSTALACIONES,
        EstatusEnumBitcora.SUCCESS,
      );

      // Usar los contadores ya obtenidos para el mensaje
      const idContadores = contadoresInstalacion
        .filter(ic => ic.idContador !== null)
        .map(ic => ic.idContador)
        .join(', ');

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Instalaciones eliminado correctamente',
        data: {
          id: id,
          nombre:
            `${instalacion.id} validador:${instalacion.idValidador} contadores: ${idContadores} vehiculo: ${instalacion.idVehiculo}` ||
            '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Instalaciones',
        `La instalación con ID: ${id} ha sido eliminada exitosamente.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.INSTALACIONES,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error al eliminar de instalaciones con id: ${id}`,
      );
    }
  }
}
