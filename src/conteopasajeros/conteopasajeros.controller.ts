import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  Request,
  Query,
} from '@nestjs/common';
import { ConteopasajerosService } from './conteopasajeros.service';
import { CreateConteoPasajerosDto } from './dto/create-conteopasajero.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';

@UseGuards(JwtAuthGuard)
@Controller('conteopasajeros')
export class ConteopasajerosController {
  constructor(
    private readonly conteopasajerosService: ConteopasajerosService,
  ) {}

  @Post()
  async create(
    @Body() createConteopasajeroDto: CreateConteoPasajerosDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return this.conteopasajerosService.create(idUser, createConteopasajeroDto);
  }

  // RUTAS ESPECÍFICAS PRIMERO (orden correcto)
  @Get('list')
  async findAllList(): Promise<ApiResponseCommon> {
    return await this.conteopasajerosService.findAllList();
  }

  @Get('hoy')
  async findToday(
    @Query('page') page: number,
    @Query('limit') limit: number,
  ): Promise<ApiResponseCommon> {
    return await this.conteopasajerosService.findTodayPaginated(page, limit);
  }

  // 📅 5. OBTENER DATOS DE LA ÚLTIMA SEMANA
  // GET /conteo-pasajeros/ultima-semana
  @Get('ultima-semana')
async findLastWeek(
  @Query('page') page: number,
  @Query('limit') limit: number,
): Promise<ApiResponseCommon> {
  return await this.conteopasajerosService.findLastWeekPaginated(page, limit);
}

  // 🗓️ 1. OBTENER DATOS DE UN DÍA ESPECÍFICO
  @Get('fecha/:fecha')
  async findByDate(
    @Param('fecha') fecha: string,
    @Query('page') page: number,
    @Query('limit') limit: number,
  ): Promise<ApiResponseCommon> {
    return await this.conteopasajerosService.findByDatePaginated(
      fecha,
      page,
      limit,
    );
  }

  @Get('rango/:fechaInicio/:fechaFin')
  async findByDateRange(
    @Param('fechaInicio') fechaInicio: string,
    @Param('fechaFin') fechaFin: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ): Promise<ApiResponseCommon> {
    return await this.conteopasajerosService.findByDateRangePaginated(
      fechaInicio,
      fechaFin,
      page,
      limit,
    );
  }

  @Get('fecha-hora/:fecha/:hora')
  async findByDateTime(
    @Param('fecha') fecha: string,
    @Param('hora') hora: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ): Promise<ApiResponseCommon> {
    return await this.conteopasajerosService.findByDateTimePaginated(
      fecha,
      hora,
      page,
      limit,
    );
  }

  @Get('contadores/:numeroSerie/hoy')
  async findByContadoresToday(
    @Param('numeroSerie') numeroSerie: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ): Promise<ApiResponseCommon> {
    const today = new Date().toISOString().split('T')[0];
    return await this.conteopasajerosService.findByContadoresAndDatePaginated(
      numeroSerie,
      today,
      today,
      page,
      limit,
    );
  }

  @Get('contadores/:numeroSerie/rango/:fechaInicio/:fechaFin')
  async findByContadoresAndDate(
    @Param('numeroSerie') numeroSerie: string,
    @Param('fechaInicio') fechaInicio: string,
    @Param('fechaFin') fechaFin: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ): Promise<ApiResponseCommon> {
    return await this.conteopasajerosService.findByContadoresAndDatePaginated(
      numeroSerie,
      fechaInicio,
      fechaFin,
      page,
      limit,
    );
  }

  // Resúmenes (sin paginación)
  @Get('resumen-horas/:fecha')
  async getHourlySummary(@Param('fecha') fecha: string): Promise<any[]> {
    return await this.conteopasajerosService.getHourlySummary(fecha);
  }

  @Get('resumen-diario/:year/:month')
  async getDailySummary(
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
  ): Promise<any[]> {
    return await this.conteopasajerosService.getDailySummary(year, month);
  }

  // RUTAS DINÁMICAS AL FINAL
  @Get(':page/:limit')
  findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
  ): Promise<ApiResponseCommon> {
    return this.conteopasajerosService.findAll(page, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.conteopasajerosService.findOne(+id);
  }
}
