import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  Request,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { VerificacionesService } from './verificaciones.service';
import { CreateVerificacionesDto } from './dto/create-verificaciones.dto';
import { UpdateVerificacionesDto } from './dto/update-verificaciones.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';

@ApiTags('Verificaciones')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('verificaciones')
export class VerificacionesController {
  constructor(
    private readonly verificacionesService: VerificacionesService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('notaVerificacion', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // máximo 10 MB
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
        if (file && !allowedTypes.includes(file.mimetype)) {
          return cb(
            new Error('Solo se permiten PNG, JPG, JPEG o PDF'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Crear una nueva verificación',
    description: 'Crea un nuevo registro de verificación con toda la información. El campo notaVerificacion debe ser una imagen (archivo).',
  })
  @ApiBody({
    type: CreateVerificacionesDto,
    description: 'Datos de la verificación a crear (FormData)',
  })
  @ApiResponse({
    status: 201,
    description: 'Verificación creada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async create(
    @Body() createVerificacionesDto: CreateVerificacionesDto,
    @UploadedFile() notaVerificacionFile: Express.Multer.File,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.verificacionesService.create(
      createVerificacionesDto,
      idUser,
      notaVerificacionFile,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Obtener verificaciones paginadas',
    description: 'Obtiene un listado paginado de verificaciones con sus relaciones.',
  })
  @ApiQuery({
    name: 'page',
    type: Number,
    description: 'Número de página',
    example: 1,
    required: true,
  })
  @ApiQuery({
    name: 'limit',
    type: Number,
    description: 'Cantidad de registros por página',
    example: 10,
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Listado paginado de verificaciones obtenido exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findAll(
    @Query('page', ParseIntPipe) page: number,
    @Query('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const idCliente = req.user.cliente;
    const rol = req.user.rol;
    return this.verificacionesService.findAll(page, limit, Number(idCliente), Number(rol));
  }

  @Get('categorias-mantenimiento-mecanico')
  @ApiOperation({
    summary: 'Obtener categorías de mantenimiento mecánico',
    description: 'Obtiene las categorías de mantenimiento mecánico con sus características de evaluación.',
  })
  @ApiResponse({
    status: 200,
    description: 'Categorías de mantenimiento mecánico obtenidas exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  getCategoriasMantenimientoMecanico(): Promise<ApiResponseCommon> {
    return this.verificacionesService.getCategoriasMantenimientoMecanico();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener una verificación por ID',
    description: 'Obtiene los detalles completos de una verificación específica por su ID, incluyendo todas sus relaciones.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID de la verificación',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Verificación encontrada exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Verificación no encontrada',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req): Promise<ApiResponseCommon> {
    const idCliente = req.user.cliente;
    const rol = req.user.rol;
    return this.verificacionesService.findOne(id, Number(idCliente), Number(rol));
  }

  @Patch(':id')
  @UseInterceptors(
    FileInterceptor('notaVerificacion', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // máximo 10 MB
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
        if (file && !allowedTypes.includes(file.mimetype)) {
          return cb(
            new Error('Solo se permiten PNG, JPG, JPEG o PDF'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Actualizar una verificación',
    description: 'Actualiza los datos de una verificación existente. Solo se actualizan los campos proporcionados. El campo notaVerificacion puede ser una imagen (archivo) o una URL string.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID de la verificación a actualizar',
    example: 1,
  })
  @ApiBody({
    type: UpdateVerificacionesDto,
    description: 'Datos de la verificación a actualizar (FormData)',
  })
  @ApiResponse({
    status: 200,
    description: 'Verificación actualizada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación',
  })
  @ApiResponse({
    status: 404,
    description: 'Verificación no encontrada',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateVerificacionesDto: UpdateVerificacionesDto,
    @UploadedFile() notaVerificacionFile: Express.Multer.File,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.verificacionesService.update(
      id,
      updateVerificacionesDto,
      idUser,
      notaVerificacionFile,
    );
  }

  @Patch(':id/desactivar')
  @ApiOperation({
    summary: 'Desactivar una verificación',
    description: 'Desactiva una verificación cambiando su estatus a 0.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID de la verificación a desactivar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Verificación desactivada exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Verificación no encontrada',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async desactivar(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.verificacionesService.desactivar(id, idUser);
  }

  @Patch(':id/activar')
  @ApiOperation({
    summary: 'Activar una verificación',
    description: 'Activa una verificación cambiando su estatus a 1 si estaba previamente en 0.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID de la verificación a activar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Verificación activada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'La verificación ya está activa',
  })
  @ApiResponse({
    status: 404,
    description: 'Verificación no encontrada',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async activar(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.verificacionesService.activar(id, idUser);
  }
}

