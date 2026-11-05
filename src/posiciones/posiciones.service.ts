import {
  clienteHijosDesdeSp,
  tieneIdsTenant,
} from 'src/common/tenant/ownership-resolvers';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { CreatePosicionesDto } from './dto/create-posicione.dto';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { InjectRepository } from '@nestjs/typeorm';
import { Posiciones } from 'src/entities/Posiciones';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { Usuarios } from 'src/entities/Usuarios';
import { Clientes } from 'src/entities/Clientes';
import { EnumModulos } from 'src/common/estatus.enum';
import { UpdatePosicionesDto } from './dto/update-posicione.dto';
import { Validadores } from 'src/entities/Validadores';
import { MonitoreoGateway } from 'src/monitoreo/monitoreo.gateway';
import { MonitoreoService } from 'src/monitoreo/monitoreo.service';

@Injectable()
export class PosicionesService {
  private readonly logger = new Logger(PosicionesService.name);
  constructor(
    @InjectRepository(Posiciones)
    private readonly posicionesRepository: Repository<Posiciones>,
    @InjectRepository(Validadores)
    private readonly validadoresRepository: Repository<Validadores>,
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
    @Inject(forwardRef(() => MonitoreoGateway))
    private readonly monitoreoGateway: MonitoreoGateway,
    @Inject(forwardRef(() => MonitoreoService))
    private readonly monitoreoService: MonitoreoService,
  ) {}

