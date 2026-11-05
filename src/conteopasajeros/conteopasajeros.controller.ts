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
  Req,
  Patch,
} from '@nestjs/common';
import { ConteopasajerosService } from './conteopasajeros.service';
import { CreateConteoPasajerosDto } from './dto/create-conteopasajero.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { Roles } from 'src/guard/roles.decorator';
import { TenantOwnershipGuard } from 'src/common/tenant/tenant-ownership.guard';
import {
  TenantExempt,
  TenantResource,
} from 'src/common/tenant/tenant-resource.decorator';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UpdateConteoPasajerosDto } from './dto/update-conteopasajero.dto';
import { assertIsoDate } from 'src/common/sql-date';
import { Public } from 'src/guard/public.decorator';
import {
  DeviceOrJwtGuard,
  DispositivoCredencial,
} from 'src/posiciones/device-auth.guard';

@ApiTags('Conteo pasajeros')
@ApiBearerAuth('bearer-token')
@Roles(1, 2, 3, 11)
@Controller('conteopasajeros')
export class ConteopasajerosController {
  constructor(
    private readonly conteopasajerosService: ConteopasajerosService,
  ) {}

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post()
  async create(
    @Body() createConteopasajeroDto: CreateConteoPasajerosDto,
    @Req()
    req: any,
  ): Promise<ApiCrudResponse> {
    return this.conteopasajerosService.create(
      createConteopasajeroDto,
      req.user.userId,
      +req.user.cliente,
      +req.user.rol,
    );
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch()
  async update(
    @Body() updateConteoPasajerosDto: UpdateConteoPasajerosDto,
    @Req() req: any,
  ): Promise<ApiCrudResponse> {
    return this.conteopasajerosService.update(
      updateConteoPasajerosDto,
      req.user.userId,
      +req.user.cliente,
      +req.user.rol,
    );
  }

  // RUTAS ESPECÍFICAS PRIMERO (orden correcto)
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('list')
  async findAllList(@Request() req): Promise<ApiResponseCommon> {
    return await this.conteopasajerosService.findAllList(
      Number(req.user.cliente),
      Number(req.user.rol),
    );
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('hoy')
  async findToday(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    return await this.conteopasajerosService.findTodayPaginated(
      page,
      limit,
      Number(req.user.cliente),
      Number(req.user.rol),
    );
  }

  // 📅 5. OBTENER DATOS DE LA ÚLTIMA SEMANA
  // GET /conteo-pasajeros/ultima-semana
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('ultima-semana')
  async findLastWeek(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    return await this.conteopasajerosService.findLastWeekPaginated(
      page,
      limit,
      Number(req.user.cliente),
      Number(req.user.rol),
    );
  }

  // 🗓️ 1. OBTENER DATOS DE UN DÍA ESPECÍFICO
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('fecha/:fecha')
  async findByDate(
    @Param('fecha') fecha: string,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    return await this.conteopasajerosService.findByDatePaginated(
      fecha,
      page,
      limit,
      Number(req.user.cliente),
      Number(req.user.rol),
    );
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('rango/:fechaInicio/:fechaFin')
  async findByDateRange(
    @Param('fechaInicio') fechaInicio: string,
    @Param('fechaFin') fechaFin: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    const idUser = req.user.userId;
    return await this.conteopasajerosService.findByDateRangePaginated(
      +idUser,
      +cliente,
      +rol,
      fechaInicio,
      fechaFin,
      page,
      limit,
    );
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('rango-agrupado/:fechaInicio/:fechaFin')
  async findByDateRangeAgrupado(
    @Param('fechaInicio') fechaInicio: string,
    @Param('fechaFin') fechaFin: string,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    const idUser = req.user.userId;
    return await this.conteopasajerosService.findByDateRangeAgrupadoPorViaje(
      +idUser,
      +cliente,
      +rol,
      fechaInicio,
      fechaFin,
    );
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('fecha-hora/:fecha/:hora')
  async findByDateTime(
    @Param('fecha') fecha: string,
    @Param('hora') hora: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    return await this.conteopasajerosService.findByDateTimePaginated(
      fecha,
      hora,
      page,
      limit,
      Number(req.user.cliente),
      Number(req.user.rol),
    );
  }

  // Ingesta/consulta por dispositivo contador: acepta x-device-token O JWT de
  // operador (transición). @Public desactiva los guards globales para habilitar
  // la vía de dispositivo; DeviceOrJwtGuard aplica la autenticación real. La
  // serie ya quedó verificada por el guard, por lo que el acceso se limita a su
  // propia serie (el servicio filtra por numeroSerieContador).
  @UseGuards(DeviceOrJwtGuard, TenantOwnershipGuard)
  @Public()
  @DispositivoCredencial('contador')
  @Get('contador/:numeroSerie/hoy')
  @TenantExempt(
    'Serie validada en el servicio contra seriesContadoresPermitidas',
  )
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async findByContadorToday(
    @Param('numeroSerie') numeroSerie: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const today = new Date().toISOString().split('T')[0];
    const cliente = req.deviceAuth ? 0 : Number(req.user.cliente);
    const rol = req.deviceAuth ? 1 : Number(req.user.rol);
    return await this.conteopasajerosService.findByContadorAndDatePaginated(
      numeroSerie,
      today,
      today,
      page,
      limit,
      cliente,
      rol,
    );
  }

  @UseGuards(DeviceOrJwtGuard, TenantOwnershipGuard)
  @Public()
  @DispositivoCredencial('contador')
  @Get('contador/:numeroSerie/rango/:fechaInicio/:fechaFin')
  @TenantExempt(
    'Serie validada en el servicio contra seriesContadoresPermitidas',
  )
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async findByContadorAndDate(
    @Param('numeroSerie') numeroSerie: string,
    @Param('fechaInicio') fechaInicio: string,
    @Param('fechaFin') fechaFin: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.deviceAuth ? 0 : Number(req.user.cliente);
    const rol = req.deviceAuth ? 1 : Number(req.user.rol);
    return await this.conteopasajerosService.findByContadorAndDatePaginated(
      numeroSerie,
      assertIsoDate(fechaInicio, 'fechaInicio'),
      assertIsoDate(fechaFin, 'fechaFin'),
      page,
      limit,
      cliente,
      rol,
    );
  }

  // Resúmenes (sin paginación)
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('resumen-horas/:fecha')
  async getHourlySummary(
    @Param('fecha') fecha: string,
    @Request() req,
  ): Promise<any[]> {
    return await this.conteopasajerosService.getHourlySummary(
      fecha,
      Number(req.user.cliente),
      Number(req.user.rol),
    );
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('resumen-diario/:year/:month')
  async getDailySummary(
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @Request() req,
  ): Promise<any[]> {
    return await this.conteopasajerosService.getDailySummary(
      year,
      month,
      Number(req.user.cliente),
      Number(req.user.rol),
    );
  }

  // RUTAS DINÁMICAS AL FINAL
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get(':page/:limit')
  findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    const idUser = req.user.userId;
    return this.conteopasajerosService.findAll(
      +idUser,
      +cliente,
      +rol,
      page,
      limit,
    );
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get(':id')
  @TenantResource('conteoPasajero')
  findOne(@Param('id') id: string, @Request() req) {
    return this.conteopasajerosService.findOne(
      +id,
      Number(req.user?.cliente) || 0,
      Number(req.user?.rol) || 0,
    );
  }
}
