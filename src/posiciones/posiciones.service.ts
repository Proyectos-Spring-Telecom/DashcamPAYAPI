import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { CreatePosicionesDto } from './dto/create-posicione.dto';
import { ApiCrudResponse, ApiResponseCommon, EstatusEnumBitcora } from 'src/common/ApiResponse';
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
  ) { }

  // ========================================
  // 🔹 CREAR UN POSICION
  // ========================================
  async create(
    createPosicionesDto: CreatePosicionesDto,
    
  ): Promise<ApiCrudResponse> {
    try {
      //Creamos la posicion sin cargar relaciones
      const newPosicion = this.posicionesRepository.create({
        exactitud: createPosicionesDto.exactitud,
        estado: createPosicionesDto.estado,
        velocidad: createPosicionesDto.velocidad,
        direccion: createPosicionesDto.direccion,
        latitud: createPosicionesDto.latitud,
        longitud: createPosicionesDto.longitud,
        fechaHora: createPosicionesDto.fechaHora,
        numeroSerieValidador: createPosicionesDto.numeroSerieValidador,
      });
      const posicionSave = await this.posicionesRepository.save(newPosicion, {
        reload: false,
      });

      // 🔥 NUEVO: Emitir actualización completa de unidad en tiempo real a usuarios conectados
      try {
        // Obtener el validador para obtener el idCliente
        const validador = await this.validadoresRepository.findOne({
          where: { numeroSerie: posicionSave.numeroSerieValidador },
        });

        if (validador && this.monitoreoGateway && this.monitoreoService) {
          // Obtener los datos completos de la unidad (igual formato que obtenerUnidades)
          const unidadCompleta = await this.monitoreoService.obtenerUnidadPorValidador(
            posicionSave.numeroSerieValidador,
            validador.idCliente,
          );

          if (unidadCompleta) {
            // Emitir actualización completa de unidad en tiempo real
            this.monitoreoGateway.emitUnidadUpdate(unidadCompleta, validador.idCliente);
          }
        }
      } catch (wsError) {
        // No fallar la creación si hay error en WebSocket
        console.error('Error al emitir actualización WebSocket:', wsError);
      }

      // Registro en la bitácora----- SUCCESS
      const querylogger = { createPosicionesDto };
      await this.bitacoraLogger.logToBitacora(
        'Posiciones',
        `Se creó una Posicion con Numero de serie Validador: ${posicionSave.numeroSerieValidador}`,
        'CREATE',
        querylogger,
        1,
        24,
        EstatusEnumBitcora.SUCCESS,
      );

      //APis Response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Posicion creada correctamente',
        data: {
          id: Number(posicionSave.id),
          nombre: `${posicionSave.id} ${posicionSave.numeroSerieValidador}` || '',
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora----- ERROR
      console.log(error);
      const querylogger = { createPosicionesDto };
      await this.bitacoraLogger.logToBitacora(
        'Posiciones',
        `Se creó una Posicion con Numero de serie Validador: ${createPosicionesDto.numeroSerieValidador}`,
        'CREATE',
        querylogger,
        1,
        24,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al crear Posicion',
        error,
      });
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
    const posicion = await this.posicionesRepository.findOne({ where: { id } });
    if (!posicion) {
      throw new NotFoundException('Posición no encontrada');
    }

    // 3. Guardar cambios
    await this.posicionesRepository.update(id, updatePosicionesDto);

    const dispositivo = await this.validadoresRepository.findOne({ where: { numeroSerie: posicion.numeroSerieValidador } });
      if (dispositivo) {
        const usuario = await this.usuariosRepository.findOne({
          where: {
            idCliente: dispositivo.idCliente, idRol: 2
          }
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
    return this.posicionesRepository.query(query, [
      ...ids,
      limit,
      offset,
    ]);
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
    return this.posicionesRepository.query(query, [
      cliente,
      limit,
      offset,
    ]);
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
    limit: number
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
        case 2:
          // Consulta de datos paginados Usuario Administrador
          posiciones = await this.consultarPoscionesPaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalPoscionesPaginados(cliente)
          break;
        case 3:
          // Consulta de datos paginados Usuario Operador
          posiciones = await this.consultarPoscionesPaginadoCL(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalPoscionesPaginadosCl(cliente)
          break;
        case 8:
          // Consulta de datos paginados Usuario Reportes
          posiciones = await this.consultarPoscionesPaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalPoscionesPaginados(cliente)
          break;
        case 10:
          // Consulta de datos paginados Usuario Capturista
          posiciones = await this.consultarPoscionesPaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalPoscionesPaginados(cliente)
          break;
        default:
          // Consulta de datos paginados Usuario Operador
          posiciones = await this.consultarPoscionesPaginadoCL(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalPoscionesPaginadosCl(cliente)
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
        case 2: // Administrador
        case 8: // Reportes
        case 10: // Capturista
          posiciones = await this.consultarPosciones(cliente);
          break;

        case 3: // Operador
        default:
          posiciones = await this.consultarPoscionesCL(cliente);
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

  async findOne(id: number): Promise<ApiResponseCommon> {
    try {
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
      WHERE p.Id = ?;
    `;

      const posiciones = await this.posicionesRepository.query(query, [id]);

      if (!posiciones || posiciones.length === 0) {
        throw new NotFoundException('Datos de posicion no encontrado');
      }

      //Forzamos a cambiar el id a number
      const data = posiciones.map(item => ({
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