  // ========================================
  // 🔹 CREAR UN POSICION
  // ========================================
  async create(
    createPosicionesDto: CreatePosicionesDto,
    actor:
      | { userId: number; cliente: number; rol: number }
      | { device: true; numeroSerieValidador: string },
  ): Promise<ApiCrudResponse> {
    const esDispositivo = 'device' in actor;
    try {
      const lat = Number(createPosicionesDto.latitud);
      const lon = Number(createPosicionesDto.longitud);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        (Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      ) {
        throw new BadRequestException('Coordenadas GPS inválidas');
      }

      let serie = String(createPosicionesDto.numeroSerieValidador || '').trim();

      if (esDispositivo) {
        // Serie ya verificada por DeviceOrJwtGuard contra la credencial del
        // dispositivo (Validadores.DeviceTokenHash). No hay usuario operador.
        serie = actor.numeroSerieValidador;
      } else {
        const usuario = await this.usuariosRepository.findOne({
          where: { id: actor.userId },
          select: ['id', 'validadorId', 'idCliente'],
        });
        if (!usuario) {
          throw new ForbiddenException('No autorizado');
        }

        if (Number(actor.rol) === 3) {
          if (!usuario.validadorId) {
            throw new ForbiddenException(
              'El operador no tiene validador asignado.',
            );
          }
          if (serie && serie !== usuario.validadorId) {
            throw new ForbiddenException(
              'El validador no coincide con el asignado.',
            );
          }
          serie = usuario.validadorId;
        }
      }

      const cuando = new Date(createPosicionesDto.fechaHora);
      const delta = cuando.getTime() - Date.now();
      if (
        Number.isNaN(cuando.getTime()) ||
        delta > 5 * 60 * 1000 ||
        delta < -30 * 60 * 1000
      ) {
        throw new BadRequestException('La marca de tiempo GPS no es válida');
      }

      const previa = await this.posicionesRepository.findOne({
        where: {
          numeroSerieValidador: serie,
          fechaHora: createPosicionesDto.fechaHora,
        },
      });
      if (previa) {
        return {
          status: 'success',
          message: 'Posicion creada correctamente',
          data: {
            id: Number(previa.id),
            nombre: `${Number(previa.id)} ${serie}`,
          },
        };
      }

      const validador = await this.validadoresRepository.findOne({
        where: { numeroSerie: serie },
      });
      if (!validador) {
        throw new NotFoundException('Validador no encontrado');
      }
      if (!esDispositivo && Number(actor.rol) !== 1) {
        const { ids } = await this.clienteHijos(Number(actor.cliente));
        if (!ids.includes(Number(validador.idCliente))) {
          throw new NotFoundException('Validador no encontrado');
        }
      }

      const newPosicion = this.posicionesRepository.create({
        exactitud: createPosicionesDto.exactitud,
        estado: createPosicionesDto.estado,
        velocidad: createPosicionesDto.velocidad,
        direccion: createPosicionesDto.direccion,
        latitud: createPosicionesDto.latitud,
        longitud: createPosicionesDto.longitud,
        fechaHora: createPosicionesDto.fechaHora,
        numeroSerieValidador: serie,
      });

      let posicionSave: Posiciones;
      try {
        posicionSave = await this.posicionesRepository.save(newPosicion, {
          reload: false,
        });
      } catch (saveError) {
        // Anti-replay (UQ_Posiciones_Serie_FechaHora): un reenvío con la misma
        // (NumeroSerieValidador, FechaHora) choca con el índice único. Se
        // descarta sin romper, respondiendo OK idempotente.
        if (this.esErrorDuplicado(saveError)) {
          const dup = await this.posicionesRepository.findOne({
            where: {
              numeroSerieValidador: serie,
              fechaHora: createPosicionesDto.fechaHora,
            },
          });
          if (dup) {
            return {
              status: 'success',
              message: 'Posicion creada correctamente',
              data: {
                id: Number(dup.id),
                nombre: `${Number(dup.id)} ${serie}`,
              },
            };
          }
        }
        throw saveError;
      }

      // 🔥 NUEVO: Emitir actualización completa de unidad en tiempo real a usuarios conectados
      try {
        if (this.monitoreoGateway && this.monitoreoService) {
          const unidadCompleta =
            await this.monitoreoService.obtenerUnidadPorValidador(
              serie,
              validador.idCliente,
            );

          if (unidadCompleta) {
            // Emitir actualización completa de unidad en tiempo real
            this.monitoreoGateway.emitUnidadUpdate(
              unidadCompleta,
              validador.idCliente,
            );
          }
        }
      } catch (wsError) {
        // No fallar la creación si hay error en WebSocket
        this.logger.error('Error al emitir actualización WebSocket');
      }

      //APis Response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Posicion creada correctamente',
        data: {
          id: Number(posicionSave.id),
          nombre:
            `${posicionSave.id} ${posicionSave.numeroSerieValidador}` || '',
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora----- ERROR
      const querylogger = {
        numeroSerieValidador: createPosicionesDto.numeroSerieValidador,
      };
      await this.bitacoraLogger.logToBitacora(
        'Posiciones',
        'Error al crear la posición',
        'CREATE',
        querylogger,
        esDispositivo ? 0 : actor.userId,
        24,
        EstatusEnumBitcora.ERROR,
        'Error al crear Posicion',
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Error al crear Posicion');
    }
  }

  // ========================================
  // 🔹 ACTUALIZAR DATOS DE LA POSICION
  // ========================================
  async update(
    id: number,
    updatePosicionesDto: UpdatePosicionesDto,
  ): Promise<ApiCrudResponse> {
    try {
      // 1. Buscar la posición
      const posicion = await this.posicionesRepository.findOne({
        where: { id },
      });
      if (!posicion) {
        throw new NotFoundException('Posición no encontrada');
      }

      // 3. Guardar cambios
      await this.posicionesRepository.update(id, updatePosicionesDto);

      const dispositivo = await this.validadoresRepository.findOne({
        where: { numeroSerie: posicion.numeroSerieValidador },
      });
      if (dispositivo) {
        const usuario = await this.usuariosRepository.findOne({
          where: {
            idCliente: dispositivo.idCliente,
            idRol: 2,
          },
        });

        // Registro en la bitácora----- SUCCESS
        const querylogger = { updatePosicionesDto };
        await this.bitacoraLogger.logToBitacora(
          'Posiciones',
          `Se creó una Posicion con Numero de serie Validador: ${posicion.numeroSerieValidador}`,
          'UPDATE',
          querylogger,
          usuario?.id || 1,
          EnumModulos.POSICIONES,
          EstatusEnumBitcora.SUCCESS,
        );
      }

      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Posición actualizada correctamente',
        data: {
          id: Number(id),
          nombre: `Posicion con ID ${id}`,
        },
      };

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar la posición',
        error,
      });
    }
  }

  //funcion para obtener los clientes hijos
  private async clienteHijos(cliente: number) {
    return clienteHijosDesdeSp(this.clienteRepository.manager, cliente);
  }

  /** Detecta violación de índice único (MySQL ER_DUP_ENTRY / errno 1062). */
  private esErrorDuplicado(error: unknown): boolean {
    const e = error as {
      code?: string;
      errno?: number;
      driverError?: { code?: string; errno?: number };
    };
    return (
      e?.code === 'ER_DUP_ENTRY' ||
      e?.errno === 1062 ||
      e?.driverError?.code === 'ER_DUP_ENTRY' ||
      e?.driverError?.errno === 1062
    );
  }

  private async consultarPoscionesPaginado(
    cliente: number,
    limit: number,
    offset: number,
  ) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT
    p.Id AS id,
    p.Exactitud AS exactitud,
    p.Estado AS estado,
    p.Estatus AS estatus,
    p.Velocidad AS velocidad,
    p.Direccion AS direccion,
    p.Latitud AS latitud,
    p.Longitud AS longitud,
    p.FechaHora AS fechaHora,
    p.FHRegistro AS fhRegistro,
    p.NumeroSerieValidador AS numeroSerieValidador,
    
    d.Marca AS marcaValidador,
    d.Modelo AS modeloValidador,
    d.IdCliente AS idCliente,

    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente

