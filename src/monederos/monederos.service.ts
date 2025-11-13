import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { CreateMonederoDto } from "./dto/create-monedero.dto";
import { UpdateMonederoDto } from "./dto/update-monedero.dto";
import { UpdateMonederoEstatusDto } from "./dto/update-monedero-estatus.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Monederos } from "src/entities/Monederos";
import { BitacoraLoggerService } from "src/bitacora/bitacora.service";
import { ClientesService } from "src/clientes/clientes.service";
import { PasajerosService } from "src/pasajeros/pasajeros.service";
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from "src/common/ApiResponse";
import { EstatusEnum } from "src/common/estado-componente.enum";
import { Clientes } from "src/entities/Clientes";

@Injectable()
export class MonederosService {
  constructor(
    @InjectRepository(Monederos)
    private readonly monederoRepository: Repository<Monederos>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly clientesService: ClientesService,
    private readonly pasajerosService: PasajerosService
  ) {}

  //Crear un monedero
  async createMonedero(
    createMonederoDto: CreateMonederoDto,
    idUser: number
  ): Promise<ApiCrudResponse> {
    try {
      const monedero = await this.monederoRepository.findOne({
        where: { numeroSerie: createMonederoDto.numeroSerie },
      });
      if (monedero) {
        throw new NotFoundException(
          `El monedero con número de serie: ${createMonederoDto.numeroSerie} está registrado.`
        );
      }

      //Agregamos la fecha actual
      function pad(n: number) {
        return n < 10 ? "0" + n : n;
      }

      const ahora = new Date();
      const desfaseMs = -6 * 60 * 60 * 1000; // -6 horas en milisegundos
      const fechaDesfasada = new Date(ahora.getTime() + desfaseMs);

      const fechaActual = `${fechaDesfasada.getFullYear()}-${pad(fechaDesfasada.getMonth() + 1)}-${pad(fechaDesfasada.getDate())} ${pad(fechaDesfasada.getHours())}:${pad(fechaDesfasada.getMinutes())}:${pad(fechaDesfasada.getSeconds())}`;

      //Añadimos fecha
      createMonederoDto.fechaActivacion = fechaActual;
      createMonederoDto.estatus = EstatusEnum.INACTIVO;
      createMonederoDto.saldo = 50;

      //Guardamos el monedero
      const newMonedero =
        await this.monederoRepository.create(createMonederoDto);
      const monederoSave = await this.monederoRepository.save(newMonedero);

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { createMonederoDto };
      await this.bitacoraLogger.logToBitacora(
        "Monederos",
        `Se creó un monedero con número de serie: ${monederoSave.numeroSerie}.`,
        "CREATE",
        querylogger,
        idUser,
        20,
        EstatusEnumBitcora.SUCCESS
      );

      //API response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Monedero creado correctamente.",
        data: {
          id: Number(monederoSave.id),
          nombre: `${monederoSave.numeroSerie} ${monederoSave.saldo} ` || "",
        },
      };
      return result;
    } catch (error) {
      // -------------   ERROR -------------****-*-*
      // --- Registro en la bitácora --- ERROR
      const querylogger = { createMonederoDto };
      await this.bitacoraLogger.logToBitacora(
        "Monederos",
        `Se creó un monedero con número de serie: ${createMonederoDto.numeroSerie}.`,
        "CREATE",
        querylogger,
        idUser,
        20,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Hubo un error al crear el monedero.",
        error: error.message,
      });
    }
  }

  //Obtener todos los monederos paginado -- No sirve
  async findAllMonederos(
    page: number,
    limit: number
  ): Promise<ApiResponseCommon> {
    try {
      const monederos = await this.monederoRepository.find();
      if (monederos.length === 0) {
        throw new NotFoundException("No se encontraron monederos.");
      }
      const [data, total] = await this.monederoRepository.findAndCount({
        relations: [],
        skip: (page - 1) * limit,
        take: limit,
        order: {
          id: "DESC",
        },
      });

      //Cambiamos los datos numericos a number
      const monederoResult = data.map((item) => ({
        ...item,
        id: Number(item.id),
        saldo: Number(item.saldo),
        idPasajero: Number(item.idPasajero),
        idCliente: Number(item.idCliente),
      }));

      const result: ApiResponseCommon = {
        data: monederoResult,
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
      throw new InternalServerErrorException(
        "Hubo un error al obtener los monederos paginados."
      );
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

  //Obtener todos los monederos
  async findAllPagMonederos(
    idUser: number,
    email: string,
    cliente: number,
    rol: number,
    page: number,
    limit: number
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let totalResult;
      let monederos;
      switch (rol) {
        case 1:
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.NumeroSerie AS numeroSerie,
    m.Saldo AS saldo,
    m.FechaActivacion AS fechaActivacion,
    m.FechaCreacion AS fechaCreacion,
    m.FechaActualizacion AS fechaActualizacion,
    m.Estatus AS estatus,
    m.IdPasajero AS idPasajero,
    m.IdCliente AS idCliente,

    p.Id AS idPasajeroMonederos,
    p.Nombre AS pasajeroNombre,
    p.ApellidoPaterno AS pasajeroApellidoPaterno,
    p.ApellidoMaterno AS pasajeroApellidoMaterno,
    CONCAT(p.Nombre, ' ', p.ApellidoPaterno, ' ', p.ApellidoMaterno) AS nombreCompletoPasajero,

    c.Id AS idClienteMonederos,
    c.Nombre AS clienteNombre,
    c.ApellidoPaterno AS clienteApellidoPaterno,
    c.ApellidoMaterno AS clienteApellidoMaterno,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id



ORDER BY m.Id DESC;

            `
          );

          totalResult = await this.monederoRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id


  `
          );
          break;

        case 9:
          const pasajero =
            await this.pasajerosService.findOnePasajeroCorreo(email);
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.NumeroSerie AS numeroSerie,
    m.Saldo AS saldo,
    m.FechaActivacion AS fechaActivacion,
    m.FechaCreacion AS fechaCreacion,
    m.FechaActualizacion AS fechaActualizacion,
    m.Estatus AS estatus,
    m.IdPasajero AS idPasajero,
    m.IdCliente AS idCliente,

    p.Id AS idPasajeroMonederos,
    p.Nombre AS pasajeroNombre,
    p.ApellidoPaterno AS pasajeroApellidoPaterno,
    p.ApellidoMaterno AS pasajeroApellidoMaterno,
    CONCAT(p.Nombre, ' ', p.ApellidoPaterno, ' ', p.ApellidoMaterno) AS nombreCompletoPasajero,

    c.Id AS idClienteMonederos,
    c.Nombre AS clienteNombre,
    c.ApellidoPaterno AS clienteApellidoPaterno,
    c.ApellidoMaterno AS clienteApellidoMaterno,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id

WHERE p.Id = ?

ORDER BY m.Id DESC;

            `,
            [pasajero.id]
          );

          totalResult = await this.monederoRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id

WHERE p.Id = ?
  `,
            [pasajero.id]
          );
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(cliente);
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.NumeroSerie AS numeroSerie,
    m.Saldo AS saldo,
    m.FechaActivacion AS fechaActivacion,
    m.FechaCreacion AS fechaCreacion,
    m.FechaActualizacion AS fechaActualizacion,
    m.Estatus AS estatus,
    m.IdPasajero AS idPasajero,
    m.IdCliente AS idCliente,

    p.Id AS idPasajeroMonederos,
    p.Nombre AS pasajeroNombre,
    p.ApellidoPaterno AS pasajeroApellidoPaterno,
    p.ApellidoMaterno AS pasajeroApellidoMaterno,
    CONCAT(p.Nombre, ' ', p.ApellidoPaterno, ' ', p.ApellidoMaterno) AS nombreCompletoPasajero,

    c.Id AS idClienteMonederos,
    c.Nombre AS clienteNombre,
    c.ApellidoPaterno AS clienteApellidoPaterno,
    c.ApellidoMaterno AS clienteApellidoMaterno,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

ORDER BY m.Id DESC;

            `,
            [...ids]
          );

          totalResult = await this.monederoRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id
WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

  `,
            [...ids]
          );
          break;
      }

      const data = monederos.map((item) => ({
        ...item,
        id: Number(item.id),
        saldo: Number(item.saldo),
        idPasajero: Number(item.idPasajero),
        idCliente: Number(item.idCliente),
        idPasajeroMonedero: Number(item.idPasajeroMonederos),
        idClienteMonedero: Number(item.idClienteMonedero),
      }));

      const total = Number(totalResult[0]?.total || 0);

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
      throw new InternalServerErrorException(
        "Hubo un error al obtener el listado de monederos."
      );
    }
  }

  //Obtener todos los monederos
  async findAllListMonederos(
    idUser: number,
    email: string,
    cliente: number,
    rol: number
  ): Promise<ApiResponseCommon> {
    try {
      let monederos;
      switch (rol) {
        case 1:
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.NumeroSerie AS numeroSerie,
    m.Saldo AS saldo,
    m.FechaActivacion AS fechaActivacion,
    m.FechaCreacion AS fechaCreacion,
    m.FechaActualizacion AS fechaActualizacion,
    m.Estatus AS estatusMonedero,

    p.Id AS idPasajero,
    p.Nombre AS pasajeroNombre,
    p.ApellidoPaterno AS pasajeroApellidoPaterno,
    p.ApellidoMaterno AS pasajeroApellidoMaterno,
    CONCAT(p.Nombre, ' ', p.ApellidoPaterno, ' ', p.ApellidoMaterno) AS nombreCompletoPasajero,

    c.Id AS idCliente,
    c.Nombre AS clienteNombre,
    c.ApellidoPaterno AS clienteApellidoPaterno,
    c.ApellidoMaterno AS clienteApellidoMaterno,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id

WHERE m.Estatus = 1 -- estatus activo
AND c.Estatus = 1

ORDER BY m.Id DESC;

            `
          );
          break;

        case 9:
          const pasajero =
            await this.pasajerosService.findOnePasajeroCorreo(email);
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.NumeroSerie AS numeroSerie,
    m.Saldo AS saldo,
    m.FechaActivacion AS fechaActivacion,
    m.FechaCreacion AS fechaCreacion,
    m.FechaActualizacion AS fechaActualizacion,
    m.Estatus AS estatusMonedero,

    p.Id AS idPasajero,
    p.Nombre AS pasajeroNombre,
    p.ApellidoPaterno AS pasajeroApellidoPaterno,
    p.ApellidoMaterno AS pasajeroApellidoMaterno,
    CONCAT(p.Nombre, ' ', p.ApellidoPaterno, ' ', p.ApellidoMaterno) AS nombreCompletoPasajero,

    c.Id AS idCliente,
    c.Nombre AS clienteNombre,
    c.ApellidoPaterno AS clienteApellidoPaterno,
    c.ApellidoMaterno AS clienteApellidoMaterno,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id

WHERE m.Estatus = 1 -- estatus activo
AND c.Estatus = 1
AND p.Id = ?

ORDER BY m.Id DESC;

            `,
            [pasajero.id]
          );
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(cliente);
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.NumeroSerie AS numeroSerie,
    m.Saldo AS saldo,
    m.FechaActivacion AS fechaActivacion,
    m.FechaCreacion AS fechaCreacion,
    m.FechaActualizacion AS fechaActualizacion,
    m.Estatus AS estatusMonedero,

    p.Id AS idPasajero,
    p.Nombre AS pasajeroNombre,
    p.ApellidoPaterno AS pasajeroApellidoPaterno,
    p.ApellidoMaterno AS pasajeroApellidoMaterno,
    CONCAT(p.Nombre, ' ', p.ApellidoPaterno, ' ', p.ApellidoMaterno) AS nombreCompletoPasajero,

    c.Id AS idCliente,
    c.Nombre AS clienteNombre,
    c.ApellidoPaterno AS clienteApellidoPaterno,
    c.ApellidoMaterno AS clienteApellidoMaterno,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND m.Estatus = 1 -- estatus activo
AND c.Estatus = 1

ORDER BY m.Id DESC;

            `,
            [...ids]
          );
          break;
      }


      const data = monederos.map((item) => ({
        ...item,
        id: Number(item.id),
        saldo: Number(item.saldo),
        idPasajero: Number(item.idPasajero),
        idCliente: Number(item.idCliente),
      }));

      //Api response
      const result: ApiResponseCommon = {
        data: data,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        "Hubo un error al obtener el listado de monederos."
      );
    }
  }

  //Obtener monedero por ID
  async findOneMonedero(id: number) {
    try {
      const monedero = await this.monederoRepository.findOne({
        where: { id: id },
      });
      if (!monedero) {
        throw new NotFoundException(
          `El monedero con ID: ${id} no fue encontrado.`
        );
      }

      //Cambiamos los datos numericos a number
      const monederoResult = {
        ...monedero,
        id: Number(monedero.id),
        saldo: Number(monedero.saldo),
        idPasajero: Number(monedero.idPasajero),
        idCliente: Number(monedero.idCliente),
      };
      return { data: monederoResult };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        "Hubo un error al obtener el monedero."
      );
    }
  }

  //Obtener monedero por numero de serie
  async findOneMonederoBySerie(NumeroSerie: string) {
    try {
      const monedero = await this.monederoRepository.findOne({
        where: { numeroSerie: NumeroSerie },
      });
      if (!monedero) {
        throw new NotFoundException(
          `El monedero con número de serie: ${NumeroSerie} no fue encontrado.`
        );
      }
      //Cambiamos los datos numericos a number
      const monederoResult = {
        ...monedero,
        id: Number(monedero.id),
        saldo: Number(monedero.saldo),
        idPasajero: Number(monedero.idPasajero),
        idCliente: Number(monedero.idCliente),
      };
      return { data: monederoResult };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        "Hubo un error al obtener el monedero por número de serie."
      );
    }
  }

  //Actualizar el estatus del monedero
  async updateMonederoEstatus(
    id: number,
    idUser: number,
    updateMonederoEstatusDto: UpdateMonederoEstatusDto
  ) {
    try {
      const monedero = await this.monederoRepository.findOne({
        where: { id: id },
      });
      if (!monedero) {
        throw new NotFoundException(
          `El monedero con ID: ${id} no fue encontrado.`
        );
      }

      //Actualizamos estatus
      const { estatus } = updateMonederoEstatusDto;
      await this.monederoRepository.update(id, { estatus: estatus });

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { updateMonederoEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Monederos",
        `Se actualizó el estatus del monedero con ID: ${id} a ${estatus}.`,
        "UPDATE",
        querylogger,
        idUser,
        20,
        EstatusEnumBitcora.SUCCESS
      );

      //API response
      const result: ApiCrudResponse = {
        status: "success",
        message: "El estatus del monedero se actualizó correctamente.",
        estatus: { estatus: estatus },
        data: {
          id: Number(monedero.id),
          nombre: `${monedero.numeroSerie} ${monedero.saldo} ` || "",
        },
      };

      return result;
    } catch (error) {
      // --- Registro en la bitácora --- ERROR
      const querylogger = { updateMonederoEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Monederos",
        `Se actualizó el estatus del monedero con ID: ${id} a ${updateMonederoEstatusDto.estatus}.`,
        "UPDATE",
        querylogger,
        idUser,
        20,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        "Hubo un error al actualizar el estatus del monedero."
      );
    }
  }

  //Actualizar saldo en el monedero
  async updateMonederoSaldo(
    numeroSerie: string,
    idUser: number,
    saldo: number
  ) {
    try {
      const monedero = await this.monederoRepository.findOne({
        where: { numeroSerie: numeroSerie },
      });
      if (!monedero) {
        throw new NotFoundException(
          `El monedero con número de serie: ${numeroSerie} no fue encontrado.`
        );
      }
      const id = Number(monedero.id);

      //Actualizamos saldo
      await this.monederoRepository.update(id, { saldo: saldo });

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { numeroSerie: numeroSerie, saldo: saldo };
      await this.bitacoraLogger.logToBitacora(
        "Monederos",
        `Se actualizó el saldo del monedero con ID: ${id}.`,
        "UPDATE",
        querylogger,
        idUser,
        20,
        EstatusEnumBitcora.SUCCESS
      );

      //API response
      const result: ApiCrudResponse = {
        status: "success",
        message: "El saldo del monedero se actualizó correctamente.",
        data: {
          id: id,
          nombre: `${monedero.numeroSerie} ${monedero.saldo} ` || "",
        },
      };
      return result;
    } catch (error) {
      // --- Registro en la bitácora --- ERROR
      const querylogger = { numeroSerie: numeroSerie, saldo: saldo };
      await this.bitacoraLogger.logToBitacora(
        "Monederos",
        `Se actualizó el saldo del monedero con número de serie: ${numeroSerie}`,
        "UPDATE",
        querylogger,
        idUser,
        20,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al crear ruta",
        error: error.message,
      });
    }
  }

  //Actualizar el monedero
  async updateMonedero(
    id: number,
    idUser: number,
    updateMonederoDto: UpdateMonederoDto
  ) {
    try {
      const monedero = await this.monederoRepository.findOne({
        where: { id: id },
      });
      if (!monedero) {
        throw new NotFoundException(
          `El monedero con ID: ${id} no fue encontrado.`
        );
      }

      //Actualizamos monedero
      const monederoData =
        await this.monederoRepository.create(updateMonederoDto);
      await this.monederoRepository.update(id, monederoData);

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { updateMonederoDto };
      await this.bitacoraLogger.logToBitacora(
        "Monederos",
        `Se actualizó el monedero con ID: ${id}.`,
        "UPDATE",
        querylogger,
        idUser,
        20,
        EstatusEnumBitcora.SUCCESS
      );

      //API response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Monedero actualizado correctamente.",
        data: {
          id: id,
          nombre: `${monedero.numeroSerie} ${monedero.saldo} ` || "",
        },
      };
      return result;
    } catch (error) {
      // --- Registro en la bitácora --- ERROR
      const querylogger = { updateMonederoDto };
      await this.bitacoraLogger.logToBitacora(
        "Monederos",
        `Se actualizó el monedero con ID: ${id}.`,
        "UPDATE",
        querylogger,
        idUser,
        20,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar monedero",
        error: error.message,
      });
    }
  }

  //Eliminar monederos
  async removeMonedero(id: number, idUser: number) {
    try {
      const monedero = await this.monederoRepository.findOne({
        where: { id: id },
      });
      if (!monedero) {
        throw new NotFoundException(
          `El monedero con ID: ${id} no fue encontrado.`
        );
      }

      //Eliminamos de manera logica
      await this.monederoRepository.update(id, {
        estatus: EstatusEnum.INACTIVO,
      });

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Monederos",
        `Se eliminó el monedero con ID: ${id}.`,
        "DELETE",
        querylogger,
        idUser,
        20
      );

      //API response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Monedero eliminado correctamente.",
        data: {
          id: id,
          nombre: `${monedero.numeroSerie} ${monedero.saldo} ` || "",
        },
      };
      return result;
    } catch (error) {
      // --- Registro en la bitácora --- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Monederos",
        `Se eliminó el monedero con ID: ${id}.`,
        "DELETE",
        querylogger,
        idUser,
        20,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        "Hubo un error al eliminar el monedero."
      );
    }
  }
}
