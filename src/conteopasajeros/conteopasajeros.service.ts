import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateConteoPasajerosDto } from './dto/create-conteopasajero.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ConteoPasajeros } from 'src/entities/ConteoPasajeros';
import { Between, MoreThanOrEqual, Repository } from 'typeorm';
import { ApiCrudResponse, ApiResponseCommon, EstatusEnumBitcora } from 'src/common/ApiResponse';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';

@Injectable()
export class ConteopasajerosService {
  constructor(
    @InjectRepository(ConteoPasajeros)
    private readonly conteopasajeroRepository: Repository<ConteoPasajeros>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  async create(
    idUser: number,
    createConteopasajeroDto: CreateConteoPasajerosDto,
  ): Promise<ApiCrudResponse> {
    try {
      const newConteoPasajero = await this.conteopasajeroRepository.create(
        createConteopasajeroDto,
      );
      const conteoPasajeroSave = await this.conteopasajeroRepository.save(newConteoPasajero);

      // Registro en la bitácora SUCCESS
      const querylogger = { createConteopasajeroDto };
      await this.bitacoraLogger.logToBitacora(
        'ConteoPasajeros',
        `Se creó un ConteoPasajeros con Numero de serie Contadores: ${createConteopasajeroDto.numeroSerieContador}`,
        'CREATE',
        querylogger,
        idUser,
        23,
        EstatusEnumBitcora.SUCCESS,
      );

      const result: ApiCrudResponse = {
        status: 'success',
        message: 'ConteoPasajero creado correctamente',
        data: {
          id: Number(conteoPasajeroSave.id),
          nombre: `${conteoPasajeroSave.id} ${conteoPasajeroSave.numeroSerieContador}` || '',
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { createConteopasajeroDto };
      await this.bitacoraLogger.logToBitacora(
        'ConteoPasajeros',
        `Se creó un ConteoPasajeros con Numero de serie Contadores: ${createConteopasajeroDto.numeroSerieContador}`,
        'CREATE',
        querylogger,
        idUser,
        23,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al crear ConteoPasajeros',
        error: error.message,
      });
    }
  }

  async findAll(page: number, limit: number): Promise<ApiResponseCommon> {
    try {
      const [data, total] = await this.conteopasajeroRepository.findAndCount({
        skip: (page - 1) * limit,
        take: limit,
        order: { fechaHora: 'DESC' },
      });

      const conteoPasajeros = data.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      const result: ApiResponseCommon = {
        data: conteoPasajeros,
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
        message: 'Error al obtener conteo pasajeros',
        error: error.message,
      });
    }
  }

  async findAllList(): Promise<ApiResponseCommon> {
    try {
      const conteopasajero = await this.conteopasajeroRepository.find({
        order: { fechaHora: 'DESC' },
      });
      if (conteopasajero.length === 0) {
        throw new NotFoundException('ConteoPasajeros no encontrado');
      }

      const data = conteopasajero.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      return { data: data };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener conteo pasajeros',
        error: error.message,
      });
    }
  }

  async findOne(id: number) {
    try {
      const conteopasajero = await this.conteopasajeroRepository.findOne({
        where: { id: id },
      });
      if (!conteopasajero) {
        throw new NotFoundException('ConteoPasajeros no encontrado');
      }

      conteopasajero.id = Number(conteopasajero.id);
      return { data: conteopasajero };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener conteo pasajeros',
        error: error.message,
      });
    }
  }

  // MÉTODOS CON PAGINACIÓN
  async findByDatePaginated(fecha: string, page: number, limit: number): Promise<ApiResponseCommon> {
    try {
      const startDate = new Date(`${fecha}T00:00:00`);
      const endDate = new Date(`${fecha}T23:59:59`);

      const [data, total] = await this.conteopasajeroRepository.findAndCount({
        where: { fechaHora: Between(startDate, endDate) },
        skip: (page - 1) * limit,
        take: limit,
        order: { fechaHora: 'DESC' },
      });

      const conteoPasajeros = data.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      return {
        data: conteoPasajeros,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new InternalServerErrorException({
        message: 'Error al obtener conteo pasajeros por fecha',
        error: error.message,
      });
    }
  }

  // 🕐 2. OBTENER DATOS DE UN RANGO DE FECHAS
  async findByDateRangePaginated(
    fechaInicio: string,
    fechaFin: string,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      const startDate = new Date(`${fechaInicio}T00:00:00`);
      const endDate = new Date(`${fechaFin}T23:59:59`);

      const [data, total] = await this.conteopasajeroRepository.findAndCount({
        where: { fechaHora: Between(startDate, endDate) },
        skip: (page - 1) * limit,
        take: limit,
        order: { fechaHora: 'DESC' },
      });

      const conteoPasajeros = data.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      return {
        data: conteoPasajeros,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new InternalServerErrorException({
        message: 'Error al obtener conteo pasajeros por rango de fechas',
      });
    }
  }


  // ⏰ 3. OBTENER DATOS DE UNA HORA ESPECÍFICA
  async findByDateTimePaginated(
    fecha: string,
    hora: string,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      const dateTime = new Date(`${fecha}T${hora}:00`);
      const endDateTime = new Date(`${fecha}T${hora}:59`);

      const [data, total] = await this.conteopasajeroRepository.findAndCount({
        where: { fechaHora: Between(dateTime, endDateTime) },
        skip: (page - 1) * limit,
        take: limit,
        order: { fechaHora: 'DESC' },
      });

      const conteoPasajeros = data.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      return {
        data: conteoPasajeros,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new InternalServerErrorException({
        message: 'Error al obtener conteo pasajeros por fecha y hora',
        error: error.message,
      });
    }
  }

  // 📊 4. OBTENER DATOS DE HOY
  async findTodayPaginated(page: number, limit: number): Promise<ApiResponseCommon> {
    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const endOfDay = new Date(today.setHours(23, 59, 59, 999));

      const [data, total] = await this.conteopasajeroRepository.findAndCount({
        where: { fechaHora: Between(startOfDay, endOfDay) },
        skip: (page - 1) * limit,
        take: limit,
        order: { fechaHora: 'DESC' },
      });

      const conteoPasajeros = data.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      return {
        data: conteoPasajeros,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new InternalServerErrorException({
        message: 'Error al obtener conteo pasajeros de hoy',
        error: error.message,
      });
    }
  }

  // 📅 5. OBTENER DATOS DE LA ÚLTIMA SEMANA
  async findLastWeekPaginated(page: number, limit: number): Promise<ApiResponseCommon> {
  try {
    const today = new Date();
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [data, total] = await this.conteopasajeroRepository.findAndCount({
      where: {
        fechaHora: MoreThanOrEqual(lastWeek)
      },
      skip: (page - 1) * limit,
      take: limit,
      order: { fechaHora: 'DESC' }
    });

    const conteoPasajeros = data.map((item) => ({
      ...item,
      id: Number(item.id),
    }));

    return {
      data: conteoPasajeros,
      paginated: {
        total: total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    throw new InternalServerErrorException({
      message: 'Error al obtener conteo pasajeros de la última semana',
      error: error.message,
    });
  }
}

  // 🔍 6. BUSCAR CON FILTROS ESPECÍFICOS + FECHA
  async findByContadoresAndDatePaginated(
    numeroSerie: string,
    fechaInicio: string,
    fechaFin: string,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      const startDate = new Date(`${fechaInicio}T00:00:00`);
      const endDate = new Date(`${fechaFin}T23:59:59`);

      const [data, total] = await this.conteopasajeroRepository.findAndCount({
        where: {
          numeroSerieContador: numeroSerie,
          fechaHora: Between(startDate, endDate),
        },
        relations: ['numeroSerieContadores2'],
        skip: (page - 1) * limit,
        take: limit,
        order: { fechaHora: 'DESC' },
      });

      const conteoPasajeros = data.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      return {
        data: conteoPasajeros,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new InternalServerErrorException({
        message: 'Error al obtener conteo pasajeros por Contadores y fecha',
        error: error.message,
      });
    }
  }

  // 📈 7. OBTENER RESUMEN POR HORAS DE UN DÍA
  async getHourlySummary(fecha: string): Promise<any[]> {
    const startDate = `${fecha} 00:00:00`;
    const endDate = `${fecha} 23:59:59`;

    return await this.conteopasajeroRepository
      .createQueryBuilder('cp')
      .select([
        'HOUR(cp.fechaHora) as hora',
        'SUM(cp.entradas) as totalEntradas',
        'SUM(cp.salidas) as totalSalidas',
        'SUM(cp.diferencia) as totalDiferencia',
        'COUNT(*) as registros',
      ])
      .where('cp.fechaHora BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('HOUR(cp.fechaHora)')
      .orderBy('hora', 'ASC')
      .getRawMany();
  }

  // 📊 8. OBTENER RESUMEN DIARIO DE UN MES
  async getDailySummary(year: number, month: number): Promise<any[]> {
    return await this.conteopasajeroRepository
      .createQueryBuilder('cp')
      .select([
        'DATE(cp.fechaHora) as fecha',
        'SUM(cp.entradas) as totalEntradas',
        'SUM(cp.salidas) as totalSalidas',
        'SUM(cp.diferencia) as totalDiferencia',
        'COUNT(*) as registros',
      ])
      .where('YEAR(cp.fechaHora) = :year AND MONTH(cp.fechaHora) = :month', {
        year,
        month,
      })
      .groupBy('DATE(cp.fechaHora)')
      .orderBy('fecha', 'ASC')
      .getRawMany();
  }
}