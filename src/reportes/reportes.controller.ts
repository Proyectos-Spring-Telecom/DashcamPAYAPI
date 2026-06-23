import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { RecaudacionDiariaRutaDto } from './dto/recaudacion-diaria-ruta.dto';
import { RecaudacionPorOperadorDto } from './dto/recaudacion-por-operador.dto';
import { RecaudacionPorVehiculoDto } from './dto/recaudacion-por-vehiculo.dto';
import { RecaudacionPorDispositivoDto } from './dto/recaudacion-por-dispositivo.dto';
import { TransaccionesDebitoDto } from './dto/transacciones-debito.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';

@ApiTags('Reportes')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Post('recaudacion-diaria-ruta')
  @ApiOperation({
    summary: 'Reporte de recaudación diaria por ruta',
    description:
      'Genera un reporte de recaudación diaria agrupado por ruta, incluyendo viajes, validaciones, ingresos, ticket promedio, % electrónico y evasión.',
  })
  @ApiBody({
    type: RecaudacionDiariaRutaDto,
    description: 'Filtros para el reporte',
  })
  @ApiResponse({
    status: 200,
    description: 'Reporte generado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación en los filtros',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async recaudacionDiariaPorRuta(
    @Body() filtros: RecaudacionDiariaRutaDto,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    return await this.reportesService.recaudacionDiariaPorRuta(
      filtros,
      Number(cliente),
    );
  }

  @Post('recaudacion-por-operador')
  @ApiOperation({
    summary: 'Reporte de recaudación por operador',
    description:
      'Genera un reporte de recaudación agrupado por operador, incluyendo turnos, viajes, validaciones, ingresos, ticket promedio, evasión % y último turno.',
  })
  @ApiBody({
    type: RecaudacionPorOperadorDto,
    description: 'Filtros para el reporte',
  })
  @ApiResponse({
    status: 200,
    description: 'Reporte generado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación en los filtros',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async recaudacionPorOperador(
    @Body() filtros: RecaudacionPorOperadorDto,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    return await this.reportesService.recaudacionPorOperador(
      filtros,
      Number(cliente),
    );
  }

  @Post('recaudacion-por-vehiculo')
  @ApiOperation({
    summary: 'Reporte de recaudación por vehículo',
    description:
      'Genera un reporte de recaudación agrupado por vehículo, incluyendo turnos, viajes, validaciones, ingresos, ticket promedio y horas en servicio.',
  })
  @ApiBody({
    type: RecaudacionPorVehiculoDto,
    description: 'Filtros para el reporte',
  })
  @ApiResponse({
    status: 200,
    description: 'Reporte generado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación en los filtros',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async recaudacionPorVehiculo(
    @Body() filtros: RecaudacionPorVehiculoDto,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    return await this.reportesService.recaudacionPorVehiculo(
      filtros,
      Number(cliente),
    );
  }

  @Post('recaudacion-por-dispositivo')
  @ApiOperation({
    summary: 'Reporte de recaudación por dispositivo/instalación',
    description:
      'Genera un reporte de recaudación agrupado por dispositivo e instalación, incluyendo validaciones, ingresos, última posición y estado.',
  })
  @ApiBody({
    type: RecaudacionPorDispositivoDto,
    description: 'Filtros para el reporte',
  })
  @ApiResponse({
    status: 200,
    description: 'Reporte generado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación en los filtros',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async recaudacionPorDispositivo(
    @Body() filtros: RecaudacionPorDispositivoDto,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    return await this.reportesService.recaudacionPorDispositivo(
      filtros,
      Number(cliente),
    );
  }

  @Post('transacciones-debito')
  @ApiOperation({
    summary: 'Reporte de transacciones débito detallado',
    description:
      'Genera un reporte detallado de transacciones débito con filtros por fecha, cliente, zona, ruta y variante. Incluye información del monedero, validador, ubicación, ruta, viaje y turno.',
  })
  @ApiBody({
    type: TransaccionesDebitoDto,
    description: 'Filtros para el reporte',
  })
  @ApiResponse({
    status: 200,
    description: 'Reporte generado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación en los filtros',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async transaccionesDebito(
    @Body() filtros: TransaccionesDebitoDto,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    const idUser = req.user.userId;
    return await this.reportesService.transaccionesDebito(
      filtros,
      Number(cliente),
      Number(rol),
      Number(idUser),
    );
  }
}
