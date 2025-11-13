import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { CreateClienteDto } from "./dto/create-cliente.dto";
import { UpdateClienteDto } from "./dto/update-cliente.dto";
import { UpdateClienteEstatusDto } from "./dto/update-clientes-estatus.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Clientes } from "src/entities/Clientes";
import { BitacoraLoggerService } from "src/bitacora/bitacora.service";
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from "src/common/ApiResponse";

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService
  ) {}
  //Crear cliente
  async createCliente(
    createClienteDto: CreateClienteDto,
    idUser: number
  ): Promise<ApiCrudResponse> {
    try {
      const clienteCreate = await this.clienteRepository.findOne({
        where: {
          rfc: createClienteDto.rfc,
        },
      });
      if (clienteCreate) {
        throw new BadRequestException(
          `Cliente ya registrado con RFC: ${createClienteDto.rfc}. Por favor, ingrese un RFC diferente.`
        );
      }
      const clienteData = await this.clienteRepository.create(createClienteDto);
      const clienteCreado = await this.clienteRepository.save(clienteData);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createClienteDto };
      await this.bitacoraLogger.logToBitacora(
        "Clientes",
        `Cliente creado correctamente con RFC: ${createClienteDto.rfc}.`,
        "CREATE",
        querylogger,
        idUser,
        1,
        EstatusEnumBitcora.SUCCESS
      );

      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "El cliente ha sido creado correctamente.",
        data: {
          id: Number(clienteCreado.id),
          nombre:
            `${clienteCreado.nombre} ${clienteCreado.apellidoPaterno} ` || "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createClienteDto };
      await this.bitacoraLogger.logToBitacora(
        "Clientes",
        `Cliente creado correctamente con RFC: ${createClienteDto.rfc}.`,
        "CREATE",
        querylogger,
        idUser,
        1,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Ocurrió un error al intentar crear un cliente.",
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

  //Obtener todos los clientes
  async getAllClientes(
    idUser: number,
    cliente: number,
    rol: number,
    page: number,
    limit: number
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let totalResult;
      let clientes;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las
          clientes = await this.clienteRepository.query(
            `
SELECT
  Id AS id,
  RFC AS rfc,
  TipoPersona AS tipoPersona,
  Nombre AS nombre,
  ApellidoPaterno AS apellidoPaterno,
  ApellidoMaterno AS apellidoMaterno,
  Telefono AS telefono,
  Correo AS correo,
  Estado AS estado,
  Municipio AS municipio,
  Colonia AS colonia,
  Calle AS calle,
  EntreCalles AS entreCalles,
  NumeroExterior AS numeroExterior,
  NumeroInterior AS numeroInterior,
  CP AS cp,
  NombreEncargado AS nombreEncargado,
  TelefonoEncargado AS telefonoEncargado,
  CorreoEncargado AS correoEncargado,
  ConstanciaSituacionFiscal AS constanciaSituacionFiscal,
  ComprobanteDomicilio AS comprobanteDomicilio,
  ActaConstitutiva AS actaConstitutiva,
  Logotipo AS logotipo,
  Estatus AS estatusCliente
  
FROM Clientes
ORDER BY Id DESC
  LIMIT ? OFFSET ?;
            `,
            [limit, offset]
          );

          // Query para total (sin paginación)
          totalResult = await this.clienteRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Clientes


  `
          );
          break;

        default:
          // Usuario Administrador - obtiene todas las
          const { ids, placeholders } = await this.clienteHijos(cliente);
          clientes = await this.clienteRepository.query(
            `
SELECT
  Id AS id,
  RFC AS rfc,
  TipoPersona AS tipoPersona,
  Nombre AS nombre,
  ApellidoPaterno AS apellidoPaterno,
  ApellidoMaterno AS apellidoMaterno,
  Telefono AS telefono,
  Correo AS correo,
  Estado AS estado,
  Municipio AS municipio,
  Colonia AS colonia,
  Calle AS calle,
  EntreCalles AS entreCalles,
  NumeroExterior AS numeroExterior,
  NumeroInterior AS numeroInterior,
  CP AS cp,
  NombreEncargado AS nombreEncargado,
  TelefonoEncargado AS telefonoEncargado,
  CorreoEncargado AS correoEncargado,
  ConstanciaSituacionFiscal AS constanciaSituacionFiscal,
  ComprobanteDomicilio AS comprobanteDomicilio,
  ActaConstitutiva AS actaConstitutiva,
  Logotipo AS logotipo,
  Estatus AS estatusCliente
  
FROM Clientes
WHERE Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
ORDER BY Id DESC
  LIMIT ? OFFSET ?;
            `,
            [...ids, limit, offset]
          );

          // Query para total (sin paginación)
          totalResult = await this.clienteRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Clientes
WHERE Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
ORDER BY Id DESC

  `,
            [...ids]
          );
          break;
      }

      // 🔥 Forzamos ids a number y agregamos nombreCompleto
      const data = clientes.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
      }));

      const total = Number(totalResult[0]?.total || 0);

      const result: ApiResponseCommon = {
        data,
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
      throw new BadRequestException({
        message: "Ocurrió un error al obtener paginados de los clientes.",
      });
    }
  }

  //Obtener todos los clientes
  async getAllListClientes(
    idUser: number,
    cliente: number,
    rol: number
  ): Promise<ApiResponseCommon> {
    try {
      let clientes;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las
          clientes = await this.clienteRepository.query(
            `
SELECT
  Id AS id,
  Nombre AS nombre,
  ApellidoPaterno AS apellidoPaterno,
  ApellidoMaterno AS apellidoMaterno
FROM Clientes
WHERE Estatus = 1
ORDER BY Id DESC;
            `
          );
          break;

        default:
          // Usuarios normales - solo sus asignadas
          const { ids, placeholders } = await this.clienteHijos(cliente);
          clientes = await this.clienteRepository.query(
            `
SELECT
  Id AS id,
  Nombre AS nombre,
  ApellidoPaterno AS apellidoPaterno,
  ApellidoMaterno AS apellidoMaterno
FROM Clientes
WHERE Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND Estatus = 1
ORDER BY Id DESC;

            `,
            [...ids]
          );
          break;
      }

      // 🔥 Forzamos ids a number y agregamos nombreCompleto
      const data = clientes.map((item) => ({
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
      throw new BadRequestException({
        message: "Ocurrió un error al obtener listado de los clientes.",
      });
    }
  }

  //Obtener el cliente por ID
  async getOneCliente(id: number) {
    try {
      const cliente = await this.clienteRepository.findOne({
        where: { id: id },
      });
      if (!cliente) {
        throw new NotFoundException(
          `El cliente con ID: ${id} no fue encontrado.`
        );
      }
      return { data: cliente };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException({
        message: `Error al obtener el cliente con ID: ${id}.`,
      });
    }
  }

  //Actualizar informacion del cliente
  async updateCliente(
    id: number,
    idUser: number,
    updateClienteDto: UpdateClienteDto
  ): Promise<ApiCrudResponse> {
    try {
      const Cliente = await this.clienteRepository.findOne({
        where: { id: id },
      });
      if (!Cliente) {
        throw new NotFoundException(
          `El cliente con ID: ${id} no fue encontrado.`
        );
      }
      const clienteData = await this.clienteRepository.create(updateClienteDto);
      await this.clienteRepository.update(id, clienteData);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateClienteDto };
      await this.bitacoraLogger.logToBitacora(
        "Clientes",
        `Cliente con ID: ${id} actualizado correctamente.`,
        "UPDATE",
        querylogger,
        idUser,
        1,
        EstatusEnumBitcora.SUCCESS
      );

      //Hacemos un expose que convierta los atributos en PascalCase
      const clientefind = await this.clienteRepository.findOne({
        where: { id: id },
      });
      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Cliente actualizado correctamente.",
        data: {
          id: id,
          nombre:
            `${clientefind?.nombre} ${clientefind?.apellidoPaterno} ` || "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateClienteDto };
      await this.bitacoraLogger.logToBitacora(
        "Clientes",
        `Cliente con ID: ${id} actualizado correctamente.`,
        "UPDATE",
        querylogger,
        idUser,
        1,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Error al actualizar la información del cliente con ID: ${id}`,
        error: error.message,
      });
    }
  }
  //Cambiar el estatus del cliente
  async updateClienteStatus(
    id: number,
    idUser: number,
    updateClienteEstatusDto: UpdateClienteEstatusDto
  ): Promise<ApiCrudResponse> {
    try {
      const usuario = await this.clienteRepository.findOne({
        where: { id: id },
      });
      if (!usuario) {
        throw new NotFoundException(`Cliente con ID: ${id} no encontrado`);
      }
      const { ids, placeholders } = await this.clienteHijos(id);
      const estatus = updateClienteEstatusDto.estatus;
      await this.clienteRepository.query(
        `
        UPDATE Clientes
        SET Estatus = ${estatus}
        WHERE Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
        `,
        [...ids]
      );

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateClienteEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Clientes",
        `El estatus del cliente con ID ${id} se modificó exitosamente a: ${estatus}.`,
        "UPDATE",
        querylogger,
        idUser,
        1,
        EstatusEnumBitcora.SUCCESS
      );

      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Estatus del cliente actualizado correctamente.",
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre: `${usuario.nombre} ${usuario.apellidoPaterno} ` || "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateClienteEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Clientes",
        `Se cambió el estatus del cliente con ID: ${id} a estatus: ${updateClienteEstatusDto.estatus}.`,
        "UPDATE",
        querylogger,
        idUser,
        1,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Error al cambiar el estatus del cliente con ID: ${id}.`,
        error: error.message,
      });
    }
  }
  //Eliminar cliente
  async removeCliente(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const clienteEliminar = await this.clienteRepository.findOne({
        where: { id: id },
      });
      if (!clienteEliminar) {
        throw new NotFoundException(
          `El cliente con ID: ${id} no fue encontrado.`
        );
      }
      const { ids, placeholders } = await this.clienteHijos(id);
      await this.clienteRepository.query(
        `
        UPDATE Clientes
        SET Estatus = 0
        WHERE Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
        `,
        [...ids]
      );

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Clientes",
        `Se eliminó el cliente con ID: ${id}.`,
        "UPDATE",
        querylogger,
        Number(idUser),
        1,
        EstatusEnumBitcora.SUCCESS
      );

      //Api response
      const result: ApiCrudResponse = {
        status: "success",
        message: "El cliente fue eliminado correctamente.",
        data: {
          id: id,
          nombre:
            `${clienteEliminar.nombre} ${clienteEliminar.apellidoPaterno} ` ||
            "",
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Clientes",
        `Se eliminó el cliente con ID: ${id}.`,
        "UPDATE",
        querylogger,
        Number(idUser),
        1,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Error al eliminar el cliente con ID: ${id}.`,
        error: error.message,
      });
    }
  }
}
