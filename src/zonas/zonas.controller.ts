import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ZonasService } from './zonas.service';
import { CreateZonasDto } from './dto/create-zona.dto';
import { UpdateZonaDto } from './dto/update-zona.dto';
import { UpdateZonasEstatusDto } from './dto/update-zona-estatus.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Zonas')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('zonas')
export class ZonasController {
  constructor(private readonly zonasService: ZonasService) {}

  @Post()
  create(@Body() createZonasDto: CreateZonasDto, @Request() req) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.zonasService.create(+idUser, +cliente, +rol, createZonasDto);
  }

  @Get('list')
  async findAllList(@Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.zonasService.findAllList(+cliente, +idUser, +rol);
  }

  @Get('by-idCliente/:idCliente')
  @ApiOperation({
    summary: 'Listar zonas por ID de cliente',
    description:
      'Obtiene todas las zonas activas filtradas por el ID de cliente especificado en la ruta.',
  })
  @ApiParam({
    name: 'idCliente',
    type: Number,
    description: 'ID del cliente del cual se desean obtener las zonas',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Zonas obtenidas exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  async findByIdCliente(
    @Param('idCliente', ParseIntPipe) idCliente: number,
    @Request() req,
  ) {
    return await this.zonasService.findByCliente(
      +idCliente,
      +req.user.userId,
      +req.user.rol,
    );
  }

  @Get('by-cliente/:idCliente')
  @ApiOperation({
    summary: 'Listar zonas por ID de cliente',
    description:
      'Obtiene todas las zonas activas pertenecientes únicamente al cliente especificado (sin incluir clientes hijos).',
  })
  @ApiParam({
    name: 'idCliente',
    type: Number,
    description: 'ID del cliente del cual se desean obtener las zonas',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Zonas obtenidas exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  async findByCliente(
    @Param('idCliente', ParseIntPipe) idCliente: number,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.zonasService.findByCliente(+idCliente, +idUser, +rol);
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
    return this.zonasService.findAll(+cliente, +idUser, +rol, page, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.zonasService.findOne(+idUser, +id, +cliente, +rol);
  }

  @Patch('estatus/:id')
  async updateEstatus(
    @Param('id') id: string,
    @Body() updateZonasEstatusDto: UpdateZonasEstatusDto,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.zonasService.updateEstatus(
      +id,
      +idUser,
      +cliente,
      +rol,
      updateZonasEstatusDto,
    );
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateZonaDto: UpdateZonaDto,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.zonasService.update(
      +id,
      +cliente,
      +idUser,
      +rol,
      updateZonaDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.zonasService.remove(+id, +cliente, +idUser, +rol);
  }
}
