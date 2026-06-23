import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateCatpasajeroDto } from './dto/create-catpasajero.dto';
import { UpdateCatpasajeroDto } from './dto/update-catpasajero.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { CatTiposPasajeros } from 'src/entities/CatTiposPasajeros';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { EnumModulos, EstatusEnum } from 'src/common/estatus.enum';
import { UpdateCatPasajeroEstatusDto } from './dto/update-catpasajero-estatus.dto';
import { Clientes } from 'src/entities/Clientes';

@Injectable()
export class CatpasajeroService {
  constructor(
    @InjectRepository(CatTiposPasajeros)
    private readonly catTiposPasajerosRepository: Repository<CatTiposPasajeros>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  // ========================================
  // 🔹 CREAR UN NUEVO TIPO DE PASAJERO
  // ========================================
  async create(idUser: number, createCatpasajeroDto: CreateCatpasajeroDto) {
    try {
      //Creamos el nuevo tipo de pasajero
      const newCatPasajero =
        await this.catTiposPasajerosRepository.create(createCatpasajeroDto);

      //Guardamos el nuevo tipo de pasajero en la base de datos
      const catPasajeroSave =
        await this.catTiposPasajerosRepository.save(newCatPasajero);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createCatpasajeroDto };
      await this.bitacoraLogger.logToBitacora(
        'CatalogoPasajero',
        `El tipo de pasajero ${createCatpasajeroDto.nombre} ha sido incorporado exitosamente al catálogo.`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.CATALOGOPASAJERO,
        EstatusEnumBitcora.SUCCESS,
      );
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El pasajero ha sido incorporado exitosamente al catálogo.',
        data: {
          id: catPasajeroSave.id,
          nombre: `${catPasajeroSave.nombre} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createCatpasajeroDto };
      await this.bitacoraLogger.logToBitacora(
        'CatalogoPasajero',
        `El tipo de pasajero ${createCatpasajeroDto.nombre} ha sido incorporado exitosamente al catálogo.`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.CATALOGOPASAJERO,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message:
          'Se ha producido un error durante la creación de un nuevo tipo de pasajero.',
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

  // ========================================
  // 🔹 OBTENER UN PAGINADO DE TIPOS DE PASAJERO
  // ========================================
  findAll() {
    return `This action returns all catpasajero`;
  }

  // ========================================
  // 🔹 OBTENER UN LISTADO DE TIPOS DE PASAJEROS POR CLIENTE
  // ========================================
  async findAllListClientes(cliente: number) {
    try {
      const catpasajeros = await this.catTiposPasajerosRepository.find({
        where: {
          estatus: EstatusEnum.ACTIVO,
          idCliente: cliente
        }
      })

      //Forzamos los BigInt a number
      const data = catpasajeros.map((item) => ({
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
        'Se produjo un error al obtener el listado de tipos de pasajeros por cliente.',
      );
    }
  }

  // ========================================
  // 🔹 OBTENER UN LISTADO DE TIPOS DE PASAJEROS
  // ========================================
  async findAllList(cliente: number, rol: number) {
    try {
      let catpasajeros;
      switch (rol) {
        case 1:
          // Consulta de datos listado Usuario SuperAdministrador
          catpasajeros = await this.catTiposPasajerosRepository.query(
            `
SELECT 
    cp.Id AS id,
    cp.Nombre AS nombre,
    cp.IdCatTipoDescuento AS idCatTipoDescuento,
    ctd.Nombre AS nombreTipoDescuento,
    cp.Cantidad AS cantidad,
    cp.Estatus AS estatus,
    cp.IdCliente AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente
FROM CatTiposPasajeros cp
INNER JOIN Clientes c 
    ON cp.IdCliente = c.Id
INNER JOIN CatTipoDescuento ctd
	ON cp.IdCatTipoDescuento = ctd.Id
WHERE c.Estatus = 1
ORDER BY cp.Id DESC;          
            `,
          );
          break;

        default:
          // Consulta de datos listado resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
          catpasajeros = await this.catTiposPasajerosRepository.query(
            `
SELECT 
    cp.Id AS id,
    cp.Nombre AS nombre,
    cp.IdCatTipoDescuento AS idCatTipoDescuento,
    ctd.Nombre AS nombreTipoDescuento,
    cp.Cantidad AS cantidad,
    cp.Estatus AS estatus,
    cp.IdCliente AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente
FROM CatTiposPasajeros cp
INNER JOIN Clientes c 
    ON cp.IdCliente = c.Id
INNER JOIN CatTipoDescuento ctd
	ON cp.IdCatTipoDescuento = ctd.Id
WHERE cp.IdCliente IN (${placeholders})   -- 👈 aquí sustituyes con el ID o IDs del cliente
AND c.Estatus = 1
ORDER BY cp.Id DESC;

            `,
            [...ids],
          );
          break;
      }

      //Forzamos los BigInt a number
      const data = catpasajeros.map((item) => ({
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
        'Se produjo un error al obtener el listado de tipos de pasajeros.',
      );
    }
  }

  // ========================================
  // 🔹 OBTENER UN SOLO TIPO DE PASAJERO
  // ========================================
  async findOne(id: number) {
    try {
      const catpasajeros = await this.catTiposPasajerosRepository.query(
        `
SELECT 
    cp.Id AS id,
    cp.Nombre AS nombre,
    cp.IdCatTipoDescuento AS idCatTipoDescuento,
    ctd.Nombre AS nombreTipoDescuento,
    cp.Cantidad AS cantidad,
    cp.Estatus AS estatus,
    cp.IdCliente AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente
FROM CatTiposPasajeros cp
INNER JOIN Clientes c 
    ON cp.IdCliente = c.Id
INNER JOIN CatTipoDescuento ctd
	ON cp.IdCatTipoDescuento = ctd.Id
WHERE cp.Id = ?
AND c.Estatus = 1
ORDER BY cp.Id DESC;        
            `,
        [id],
      );

      if (!catpasajeros) {
        throw new BadRequestException(
          `No se encontró el pasajero con ID ${id} dentro del catálogo.`,
        );
      }

      //Forzamos los BigInt a number
      const data = catpasajeros.map((item) => ({
        ...item,
        idTipoPasajero: Number(item.idTipoPasajero),
        idCliente: Number(item.idCliente),
      }));

      return data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        'Se produjo un error al obtener tipo de pasajero.',
      );
    }
  }

  // ========================================
  // 🔹 ACTUALIZAR DATOS DE UN TIPO DE PASAJERO
  // ========================================
  async update(
    id: number,
    idUser: number,
    updateCatpasajeroDto: UpdateCatpasajeroDto,
  ) {
    try {
      //Buscamos si existe el tipo de pasajero con ese ID y validamos
      const catpasajero = await this.catTiposPasajerosRepository.findOne({
        where: { id: id },
      });
      if (!catpasajero) {
        throw new BadRequestException(
          `No se encontró el pasajero con ID ${id} dentro del catálogo.`,
        );
      }

      //Actualizamos los datos en la base de datos
      await this.catTiposPasajerosRepository.update(id, updateCatpasajeroDto);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateCatpasajeroDto };
      await this.bitacoraLogger.logToBitacora(
        'CatalogoPasajero',
        `El tipo de pasajero con ID ${id} ha sido actualizado correctamente en el catálogo.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.CATALOGOPASAJERO,
        EstatusEnumBitcora.SUCCESS,
      );
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Se ha actualizado un pasajero del catálogo correctamente.',
        data: {
          id: id,
          nombre: `${updateCatpasajeroDto.nombre} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateCatpasajeroDto };
      await this.bitacoraLogger.logToBitacora(
        'CatalogoPasajero',
        `El tipo de pasajero con ID ${id} ha sido actualizado correctamente en el catálogo.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.CATALOGOPASAJERO,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al intentar actualizar el tipo de pasajero.',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 ACTUALIZAR ESTATUS DE UN TIPO DE PASAJERO
  // ========================================
  async updateEstatus(
    id: number,
    idUser: number,
    updateCatPasajeroEstatusDto: UpdateCatPasajeroEstatusDto,
  ) {
    try {
      //Buscamos si existe el tipo de pasajero con ese ID y validamos
      const catpasajero = await this.catTiposPasajerosRepository.findOne({
        where: { id: id },
      });
      if (!catpasajero) {
        throw new BadRequestException(
          `No se encontró el pasajero con ID ${id} dentro del catálogo.`,
        );
      }

      //Obtenemos el valor del estatus
      const { estatus } = updateCatPasajeroEstatusDto;

      //Actualizamos el estatus
      await this.catTiposPasajerosRepository.update(id, { estatus: estatus });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateCatPasajeroEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'CatalogoPasajero',
        `El estatus del tipo de pasajero ha sido actualizado correctamente en el catálogo a ${estatus}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.CATALOGOPASAJERO,
        EstatusEnumBitcora.SUCCESS,
      );
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Se ha actualizado el estatus de un pasajero del catálogo correctamente.',
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre: `${catpasajero.nombre} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateCatPasajeroEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'CatalogoPasajero',
        `El estatus del tipo de pasajero ha sido actualizado correctamente en el catálogo a ${updateCatPasajeroEstatusDto.estatus}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.CATALOGOPASAJERO,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message:
          'No fue posible cambiar el estatus del tipo de pasajero.',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 ELIMINADO LOGICO
  // ========================================
  async remove(id: number, idUser: number) {
    try {
      //Buscamos si existe el tipo de pasajero con ese ID y validamos
      const catpasajero = await this.catTiposPasajerosRepository.findOne({
        where: { id: id },
      });
      if (!catpasajero) {
        throw new BadRequestException(
          `No se encontró el pasajero con ID ${id} dentro del catálogo.`,
        );
      }

      //Actualizamos el estatus
      await this.catTiposPasajerosRepository.update(id, { estatus: 0 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: EstatusEnum.INACTIVO };
      await this.bitacoraLogger.logToBitacora(
        'CatalogoPasajero',
        `Tipo de pasajero eliminado del catálogo: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.CATALOGOPASAJERO,
        EstatusEnumBitcora.SUCCESS,
      );
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Se elimino un pasajero del catalogo correctamente.',
        data: {
          id: id,
          nombre: `${catpasajero.nombre} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: EstatusEnum.INACTIVO };
      await this.bitacoraLogger.logToBitacora(
        'CatalogoPasajero',
        `Tipo de pasajero eliminado del catálogo: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.CATALOGOPASAJERO,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al intentar eliminar el tipo de pasajero.',
        error: error.message,
      });
    }
  }
}
