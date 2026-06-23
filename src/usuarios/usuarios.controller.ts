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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { UpdateUsuarioEstatusDto } from './dto/update-usuario-estatus.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { ApiCrudResponse } from 'src/common/ApiResponse';
import { UpdateUsuarioOperadorDto } from './dto/update-usuario-operador.dto';
import { UpdateUsuarioContrasena } from './dto/update-usuario-contrasena.dto';
import { UpdateUsuarioValidadorDto } from './dto/update-usuario-validador.dto';

@UseGuards(JwtAuthGuard)
@ApiTags('Usuarios')
@ApiBearerAuth('bearer-token')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  // ========================================
  // 🔹 POST ROUTES (crear recursos)
  // ========================================
  @Post()
  @ApiOperation({ summary: 'Registrar un nuevo usuario' })
  @ApiResponse({
    status: 201,
    description: 'El usuario ha sido creado exitosamente.',
  })
  @ApiResponse({
    status: 400,
    description: 'Los datos ingresados no son válidos',
  })
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

  @Get('list/cliente')
  @ApiOperation({ summary: 'Obtener usuarios por cliente específico' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios del cliente' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  async findAllListUsuarioCliente(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const _rol = req.user.rol;
    return await this.usuariosService.getAllListUsuariosCliente(id, +cliente);
  }

  @Get('list/rol/operador/:cliente')
  @ApiOperation({ summary: 'Obtener usuarios con rol operador' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios operadores' })
  async findAllListOperador(
    @Request() req,
    @Param('cliente', ParseIntPipe) id: number,
  ): Promise<ApiResponseCommon> {
    const _cliente = req.user.cliente;
    const _rol = req.user.rol;
    return await this.usuariosService.getAllListUsuariosRol(+id);
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
    const idUser = req.user.userId;
    return await this.usuariosService.getAllUsuario(
      +idUser,
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
  @ApiResponse({
    status: 200,
    description: 'Contraseña actualizada exitosamente',
  })
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

  // ========================================
  // 🔹 PUT ACTUALIZAR USUARIO
  // ========================================

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

  @Patch('generar/pin')
  @ApiOperation({ summary: 'Actualizar o crear PIN de operador' })
  @ApiResponse({ status: 200, description: 'PIN de operador actualizado' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async updatePin(
    @Body() updateUsuarioOperadorDto: UpdateUsuarioOperadorDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    const userName = req.user.email;
    return await this.usuariosService.createPin(
      userName,
      +idUser,
      updateUsuarioOperadorDto,
    );
  }

  @Patch('actualizar/validador')
  @ApiOperation({ summary: 'Actualizar validador del operador' })
  @ApiResponse({ status: 200, description: 'Validador Actualizado' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async updateValidador(
    @Body() updateUsuarioValidadorDto: UpdateUsuarioValidadorDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    const userName = req.user.email;
    return await this.usuariosService.updateValidador(
      userName,
      +idUser,
      updateUsuarioValidadorDto,
    );
  }

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

  @Post('foto-perfil')
  @UseInterceptors(
    FileInterceptor('foto', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // máximo 10 MB
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
        if (file && !allowedTypes.includes(file.mimetype)) {
          return cb(
            new Error('Solo se permiten imágenes PNG, JPG o JPEG'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Subir o actualizar foto de perfil del usuario',
    description:
      'Sube una nueva foto de perfil para el usuario autenticado. Si el usuario ya tiene una foto, se reemplazará automáticamente.',
  })
  @ApiBody({
    description: 'Archivo de imagen (PNG, JPG o JPEG)',
    schema: {
      type: 'object',
      properties: {
        foto: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Foto de perfil actualizada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Archivo inválido o no proporcionado',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuario no encontrado',
  })
  async uploadFotoPerfil(
    @UploadedFile() fotoFile: Express.Multer.File,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.usuariosService.uploadFotoPerfil(fotoFile, idUser);
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
