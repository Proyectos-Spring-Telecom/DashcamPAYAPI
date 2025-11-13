import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { CreateContadoresDto } from "../contadores/dto/create-contadores.dto";
import { UpdateContadoresDto } from "../contadores/dto/update-contadores.dto";
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from "src/common/ApiResponse";
import { InjectRepository } from "@nestjs/typeorm";
import { Contadores } from "src/entities/Contadores";
import { Repository } from "typeorm";
import { BitacoraLoggerService } from "src/bitacora/bitacora.service";
import { UpdateContadoresEstatusDto } from "../contadores/dto/update-contadores-estatus.dto";
import { Instalaciones } from "src/entities/Instalaciones";
import { Clientes } from "src/entities/Clientes";
import {
  EstadoComponente,
  EstatusEnum,
} from "src/common/estado-componente.enum";
import { UpdateContadoresEstadoDto } from "./dto/update-contadores-estado.dto";

@Injectable()
export class ContadoresService {
  constructor(
    @InjectRepository(Contadores)
    private readonly contadoresRepository: Repository<Contadores>,
    @InjectRepository(Instalaciones)
    private readonly instalacionesRepository: Repository<Instalaciones>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService
  ) {}

  //Crear Contadores
  async create(
    idUser: number,
    createContadoresDto: CreateContadoresDto
  ): Promise<ApiCrudResponse> {
    try {
      const Contadores = await this.contadoresRepository.findOne({
        where: { numeroSerie: createContadoresDto.numeroSerie },
      });
      if (Contadores) {
        throw new BadRequestException(
          `Contador registrado con número de serie: ${Contadores.numeroSerie}.`
        );
      }

      //Se crea
      const newContadoress =
        await this.contadoresRepository.create(createContadoresDto);
      const ContadoresSave =
        await this.contadoresRepository.save(newContadoress);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createContadoresDto };
      await this.bitacoraLogger.logToBitacora(
        "Contadores",
        `Se creó un Contador con número de serie: ${ContadoresSave.numeroSerie}.`,
        "CREATE",
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.SUCCESS
      );

      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Contador creado correctamente.",
        data: {
          id: Number(ContadoresSave.id),
          nombre:
            `${ContadoresSave.marca} ${ContadoresSave.numeroSerie} ` || "",
        },
      };

      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createContadoresDto };
      await this.bitacoraLogger.logToBitacora(
        "Contadores",
        `Se creó un Contador con número de serie: ${createContadoresDto.numeroSerie}.`,
        "CREATE",
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Ocurrió un error al intentar crear un Contador.",
        error: error.message,
      });
    }
  }

  //Obtener los Contadores por cliente --obsoleto
  async findAllListClientes(id: number, cliente: number) {
    try {
      const Contadores = await this.contadoresRepository.find({
        where: {
          idCliente: id,
          estatus: EstatusEnum.ACTIVO,
          estadoActual: EstadoComponente.DISPONIBLE,
        },
      });
      

      //Forzamos a cambiar el id a number
      const data = Contadores.map((item) => ({
        ...item,
        id: Number(item.id),
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
        message: `Error al obtener los Contador.`,
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

  //Obtner paginado
  async findAll(
    cliente: number,
    rol: number,
    page: number,
    limit: number
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let Contadores;
      let totalResult;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          Contadores = await this.contadoresRepository.query(
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
            [limit, offset]
          );

          // Query para total (sin paginación)
          totalResult = await this.contadoresRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Contadores b
INNER JOIN Clientes c ON b.IdCliente = c.Id
  `
          );
          break;

        default:
          // Consulta de datos paginados resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
          Contadores = await this.contadoresRepository.query(
            `
SELECT
  -- Datos del Contadores
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
            [...ids, limit, offset]
          );

          // Query para total (sin paginación)
          totalResult = await this.contadoresRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Contadores b
INNER JOIN Clientes c ON b.IdCliente = c.Id
WHERE b.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  `,
            [...ids]
          );
          break;
      }

      const data = Contadores.map((item) => ({
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
      let Contadores;
      switch (rol) {
        case 1:
          // Consulta de datos listado Usuario SuperAdministrador
          Contadores = await this.contadoresRepository.query(
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
        `
          );
          break;

        default:
          // Consulta de datos listado resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
          Contadores = await this.contadoresRepository.query(
            `
SELECT
  -- Datos del Contadores
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
            [...ids]
          );
          break;
      }

      const data = Contadores.map((item) => ({
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
      throw new BadRequestException({
        message: "Error al Obtener listado Contadores.",
      });
    }
  }

  async findOne(id: number, cliente: number, rol: number) {
    try {
      let Contadores;
      switch (rol) {
        case 1:
          Contadores = await this.contadoresRepository.query(
            `
SELECT
  -- Datos del Contadores
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
            [id]
          );
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(cliente);
          Contadores = await this.contadoresRepository.query(
            `
SELECT
  -- Datos del Contadores
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
            [...ids, id]
          );
          break;
      }

      if (Contadores.length == 0) {
        throw new NotFoundException(`Contadores con ID:${id} no encontrado.`);
      }

      const data = Contadores.map((item) => ({
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
        message: "Error al obtener Contadores",
      });
    }
  }

  async update(
    id: number,
    idUser: number,
    updateContadoresDto: UpdateContadoresDto
  ) {
    try {
      const Contadores = await this.contadoresRepository.findOne({
        where: { id: id },
      });
      if (!Contadores) throw new NotFoundException("Contadores no encontrado");
      await this.contadoresRepository.update(id, updateContadoresDto);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateContadoresDto };
      await this.bitacoraLogger.logToBitacora(
        "Contadores",
        `Se actualizo el Contadores con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.SUCCESS
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: "success",
        message: "Contadores actualizado correctamente",
        data: {
          id: id,
          nombre:
            `${Contadores.marca || updateContadoresDto.marca} ${Contadores.numeroSerie || updateContadoresDto.numeroSerie} ` ||
            "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateContadoresDto };
      await this.bitacoraLogger.logToBitacora(
        "Contadores",
        `Se actualizo el Contadores con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Ocurrió un error al intentar actualizar Contadores.",
        error: error.message,
      });
    }
  }

  async updateEstado(
    id: number,
    idUser: number,
    updateContadoresEstadoDto: UpdateContadoresEstadoDto
  ) {
    try {
      //buscamos y validamos que exista
      const contadores = await this.contadoresRepository.findOne({
        where: { id: id },
      });
      if (!contadores)
        throw new NotFoundException(`No se encontró un contador con ID: ${id}`);

      //obtenemos el valor de estado
      const estadoActual = updateContadoresEstadoDto.estadoActual;

      //logica si estado del contador esta asignado
      if (
        contadores.estadoActual === EstadoComponente.INACTIVO &&
        contadores.estatus === EstatusEnum.INACTIVO
      ) {
        throw new BadRequestException(
          "No es posible completar la operación: contador se encuentra dado de baja."
        );
      }

      const contadoresInstalacion = await this.instalacionesRepository.findOne({
        where: { idContador: contadores.id, estatus: 1 },
      });

      if (contadoresInstalacion)
        throw new BadRequestException(
          "No es posible completar la operación: contador ya se encuentra asignado a una instalación."
        );

      //se cambia estado del componente
      await this.contadoresRepository.update(id, {
        estadoActual: estadoActual,
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateContadoresEstadoDto };
      await this.bitacoraLogger.logToBitacora(
        "Contadores",
        `Se actualizo el estado del contador con ID: ${id}.`,
        "UPDATE",
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.SUCCESS
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: "success",
        message: "Estado del contador actualizado correctamente.",
        estatus: { estatus: Number(estadoActual) },
        data: {
          id: id,
          nombre: `${contadores.modelo} ${contadores.numeroSerie} ` || "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateContadoresEstadoDto };
      await this.bitacoraLogger.logToBitacora(
        "Contadores",
        `Se actualizo el estado del contador con ID: ${id}.`,
        "UPDATE",
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar estado del contador.",
        error: error.message,
      });
    }
  }

  async updateEstatus(
    id: number,
    idUser: number,
    updateContadoresEstatusDto: UpdateContadoresEstatusDto
  ) {
    try {
      //buscamos y validamos que exista
      const contadores = await this.contadoresRepository.findOne({
        where: { id: id },
      });
      if (!contadores)
        throw new NotFoundException(`No se encontró un contador con ID: ${id}`);

      //obtenemos el valor de estatus
      const estatus = updateContadoresEstatusDto.estatus;

      //logica si estatus es 0 :3
      if (estatus === 0) {
        //buscamos que no este asiganada a una instalacion
        const contadoresInstalacion =
          await this.instalacionesRepository.findOne({
            where: { idContador: contadores.id, estatus: 1 },
          });

        if (contadoresInstalacion)
          throw new BadRequestException(
            "No es posible completar la operación: Contadores ya se encuentra asignado a una instalación."
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

      //se habilita o desabilita el componente
      await this.contadoresRepository.update(id, { estatus: estatus });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateContadoresEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Contadores",
        `Se actualizo el estatus del Contadores con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.SUCCESS
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: "success",
        message: "Estatus de contador actualizado correctamente.",
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre: `${contadores.modelo} ${contadores.numeroSerie} ` || "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateContadoresEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Contadores",
        `Se actualizo el estatus del Contadores con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar estatus del Contadores.",
        error: error.message,
      });
    }
  }

  async remove(id: number, idUser: number) {
    try {
      const Contadores = await this.contadoresRepository.findOne({
        where: { id: id },
      });
      if (!Contadores) throw new NotFoundException("Contador no encontrado.");

      //buscamos que no este asiganada a una instalacion
      const contadoresInstalacion = await this.instalacionesRepository.findOne({
        where: { idContador: Contadores.id, estatus: 1 },
      });

      if (contadoresInstalacion)
        throw new BadRequestException(
          "No es posible completar la operación: contador se encuentra dado de baja."
        );

      await this.contadoresRepository.update(id, { estatus: 0 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Contadores",
        `Se eliminó el Contadores con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.SUCCESS
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: "success",
        message: "Contadores eliminado correctamente",
        data: {
          id: id,
          nombre: `${Contadores.modelo} ${Contadores.numeroSerie} ` || "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Contadores",
        `Se eliminó el Contadores con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        12,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Ocurrió un error al intentar eliminar el Contadores.",
        error: error.message,
      });
    }
  }
}
