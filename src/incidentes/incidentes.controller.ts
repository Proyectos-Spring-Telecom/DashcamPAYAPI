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
import { IncidentesService } from './incidentes.service';
import { CreateIncidentesDto } from './dto/create-incidentes.dto';
import { UpdateIncidentesDto } from './dto/update-incidentes.dto';
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

@ApiTags('Incidentes')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('incidentes')
export class IncidentesController {
  constructor(
    private readonly incidentesService: IncidentesService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('imagen', {
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
    summary: 'Crear un nuevo incidente',
    description: 'Crea un nuevo registro de incidente con toda la información. El campo imagen debe ser una imagen (archivo).',
  })
  @ApiBody({
    type: CreateIncidentesDto,
    description: 'Datos del incidente a crear (FormData)',
  })
  @ApiResponse({
    status: 201,
    description: 'Incidente creado exitosamente',
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
    @Body() createIncidentesDto: CreateIncidentesDto,
    @UploadedFile() imagenFile: Express.Multer.File,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.incidentesService.create(
      createIncidentesDto,
      idUser,
      imagenFile,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Obtener incidentes paginados',
    description: 'Obtiene un listado paginado de incidentes con sus relaciones.',
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
    description: 'Listado paginado de incidentes obtenido exitosamente',
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
    return this.incidentesService.findAll(page, limit, Number(idCliente), Number(rol));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un incidente por ID',
    description: 'Obtiene los detalles completos de un incidente específico por su ID, incluyendo todas sus relaciones.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del incidente',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Incidente encontrado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Incidente no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req): Promise<ApiResponseCommon> {
    const idCliente = req.user.cliente;
    const rol = req.user.rol;
    return this.incidentesService.findOne(id, Number(idCliente), Number(rol));
  }

  @Patch(':id')
  @UseInterceptors(
    FileInterceptor('imagen', {
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
    summary: 'Actualizar un incidente',
    description: 'Actualiza los datos de un incidente existente. Solo se actualizan los campos proporcionados. El campo imagen puede ser una imagen (archivo) o una URL string.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del incidente a actualizar',
    example: 1,
  })
  @ApiBody({
    type: UpdateIncidentesDto,
    description: 'Datos del incidente a actualizar (FormData)',
  })
  @ApiResponse({
    status: 200,
    description: 'Incidente actualizado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación',
  })
  @ApiResponse({
    status: 404,
    description: 'Incidente no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateIncidentesDto: UpdateIncidentesDto,
    @UploadedFile() imagenFile: Express.Multer.File,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.incidentesService.update(
      id,
      updateIncidentesDto,
      idUser,
      imagenFile,
    );
  }

  @Patch(':id/desactivar')
  @ApiOperation({
    summary: 'Desactivar un incidente',
    description: 'Desactiva un incidente cambiando su estatus a 0.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del incidente a desactivar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Incidente desactivado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Incidente no encontrado',
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
    return await this.incidentesService.desactivar(id, idUser);
  }

  @Patch(':id/activar')
  @ApiOperation({
    summary: 'Activar un incidente',
    description: 'Activa un incidente cambiando su estatus a 1 si estaba previamente en 0.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del incidente a activar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Incidente activado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'El incidente ya está activo',
  })
  @ApiResponse({
    status: 404,
    description: 'Incidente no encontrado',
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
    return await this.incidentesService.activar(id, idUser);
  }

  @Patch(':id/estatus/:estatus')
  @ApiOperation({
    summary: 'Actualizar el estatus de un incidente',
    description: 'Actualiza el estatus de un incidente.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del incidente a actualizar',
    example: 1,
  })
  @ApiParam({
    name: 'estatus',
    type: Number,
    description: 'Estatus del incidente a actualizar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Estatus del incidente actualizado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación',
  })
  @ApiResponse({
    status: 404,
    description: 'Incidente no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Param('estatus', ParseIntPipe) estatus: number,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.incidentesService.updateStatus(idUser, id, estatus);
  }
}
