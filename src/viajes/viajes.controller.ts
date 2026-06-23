import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  ParseIntPipe,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { ViajesService } from './viajes.service';
import { CreateViajeDto } from './dto/create-viaje.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { UpdateViajeDto } from './dto/update-viaje.dto';
import { ApiResponseCommon } from 'src/common/ApiResponse';

@ApiTags('Viajes')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('viajes')
export class ViajesController {
  constructor(private readonly viajesService: ViajesService) {}

  @Post()
  create(@Body() createViajeDto: CreateViajeDto, @Request() req) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const _rol = req.user.rol;
    const idOperador = req.user.idOperador;
    return this.viajesService.create(
      +idUser,
      +cliente,
      +idOperador,
      createViajeDto,
    );
  }

  @Patch(':id')
  async update(
    @Param('id') id: number,
    @Body() updateViajeDto: UpdateViajeDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const _rol = req.user.rol;
    const idOperador = req.user.idOperador;
    return this.viajesService.update(
      +idUser,
      +cliente,
      +idOperador,
      +id,
      updateViajeDto,
    );
  }

  @Get('list')
  findAllList(@Request() req) {
    const _idUser = req.user.userId;
    const cliente = req.user.cliente;
    const _rol = req.user.rol;
    return this.viajesService.findAllList(+cliente, +cliente);
  }

  @Get('viajes-ultima-semana/:numeroSerieValidador')
  @ApiOperation({
    summary:
      'Obtener viajes de la última semana por número de serie del validador',
    description:
      'Obtiene los viajes de la última semana asociados a un validador, incluyendo información del turno, variante, instalación y la última posición del validador.',
  })
  @ApiParam({
    name: 'numeroSerieValidador',
    type: String,
    description: 'Número de serie del validador',
    example: 'VAL-0001',
  })
  @ApiResponse({
    status: 200,
    description: 'Viajes obtenidos exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Validador no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async getViajesUltimaSemanaPorValidador(
    @Param('numeroSerieValidador') numeroSerieValidador: string,
  ): Promise<ApiResponseCommon> {
    return await this.viajesService.getViajesUltimaSemanaPorValidador(
      numeroSerieValidador,
    );
  }

  @Get(':page/:limit')
  findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ) {
    const _idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.viajesService.findAll(+cliente, +rol, page, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const _idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.viajesService.findOne(+id, +cliente, +rol);
  }
}
