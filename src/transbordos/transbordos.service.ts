import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CreateTransbordoDto } from './dto/create-transbordo.dto';
import { UpdateTransbordoDto } from './dto/update-transbordo.dto';
import { TransbordosPermitidos } from 'src/entities/TransbordosPermitidos';
import { DetalleTransbordos } from 'src/entities/DetalleTransbordos';
import { Clientes } from 'src/entities/Clientes';
import { CatTipoDescuentoTransbordo } from 'src/entities/CatTipoDescuentoTransbordo';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';

@Injectable()
export class TransbordosService {
  constructor(
    @InjectRepository(TransbordosPermitidos)
    private readonly transbordosRepository: Repository<TransbordosPermitidos>,
    @InjectRepository(DetalleTransbordos)
    private readonly detalleTransbordosRepository: Repository<DetalleTransbordos>,
    @InjectRepository(Clientes)
    private readonly clientesRepository: Repository<Clientes>,
    @InjectRepository(CatTipoDescuentoTransbordo)
    private readonly tipoDescuentoRepository: Repository<CatTipoDescuentoTransbordo>,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Crear un transbordo con sus detalles
   * Valida que el número de detalles no exceda el número de transbordos permitidos
   */
  async create(
    idUser: number,
    createTransbordoDto: CreateTransbordoDto,
  ): Promise<ApiCrudResponse> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validar que el cliente existe
      const cliente = await this.clientesRepository.findOne({
        where: { id: createTransbordoDto.idCliente },
      });

      if (!cliente) {
        throw new NotFoundException(
          `Cliente con ID ${createTransbordoDto.idCliente} no encontrado`,
        );
      }

      // Validar que el número de detalles no exceda el número de transbordos permitidos
      if (
        createTransbordoDto.detalles.length >
        createTransbordoDto.numeroTransbordos
      ) {
        throw new BadRequestException(
          `El número de detalles (${createTransbordoDto.detalles.length}) no puede exceder el número de transbordos permitidos (${createTransbordoDto.numeroTransbordos})`,
        );
      }

      // Validar que no haya números de transbordo duplicados
      const nrosTransbordos = createTransbordoDto.detalles.map(
        (d) => d.nroTransbordo,
      );
      const duplicados = nrosTransbordos.filter(
        (item, index) => nrosTransbordos.indexOf(item) !== index,
      );
      if (duplicados.length > 0) {
        throw new BadRequestException(
          `Números de transbordo duplicados: ${duplicados.join(', ')}`,
        );
      }

      // Validar que los números de transbordo estén dentro del rango permitido
      const maxNroTransbordo = Math.max(...nrosTransbordos);
      if (maxNroTransbordo > createTransbordoDto.numeroTransbordos) {
        throw new BadRequestException(
          `El número de transbordo ${maxNroTransbordo} excede el número máximo permitido (${createTransbordoDto.numeroTransbordos})`,
        );
      }

      // Crear el transbordo
      const nuevoTransbordo = this.transbordosRepository.create({
        nombre: createTransbordoDto.nombre.toUpperCase(),
        tiempo: createTransbordoDto.tiempo,
        numeroTransbordos: createTransbordoDto.numeroTransbordos,
        idCliente: createTransbordoDto.idCliente,
        idTipoDescuento: createTransbordoDto.idTipoDescuento || null,
        estatus: 1, // Por defecto activo
      });

      const transbordoGuardado =
        await queryRunner.manager.save(nuevoTransbordo);

      // Crear los detalles
      const detalles = createTransbordoDto.detalles.map((detalle) =>
        this.detalleTransbordosRepository.create({
          idTransbordo: transbordoGuardado.id,
          costo: detalle.costo,
          nroTransbordo: detalle.nroTransbordo,
        }),
      );

      await queryRunner.manager.save(detalles);

      await queryRunner.commitTransaction();

      // Registro en la bitácora SUCCESS
      const querylogger = { createTransbordoDto };
      await this.bitacoraLogger.logToBitacora(
        'TransbordosPermitidos',
        `Se creó un Transbordo con nombre: ${transbordoGuardado.nombre} e ID ${transbordoGuardado.id}`,
        'CREATE',
        querylogger,
        idUser,
        19, // ID del módulo de transbordos
        EstatusEnumBitcora.SUCCESS,
      );

      // API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Transbordo creado correctamente',
        data: {
          id: Number(transbordoGuardado.id),
          nombre: transbordoGuardado.nombre || '',
        },
      };
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // Registro en la bitácora ERROR
      const querylogger = { createTransbordoDto };
      await this.bitacoraLogger.logToBitacora(
        'TransbordosPermitidos',
        `Error al crear Transbordo: ${createTransbordoDto.nombre}`,
        'CREATE',
        querylogger,
        idUser,
        19,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        message: 'Error al crear Transbordo',
        error: error.message,
      });
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Obtener todos los transbordos con paginación
   */
  async findAll(
    cliente: number,
    idUser: number,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      // Obtener clientes hijos
      const { ids, placeholders } = await this.clienteHijos(cliente);

      if (!ids || ids.length === 0) {
        return {
          data: [],
          paginated: {
            total: 0,
            page,
            lastPage: 0,
          },
        };
      }

      const offset = (page - 1) * limit;

      // Consulta para obtener transbordos con sus detalles
      const query = `
        SELECT 
          tp.Id,
          tp.IdCliente,
          tp.IdTipoDescuento,
          tp.Nombre,
          tp.Tiempo,
          tp.NumeroTransbordos,
          tp.Estatus,
          c.Nombre as NombreCliente,
          tdt.Nombre as NombreTipoDescuento,
          COUNT(dt.Id) as CantidadDetalles,
          GROUP_CONCAT(
            CONCAT('{"nroTransbordo":', dt.NroTransbordo, ',"costo":', dt.Costo, '}')
            ORDER BY dt.NroTransbordo
            SEPARATOR ','
          ) as Detalles
        FROM TransbordosPermitidos tp
        INNER JOIN Clientes c ON tp.IdCliente = c.Id
        LEFT JOIN CatTipoDescuentoTransbordo tdt ON tp.IdTipoDescuento = tdt.Id
        LEFT JOIN DetalleTransbordos dt ON tp.Id = dt.IdTransbordo
        WHERE tp.IdCliente IN (${placeholders})
        GROUP BY tp.Id, tp.IdCliente, tp.IdTipoDescuento, tp.Nombre, tp.Tiempo, tp.NumeroTransbordos, tp.Estatus, c.Nombre, tdt.Nombre
        ORDER BY tp.Id DESC
        LIMIT ? OFFSET ?
      `;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM TransbordosPermitidos tp
        WHERE tp.IdCliente IN (${placeholders})
      `;

      const data = await this.transbordosRepository.query(query, [
        ...ids,
        limit,
        offset,
      ]);
      const countResult = await this.transbordosRepository.query(
        countQuery,
        ids,
      );
      const total = countResult[0]?.total || 0;

      // Formatear los datos
      const formattedData = data.map((item: any) => ({
        id: Number(item.Id),
        idCliente: Number(item.IdCliente),
        idTipoDescuento: item.IdTipoDescuento
          ? Number(item.IdTipoDescuento)
          : null,
        nombreTipoDescuento: item.NombreTipoDescuento || null,
        nombreCliente: item.NombreCliente,
        nombre: item.Nombre,
        tiempo: item.Tiempo ? Number(item.Tiempo) : null,
        numeroTransbordos: Number(item.NumeroTransbordos),
        estatus: Number(item.Estatus),
        cantidadDetalles: Number(item.CantidadDetalles),
        detalles: item.Detalles ? JSON.parse(`[${item.Detalles}]`) : [],
      }));

      // Registro en la bitácora SUCCESS
      await this.bitacoraLogger.logToBitacora(
        'TransbordosPermitidos',
        `Se consultó el listado de Transbordos (página ${page}, límite ${limit})`,
        'READ',
        { page, limit },
        idUser,
        19,
        EstatusEnumBitcora.SUCCESS,
      );

      const lastPage = Math.ceil(Number(total) / limit);

      const result: ApiResponseCommon = {
        data: formattedData,
        paginated: {
          total: Number(total),
          page,
          lastPage,
        },
      };

      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      await this.bitacoraLogger.logToBitacora(
        'TransbordosPermitidos',
        'Error al consultar listado de Transbordos',
        'READ',
        { page, limit },
        idUser,
        19,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        message: 'Error al obtener listado de Transbordos',
        error: error.message,
      });
    }
  }

  /**
   * Obtener un transbordo por ID con sus detalles
   */
  async findOne(id: number, idUser: number): Promise<ApiResponseCommon> {
    try {
      const transbordo = await this.transbordosRepository.findOne({
        where: { id },
        relations: [
          'detalleTransbordos',
          'idClienteTransbordo',
          'tipoDescuento',
        ],
      });

      if (!transbordo) {
        throw new NotFoundException(`Transbordo con ID ${id} no encontrado`);
      }

      // Verificar que el transbordo esté activo
      if (transbordo.estatus === 0) {
        throw new NotFoundException(
          `Transbordo con ID ${id} no encontrado o está inactivo`,
        );
      }

      // Registro en la bitácora SUCCESS
      await this.bitacoraLogger.logToBitacora(
        'TransbordosPermitidos',
        `Se consultó el Transbordo con ID ${id}`,
        'READ',
        { id },
        idUser,
        19,
        EstatusEnumBitcora.SUCCESS,
      );

      const result: ApiResponseCommon = {
        data: [
          {
            id: Number(transbordo.id),
            nombre: transbordo.nombre,
            tiempo: transbordo.tiempo,
            numeroTransbordos: transbordo.numeroTransbordos,
            estatus: transbordo.estatus,
            idCliente: transbordo.idCliente,
            idTipoDescuento: transbordo.idTipoDescuento,
            nombreTipoDescuento: transbordo.tipoDescuento?.nombre || null,
            nombreCliente: transbordo.idClienteTransbordo?.nombre,
            detalles: transbordo.detalleTransbordos.map((detalle) => ({
              id: Number(detalle.id),
              costo: Number(detalle.costo),
              nroTransbordo: detalle.nroTransbordo,
            })),
          },
        ],
      };

      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      await this.bitacoraLogger.logToBitacora(
        'TransbordosPermitidos',
        `Error al consultar Transbordo con ID ${id}`,
        'READ',
        { id },
        idUser,
        19,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        message: `Error al obtener Transbordo con ID ${id}`,
        error: error.message,
      });
    }
  }

  /**
   * Actualizar un transbordo con sus detalles
   * Valida que el número de detalles no exceda el número de transbordos permitidos
   */
  async update(
    id: number,
    idUser: number,
    updateTransbordoDto: UpdateTransbordoDto,
  ): Promise<ApiCrudResponse> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que el transbordo existe
      const transbordoExistente = await this.transbordosRepository.findOne({
        where: { id },
        relations: ['detalleTransbordos'],
      });

      if (!transbordoExistente) {
        throw new NotFoundException(`Transbordo con ID ${id} no encontrado`);
      }

      // Si se está actualizando el cliente, validar que existe
      if (updateTransbordoDto.idCliente) {
        const cliente = await this.clientesRepository.findOne({
          where: { id: updateTransbordoDto.idCliente },
        });

        if (!cliente) {
          throw new NotFoundException(
            `Cliente con ID ${updateTransbordoDto.idCliente} no encontrado`,
          );
        }
      }

      // Determinar el número de transbordos a usar para validación
      const numeroTransbordos =
        updateTransbordoDto.numeroTransbordos !== undefined
          ? updateTransbordoDto.numeroTransbordos
          : transbordoExistente.numeroTransbordos;

      // Validar detalles si se proporcionan
      if (updateTransbordoDto.detalles) {
        if (
          numeroTransbordos !== null &&
          updateTransbordoDto.detalles.length > numeroTransbordos
        ) {
          throw new BadRequestException(
            `El número de detalles (${updateTransbordoDto.detalles.length}) no puede exceder el número de transbordos permitidos (${numeroTransbordos})`,
          );
        }

        // Validar números de transbordo duplicados
        const nrosTransbordos = updateTransbordoDto.detalles.map(
          (d) => d.nroTransbordo,
        );
        const duplicados = nrosTransbordos.filter(
          (item, index) => nrosTransbordos.indexOf(item) !== index,
        );
        if (duplicados.length > 0) {
          throw new BadRequestException(
            `Números de transbordo duplicados: ${duplicados.join(', ')}`,
          );
        }

        // Validar rango de números de transbordo
        const maxNroTransbordo = Math.max(...nrosTransbordos);
        if (
          numeroTransbordos !== null &&
          maxNroTransbordo > numeroTransbordos
        ) {
          throw new BadRequestException(
            `El número de transbordo ${maxNroTransbordo} excede el número máximo permitido (${numeroTransbordos})`,
          );
        }

        // Eliminar detalles existentes
        await queryRunner.manager.delete(DetalleTransbordos, {
          idTransbordo: id,
        });

        // Crear nuevos detalles
        const nuevosDetalles = updateTransbordoDto.detalles.map((detalle) =>
          this.detalleTransbordosRepository.create({
            idTransbordo: id,
            costo: detalle.costo,
            nroTransbordo: detalle.nroTransbordo,
          }),
        );

        await queryRunner.manager.save(nuevosDetalles);
      }

      // Actualizar el transbordo
      const datosActualizacion: any = {};
      if (updateTransbordoDto.nombre !== undefined) {
        datosActualizacion.nombre = updateTransbordoDto.nombre.toUpperCase();
      }
      if (updateTransbordoDto.tiempo !== undefined) {
        datosActualizacion.tiempo = updateTransbordoDto.tiempo;
      }
      if (updateTransbordoDto.numeroTransbordos !== undefined) {
        datosActualizacion.numeroTransbordos =
          updateTransbordoDto.numeroTransbordos;
      }
      if (updateTransbordoDto.idCliente !== undefined) {
        datosActualizacion.idCliente = updateTransbordoDto.idCliente;
      }
      if (updateTransbordoDto.idTipoDescuento !== undefined) {
        datosActualizacion.idTipoDescuento =
          updateTransbordoDto.idTipoDescuento || null;
      }

      if (Object.keys(datosActualizacion).length > 0) {
        await queryRunner.manager.update(
          TransbordosPermitidos,
          { id },
          datosActualizacion,
        );
      }

      await queryRunner.commitTransaction();

      // Obtener el transbordo actualizado
      const transbordoActualizado = await this.transbordosRepository.findOne({
        where: { id },
        relations: ['detalleTransbordos'],
      });

      if (!transbordoActualizado) {
        throw new NotFoundException(
          `Transbordo con ID ${id} no encontrado después de actualizar`,
        );
      }

      // Registro en la bitácora SUCCESS
      const querylogger = { updateTransbordoDto };
      await this.bitacoraLogger.logToBitacora(
        'TransbordosPermitidos',
        `Se actualizó el Transbordo con nombre: ${transbordoActualizado.nombre || ''} e ID ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        19,
        EstatusEnumBitcora.SUCCESS,
      );

      // API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Transbordo actualizado correctamente',
        data: {
          id: Number(transbordoActualizado.id),
          nombre: transbordoActualizado.nombre || '',
        },
      };
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // Registro en la bitácora ERROR
      const querylogger = { updateTransbordoDto };
      await this.bitacoraLogger.logToBitacora(
        'TransbordosPermitidos',
        `Error al actualizar Transbordo con ID ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        19,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        message: `Error al actualizar Transbordo con ID ${id}`,
        error: error.message,
      });
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Eliminar un transbordo (eliminación lógica - estatus = 0)
   */
  async remove(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const transbordo = await this.transbordosRepository.findOne({
        where: { id },
      });

      if (!transbordo) {
        throw new NotFoundException(`Transbordo con ID ${id} no encontrado`);
      }

      if (transbordo.estatus === 0) {
        throw new BadRequestException(
          `El Transbordo con ID ${id} ya está inactivo`,
        );
      }

      const nombreTransbordo = transbordo.nombre || '';

      // Eliminación lógica: cambiar estatus a 0
      await this.transbordosRepository.update(id, { estatus: 0 });

      // Registro en la bitácora SUCCESS
      await this.bitacoraLogger.logToBitacora(
        'TransbordosPermitidos',
        `Se dio de baja el Transbordo con nombre: ${nombreTransbordo} e ID ${id}`,
        'UPDATE',
        { id, estatus: 0 },
        idUser,
        19,
        EstatusEnumBitcora.SUCCESS,
      );

      // API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Transbordo dado de baja correctamente',
        data: {
          id: Number(id),
          nombre: nombreTransbordo,
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      await this.bitacoraLogger.logToBitacora(
        'TransbordosPermitidos',
        `Error al dar de baja Transbordo con ID ${id}`,
        'UPDATE',
        { id },
        idUser,
        19,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        message: `Error al dar de baja Transbordo con ID ${id}`,
        error: error.message,
      });
    }
  }

  /**
   * Activar un transbordo (estatus = 1)
   */
  async activar(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const transbordo = await this.transbordosRepository.findOne({
        where: { id },
      });

      if (!transbordo) {
        throw new NotFoundException(`Transbordo con ID ${id} no encontrado`);
      }

      if (transbordo.estatus === 1) {
        throw new BadRequestException(
          `El Transbordo con ID ${id} ya está activo`,
        );
      }

      const nombreTransbordo = transbordo.nombre || '';

      // Activar: cambiar estatus a 1
      await this.transbordosRepository.update(id, { estatus: 1 });

      // Registro en la bitácora SUCCESS
      await this.bitacoraLogger.logToBitacora(
        'TransbordosPermitidos',
        `Se activó el Transbordo con nombre: ${nombreTransbordo} e ID ${id}`,
        'UPDATE',
        { id, estatus: 1 },
        idUser,
        19,
        EstatusEnumBitcora.SUCCESS,
      );

      // API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Transbordo activado correctamente',
        data: {
          id: Number(id),
          nombre: nombreTransbordo,
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      await this.bitacoraLogger.logToBitacora(
        'TransbordosPermitidos',
        `Error al activar Transbordo con ID ${id}`,
        'UPDATE',
        { id },
        idUser,
        19,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        message: `Error al activar Transbordo con ID ${id}`,
        error: error.message,
      });
    }
  }

  /**
   * Obtener todos los tipos de descuento disponibles
   */
  async getTiposDescuento(idUser: number): Promise<ApiResponseCommon> {
    try {
      const tiposDescuento = await this.tipoDescuentoRepository.find({
        order: { nombre: 'ASC' },
      });

      // Registro en la bitácora SUCCESS
      await this.bitacoraLogger.logToBitacora(
        'TransbordosPermitidos',
        'Se consultó el listado de tipos de descuento',
        'READ',
        {},
        idUser,
        19,
        EstatusEnumBitcora.SUCCESS,
      );

      const result: ApiResponseCommon = {
        data: tiposDescuento.map((tipo) => ({
          id: Number(tipo.id),
          nombre: tipo.nombre,
        })),
      };

      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      await this.bitacoraLogger.logToBitacora(
        'TransbordosPermitidos',
        'Error al consultar listado de tipos de descuento',
        'READ',
        {},
        idUser,
        19,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        message: 'Error al obtener listado de tipos de descuento',
        error: error.message,
      });
    }
  }

  /**
   * Función privada para obtener los clientes hijos
   */
  private async clienteHijos(cliente: number) {
    const clientesFiltrado = await this.clientesRepository.query(
      `CALL spGetClientes(?);`,
      [cliente],
    );

    const idsFiltrados = clientesFiltrado[0];
    const ids = idsFiltrados
      .map((clientesFiltrado: any) => Number(clientesFiltrado.Id))
      .filter(Boolean);

    if (ids.length === 0) {
      return { ids: [], placeholders: '' };
    }

    const placeholders = ids.map(() => '?').join(', ');
    return { ids, placeholders };
  }
}
