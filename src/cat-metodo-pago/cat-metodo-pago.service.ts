import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCatMetodoPagoDto } from './dto/create-cat-metodo-pago.dto';
import { UpdateCatMetodoPagoDto } from './dto/update-cat-metodo-pago.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { CatMetodoPago } from 'src/entities/CatMetodoPago';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { EnumModulos } from 'src/common/estatus.enum';

@Injectable()
export class CatMetodoPagoService {
  constructor(
    @InjectRepository(CatMetodoPago)
    private readonly catMetodoPagoRepository: Repository<CatMetodoPago>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  // ========================================
  // 🔹 CREAR UN NUEVO MÉTODO DE PAGO
  // ========================================
  async create(idUser: number, createCatMetodoPagoDto: CreateCatMetodoPagoDto) {
    try {
      // Verificar si ya existe un método de pago con el mismo nombre
      const existente = await this.catMetodoPagoRepository.findOne({
        where: { nombre: createCatMetodoPagoDto.nombre },
      });

      if (existente) {
        throw new BadRequestException(
          `Ya existe un método de pago con el nombre "${createCatMetodoPagoDto.nombre}".`,
        );
      }

      // Crear el nuevo método de pago
      const newCatMetodoPago = await this.catMetodoPagoRepository.create(
        createCatMetodoPagoDto,
      );

      // Guardar en la base de datos
      const catMetodoPagoSave =
        await this.catMetodoPagoRepository.save(newCatMetodoPago);

      // Registro en la bitácora - SUCCESS
      const querylogger = { createCatMetodoPagoDto };
      await this.bitacoraLogger.logToBitacora(
        'CatalogoMetodoPago',
        `El método de pago "${createCatMetodoPagoDto.nombre}" ha sido incorporado exitosamente al catálogo.`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.CATMETODOSPAGO,
        EstatusEnumBitcora.SUCCESS,
      );

      // API response
      const result: ApiCrudResponse = {
        status: 'success',
        message:
          'El método de pago ha sido incorporado exitosamente al catálogo.',
        data: {
          id: catMetodoPagoSave.id,
          nombre: catMetodoPagoSave.nombre,
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora - ERROR
      const querylogger = { createCatMetodoPagoDto };
      await this.bitacoraLogger.logToBitacora(
        'CatalogoMetodoPago',
        `Error al incorporar el método de pago "${createCatMetodoPagoDto.nombre}" al catálogo.`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.CATMETODOSPAGO,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message:
          'Se ha producido un error durante la creación de un nuevo método de pago.',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 OBTENER LISTADO DE MÉTODOS DE PAGO
  // ========================================
  async findAllList(): Promise<ApiResponseCommon> {
    try {
      const metodosPago = await this.catMetodoPagoRepository.find({
        order: { nombre: 'ASC' },
      });

      // Forzar BigInt a number
      const data = metodosPago.map((item) => ({
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
      throw new BadRequestException(
        'Se produjo un error al obtener el listado de métodos de pago.',
      );
    }
  }

  // ========================================
  // 🔹 OBTENER UN SOLO MÉTODO DE PAGO
  // ========================================
  async findOne(id: number) {
    try {
      const metodoPago = await this.catMetodoPagoRepository.findOne({
        where: { id: id },
      });

      if (!metodoPago) {
        throw new NotFoundException(
          `No se encontró el método de pago con ID ${id} en el catálogo.`,
        );
      }

      // API response
      const dataItem = {
        id: Number(metodoPago.id),
        nombre: metodoPago.nombre,
      };

      const result: ApiResponseCommon = {
        data: [dataItem],
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        'Se produjo un error al obtener el método de pago.',
      );
    }
  }

  // ========================================
  // 🔹 ACTUALIZAR DATOS DE UN MÉTODO DE PAGO
  // ========================================
  async update(
    id: number,
    idUser: number,
    updateCatMetodoPagoDto: UpdateCatMetodoPagoDto,
  ) {
    try {
      // Buscar si existe el método de pago con ese ID
      const metodoPago = await this.catMetodoPagoRepository.findOne({
        where: { id: id },
      });

      if (!metodoPago) {
        throw new NotFoundException(
          `No se encontró el método de pago con ID ${id} en el catálogo.`,
        );
      }

      // Si se está actualizando el nombre, verificar que no exista otro con el mismo nombre
      if (
        updateCatMetodoPagoDto.nombre &&
        updateCatMetodoPagoDto.nombre !== metodoPago.nombre
      ) {
        const existente = await this.catMetodoPagoRepository.findOne({
          where: { nombre: updateCatMetodoPagoDto.nombre },
        });

        if (existente) {
          throw new BadRequestException(
            `Ya existe un método de pago con el nombre "${updateCatMetodoPagoDto.nombre}".`,
          );
        }
      }

      // Actualizar los datos en la base de datos
      await this.catMetodoPagoRepository.update(id, updateCatMetodoPagoDto);

      // Registro en la bitácora - SUCCESS
      const querylogger = { updateCatMetodoPagoDto };
      await this.bitacoraLogger.logToBitacora(
        'CatalogoMetodoPago',
        `El método de pago con ID ${id} ha sido actualizado correctamente en el catálogo.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.CATMETODOSPAGO,
        EstatusEnumBitcora.SUCCESS,
      );

      // API response
      const result: ApiCrudResponse = {
        status: 'success',
        message:
          'Se ha actualizado el método de pago del catálogo correctamente.',
        data: {
          id: id,
          nombre: updateCatMetodoPagoDto.nombre || metodoPago.nombre,
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora - ERROR
      const querylogger = { updateCatMetodoPagoDto };
      await this.bitacoraLogger.logToBitacora(
        'CatalogoMetodoPago',
        `Error al actualizar el método de pago con ID ${id} en el catálogo.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.CATMETODOSPAGO,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message:
          'Se ha producido un error durante la actualización del método de pago.',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 ELIMINAR UN MÉTODO DE PAGO
  // ========================================
  async remove(id: number, idUser: number) {
    try {
      // Buscar si existe el método de pago con ese ID
      const metodoPago = await this.catMetodoPagoRepository.findOne({
        where: { id: id },
      });

      if (!metodoPago) {
        throw new NotFoundException(
          `No se encontró el método de pago con ID ${id} en el catálogo.`,
        );
      }

      // Eliminar de la base de datos
      await this.catMetodoPagoRepository.remove(metodoPago);

      // Registro en la bitácora - SUCCESS
      await this.bitacoraLogger.logToBitacora(
        'CatalogoMetodoPago',
        `El método de pago "${metodoPago.nombre}" (ID: ${id}) ha sido eliminado del catálogo.`,
        'DELETE',
        { id, nombre: metodoPago.nombre },
        idUser,
        EnumModulos.CATMETODOSPAGO,
        EstatusEnumBitcora.SUCCESS,
      );

      // API response
      const result: ApiCrudResponse = {
        status: 'success',
        message:
          'El método de pago ha sido eliminado del catálogo correctamente.',
        data: {
          id: id,
          nombre: metodoPago.nombre,
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora - ERROR
      await this.bitacoraLogger.logToBitacora(
        'CatalogoMetodoPago',
        `Error al eliminar el método de pago con ID ${id} del catálogo.`,
        'DELETE',
        { id },
        idUser,
        EnumModulos.CATMETODOSPAGO,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message:
          'Se ha producido un error durante la eliminación del método de pago.',
        error: error.message,
      });
    }
  }
}
