import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import { InstalacionesService } from './instalaciones.service';
import { CreateInstalacionesDto } from './dto/create-instalacione.dto';
import { UpdateInstalacioneDto } from './dto/update-instalacione.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';
import { UpdateInstalacioneEstatusDto } from './dto/update-instalacione-estatus.dto';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

@ApiTags('Instalaciones')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('instalaciones')
export class InstalacionesController {
  constructor(private readonly instalacionesService: InstalacionesService) {}

  @Post()
  async create(
    @Body() createInstalacioneDto: CreateInstalacionesDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return await this.instalacionesService.create(
      +idUser,
      +cliente,
      +rol,
      createInstalacioneDto,
    );
  }

  @Get('list')
  async findAllList(@Request() req): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.instalacionesService.findAllList(+idUser, +cliente, +rol);
  }

  @Get('by-idValidador/:idValidador')
  @ApiOperation({
    summary: 'Obtener instalaciones por ID de validador',
    description: 'Obtiene todas las instalaciones activas asociadas al validador especificado.',
  })
  @ApiParam({
    name: 'idValidador',
    type: Number,
    description: 'ID del validador del cual se desean obtener las instalaciones',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Instalaciones obtenidas exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  async findByValidador(
    @Param('idValidador', ParseIntPipe) idValidador: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.instalacionesService.findByValidador(+idValidador, +idUser, +cliente, +rol);
  }

  @Get(':page/:limit')
  async findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.instalacionesService.findAll(+idUser, +cliente, +rol, page, limit);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.instalacionesService.findOne(+id,+idUser,+cliente, +rol);
  }

  @Patch('estatus/:id')
  updateEstatus(
    @Param('id') id: string,
    @Body() updateInstalacioneEstatusDto: UpdateInstalacioneEstatusDto,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.instalacionesService.updateEstatus(
      +id,
      +idUser,
      +cliente,
      +rol,
      updateInstalacioneEstatusDto,
    );
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateInstalacioneDto: UpdateInstalacioneDto,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.instalacionesService.update(
      +id,
      +idUser,
      +cliente,
      +rol,
      updateInstalacioneDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.instalacionesService.remove(+id, +cliente, +idUser, +rol);
  }
}
