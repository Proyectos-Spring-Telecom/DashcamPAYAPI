import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Request,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { MantenimientoVehicularService } from './mantenimiento-vehicular.service';
import { CreateMantenimientoVehicularDto } from './dto/create-mantenimiento-vehicular.dto';
import { UpdateMantenimientoVehicularDto } from './dto/update-mantenimiento-vehicular.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';

@ApiTags('Mantenimiento vehicular')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('mantenimiento-vehicular')
export class MantenimientoVehicularController {
  constructor(
    private readonly mantenimientoVehicularService: MantenimientoVehicularService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('notaServicio', {
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
    summary: 'Crear un nuevo mantenimiento vehicular',
    description: 'Crea un nuevo registro de mantenimiento vehicular con toda la información del servicio realizado. El campo notaServicio debe ser una imagen (archivo).',
  })
  @ApiBody({
    type: CreateMantenimientoVehicularDto,
    description: 'Datos del mantenimiento vehicular a crear (FormData)',
  })
  @ApiResponse({
    status: 201,
    description: 'Mantenimiento vehicular creado exitosamente',
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
    @Body() createMantenimientoVehicularDto: CreateMantenimientoVehicularDto,
    @UploadedFile() notaServicioFile: Express.Multer.File,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.mantenimientoVehicularService.create(
      createMantenimientoVehicularDto,
      idUser,
      notaServicioFile,
    );
  }

  @Get(':page/:limit')
  @ApiOperation({
    summary: 'Obtener mantenimientos vehiculares paginados',
    description: 'Obtiene un listado paginado de mantenimientos vehiculares con sus relaciones.',
  })
  @ApiParam({
    name: 'page',
    type: Number,
    description: 'Número de página',
    example: 1,
  })
  @ApiParam({
    name: 'limit',
    type: Number,
    description: 'Cantidad de registros por página',
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'Listado paginado de mantenimientos vehiculares obtenido exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const idCliente = req.user.cliente;
    const rol = req.user.rol;
    return this.mantenimientoVehicularService.findAll(page, limit, Number(idCliente), Number(rol));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un mantenimiento vehicular por ID',
    description: 'Obtiene los detalles completos de un mantenimiento vehicular específico por su ID, incluyendo todas sus relaciones.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del mantenimiento vehicular',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Mantenimiento vehicular encontrado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento vehicular no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req): Promise<ApiResponseCommon> {
    const idCliente = req.user.cliente;
    const rol = req.user.rol;
    return this.mantenimientoVehicularService.findOne(id, Number(idCliente), Number(rol));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar un mantenimiento vehicular',
    description: 'Actualiza los datos de un mantenimiento vehicular existente. Solo se actualizan los campos proporcionados.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del mantenimiento vehicular a actualizar',
    example: 1,
  })
  @ApiBody({
    type: UpdateMantenimientoVehicularDto,
    description: 'Datos del mantenimiento vehicular a actualizar',
  })
  @ApiResponse({
    status: 200,
    description: 'Mantenimiento vehicular actualizado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación',
  })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento vehicular no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMantenimientoVehicularDto: UpdateMantenimientoVehicularDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.mantenimientoVehicularService.update(
      id,
      updateMantenimientoVehicularDto,
      idUser,
    );
  }

  @Patch(':id/desactivar')
  @ApiOperation({
    summary: 'Desactivar un mantenimiento vehicular',
    description: 'Desactiva un mantenimiento vehicular cambiando su estatus a 0.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del mantenimiento vehicular a desactivar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Mantenimiento vehicular desactivado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento vehicular no encontrado',
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
    return await this.mantenimientoVehicularService.desactivar(id, idUser);
  }

  @Patch(':id/activar')
  @ApiOperation({
    summary: 'Activar un mantenimiento vehicular',
    description: 'Activa un mantenimiento vehicular cambiando su estatus a 1 si estaba previamente en 0.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del mantenimiento vehicular a activar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Mantenimiento vehicular activado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'El mantenimiento vehicular ya está activo',
  })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento vehicular no encontrado',
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
    return await this.mantenimientoVehicularService.activar(id, idUser);
  }

  @Patch(':id/estatus/:estatus')
  @ApiOperation({
    summary: 'Actualizar el estatus de un mantenimiento vehicular',
    description: 'Actualiza el estatus de un mantenimiento vehicular.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del mantenimiento vehicular a actualizar',
    example: 1,
  })
  @ApiParam({
    name: 'estatus',
    type: Number,
    description: 'Estatus del mantenimiento vehicular a actualizar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Estatus del mantenimiento vehicular actualizado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación',
  })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento vehicular no encontrado',
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
    return await this.mantenimientoVehicularService.updateStatus(idUser, id, estatus);
  }
}
