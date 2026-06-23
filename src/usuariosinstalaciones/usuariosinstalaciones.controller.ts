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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { UsuariosinstalacionesService } from './usuariosinstalaciones.service';
import { CreateUsuariosInstalacionesDto } from './dto/create-usuariosinstalacione.dto';
import { UpdateUsuariosinstalacioneDto } from './dto/update-usuariosinstalacione.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiCrudResponse } from 'src/common/ApiResponse';
import { UpdateUsuariosInstalacionesEstatusDto } from './dto/update-usuariosinstalacione-estatus.dto';

@ApiTags('Usuarios instalaciones')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('usuariosinstalaciones')
export class UsuariosinstalacionesController {
  constructor(
    private readonly usuariosinstalacionesService: UsuariosinstalacionesService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Crear relación usuario-instalación',
    description: 'Crea una nueva relación entre un usuario y una instalación',
  })
  @ApiBody({
    type: CreateUsuariosInstalacionesDto,
    description: 'Datos para crear la relación usuario-instalación',
  })
  @ApiResponse({
    status: 201,
    description: 'Relación usuario-instalación creada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de entrada inválidos',
  })
  @ApiResponse({
    status: 401,
    description: 'Token de autorización inválido o faltante',
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  async create(
    @Body() createUsuariosInstalacionesDto: CreateUsuariosInstalacionesDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.usuariosinstalacionesService.create(
      +idUser,
      createUsuariosInstalacionesDto,
    );
  }

  // ✅ Rutas específicas primero (antes de las rutas con parámetros dinámicos)
  @Get('list')
  @ApiOperation({
    summary: 'Obtener lista completa',
    description:
      'Obtiene una lista completa de todas las relaciones usuario-instalación activas',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista obtenida exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'Token de autorización inválido o faltante',
  })
  async findAllList() {
    return this.usuariosinstalacionesService.findAllList();
  }

  @Get('usuario/:idUsuario')
  @ApiOperation({
    summary: 'Obtener instalaciones por usuario',
    description:
      'Obtiene todas las instalaciones asociadas a un usuario específico',
  })
  @ApiParam({
    name: 'idUsuario',
    type: 'number',
    description: 'ID del usuario',
    example: 123,
  })
  @ApiResponse({
    status: 200,
    description: 'Instalaciones del usuario obtenidas exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuario no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'Token de autorización inválido o faltante',
  })
  async findOneUsuario(@Param('idUsuario', ParseIntPipe) id: number) {
    return await this.usuariosinstalacionesService.findOneUsuario(id);
  }

  @Get(':page/:limit')
  @ApiOperation({
    summary: 'Obtener relaciones con paginación',
    description: 'Obtiene una lista paginada de relaciones usuario-instalación',
  })
  @ApiParam({
    name: 'page',
    type: 'number',
    description: 'Número de página (empezando desde 1)',
    example: 1,
  })
  @ApiParam({
    name: 'limit',
    type: 'number',
    description: 'Cantidad de registros por página',
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada obtenida exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros de paginación inválidos',
  })
  @ApiResponse({
    status: 401,
    description: 'Token de autorización inválido o faltante',
  })
  async findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
  ) {
    return this.usuariosinstalacionesService.findAll(page, limit);
  }

  // ✅ Ruta con parámetro dinámico al final
  @Get(':id')
  @ApiOperation({
    summary: 'Obtener relación por ID',
    description:
      'Obtiene una relación específica usuario-instalación por su ID',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'ID de la relación usuario-instalación',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Relación encontrada exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Relación no encontrada',
  })
  @ApiResponse({
    status: 401,
    description: 'Token de autorización inválido o faltante',
  })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usuariosinstalacionesService.findOne(id);
  }

  @Put(':idUsuario')
  @ApiOperation({
    summary: 'Actualizar relación usuario-instalación',
    description:
      'Actualiza completamente las instalaciones asociadas a un usuario',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'ID del usuario',
    example: 123,
  })
  @ApiBody({
    type: UpdateUsuariosinstalacioneDto,
    description: 'Nuevos datos de instalaciones para el usuario',
  })
  @ApiResponse({
    status: 200,
    description: 'Instalaciones del usuario actualizadas exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de entrada inválidos',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuario no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'Token de autorización inválido o faltante',
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  async update(
    @Param('idUsuario', ParseIntPipe) id: number,
    @Body() updateUsuariosinstalacioneDto: UpdateUsuariosinstalacioneDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return this.usuariosinstalacionesService.update(
      id,
      idUser,
      updateUsuariosinstalacioneDto,
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar estatus de relación',
    description:
      'Actualiza únicamente el estatus de una relación usuario-instalación específica',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'ID de la relación usuario-instalación',
    example: 1,
  })
  @ApiBody({
    type: UpdateUsuariosInstalacionesEstatusDto,
    description: 'Nuevo estatus de la relación',
  })
  @ApiResponse({
    status: 200,
    description: 'Estatus actualizado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de entrada inválidos',
  })
  @ApiResponse({
    status: 404,
    description: 'Relación no encontrada',
  })
  @ApiResponse({
    status: 401,
    description: 'Token de autorización inválido o faltante',
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  async updateEstatus(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    updateUsuariosInstalacionesEstatusDto: UpdateUsuariosInstalacionesEstatusDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return this.usuariosinstalacionesService.updateEstatus(
      id,
      idUser,
      updateUsuariosInstalacionesEstatusDto,
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar relación usuario-instalación',
    description: 'Elimina una relación específica entre usuario e instalación',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'ID de la relación usuario-instalación a eliminar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Relación eliminada exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Relación no encontrada',
  })
  @ApiResponse({
    status: 401,
    description: 'Token de autorización inválido o faltante',
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return this.usuariosinstalacionesService.remove(id, idUser);
  }
}
