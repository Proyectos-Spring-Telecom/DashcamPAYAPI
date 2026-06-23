import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  Request,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { TarifasService } from './tarifas.service';
import { CreateTarifaDto } from './dto/create-tarifa.dto';
import { UpdateTarifaDto } from './dto/update-tarifa.dto';
import { UpdateTarifasEstatusDto } from './dto/update-tarifa-estatus.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('Tarifas')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('tarifas')
export class TarifasController {
  constructor(private readonly tarifasService: TarifasService) {}

  @Post()
  create(@Body() createTarifaDto: CreateTarifaDto, @Request() req) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.tarifasService.create(+idUser, +cliente, +rol, createTarifaDto);
  }

  @Get('list')
  findAllList(@Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.tarifasService.findAllList(+idUser, +cliente, +rol);
  }

  @Get('variante/:idVariante')
  @ApiOperation({
    summary: 'Obtener tarifa por ID de variante',
    description: 'Obtiene la tarifa activa asociada a una variante específica',
  })
  @ApiParam({
    name: 'idVariante',
    description: 'ID de la variante',
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Tarifa encontrada exitosamente',
    schema: {
      example: {
        data: [
          {
            id: 1,
            tarifaBase: 10.5,
            distanciaBaseKm: 5.0,
            incrementoCadaMetros: 100,
            costoAdicional: 1.5,
            tipoTarifa: 1,
            fechaCreacion: '2025-01-01T00:00:00.000Z',
            fechaActualizacion: '2025-01-01T00:00:00.000Z',
            estatus: 1,
            idVariante: 1,
            nombreVariante: 'Variante Centro',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Variante o tarifa no encontrada',
  })
  findByVariante(
    @Param('idVariante', ParseIntPipe) idVariante: number,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.tarifasService.findByVariante(idVariante, +idUser);
  }

  @Get(':page/:limit')
  findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.tarifasService.findAll(+idUser, +cliente, +rol, page, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.tarifasService.findOne(+id, +idUser, +cliente, +rol);
  }

  @Patch('estatus/:id')
  updateEstatus(
    @Param('id') id: string,
    @Body() updateTarifasEstatusDto: UpdateTarifasEstatusDto,
    @Request() req,
  ) {
    const _cliente = req.user.cliente;
    const idUser = req.user.userId;
    const _rol = req.user.rol;
    return this.tarifasService.updateEstatus(
      +id,
      +idUser,
      updateTarifasEstatusDto,
    );
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateTarifaDto: UpdateTarifaDto,
    @Request() req,
  ) {
    const _cliente = req.user.cliente;
    const idUser = req.user.userId;
    const _rol = req.user.rol;
    return this.tarifasService.update(+id, +idUser, updateTarifaDto);
  }

  @Delete('eliminado/total/:id')
  removeTotal(@Param('id') id: string, @Request() req) {
    const _cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.tarifasService.removeTotal(+id, +idUser, +rol);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const _cliente = req.user.cliente;
    const idUser = req.user.userId;
    const _rol = req.user.rol;
    return this.tarifasService.remove(+id, +idUser);
  }
}