FROM Posiciones p
INNER JOIN Validadores d
    ON p.NumeroSerieValidador = d.NumeroSerie
INNER JOIN Clientes c
    ON d.IdCliente = c.Id
    
WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

ORDER BY p.Id DESC
LIMIT ? OFFSET ?;
    `;
    return this.posicionesRepository.query(query, [...ids, limit, offset]);
  }

  private async consultarTotalPoscionesPaginados(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `  
    SELECT COUNT(*) AS total
FROM Posiciones p
INNER JOIN Validadores d
    ON p.NumeroSerieValidador = d.NumeroSerie
INNER JOIN Clientes c
    ON d.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
`;
    return await this.posicionesRepository.query(query, [...ids]);
  }

  private async consultarPoscionesPaginadoCL(
    cliente: number,
    limit: number,
    offset: number,
  ) {
    const query = `
SELECT
    p.Id AS id,
    p.Exactitud AS exactitud,
    p.Estado AS estado,
    p.Estatus AS estatus,
    p.Velocidad AS velocidad,
    p.Direccion AS direccion,
    p.Latitud AS latitud,
    p.Longitud AS longitud,
    p.FechaHora AS fechaHora,
    p.FHRegistro AS fhRegistro,
    p.NumeroSerieValidador AS numeroSerieValidador,
    
    d.Marca AS marcaValidador,
    d.Modelo AS modeloValidador,
    d.IdCliente AS idCliente,

    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente

FROM Posiciones p
INNER JOIN Validadores d
    ON p.NumeroSerieValidador = d.NumeroSerie
INNER JOIN Clientes c
    ON d.IdCliente = c.Id

WHERE c.Id = ?   -- 🔹 aquí colocas el ID del cliente que quieres consultar

ORDER BY p.Id DESC
LIMIT ? OFFSET ?;
    `;
    return this.posicionesRepository.query(query, [cliente, limit, offset]);
  }

  private async consultarTotalPoscionesPaginadosCl(cliente: number) {
    const query = `  
    SELECT COUNT(*) AS total
FROM Posiciones p
INNER JOIN Validadores d
    ON p.NumeroSerieValidador = d.NumeroSerie
INNER JOIN Clientes c
    ON d.IdCliente = c.Id

