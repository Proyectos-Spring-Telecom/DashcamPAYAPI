import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateContadoresDto } from './dto/create-contadores.dto';
import { UpdateContadoresDto } from './dto/update-contadores.dto';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { InjectRepository } from '@nestjs/typeorm';
import { Contadores } from 'src/entities/Contadores';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { UpdateContadoresEstatusDto } from './dto/update-contadores-estatus.dto';
import { Instalaciones } from 'src/entities/Instalaciones';
import { InstalacionContadores } from 'src/entities/InstalacionContadores';
import { Clientes } from 'src/entities/Clientes';
import { UpdateContadoresEstadoDto } from './dto/update-contadores.estado.dto';
import { EstadoComponente, EstatusEnum } from 'src/common/estatus.enum';

@Injectable()
export class ContadoresService {
  constructor(
    @InjectRepository(Contadores)
    private readonly contadoresRepository: Repository<Contadores>,
    @InjectRepository(Instalaciones)
    private readonly instalacionesRepository: Repository<Instalaciones>,
    @InjectRepository(InstalacionContadores)
    private readonly instalacionContadoresRepository: Repository<InstalacionContadores>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  //Crear Contadores
  async create(
    idUser: number,
    createContadorDto: CreateContadoresDto,
  ): Promise<ApiCrudResponse> {
    try {
      const contador = await this.contadoresRepository.findOne({
        where: { numeroSerie: createContadorDto.numeroSerie },
      });
      if (contador) {
        throw new BadRequestException(
          `Contador registrado con número de serie: ${contador.numeroSerie}.`,
        );
      }

      //Se crea contador
      const newContador =
        await this.contadoresRepository.create(createContadorDto);
      const contadorSave = await this.contadoresRepository.save(newContador);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createContadorDto };
      await this.bitacoraLogger.logToBitacora(
        'Contadores',
        `Se creó un Contador con número de serie: ${contadorSave.numeroSerie}.`,
        'CREATE',
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Contador creado correctamente.',
        data: {
          id: Number(contadorSave.id),
          nombre: `${contadorSave.marca} ${contadorSave.numeroSerie} ` || '',
        },
      };

      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createContadorDto };
      await this.bitacoraLogger.logToBitacora(
        'Contadores',
        `Se creó un Contador con número de serie: ${createContadorDto.numeroSerie}.`,
        'CREATE',
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al intentar crear un Contador.',
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

  //Obtener los contadores por cliente -- incluye disponibles y el que está en uso
  async findAllListClientes(id: number, cliente: number) {
    try {
      // Consulta SQL para obtener contadores DISPONIBLES y ASIGNADOS
      // Para los asignados a instalaciones, se agrega "-Asignado" al numeroSerie
      const contadores = await this.contadoresRepository.query(
        `
SELECT
  c.Id AS id,
  CASE 
    WHEN ic.Id IS NOT NULL THEN CONCAT(c.NumeroSerie, '-Asignado')
    ELSE c.NumeroSerie
  END AS numeroSerie,
  c.Marca AS marca,
  c.Modelo AS modelo,
  c.FechaCreacion AS fechaCreacion,
  c.FechaActualizacion AS fechaActualizacion,
  c.EstadoActual AS estadoActual,
  c.Estatus AS estatus,
  c.IdCliente AS idCliente,
  CASE 
    WHEN ic.Id IS NOT NULL THEN 1
    ELSE 0
  END AS enUso
FROM Contadores c
LEFT JOIN InstalacionContadores ic ON c.Id = ic.IdContador AND ic.Estatus = 1
LEFT JOIN Instalaciones i ON ic.IdInstalacion = i.Id AND i.Estatus = 1
WHERE c.IdCliente = ?
  AND c.Estatus = 1
  AND (
    c.EstadoActual = ? -- DISPONIBLE
    OR c.EstadoActual = ? -- ASIGNADO
  )
ORDER BY 
  enUso DESC, -- Primero los que están en uso
  c.Id ASC;
        `,
        [id, EstadoComponente.DISPONIBLE, EstadoComponente.ASIGNADO],
      );

      //Forzamos a cambiar el id a number
      const data = contadores.map((item) => ({
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
        message: `Error al obtener los contadores.`,
        error: error.message,
      });
    }
  }

  //Obtner paginado
  async findAll(
    cliente: number,
    rol: number,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let contadores;
      let totalResult;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          contadores = await this.contadoresRepository.query(
            `
SELECT
  -- Datos del Contador
  b.Id AS id,
  b.NumeroSerie AS numeroSerie,
  b.Marca AS marca,
  b.Modelo AS modelo,
  b.FechaCreacion AS fechaCreacion,
  b.FechaActualizacion AS fechaActualizacion,
  b.EstadoActual as estadoActual,
  b.Estatus AS estatus,

  -- Datos del Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Contadores b
INNER JOIN Clientes c ON b.IdCliente = c.Id
ORDER BY b.Id DESC
LIMIT ? OFFSET ?;
        `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.contadoresRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Contadores b
INNER JOIN Clientes c ON b.IdCliente = c.Id
  `,
          );
          break;

        default:
          // Consulta de datos paginados resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
          contadores = await this.contadoresRepository.query(
            `
SELECT
  -- Datos del Contador
  b.Id AS id,
  b.NumeroSerie AS numeroSerie,
  b.Marca AS marca,
  b.Modelo AS modelo,
  b.FechaCreacion AS fechaCreacion,
  b.FechaActualizacion AS fechaActualizacion,
  b.EstadoActual as estadoActual,
  b.Estatus AS estatus,

  -- Datos del Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Contadores b
INNER JOIN Clientes c ON b.IdCliente = c.Id
WHERE b.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

ORDER BY b.Id DESC
LIMIT ? OFFSET ?;
        `,
            [...ids, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.contadoresRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Contadores b
INNER JOIN Clientes c ON b.IdCliente = c.Id
WHERE b.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  `,
            [...ids],
          );
          break;
      }

      const data = contadores.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
      }));

