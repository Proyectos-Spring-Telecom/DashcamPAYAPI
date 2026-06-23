import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { UpdateClienteEstatusDto } from './dto/update-clientes-estatus.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Clientes } from 'src/entities/Clientes';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { CatpasajeroService } from 'src/cattiposasajeros/catpasajero.service';
import {
  EnumModulos,
  EnumTipoDescuento,
  EstatusEnum,
} from 'src/common/estatus.enum';

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly catpasajeroService: CatpasajeroService,
  ) { }

  // ========================================
  // 🔹 CREAR UN CLIENTE
  // ========================================
  async createCliente(
    createClienteDto: CreateClienteDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      //Buscamos al cliente y verificamos
      const clienteCreate = await this.clienteRepository.findOne({
        where: {
          rfc: createClienteDto.rfc,
        },
      });
      if (clienteCreate) {
        throw new BadRequestException(
          `Cliente ya registrado con RFC: ${createClienteDto.rfc}. Por favor, ingrese un RFC diferente.`,
        );
      }

      //Creamos el nuevo cliente
      const clienteData = await this.clienteRepository.create(createClienteDto);
      const clienteCreado = await this.clienteRepository.save(clienteData);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createClienteDto };
      await this.bitacoraLogger.logToBitacora(
        'Clientes',
        `Cliente creado correctamente con RFC: ${createClienteDto.rfc}.`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.CLIENTES,
        EstatusEnumBitcora.SUCCESS,
      );

      //Creamos el body para generarle al nuevo cliente un tipo de pasajero estandar
      const bodyCatPasajero = {
        nombre: 'Estandar',
        idCatTipoDescuento: EnumTipoDescuento.NULO,
        cantidad: null,
        estatus: EstatusEnum.ACTIVO,
        idCliente: Number(clienteCreado.id),
      };

      //consumimos el servicio crear catpasajero estandas
      await this.catpasajeroService.create(idUser, bodyCatPasajero);

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El cliente ha sido creado correctamente.',
        data: {
          id: clienteCreado.id,
          nombre:
            `${clienteCreado.nombre} ${clienteCreado.apellidoPaterno} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createClienteDto };
      await this.bitacoraLogger.logToBitacora(
        'Clientes',
        `Cliente creado correctamente con RFC: ${createClienteDto.rfc}.`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.CLIENTES,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al intentar crear un cliente.',
        error: error.message,
      });
    }
  }

  //funcion para obtener los clientes padre e hijos
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

  private async clienteHijosPag(cliente: number) {
    const result = await this.clienteRepository.query(
      'CALL spGetClientes(?);',
      [cliente],
    );

    let rows = result?.[0] ?? [];

    // Construir ids y quitar el cliente padre
    const ids = rows
      .map((row: any) => Number(row.Id))
      .filter(id => !isNaN(id) && id !== cliente); // 👈 QUITAR EL CLIENTE PADRE

    if (ids.length === 0) {
      return { ids: [], placeholders: '' };
    }

    const placeholders = ids.map(() => '?').join(', ');

    return { ids, placeholders };
  }

  // ========================================
  // 🔹 OBTENER PAGINADO DE CLIENTES
  // ========================================
  async getAllClientes(
    idUser: number,
    cliente: number,
    rol: number,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let totalResult;
      let clientes;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las zonas
          clientes = await this.clienteRepository.query(
            `
SELECT
  c.Id AS id,
  c.RFC AS rfc,
  c.TipoPersona AS tipoPersona,
  c.Nombre AS nombre,
  c.ApellidoPaterno AS apellidoPaterno,
  c.ApellidoMaterno AS apellidoMaterno,
  c.Telefono AS telefono,
  c.Correo AS correo,
  c.Estado AS estado,
  c.Municipio AS municipio,
  c.Colonia AS colonia,
  c.Calle AS calle,
  c.EntreCalles AS entreCalles,
  c.NumeroExterior AS numeroExterior,
  c.NumeroInterior AS numeroInterior,
  c.CP AS cp,
  c.NombreEncargado AS nombreEncargado,
  c.TelefonoEncargado AS telefonoEncargado,
  c.CorreoEncargado AS correoEncargado,
  c.ConstanciaSituacionFiscal AS constanciaSituacionFiscal,
  c.ComprobanteDomicilio AS comprobanteDomicilio,
  c.ActaConstitutiva AS actaConstitutiva,
  COALESCE(c.Logotipo, cp.Logotipo) AS logotipo,
  c.Estatus AS estatus
  
FROM Clientes c
LEFT JOIN Clientes cp ON c.IdPadre = cp.Id
ORDER BY c.Id ASC
  LIMIT ? OFFSET ?;
            `,
            [ limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.clienteRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Clientes

  `, 
          );
          break;

        default:
          const { ids, placeholders } = await this.clienteHijosPag(cliente);
          clientes = await this.clienteRepository.query(
            `
SELECT
  c.Id AS id,
  c.RFC AS rfc,
  c.TipoPersona AS tipoPersona,
  c.Nombre AS nombre,
  c.ApellidoPaterno AS apellidoPaterno,
  c.ApellidoMaterno AS apellidoMaterno,
  c.Telefono AS telefono,
  c.Correo AS correo,
  c.Estado AS estado,
  c.Municipio AS municipio,
  c.Colonia AS colonia,
  c.Calle AS calle,
  c.EntreCalles AS entreCalles,
  c.NumeroExterior AS numeroExterior,
  c.NumeroInterior AS numeroInterior,
  c.CP AS cp,
  c.NombreEncargado AS nombreEncargado,
  c.TelefonoEncargado AS telefonoEncargado,
  c.CorreoEncargado AS correoEncargado,
  c.ConstanciaSituacionFiscal AS constanciaSituacionFiscal,
  c.ComprobanteDomicilio AS comprobanteDomicilio,
  c.ActaConstitutiva AS actaConstitutiva,
  COALESCE(c.Logotipo, cp.Logotipo) AS logotipo,
  c.Estatus AS estatus
  
FROM Clientes c
LEFT JOIN Clientes cp ON c.IdPadre = cp.Id
WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
ORDER BY c.Id ASC
  LIMIT ? OFFSET ?;
            `,
            [...ids, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.clienteRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Clientes
WHERE Id IN (${placeholders})    -- 🔹 aquí colocas el ID del cliente que quieres consultar
ORDER BY Id ASC

  `,
            [...ids],
          );
          break;
      }

      // 🔥 Forzamos ids a number y agregamos nombreCompleto
      const data = clientes.map((item) => ({
        ...item,
        id: Number(item.id),
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
        message: 'Ocurrió un error al obtener paginados de los clientes.',
      });
    }
  }

  // ========================================
  // 🔹 OBTENER UN LISTADO DE CLIENTES
  // ========================================
  async getAllListClientes(
    idUser: number,
    cliente: number | null,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      let clientes;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las zonas
          clientes = await this.clienteRepository.query(
            `
SELECT
  c.Id AS id,
  c.Nombre AS nombre,
  c.ApellidoPaterno AS apellidoPaterno,
  c.ApellidoMaterno AS apellidoMaterno,
  COALESCE(c.Logotipo, cp.Logotipo) AS logotipo
FROM Clientes c
LEFT JOIN Clientes cp ON c.IdPadre = cp.Id
WHERE c.Estatus = 1
ORDER BY c.Id ASC;
            `,
          );
          break;

        default:
          // Usuarios normales - solo sus zonas asignadas
          if (!cliente) {
            throw new Error('Cliente es requerido para usuarios no administradores');
          }
          const { ids, placeholders } = await this.clienteHijos(cliente);
          clientes = await this.clienteRepository.query(
            `
SELECT
  c.Id AS id,
  c.Nombre AS nombre,
  c.ApellidoPaterno AS apellidoPaterno,
  c.ApellidoMaterno AS apellidoMaterno,
  COALESCE(c.Logotipo, cp.Logotipo) AS logotipo
FROM Clientes c
LEFT JOIN Clientes cp ON c.IdPadre = cp.Id
WHERE c.Id IN (${placeholders})  -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND c.Estatus = 1
ORDER BY c.Id ASC;

            `,
            [...ids],
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
        message: 'Ocurrió un error al obtener listado de los clientes.',
      });
    }
  }

  // ========================================
  // 🔹 OBTENER UN LISTADO POR ID CLIENTE
  // ========================================
  async getAllListClientesId(
    idUser: number,
    cliente: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      let clientes;
      // Usuarios normales - solo sus Zonas asignadas
          const { ids, placeholders } = await this.clienteHijos(cliente);
          clientes = await this.clienteRepository.query(
            `
SELECT
  Id AS id,
  Nombre AS nombre,
  ApellidoPaterno AS apellidoPaterno,
  ApellidoMaterno AS apellidoMaterno
FROM Clientes
WHERE Id IN (${placeholders})  -- 🔹 aquí colocas el ID del cliente que quieres consultar
  
ORDER BY Id ASC

            `,
            [...ids],
          );

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
        message: 'Ocurrió un error al obtener listado de los clientes.',
      });
    }
  }

  // ========================================
  // 🔹 OBTENER TODOS LOS CLIENTES ACTIVOS (PÚBLICO - SIN AUTENTICACIÓN)
  // ========================================
  async getClientesPublicos(): Promise<ApiResponseCommon> {
    try {
      const clientes = await this.clienteRepository.find({
        where: { estatus: EstatusEnum.ACTIVO },
        select: ['id', 'nombre'],
        order: { id: 'ASC' },
      });

      // 🔥 Forzamos ids a number y solo devolvemos id y nombre
      const data = clientes.map((item) => ({
        id: Number(item.id),
        nombre: item.nombre,
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
        message: 'Ocurrió un error al obtener el listado de clientes.',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 OBTENER UN CLIENTE
  // ========================================
  async getOneCliente(id: number) {
    try {
      const cliente = await this.clienteRepository.findOne({
        where: { id: id },
      });
      if (!cliente) {
        throw new NotFoundException(
          `El cliente con ID: ${id} no fue encontrado.`,
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

  // ========================================
  // 🔹 ACTUALIZAR CLIENTE
  // ========================================
  async updateCliente(
    id: number,
    idUser: number,
    updateClienteDto: UpdateClienteDto,
  ): Promise<ApiCrudResponse> {
    try {
      //Buscamos al cliente y verificamos
      const Cliente = await this.clienteRepository.findOne({
        where: { id: id },
      });
      if (!Cliente) {
        throw new NotFoundException(
          `El cliente con ID: ${id} no fue encontrado.`,
        );
      }

      //Actualizamos datos del cliente
      await this.clienteRepository.update(id, updateClienteDto);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateClienteDto };
      await this.bitacoraLogger.logToBitacora(
        'Clientes',
        `Cliente con ID: ${id} actualizado correctamente.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.CLIENTES,
        EstatusEnumBitcora.SUCCESS,
      );

      //buscamos el cliente ya actualizados
      const clientefind = await this.clienteRepository.findOne({
        where: { id: id },
      });
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Cliente actualizado correctamente.',
        data: {
          id: id,
          nombre:
            `${clientefind?.nombre} ${clientefind?.apellidoPaterno} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateClienteDto };
      await this.bitacoraLogger.logToBitacora(
        'Clientes',
        `Cliente con ID: ${id} actualizado correctamente.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.CLIENTES,
        EstatusEnumBitcora.ERROR,
        error.message,
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

  // ========================================
  // 🔹 ACTUALIZAR ESTATUS DEL CLIENTE
  // ========================================
  async updateClienteStatus(
    id: number,
    idUser: number,
    cliente: number,
    updateClienteEstatusDto: UpdateClienteEstatusDto,
  ): Promise<ApiCrudResponse> {
    try {
      //Buscamos al cliente y verificamos
      const cliente = await this.clienteRepository.findOne({
        where: { id: id },
      });
      if (!cliente) {
        throw new NotFoundException(`Cliente con ID: ${id} no encontrado`);
      }

      //Obtenemos los clientes hijos
      const { ids, placeholders } = await this.clienteHijos(id);

      //Obtenemos el valor de estatus
      const estatus = updateClienteEstatusDto.estatus;

      //Hacemos eliminado logico al cliente padre e hijos
      await this.clienteRepository.query(
        `
        UPDATE Clientes
        SET Estatus = ${estatus}
        WHERE Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
        `,
        [...ids],
      );

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateClienteEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Clientes',
        `El estatus del cliente con ID ${id} se modificó exitosamente a: ${estatus}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.CLIENTES,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Estatus del cliente actualizado correctamente.',
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre: `${cliente.nombre} ${cliente.apellidoPaterno} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateClienteEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Clientes',
        `Se cambió el estatus del cliente con ID: ${id} a estatus: ${updateClienteEstatusDto.estatus}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.CLIENTES,
        EstatusEnumBitcora.ERROR,
        error.message,
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

  // ========================================
  // 🔹 ELIMINAR CLIENTES
  // ========================================
  async removeCliente(
    id: number,
    idUser: number,
    cliente: number,
  ): Promise<ApiCrudResponse> {
    try {

      //Buscamos al cliente y verificamos
      const clienteEliminar = await this.clienteRepository.findOne({
        where: { id: id },
      });
      if (!clienteEliminar) {
        throw new NotFoundException(
          `El cliente con ID: ${id} no fue encontrado.`,
        );
      }

      //Obtenemos los clientes hijos
      const { ids, placeholders } = await this.clienteHijos(id);

      //Hacemos eliminado logico al cliente padre e hijos
      await this.clienteRepository.query(
        `
        UPDATE Clientes
        SET Estatus = 0
        WHERE Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
        `,
        [...ids],
      );

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Clientes',
        `Se eliminó el cliente con ID: ${id}.`,
        'UPDATE',
        querylogger,
        Number(idUser),
        EnumModulos.CLIENTES,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El cliente fue eliminado correctamente.',
        data: {
          id: id,
          nombre:
            `${clienteEliminar.nombre} ${clienteEliminar.apellidoPaterno} ` ||
            '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Clientes',
        `Se eliminó el cliente con ID: ${id}.`,
        'UPDATE',
        querylogger,
        Number(idUser),
        EnumModulos.CLIENTES,
        EstatusEnumBitcora.ERROR,
        error.message,
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
