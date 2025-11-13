import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { CreateValidadoresDto } from "./dto/create-validadores.dto";
import { UpdateValidadoresDto } from "./dto/update-validadores.dto";
import { UpdateValidadoresEstatusDto } from "./dto/update-validadores-estatus.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Validadores } from "src/entities/Validadores";
import { BitacoraLoggerService } from "src/bitacora/bitacora.service";
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from "src/common/ApiResponse";
import { ClientesService } from "src/clientes/clientes.service";
import { Instalaciones } from "src/entities/Instalaciones";
import { Clientes } from "src/entities/Clientes";
import {
  EstadoComponente,
  EstatusEnum,
} from "src/common/estado-componente.enum";
import { UpdateValidadoresEstadoDto } from "./dto/update-validadores-estado.dto";
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
    private readonly clientesService: ClientesService
  ) {}

  //----------------------Crear un nuevo Validadores----------------------------
  async createValidadores(
    createValidadoresDto: CreateValidadoresDto,
    idUser: number
  ): Promise<ApiCrudResponse> {
    try {
      //Validamos que no exista el mismo numero de serie
      const validador = await this.validadoresRepository.findOne({
        where: { numeroSerie: createValidadoresDto.numeroSerie },
      });
      if (validador) {
        throw new BadRequestException(
          `El validador con número de serie ${createValidadoresDto.numeroSerie} ya existe.`
        );
      }
      //Buscamos si existe el cliente
      const cliente = await this.clientesService.getOneCliente(
        createValidadoresDto.idCliente
      );
      if (!cliente)
        throw new BadRequestException(
          "Se ha proporcionado un cliente no válido."
        );

      //Crear Validadores
      const newValidadores =
        await this.validadoresRepository.create(createValidadoresDto);
      const ValidadoresSave =
        await this.validadoresRepository.save(newValidadores);

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { createValidadoresDto };
      await this.bitacoraLogger.logToBitacora(
        "Validadores",
        `El validador se ha creado correctamente con el número de serie ${createValidadoresDto.numeroSerie} y el ID ${ValidadoresSave.id}.`,
        "CREATE",
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.SUCCESS
      );

      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "El validador se ha creado correctamente.",
        data: {
          id: Number(ValidadoresSave.id),
          nombre:
            `${ValidadoresSave.modelo} ${ValidadoresSave.numeroSerie} ` || "",
        },
      };

      return result;
    } catch (error) {
      // --- Registro en la bitácora --- ERROR
      const querylogger = { createValidadoresDto };
      await this.bitacoraLogger.logToBitacora(
        "Validadores",
        `El validador se ha creado correctamente con el número de serie ${createValidadoresDto.numeroSerie}`,
        "CREATE",
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Ocurrió un error al intentar crear el validador.",
        error: error.message,
      });
    }
  }

  //Obtener todos los Validadores por cliente
  async findAllListValidadoresClientes(id: number, cliente: number) {
    try {
      const Validadores = await this.validadoresRepository.find({
        where: {
          idCliente: id,
          estatus: EstatusEnum.ACTIVO,
          estadoActual: EstadoComponente.DISPONIBLE,
        },
      });
      

      //Forzamos a cambiar el id a number
      const data = Validadores.map((item) => ({
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
        message: "Ocurrió un error al recuperar los Validadores indicados.",
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

  //---------------------------Obtener todos los Validadores-----------------------
  async findAllList(cliente: number, rol: number): Promise<ApiResponseCommon> {
    try {
      let Validadores;
      switch (rol) {
        case 1:
          // Consulta de datos listado Usuario SuperAdministrador
          Validadores = await this.validadoresRepository.query(`
        SELECT
  -- Validadores
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

        default:
          // Consulta de datos listado resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
          Validadores = await this.validadoresRepository.query(
            `
        SELECT
  -- Validadores
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
            [...ids]
          );
          break;
      }

      const data = Validadores.map((item) => ({
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
        message: "Ocurrió un error al recuperar los validadores.",
        error: error.message,
      });
    }
  }

  // ------------------------------Obtener todos los Validadores paginado------------------------
  async findAll(
    cliente: number,
    rol: number,
    page: number,
    limit: number
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let Validadores;
      let totalResult;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          Validadores = await this.validadoresRepository.query(
            `
        SELECT
  -- Validadores
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
            [limit, offset]
          );

          // Query para total (sin paginación)
          totalResult = await this.validadoresRepository.query(
            `
  SELECT COUNT(*) AS total
  FROM Validadores d
  `
          );
          break;

        default:
          // Consulta de datos paginados resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
          Validadores = await this.validadoresRepository.query(
            `
        SELECT
  -- Validadores
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
            [...ids, limit, offset]
          );

          // Query para total (sin paginación)
          totalResult = await this.validadoresRepository.query(
            `
  SELECT COUNT(*) AS total
  FROM Validadores d
  WHERE d.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  `,
            [...ids]
          );
          break;
      }

      const data = Validadores.map((item) => ({
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
        message: `Error al obtener los validadores específicos.`,
        error: error.message,
      });
    }
  }

  //------------------------------Obtener validadores por ID--------------------------------------
  async findOneValidadores(id: number, cliente: number, rol: number) {
    try {
      let Validadores;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          Validadores = await this.validadoresRepository.query(
            `
        SELECT
  -- Validadores
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
            [id]
          );
          break;

        default:
          // Consulta de datos Usuarios Normales
          const { ids, placeholders } = await this.clienteHijos(cliente);
          Validadores = await this.validadoresRepository.query(
            `
        SELECT
  -- Validadores
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
            [id, ...ids]
          );
          break;
      }

      if (Validadores.length == 0) {
        throw new NotFoundException(`Validador con ID: ${id} no encontrado.`);
      }
      const data = Validadores.map((item) => ({
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
        message: "Ocurrió un error al recuperar los datos del validador.",
        error: error.message,
      });
    }
  }

  //--------------------------------Actualizar el ESTATUS del Validadores ----------------------------------
  async updateValidadoresEstatus(
    id: number,
    idUser: number,
    updateValidadoresEstatusDto: UpdateValidadoresEstatusDto
  ) {
    try {
      //buscamos y validamos que exista
      const validadores = await this.validadoresRepository.findOne({
        where: { id: id },
      });
      if (!validadores) {
        throw new NotFoundException(
          `No se encontró un validadores con ID ${id}.`
        );
      }
      //Obtenemos el estatus
      const { estatus } = updateValidadoresEstatusDto;
      if (estatus === 0) {
        //buscamos que no este asignado a una instalacion
        const validadoresInstalacion =
          await this.instalacionesRepository.findOne({
            where: { idValidador: validadores.id, estatus: 1 },
          });

        if (validadoresInstalacion) {
          throw new BadRequestException(
            "No es posible completar la operación: validador ya se encuentra asignado a una instalación."
          );
        }
        //actualizamos el estado del componente a INACTIVO
        await this.validadoresRepository.update(id, {
          estadoActual: EstadoComponente.INACTIVO,
        });
      } else {
        //actualizamos el estado del componente a DISPONIBLE
        await this.validadoresRepository.update(id, {
          estadoActual: EstadoComponente.DISPONIBLE,
        });
      }

      await this.validadoresRepository.update(id, {
        estatus: estatus,
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateValidadoresEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Validadores",
        `Se cambió el estatus del validador con ID: ${id} a estatus: ${estatus}.`,
        "UPDATE",
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.SUCCESS
      );

      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "El estatus del validador se ha actualizado correctamente.",
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre: `${validadores.modelo} ${validadores.numeroSerie} ` || "",
        },
      };

      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateValidadoresEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Validadores",
        `Se cambió el estatus del validador con ID: ${id} a estatus: ${updateValidadoresEstatusDto.estatus}.`,
        "UPDATE",
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.ERROR,
        error.message
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar el estatus del validador.",
        error: error.message,
      });
    }
  }

  //----------------------------------Actualizar el ESTADO del Validadores--------------------------------
  async updateValidadorEstado(
    id: number,
    idUser: number,
    updateValidadoresEstadoDto: UpdateValidadoresEstadoDto
  ) {
    try {
      //buscamos y validamos que exista
      const validadores = await this.validadoresRepository.findOne({
        where: { id: id },
      });
      if (!validadores) {
        throw new NotFoundException(
          `No se encontró un validador con ID ${id}.`
        );
      }

      //No es posible cambiar el estado si esta asignado a una instalacion
      if (
        validadores.estatus === EstatusEnum.INACTIVO &&
        validadores.estadoActual === EstadoComponente.INACTIVO
      ) {
        throw new BadRequestException(
          "No es posible completar la operación: validador se encuentra dado de baja."
        );
      }

      //buscamos que no este asiganada a una instalacion
      const validadoresInstalacion = await this.instalacionesRepository.findOne(
        {
          where: { idValidador: validadores.id, estatus: 1 },
        }
      );

      if (validadoresInstalacion) {
        throw new BadRequestException(
          "No es posible completar la operación: validador ya se encuentra asignado a una instalación."
        );
      }

      //Obtenemos el estado
      const { estadoActual } = updateValidadoresEstadoDto;

      await this.validadoresRepository.update(id, {
        estadoActual: estadoActual,
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateValidadoresEstadoDto };
      await this.bitacoraLogger.logToBitacora(
        "Validadores",
        `Se cambió el estatus del validador con ID: ${id} a estado: ${estadoActual}.`,
        "UPDATE",
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.SUCCESS
      );

      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "El estado del validador se ha actualizado correctamente.",
        estatus: { estatus: Number(estadoActual) },
        data: {
          id: id,
          nombre: `${validadores.modelo} ${validadores.numeroSerie} ` || "",
        },
      };

      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateValidadoresEstadoDto };
      await this.bitacoraLogger.logToBitacora(
        "Validadores",
        `Se cambió el estatus del validador con ID: ${id} a estado: ${updateValidadoresEstadoDto.estadoActual}.`,
        "UPDATE",
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.ERROR,
        error.message
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar el estatus del validador.",
        error: error.message,
      });
    }
  }

  //------------------------------------------Actualizar datos de validador-------------------------------------
  async updateValidadores(
    id: number,
    idUser: number,
    updateValidadoresDto: UpdateValidadoresDto
  ): Promise<ApiCrudResponse> {
    try {
      const validadorExistente = await this.validadoresRepository.findOne({
        where: { id: id },
      });
      if (!validadorExistente) {
        throw new NotFoundException(`Validador con ID ${id} no encontrado.`);
      }

      //Actualindo Validadores
      const dataValidadores =
        await this.validadoresRepository.create(updateValidadoresDto);
      await this.validadoresRepository.update(id, dataValidadores);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateValidadoresDto };
      await this.bitacoraLogger.logToBitacora(
        "Validadores",
        `Se actualizó el validador con ID: ${id}.`,
        "UPDATE",
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.SUCCESS
      );

      const ValidadoresActualizado = await this.validadoresRepository.findOne({
        where: { id: id },
      });

      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "El validador se ha actualizado correctamente.",
        data: {
          id: id,
          nombre:
            `${ValidadoresActualizado?.modelo} ${ValidadoresActualizado?.numeroSerie} ` ||
            "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateValidadoresDto };
      await this.bitacoraLogger.logToBitacora(
        "Validadores",
        `Se actualizó el validador con ID: ${id}.`,
        "UPDATE",
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.ERROR,
        error.message
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar los datos del validador.",
        error: error.message,
      });
    }
  }
  //Eliminar Validadores
  async removeValidadores(
    id: number,
    idUser: number
  ): Promise<ApiCrudResponse> {
    try {
      const Validadores = await this.validadoresRepository.findOne({
        where: { id: id },
      });
      if (!Validadores) {
        throw new NotFoundException(
          `No se encontró el validador con ID: ${id}.`
        );
      }

      //buscamos que no este asiganada a una instalacion
      const validadoresInstalacion = await this.instalacionesRepository.findOne(
        {
          where: { idValidador: Validadores.id, estatus: 1 },
        }
      );

      if (validadoresInstalacion) {
        throw new BadRequestException(
          "No es posible completar la operación: validador ya se encuentra asignado a una instalación."
        );
      }

      await this.validadoresRepository.update(id, {
        estatus: EstatusEnum.INACTIVO,
        estadoActual: EstadoComponente.INACTIVO,
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = {
        id: id,
        estatus: EstatusEnum.INACTIVO,
        estadoActual: EstadoComponente.INACTIVO,
      };
      await this.bitacoraLogger.logToBitacora(
        "Validadores",
        `Se eliminó el validador con ID: ${id}.`,
        "UPDATE",
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.SUCCESS
      );

      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Validador eliminado correctamente.",
        data: {
          id: id,
          nombre: `${Validadores.modelo} ${Validadores.numeroSerie} ` || "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Validadores",
        `Se eliminó el validador con ID: ${id}.`,
        "UPDATE",
        querylogger,
        idUser,
        11,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Ocurrió un error al intentar eliminar el validador.",
        error: error.message,
      });
    }
  }
}
