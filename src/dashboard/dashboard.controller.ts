import { Controller, Get, Post, Body, UseGuards, Request, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { KpiDto } from './dto/kpi.dto';
import { MetricsFilterDto } from './dto/metrics-filter.dto';

@ApiTags('Dashboard')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) { }

  @Post('kpi')
  @ApiOperation({ summary: 'Obtener KPIs del dashboard' })
  @ApiResponse({ status: 201, description: 'KPIs obtenidos exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  findKpi(@Body() kpiDto: KpiDto, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.dashboardService.dashboardkpi(kpiDto, +rol, +cliente);
  }

  @Get('metrics')
  @ApiOperation({ 
    summary: 'Obtener métricas del dashboard',
    description: 'Obtiene las métricas del dashboard. Puede filtrar por período: 1 (hoy - default), 2 (últimos 7 días), 3 (mes actual), 4 (año actual)'
  })
  @ApiResponse({ status: 200, description: 'Métricas obtenidas exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  getMetrics(@Query() metricsFilterDto: MetricsFilterDto, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.dashboardService.getDashboardMetrics(
      +idUser,
      +cliente,
      +rol,
      Number(metricsFilterDto.filtro) || 1
    );
  }
}
