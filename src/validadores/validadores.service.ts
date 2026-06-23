import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateValidadorDto } from './dto/create-validador.dto';
import { UpdateValidadorDto } from './dto/update-validador.dto';
import { UpdateValidadorEstatusDto } from './dto/update-validador-estatus.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Validadores } from 'src/entities/Validadores';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { ClientesService } from 'src/clientes/clientes.service';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Clientes } from 'src/entities/Clientes';
import { EstadoComponente, EstatusEnum } from 'src/common/estatus.enum';
import { UpdateValidadorEstadoDto } from './dto/update-validador-estado.dto';
@Injectable()
export class ValidadoresService {
  constructor(
    @InjectRepository(Validadores)
    private readonly validadoresRepository: Repository<Validadores>,
    @InjectRepository(Instalaciones)
    private readonly instalacionesRepository: Repository<Instalaciones>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly clientesService: ClientesService,
  ) {}
  //Crear un nuevo Validador
  async createValidador(
    createValidadorDto: CreateValidadorDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      const Validador = await this.validadoresRepository.findOne({
        where: { numeroSerie: createValidadorDto.numeroSerie },
      });
      if (Validador) {
        throw new BadRequestException(
          `El Validador con número de serie ${createValidadorDto.numeroSerie} ya existe.`,
        );
      }
      const cliente = await this.clientesService.getOneCliente(
        //Buscamos si existe el cliente
        createValidadorDto.idCliente,
      );
      if (!cliente)
        throw new BadRequestException(
          'Se ha proporcionado un cliente no válido.',
        );

      //Crear Validador
      const newValidador =
        await this.validadoresRepository.create(createValidadorDto);
      const Validadoresave =
        await this.validadoresRepository.save(newValidador);

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { createValidadorDto };
      await this.bitacoraLogger.logToBitacora(
        'Validadores',
        `El Validador se ha creado correctamente con el número de serie ${createValidadorDto.numeroSerie} y el ID ${Validadoresave.id}.`,
        'CREATE',
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El Validador se ha creado correctamente.',
        data: {
          id: Number(Validadoresave.id),
          nombre:
            `${Validadoresave.modelo} ${Validadoresave.numeroSerie} ` || '',
        },
      };

      return result;
    } catch (error) {
      // --- Registro en la bitácora --- ERROR
      const querylogger = { createValidadorDto };
      await this.bitacoraLogger.logToBitacora(
        'Validadores',
        `El Validador se ha creado correctamente con el número de serie ${createValidadorDto.numeroSerie}`,
        'CREATE',
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al intentar crear el Validador.',
        error: error.message,
      });
    }
  }

  //Obtener todos los Validadores por cliente
  async findAllListValidadoresClientes(id: number, _cliente: number) {
    try {
      // Consulta SQL para obtener validadores DISPONIBLES y ASIGNADOS
      // Para los asignados a instalaciones, se agrega "-Asignado" al numeroSerie
      const validadores = await this.validadoresRepository.query(
        `
SELECT
  v.Id AS id,
  CASE 
    WHEN i.Id IS NOT NULL THEN CONCAT(v.NumeroSerie, '-Asignado')
    ELSE v.NumeroSerie
  END AS numeroSerie,
  v.Marca AS marca,
  v.Modelo AS modelo,
  v.FechaCreacion AS fechaCreacion,
  v.FechaActualizacion AS fechaActualizacion,
  v.EstadoActual AS estadoActual,
  v.Estatus AS estatus,
  v.IdCliente AS idCliente,
  CASE 
    WHEN i.Id IS NOT NULL THEN 1
    ELSE 0
  END AS enUso
FROM Validadores v
LEFT JOIN Instalaciones i ON v.Id = i.IdValidador AND i.Estatus = 1
WHERE v.IdCliente = ?
  AND v.Estatus = 1
  AND (
    v.EstadoActual = ? -- DISPONIBLE
    OR v.EstadoActual = ? -- ASIGNADO
  )
ORDER BY 
  enUso DESC, -- Primero los que están en uso
  v.Id ASC;
        `,
        [id, EstadoComponente.DISPONIBLE, EstadoComponente.ASIGNADO],
      );

      //Forzamos a cambiar el id a number
      const data = validadores.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
        estadoActual: Number(item.estadoActual),
        estatus: Number(item.estatus),
        enUso: Number(item.enUso),
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
        message: 'Ocurrió un error al recuperar los Validadores indicados.',
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

  //Obtener todos los Validadores
  async findAllList(cliente: number, rol: number): Promise<ApiResponseCommon> {
    try {
      let Validador;
      switch (rol) {
        case 1:
          // Consulta de datos listado Usuario SuperAdministrador
          Validador = await this.validadoresRepository.query(`
        SELECT
  -- Validador
  d.Id AS id,
  d.NumeroSerie AS numeroSerie,
  d.Marca AS marca,
  d.Modelo AS modelo,
  d.FechaCreacion AS fechaCreacion,
  d.FechaActualizacion AS fechaActualizacion,
  d.EstadoActual as estadoActual,
  d.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Validadores d
INNER JOIN Clientes c ON d.IdCliente = c.Id

WHERE d.Estatus = 1
AND d.EstadoActual = 1
AND c.Estatus = 1

ORDER BY d.Id DESC;
        `);
          break;

        case 3:
          Validador = await this.validadoresRepository.query(
            `
        SELECT
  -- Dispositivo
  d.Id AS id,
  d.NumeroSerie AS numeroSerie,
  d.Marca AS marca,
  d.Modelo AS modelo,
  d.FechaCreacion AS fechaCreacion,
  d.FechaActualizacion AS fechaActualizacion,
  d.EstadoActual as estadoActual,
  d.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Validadores d
INNER JOIN Clientes c ON d.IdCliente = c.Id

WHERE d.IdCliente IN (${cliente})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND d.Estatus = 1
  AND c.Estatus = 1

ORDER BY d.Id DESC;
        `,
          );
          break;

        default:
          // Consulta de datos listado resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
          Validador = await this.validadoresRepository.query(
            `
        SELECT
  -- Validador
  d.Id AS id,
  d.NumeroSerie AS numeroSerie,
  d.Marca AS marca,
  d.Modelo AS modelo,
  d.FechaCreacion AS fechaCreacion,
  d.FechaActualizacion AS fechaActualizacion,
  d.EstadoActual as estadoActual,
  d.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Validadores d
INNER JOIN Clientes c ON d.IdCliente = c.Id

WHERE d.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND d.Estatus = 1
  AND d.EstadoActual = 1
  AND c.Estatus = 1

ORDER BY d.Id DESC;
        `,
            [...ids],
          );
          break;
      }

      const data = Validador.map((item) => ({
        ...item,
        id: Number(item.id),
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
        message: 'Ocurrió un error al recuperar los Validadores.',
        error: error.message,
      });
    }
  }

  //Obtener todos los Validadores paginado
  async findAll(
    cliente: number,
    rol: number,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let Validador;
      let totalResult;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          Validador = await this.validadoresRepository.query(
            `
        SELECT
  -- Validador
  d.Id AS id,
  d.NumeroSerie AS numeroSerie,
  d.Marca AS marca,
  d.Modelo AS modelo,
  d.FechaCreacion AS fechaCreacion,
  d.FechaActualizacion AS fechaActualizacion,
  d.EstadoActual as estadoActual,
  d.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Validadores d
INNER JOIN Clientes c ON d.IdCliente = c.Id

ORDER BY d.Id DESC
LIMIT ? OFFSET ?;
        `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.validadoresRepository.query(
            `
              SELECT COUNT(*) AS total
FROM Validadores d
INNER JOIN Clientes c ON d.IdCliente = c.Id
  `,
          );
          break;

        default:
          // Consulta de datos paginados resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
          Validador = await this.validadoresRepository.query(
            `
        SELECT
  -- Validador
  d.Id AS id,
  d.NumeroSerie AS numeroSerie,
  d.Marca AS marca,
  d.Modelo AS modelo,
  d.FechaCreacion AS fechaCreacion,
  d.FechaActualizacion AS fechaActualizacion,
  d.EstadoActual as estadoActual,
  d.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Validadores d
INNER JOIN Clientes c ON d.IdCliente = c.Id

WHERE d.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

ORDER BY d.Id DESC
LIMIT ? OFFSET ?;
        `,
            [...ids, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.validadoresRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Validadores d
INNER JOIN Clientes c ON d.IdCliente = c.Id

WHERE d.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  `,
            [...ids],
          );
          break;
      }

      const data = Validador.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
      }));

      const total = Number(totalResult[0]?.total || 0);

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
        message: `Error al obtener los Validadores  específicos.`,
        error: error.message,
      });
    }
  }
  //Obtener Validador por ID
  async findOneValidador(id: number, cliente: number, rol: number) {
    try {
      let Validador;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          Validador = await this.validadoresRepository.query(
            `
        SELECT
  -- Validador
  d.Id AS id,
  d.NumeroSerie AS numeroSerie,
  d.Marca AS marca,
  d.Modelo AS modelo,
  d.FechaCreacion AS fechaCreacion,
  d.FechaActualizacion AS fechaActualizacion,
  d.EstadoActual as estadoActual,
  d.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Validadores d
INNER JOIN Clientes c ON d.IdCliente = c.Id

WHERE d.Id = ?

ORDER BY d.Id DESC;
        `,
            [id],
          );
          break;

        default:
          // Consulta de datos Usuarios Normales
          const { ids, placeholders } = await this.clienteHijos(cliente);
          Validador = await this.validadoresRepository.query(
            `
        SELECT
  -- Validador
  d.Id AS id,
  d.NumeroSerie AS numeroSerie,
  d.Marca AS marca,
  d.Modelo AS modelo,
  d.FechaCreacion AS fechaCreacion,
  d.FechaActualizacion AS fechaActualizacion,
  d.EstadoActual as estadoActual,
  d.Estatus AS estatus,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Validadores d
INNER JOIN Clientes c ON d.IdCliente = c.Id

WHERE d.Id = ?
     AND d.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

ORDER BY d.Id DESC;
        `,
            [id, ...ids],
          );
          break;
      }

      if (Validador.length == 0) {
        throw new NotFoundException(`Validador con ID: ${id} no encontrado.`);
      }
      const data = Validador.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
      }));
      return {
        data: data,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException({
        message: 'Ocurrió un error al recuperar los datos del Validador.',
        error: error.message,
      });
    }
  }

  //Actualizar el estatus del Validador
  async updateValidadorEstatus(
    id: number,
    idUser: number,
    updateValidadorEstatusDto: UpdateValidadorEstatusDto,
  ) {
    try {
      const Validador = await this.validadoresRepository.findOne({
        where: { id: id },
      });
      if (!Validador) {
        throw new NotFoundException(
          `No se encontró un Validador con ID ${id}.`,
        );
      }
      const { estatus } = updateValidadorEstatusDto;
      if (estatus === 0) {
        const ValidadorInstalacion = await this.instalacionesRepository.findOne(
          {
            where: { idValidador: Validador.id, estatus: 1 },
          },
        );

        if (ValidadorInstalacion)
          throw new BadRequestException(
            'No es posible completar la operación: Validador se encuentra asignado a una instalación.',
          );

        await this.validadoresRepository.update(id, {
          estadoActual: estatus,
        });
      } else {
        await this.validadoresRepository.update(id, {
          estadoActual: estatus,
        });
      }
      await this.validadoresRepository.update(id, {
        estatus: estatus,
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateValidadorEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Validadores',
        `Se cambió el estatus del Validador con ID: ${id} a estatus: ${estatus}.`,
        'UPDATE',
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El estatus del Validador se ha actualizado correctamente.',
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre: `${Validador.modelo} ${Validador.numeroSerie} ` || '',
        },
      };

      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateValidadorEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Validadores',
        `Se cambió el estatus del Validador con ID: ${id} a estatus: ${updateValidadorEstatusDto.estatus}.`,
        'UPDATE',
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar el estatus del Validador.',
        error: error.message,
      });
    }
  }

  //Actualizar el estado del Validador
  async updateValidadorEstado(
    id: number,
    idUser: number,
    updateValidadorEstadoDto: UpdateValidadorEstadoDto,
  ) {
    try {
      //buscamos y validamos que exista
      const Validador = await this.validadoresRepository.findOne({
        where: { id: id },
      });
      if (!Validador) {
        throw new NotFoundException(
          `No se encontró un Validador con ID ${id}.`,
        );
      }

      //buscamos que no este asiganada a una instalacion
      const ValidadorInstalacion = await this.instalacionesRepository.findOne({
        where: { idValidador: Validador.id, estatus: 1 },
      });

      if (ValidadorInstalacion)
        throw new BadRequestException(
          'No es posible completar la operación: Validador se encuentra asignado a una instalación.',
        );

      if (
        Validador.estadoActual === EstadoComponente.INACTIVO &&
        Validador.estatus === EstatusEnum.INACTIVO
      ) {
        throw new BadRequestException(
          'No es posible completar la operación: Validador se encuentra dado de baja.',
        );
      }
      const { estadoActual } = updateValidadorEstadoDto;

      await this.validadoresRepository.update(id, {
        estadoActual: estadoActual,
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateValidadorEstadoDto };
      await this.bitacoraLogger.logToBitacora(
        'Validadores',
        `Se cambió el estadoActual del Validador con ID: ${id} a estadoActual: ${estadoActual}.`,
        'UPDATE',
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El estado del Validador se ha actualizado correctamente.',
        estatus: { estatus: Number(estadoActual) },
        data: {
          id: id,
          nombre: `${Validador.modelo} ${Validador.numeroSerie} ` || '',
        },
      };

      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateValidadorEstadoDto };
      await this.bitacoraLogger.logToBitacora(
        'Validadores',
        `Se cambió el estado del Validador con ID: ${id} a estado: ${updateValidadorEstadoDto.estadoActual}.`,
        'UPDATE',
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar el estado del Validador.',
        error: error.message,
      });
    }
  }

  //Actualizar datos de Validadores
  async updateValidador(
    id: number,
    idUser: number,
    updateValidadorDto: UpdateValidadorDto,
  ): Promise<ApiCrudResponse> {
    try {
      const dispostivoExistente = await this.validadoresRepository.findOne({
        where: { id: id },
      });
      if (!dispostivoExistente) {
        throw new NotFoundException(`Validador con ID ${id} no encontrado.`);
      }

      //Actualindo Validador
      const dataValidador =
        await this.validadoresRepository.create(updateValidadorDto);
      await this.validadoresRepository.update(id, dataValidador);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateValidadorDto };
      await this.bitacoraLogger.logToBitacora(
        'Validadores',
        `Se actualizó el Validador con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.SUCCESS,
      );

      const ValidadorActualizado = await this.validadoresRepository.findOne({
        where: { id: id },
      });

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El Validador se ha actualizado correctamente.',
        data: {
          id: id,
          nombre:
            `${ValidadorActualizado?.modelo} ${ValidadorActualizado?.numeroSerie} ` ||
            '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateValidadorDto };
      await this.bitacoraLogger.logToBitacora(
        'Validadores',
        `Se actualizó el Validador con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar los datos del Validador.',
        error: error.message,
      });
    }
  }
  //Eliminar Validadores
  async removeValidador(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const Validador = await this.validadoresRepository.findOne({
        where: { id: id },
      });
      if (!Validador) {
        throw new NotFoundException(
          `No se encontró el Validador con ID: ${id}.`,
        );
      }

      const ValidadorInstalacion = await this.instalacionesRepository.findOne({
        where: { idValidador: Validador.id, estatus: 1 },
      });

      if (ValidadorInstalacion)
        throw new BadRequestException(
          'No es posible completar la operación: Validador se encuentra asignado a una instalación.',
        );

      await this.validadoresRepository.update(id, {
        estadoActual: EstadoComponente.INACTIVO,
        estatus: EstatusEnum.INACTIVO,
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Validador',
        `Se eliminó el Validador con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Validador eliminado correctamente',
        data: {
          id: id,
          nombre: `${Validador.modelo} ${Validador.numeroSerie} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Validador',
        `Se eliminó el Validador con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al intentar eliminar el Validador.',
        error: error.message,
      });
    }
  }
}
