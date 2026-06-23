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
import { RutasService } from './rutas.service';
import { CreateRutaDto } from './dto/create-ruta.dto';
import { UpdateRutaDto } from './dto/update-ruta.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { UpdateRutasEstatusDto } from './dto/update-ruta-estatus.dto';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('Rutas')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('rutas')
export class RutasController {
  constructor(private readonly rutasService: RutasService) {}

  @Post()
  async create(@Body() createRutaDto: CreateRutaDto, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.rutasService.create(+idUser, +cliente, +rol, createRutaDto);
  }

  @Get('list')
  findAllList(@Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.rutasService.findAllList(+idUser, +cliente, +rol);
  }

  @Get('by-zona/:idZona')
  @ApiOperation({
    summary: 'Listar rutas por ID de zona',
    description: 'Obtiene todas las rutas activas pertenecientes únicamente a la zona especificada.',
  })
  @ApiParam({
    name: 'idZona',
    type: Number,
    description: 'ID de la zona de la cual se desean obtener las rutas',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Rutas obtenidas exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  async findByZona(
    @Param('idZona', ParseIntPipe) idZona: number,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.rutasService.findByZona(+idZona, +idUser, +rol);
  }

  @Get('by-idCliente/:idCliente')
  @ApiOperation({
    summary: 'Listar rutas por ID de cliente',
    description: 'Obtiene todas las rutas activas pertenecientes al cliente especificado (a través de sus zonas).',
  })
  @ApiParam({
    name: 'idCliente',
    type: Number,
    description: 'ID del cliente del cual se desean obtener las rutas',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Rutas obtenidas exitosamente',
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
    return await this.rutasService.findByCliente(+idCliente, +idUser, +rol);
  }

  @Get(':page/:limit')
  async getRutasUsuario(
    @Request() req,
    @Param('page', ParseIntPipe) page,
    @Param('limit', ParseIntPipe) limit,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.rutasService.obtenerRutasPorUsuarioSQL(+idUser, +cliente, +rol, +page, +limit);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.rutasService.findOne(id, +idUser, +cliente, +rol);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRutaDto: UpdateRutaDto,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.rutasService.update(id, +idUser, +cliente, +rol, updateRutaDto);
  }

  @Patch('estatus/:id')
  updateEstatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRutasEstatusDto: UpdateRutasEstatusDto,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.rutasService.updateEstatus(
      id,
      +idUser,
      +cliente,
      +rol,
      updateRutasEstatusDto,
    );
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.rutasService.remove(id, +idUser, +rol);
  }
}
