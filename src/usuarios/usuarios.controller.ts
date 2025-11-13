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
  ParseIntPipe,
  Request,
  Query,
} from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { UpdateUsuarioEstatusDto } from './dto/update-usuario-estatus.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ApiCrudResponse } from 'src/common/ApiResponse';
import { UpdateUsuarioOperadorDto } from './dto/update-usuario-operador.dto';
import { UpdateUsuarioContrasena } from './dto/update-usuario-contrasena.dto';

@UseGuards(JwtAuthGuard)
@ApiTags('usuarios')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  // ========================================
  // 🔹 POST ROUTES (crear recursos)
  // ========================================
  @Post()
  @ApiOperation({ summary: 'Crear nuevo usuario' })
  @ApiResponse({ status: 201, description: 'Usuario creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async createUsuario(
    @Body() createUsuarioDto: CreateUsuarioDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.usuariosService.createUsuario(createUsuarioDto, idUser);
  }

  // ========================================
  // 🔹 GET ROUTES - Rutas específicas primero
  // ========================================
  @Get('list')
  @ApiOperation({ summary: 'Obtener todos los usuarios sin paginación' })
  @ApiResponse({ status: 200, description: 'Lista completa de usuarios' })
  async findAllList(@Request() req): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return await this.usuariosService.getAllListUsuarios(+cliente, +rol);
  }

  @Get('list/rol/operador/:cliente')
  @ApiOperation({ summary: 'Obtener usuarios con rol operador' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios operadores' })
  async findAllListOperador(@Request() req,
    @Param('cliente', ParseIntPipe) id: number,): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return await this.usuariosService.getAllListUsuariosRol(+id);
  }

  @Get('list/cliente')
  @ApiOperation({ summary: 'Obtener usuarios por cliente específico' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios del cliente' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  async findAllListUsuarioCliente(
    @Param('id', ParseIntPipe) id: number,
    @Request() req
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return await this.usuariosService.getAllListUsuariosCliente(id, +cliente);
  }

  @Get(':page/:limit')
  @ApiOperation({ summary: 'Obtener usuarios con paginación' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios paginada' })
  async findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return await this.usuariosService.getAllUsuario(
      +cliente,
      +rol,
      page,
      limit,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener usuario por ID' })
  @ApiResponse({ status: 200, description: 'Usuario encontrado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.usuariosService.getUsuarioByID(+id, +cliente, +rol);
  }

  // ========================================
  // 🔹 PUT ROUTES (actualización completa)
  // ========================================

  @Put('actualizar/contrasena/:id')
  @ApiOperation({ summary: 'Cambiar contraseña de usuario' })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada exitosamente' })
  @ApiResponse({ status: 400, description: 'Contraseña inválida' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async updateContrasena(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUsuarioContrasena: UpdateUsuarioContrasena,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.usuariosService.updateContrasena(
      id,
      idUser,
      updateUsuarioContrasena,
    );
  }

  @Put('operador')
  @ApiOperation({ summary: 'Actualizar o crear Codigo de operador' })
  @ApiResponse({ status: 200, description: 'Codigo de operador actualizado' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async updateCodigo(
    @Body() updateUsuarioOperadorDto: UpdateUsuarioOperadorDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    const userName = req.user.email;
    return await this.usuariosService.createCodigo(
      userName,
      +idUser,
      updateUsuarioOperadorDto,
    );
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar información completa del usuario' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async updateUsuario(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUsuarioDto: UpdateUsuarioDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.usuariosService.updateUsuario(
      id,
      updateUsuarioDto,
      idUser,
    );
  }

  // ========================================
  // 🔹 PATCH ROUTES (actualización parcial)
  // ========================================

  @Patch('estatus/:id')
  @ApiOperation({ summary: 'Cambiar estatus del usuario (activar/desactivar)' })
  @ApiResponse({ status: 200, description: 'Estatus actualizado exitosamente' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async changeUsuarioEstatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUsuarioEstatusDto: UpdateUsuarioEstatusDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.usuariosService.updateUsuarioEstatus(
      id,
      updateUsuarioEstatusDto,
      idUser,
    );
  }

  // ========================================
  // 🔹 DELETE ROUTES
  // ========================================

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar usuario' })
  @ApiResponse({ status: 200, description: 'Usuario eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @ApiResponse({ status: 400, description: 'No se puede eliminar el usuario' })
  async deleteUsuario(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.usuariosService.deleteUsuario(id, idUser);
  }
}