WHERE c.Id = ?   -- 🔹 aquí colocas el ID del cliente que quieres consultar
`;
    return await this.posicionesRepository.query(query, [cliente]);
  }

  // ========================================
  // 🔹 OBTENER PAGINADO DE POSICIONES
  // ========================================
  async findAll(
    idUser: number,
    cliente: number,
    rol: number,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      let posiciones;
      const offset = (page - 1) * limit;
      let totalResult;
      switch (rol) {
        case 1:
          posiciones = await this.posicionesRepository.query(
            `
SELECT
    p.Id AS id,
    p.Exactitud AS exactitud,
    p.Estado AS estado,
    p.Estatus AS estatus,
    p.Velocidad AS velocidad,
    p.Direccion AS direccion,
    p.Latitud AS latitud,
    p.Longitud AS longitud,
    p.FechaHora AS fechaHora,
    p.FHRegistro AS fhRegistro,
    p.NumeroSerieValidador AS numeroSerieValidador,
    
    d.Marca AS marcaValidador,
    d.Modelo AS modeloValidador,
    d.IdCliente AS idCliente,

    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente

FROM Posiciones p
INNER JOIN Validadores d
    ON p.NumeroSerieValidador = d.NumeroSerie
INNER JOIN Clientes c
    ON d.IdCliente = c.Id

