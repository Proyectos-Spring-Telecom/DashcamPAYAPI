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
} from '@nestjs/common';
import { MantenimientoKilometrajeService } from './mantenimiento-kilometraje.service';
import { CreateMantenimientoKilometrajeDto } from './dto/create-mantenimiento-kilometraje.dto';
import { UpdateMantenimientoKilometrajeDto } from './dto/update-mantenimiento-kilometraje.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';

@ApiTags('Mantenimiento kilometraje')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('mantenimiento-kilometraje')
export class MantenimientoKilometrajeController {
  constructor(
    private readonly mantenimientoKilometrajeService: MantenimientoKilometrajeService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un nuevo registro de mantenimiento por kilometraje',
    description: 'Crea un nuevo registro de mantenimiento programado por kilometraje con la información del kilometraje inicial, deseado, periodo y año.',
  })
  @ApiBody({
    type: CreateMantenimientoKilometrajeDto,
    description: 'Datos del mantenimiento por kilometraje a crear',
  })
  @ApiResponse({
    status: 201,
    description: 'Mantenimiento por kilometraje creado exitosamente',
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
    @Body() createMantenimientoKilometrajeDto: CreateMantenimientoKilometrajeDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.mantenimientoKilometrajeService.create(
      createMantenimientoKilometrajeDto,
      idUser,
    );
  }

  @Get(':page/:limit')
  @ApiOperation({
    summary: 'Obtener mantenimientos por kilometraje paginados',
    description: 'Obtiene un listado paginado de registros de mantenimiento por kilometraje con su relación de instalación.',
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
    description: 'Listado paginado de mantenimientos por kilometraje obtenido exitosamente',
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
    return this.mantenimientoKilometrajeService.findAll(page, limit, Number(idCliente), Number(rol));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un mantenimiento por kilometraje por ID',
    description: 'Obtiene los detalles completos de un registro de mantenimiento por kilometraje específico por su ID, incluyendo su relación de instalación.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del mantenimiento por kilometraje',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Mantenimiento por kilometraje encontrado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento por kilometraje no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req): Promise<ApiResponseCommon> {
    const idCliente = req.user.cliente;
    const rol = req.user.rol;
    return this.mantenimientoKilometrajeService.findOne(id, Number(idCliente), Number(rol));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar un mantenimiento por kilometraje',
    description: 'Actualiza los datos de un registro de mantenimiento por kilometraje existente. Solo se actualizan los campos proporcionados.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del mantenimiento por kilometraje a actualizar',
    example: 1,
  })
  @ApiBody({
    type: UpdateMantenimientoKilometrajeDto,
    description: 'Datos del mantenimiento por kilometraje a actualizar',
  })
  @ApiResponse({
    status: 200,
    description: 'Mantenimiento por kilometraje actualizado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación',
  })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento por kilometraje no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMantenimientoKilometrajeDto: UpdateMantenimientoKilometrajeDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.mantenimientoKilometrajeService.update(
      id,
      updateMantenimientoKilometrajeDto,
      idUser,
    );
  }

  @Patch(':id/desactivar')
  @ApiOperation({
    summary: 'Desactivar un mantenimiento por kilometraje',
    description: 'Desactiva un registro de mantenimiento por kilometraje cambiando su estatus a 0.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del mantenimiento por kilometraje a desactivar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Mantenimiento por kilometraje desactivado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento por kilometraje no encontrado',
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
    return await this.mantenimientoKilometrajeService.desactivar(id, idUser);
  }

  @Patch(':id/activar')
  @ApiOperation({
    summary: 'Activar un mantenimiento por kilometraje',
    description: 'Activa un registro de mantenimiento por kilometraje cambiando su estatus a 1 si estaba previamente en 0.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del mantenimiento por kilometraje a activar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Mantenimiento por kilometraje activado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'El mantenimiento por kilometraje ya está activo',
  })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento por kilometraje no encontrado',
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
    return await this.mantenimientoKilometrajeService.activar(id, idUser);
  }
}