      const total = Number(totalResult[0]?.total ?? 0);
      //Apis response
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
        message: `Error al obtener paginado Contadores.`,
        error: error.message,
      });
    }
  }

  async findAllList(cliente: number, rol: number): Promise<ApiResponseCommon> {
    try {
      let contadores;
      switch (rol) {
        case 1:
          // Consulta de datos listado Usuario SuperAdministrador
          contadores = await this.contadoresRepository.query(
            `
SELECT
  -- Datos del Contador
  b.Id AS id,
  b.NumeroSerie AS numeroSerie,
  b.Marca AS marca,
  b.Modelo AS modelo,
  b.FechaCreacion AS fechaCreacion,
  b.FechaActualizacion AS fechaActualizacion,
  b.EstadoActual as estadoActual,
  b.Estatus AS estatus,

  -- Datos del Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Contadores b
INNER JOIN Clientes c ON b.IdCliente = c.Id
WHERE b.Estatus = 1
AND b.EstadoActual = 1
AND c.Estatus = 1
ORDER BY b.Id DESC;
        `,
          );
          break;

        default:
          // Consulta de datos listado resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
          contadores = await this.contadoresRepository.query(
            `
SELECT
  -- Datos del Contador
  b.Id AS id,
  b.NumeroSerie AS numeroSerie,
  b.Marca AS marca,
  b.Modelo AS modelo,
  b.FechaCreacion AS fechaCreacion,
  b.FechaActualizacion AS fechaActualizacion,
  b.EstadoActual as estadoActual,
  b.Estatus AS estatus,

  -- Datos del Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Contadores b
INNER JOIN Clientes c ON b.IdCliente = c.Id
WHERE b.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND b.Estatus = 1
AND b.EstadoActual = 1
AND c.Estatus = 1
ORDER BY b.Id DESC;
        `,
            [...ids],
          );
          break;
      }

      const data = contadores.map((item) => ({
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
      throw new BadRequestException(
        'Se produjo un error al obtener el listado de Contadores.',
      );
    }
  }

  //Obtener por ID
  async findOne(id: number, cliente: number, rol: number) {
    try {
      let contadores;
      switch (rol) {
        case 1:
          contadores = await this.contadoresRepository.query(
            `
SELECT
  -- Datos del Contador
  b.Id AS id,
  b.NumeroSerie AS numeroSerie,
  b.Marca AS marca,
  b.Modelo AS modelo,
  b.FechaCreacion AS fechaCreacion,
  b.FechaActualizacion AS fechaActualizacion,
  b.EstadoActual as estadoActual,
  b.Estatus AS estatus,

  -- Datos del Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Contadores b
INNER JOIN Clientes c ON b.IdCliente = c.Id
WHERE b.Id = ?
ORDER BY b.Id DESC;
        `,
            [id],
          );
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(cliente);
          contadores = await this.contadoresRepository.query(
            `
SELECT
  -- Datos del Contador
  b.Id AS id,
  b.NumeroSerie AS numeroSerie,
  b.Marca AS marca,
  b.Modelo AS modelo,
  b.FechaCreacion AS fechaCreacion,
  b.FechaActualizacion AS fechaActualizacion,
  b.EstadoActual as estadoActual,
  b.Estatus AS estatus,

  -- Datos del Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente

FROM Contadores b
INNER JOIN Clientes c ON b.IdCliente = c.Id
WHERE b.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND b.Id = ?
ORDER BY b.Id DESC;
        `,
            [...ids, id],
          );
          break;
      }

      if (contadores.length == 0) {
        throw new NotFoundException(`No se encontró un Contador con ID: ${id}.`);
      }

      const data = contadores.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
      }));

      return data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'No fue posible recuperar la información del Contador.',
      });
    }
  }

  //Actualizar equipo
  async update(id: number, idUser: number, updateContadorDto: UpdateContadoresDto) {
    try {
      const contador = await this.contadoresRepository.findOne({
        where: { id: id },
      });
      if (!contador)
        throw new NotFoundException(`No se encontró un Contador con ID: ${id}.`);
      await this.contadoresRepository.update(id, updateContadorDto);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateContadorDto };
      await this.bitacoraLogger.logToBitacora(
        'Contadores',
        `Se actualizó el Contador con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Contador actualizado correctamente',
        data: {
          id: id,
          nombre:
            `${contador.marca || updateContadorDto.marca} ${contador.numeroSerie || updateContadorDto.numeroSerie} ` ||
            '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateContadorDto };
      await this.bitacoraLogger.logToBitacora(
        'Contadores',
        `Se actualizó el Contador con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al intentar actualizar contador.',
        error: error.message,
      });
    }
  }

  //actualizar estatus
  async updateEstatus(
    id: number,
    idUser: number,
    updateContadorEstatusDto: UpdateContadoresEstatusDto,
  ) {
    try {
      //buscamos y validamos que exista
      const contador = await this.contadoresRepository.findOne({
        where: { id: id },
      });
      if (!contador)
        throw new NotFoundException(`No se encontró un Contador con ID: ${id}.`);

      //Obtenemos el estatus
      const estatus = updateContadorEstatusDto.estatus;

      //logica si estatus es 0
      if (estatus === 0) {
        //buscamos que no este asignado a una instalacion
        const contadorInstalacion = await this.instalacionContadoresRepository.findOne({
          where: { idContador: contador.id, estatus: 1 },
        });
        if (contadorInstalacion)
          throw new BadRequestException(
            'No es posible completar la operación: Contador se encuentra asignado a una instalación.',
          );

        //actualizamos el estado del componente a INACTIVO
        await this.contadoresRepository.update(id, {
          estadoActual: EstadoComponente.INACTIVO,
        });
      } else {
        //actualizamos el estado del componente a DISPONIBLE
        await this.contadoresRepository.update(id, {
          estadoActual: EstadoComponente.DISPONIBLE,
        });
      }
      await this.contadoresRepository.update(id, { estatus: estatus });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateContadorEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Contadores',
        `Se actualizo el estatus del contador con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Estatus de contador actualizado correctamente',
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre: `${contador.modelo} ${contador.numeroSerie} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateContadorEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Contadores',
        `Se actualizo el estatus del contador con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar estatus del contador.',
        error: error.message,
      });
    }
  }

  //actualizar estado
  async updateEstado(
    id: number,
    idUser: number,
    updateContadorEstadoDto: UpdateContadoresEstadoDto,
  ) {
    try {
      //buscamos y validamos que exista
      const contador = await this.contadoresRepository.findOne({
        where: { id: id },
      });
      if (!contador)
        throw new NotFoundException(`No se encontró un Contador con ID: ${id}.`);

      //buscamos que no este asignado a una instalacion
      const contadorInstalacion = await this.instalacionContadoresRepository.findOne({
        where: { idContador: contador.id, estatus: 1 },
      });
      if (contadorInstalacion)
        throw new BadRequestException(
          'No es posible completar la operación: Contador se encuentra asignado a una instalación.',
        );

      //logica si estado del componente esta asignado
      if (
        contador.estadoActual === EstadoComponente.INACTIVO &&
        contador.estatus === EstatusEnum.INACTIVO
      ) {
        throw new BadRequestException(
          'No es posible completar la operación: Contador se encuentra asignado a una instalación.',
        );
      }
      //obtenemos el valor de estado
      const estadoActual = updateContadorEstadoDto.estadoActual;
      //se cambia estado del componente
      await this.contadoresRepository.update(id, { estadoActual: estadoActual });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateContadorEstadoDto };
      await this.bitacoraLogger.logToBitacora(
        'Contadores',
        `Se actualizo el estado del contador con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Estado de contador actualizado correctamente',
        estatus: { estatus: Number(estadoActual) },
        data: {
          id: id,
          nombre: `${contador.modelo} ${contador.numeroSerie} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateContadorEstadoDto };
      await this.bitacoraLogger.logToBitacora(
        'Contadores',
        `Se actualizo el estado del contador con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar estado del contador.',
        error: error.message,
      });
    }
  }

  async remove(id: number, idUser: number) {
    try {
      //buscamos y validamos que exista
      const contador = await this.contadoresRepository.findOne({
        where: { id: id },
      });
      if (!contador)
        throw new NotFoundException(`No se encontró un Contador con ID: ${id}.`);

      //buscamos que no este asignado a una instalacion
      const contadorInstalacion = await this.instalacionContadoresRepository.findOne({
        where: { idContador: contador.id, estatus: 1 },
      });
      if (contadorInstalacion)
        throw new BadRequestException(
          'No es posible completar la operación: Contador se encuentra asignado a una instalación.',
        );

      //actualizamos el estado del componente a INACTIVO
      await this.contadoresRepository.update(id, { estadoActual: 0 });

      await this.contadoresRepository.update(id, { estatus: 0 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Contadores',
        `Se eliminó el contador con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Contador eliminado correctamente',
        data: {
          id: id,
          nombre: `${contador.modelo} ${contador.numeroSerie} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Contadores',
        `Se eliminó el contador con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al intentar eliminar el contador.',
        error: error.message,
      });
    }
  }
}