ORDER BY p.Id DESC
LIMIT ? OFFSET ?;
        `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.posicionesRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Posiciones p
INNER JOIN Validadores d
    ON p.NumeroSerieValidador = d.NumeroSerie
INNER JOIN Clientes c
    ON d.IdCliente = c.Id

  `,
          );
          break;
        case 3:
        default:
          // Cualquier otro rol (actual o nuevo): filtrar por idCliente + hijos
          posiciones = await this.consultarPoscionesPaginado(
            cliente,
            limit,
            offset,
          );
          totalResult = await this.consultarTotalPoscionesPaginados(cliente);
          break;
      }

      const total = Number(totalResult[0]?.total || 0);

      //Forzamos a cambiar el id a number
      const data = posiciones.map((item) => ({
        ...item,
        id: Number(item.id),
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
        message: 'Error al obtener paginado Posiciones',
        error,
      });
    }
  }

  // Consultar posiciones para roles que usan clientes hijos
  private async consultarPosciones(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);

    const query = `
      SELECT
        p.Id AS id,
        p.Exactitud AS exactitud,
        p.Estado AS estado,
        p.Estatus AS estatus,
        p.Velocidad AS velocidad,
        p.Direccion AS direccion,
        p.Latitud AS latitud,
        p.Longitud AS longitud,
        p.FechaHora AS fechaHora,
        p.FHRegistro AS fhRegistro,
        p.NumeroSerieValidador AS numeroSerieValidador,
        d.Marca AS marcaValidador,
        d.Modelo AS modeloValidador,
        d.IdCliente AS idCliente,
        CONCAT(
          c.Nombre,
          IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
          IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
        ) AS NombreCompletoCliente
      FROM Posiciones p
      INNER JOIN Validadores d
        ON p.NumeroSerieValidador = d.NumeroSerie
      INNER JOIN Clientes c
        ON d.IdCliente = c.Id
      WHERE c.Id IN (${placeholders})
      ORDER BY p.Id DESC;
    `;
    return this.posicionesRepository.query(query, [...ids]);
  }

  // Consultar posiciones para roles que usan solo el cliente actual
  private async consultarPoscionesCL(cliente: number) {
    const query = `
      SELECT
        p.Id AS id,
        p.Exactitud AS exactitud,
        p.Estado AS estado,
        p.Estatus AS estatus,
        p.Velocidad AS velocidad,
        p.Direccion AS direccion,
        p.Latitud AS latitud,
        p.Longitud AS longitud,
        p.FechaHora AS fechaHora,
        p.FHRegistro AS fhRegistro,
        p.NumeroSerieValidador AS numeroSerieValidador,
        d.Marca AS marcaValidador,
        d.Modelo AS modeloDispositivo,
        d.IdCliente AS idCliente,
        CONCAT(
          c.Nombre,
          IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
          IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
        ) AS NombreCompletoCliente
      FROM Posiciones p
      INNER JOIN Validadores d
        ON p.NumeroSerieValidador = d.NumeroSerie
      INNER JOIN Clientes c
        ON d.IdCliente = c.Id
      WHERE c.Id = ? 
      ORDER BY p.Id DESC;
    `;
    return this.posicionesRepository.query(query, [cliente]);
  }

  // ========================================
  // 🔹 OBTENER LISTADO DE POSICIONES
  // ========================================
  async findAllList(idUser: number, cliente: number, rol: number) {
    try {
      let posiciones;

      switch (rol) {
        case 1: // Super Admin
          posiciones = await this.posicionesRepository.query(
            `
SELECT
    p.Id AS id,
    p.Exactitud AS exactitud,
    p.Estado AS estado,
    p.Estatus AS estatus,
    p.Velocidad AS velocidad,
    p.Direccion AS direccion,
    p.Latitud AS latitud,
    p.Longitud AS longitud,
    p.FechaHora AS fechaHora,
    p.FHRegistro AS fhRegistro,
    p.NumeroSerieValidador AS numeroSerieValidador,
    
    d.Marca AS marcaValidador,
    d.Modelo AS modeloValidador,
    d.IdCliente AS idCliente,

    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente

FROM Posiciones p
INNER JOIN Validadores d
    ON p.NumeroSerieValidador = d.NumeroSerie
INNER JOIN Clientes c
    ON d.IdCliente = c.Id

ORDER BY p.Id DESC
        `,
          );
          break;
        case 3:
        default:
          // Cualquier otro rol (actual o nuevo): filtrar por idCliente + hijos
          posiciones = await this.consultarPosciones(cliente);
          break;
      }

      // Forzar id a number
      const data = posiciones.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
      }));

      //APi response
      const result: ApiResponseCommon = {
        data: data,
      };
      return result;
    } catch (error) {
      throw new InternalServerErrorException({
        message: 'Error al obtener posiciones',
        error,
      });
    }
  }

  async findOne(id: number, cliente = 0, rol = 1): Promise<ApiResponseCommon> {
    try {
      let whereSql = 'WHERE p.Id = ?';
      let params: Array<number> = [id];
      if (Number(rol) !== 1) {
        const { ids, placeholders } = await this.clienteHijos(cliente);
        if (!tieneIdsTenant(ids)) {
          throw new NotFoundException('Datos de posicion no encontrado');
        }
        whereSql += ` AND d.IdCliente IN (${placeholders})`;
        params = [id, ...ids];
      }

      const query = `
      SELECT
        p.Id AS id,
        p.Exactitud AS exactitud,
        p.Estado AS estado,
        p.Estatus AS estatus,
        p.Velocidad AS velocidad,
        p.Direccion AS direccion,
        p.Latitud AS latitud,
        p.Longitud AS longitud,
        p.FechaHora AS fechaHora,
        p.FHRegistro AS fhRegistro,
        p.NumeroSerieValidador AS numeroSerieValidador,
        
        d.Marca AS marcaValidador,
        d.Modelo AS modeloValidador,
        d.IdCliente AS idCliente,

        CONCAT(
          c.Nombre,
          IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
          IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
        ) AS NombreCompletoCliente

      FROM Posiciones p
      INNER JOIN Validadores d
        ON p.NumeroSerieValidador = d.NumeroSerie
      INNER JOIN Clientes c
        ON d.IdCliente = c.Id
      ${whereSql};
    `;

      const posiciones = await this.posicionesRepository.query(query, params);

      if (!posiciones || posiciones.length === 0) {
        throw new NotFoundException('Datos de posicion no encontrado');
      }

      //Forzamos a cambiar el id a number
      const data = posiciones.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
      }));

      return { data: data[0] }; // solo un objeto, no array
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener Posicion por ID',
        error,
      });
    }
  }
}
