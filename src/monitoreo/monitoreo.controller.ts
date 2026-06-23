import {
  Controller,
  Get,
  Param,
  UseGuards,
  Request,
  ParseIntPipe,
  Post,
  Body,
} from '@nestjs/common';
import { MonitoreoService } from './monitoreo.service';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RecorridoMonitoreoDto } from './dto/recorrido-monitoreo.dto';

@ApiTags('Monitoreo')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('monitoreo')
export class MonitoreoController {
  constructor(private readonly monitoreoService: MonitoreoService) {}

  @Get('list/:cliente')
  findListPosiciones(
    @Param('cliente', ParseIntPipe) cliente: number,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.monitoreoService.monitoreoListado(+idUser, +cliente, +rol);
  }

  @Post('recorrido')
  @ApiOperation({ summary: 'Obtener el recorrido del día de un dispositivo' })
  @ApiResponse({
    status: 201,
    description: 'Json de las posiciones del dispositivo',
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  findKpi(
    @Body() recorridoMonitoreoDto: RecorridoMonitoreoDto,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const _idUser = req.user.userId;
    const rol = req.user.rol;
    return this.monitoreoService.monitoreoRecorrido(
      recorridoMonitoreoDto,
      +cliente,
      +rol,
    );
  }

  @Get()
  @ApiOperation({
    summary:
      'Obtener unidades de monitoreo filtradas por cliente del token y sus clientes hijos',
  })
  @ApiResponse({ status: 200, description: 'Lista de unidades de monitoreo' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  obtenerUnidades(@Request() req) {
    const cliente = req.user.cliente;
    return this.monitoreoService.obtenerUnidades(+cliente);
  }
}
