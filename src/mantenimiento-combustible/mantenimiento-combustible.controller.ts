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
import { MantenimientoCombustibleService } from './mantenimiento-combustible.service';
import { CreateMantenimientoCombustibleDto } from './dto/create-mantenimiento-combustible.dto';
import { UpdateMantenimientoCombustibleDto } from './dto/update-mantenimiento-combustible.dto';
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

@ApiTags('Mantenimiento combustible')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('mantenimiento-combustible')
export class MantenimientoCombustibleController {
  constructor(
    private readonly mantenimientoCombustibleService: MantenimientoCombustibleService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un nuevo registro de mantenimiento de combustible',
    description: 'Crea un nuevo registro de abastecimiento de combustible con toda la información del servicio realizado.',
  })
  @ApiBody({
    type: CreateMantenimientoCombustibleDto,
    description: 'Datos del mantenimiento de combustible a crear',
  })
  @ApiResponse({
    status: 201,
    description: 'Mantenimiento de combustible creado exitosamente',
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
    @Body() createMantenimientoCombustibleDto: CreateMantenimientoCombustibleDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.mantenimientoCombustibleService.create(
      createMantenimientoCombustibleDto,
      idUser,
    );
  }

  @Get(':page/:limit')
  @ApiOperation({
    summary: 'Obtener mantenimientos de combustible paginados',
    description: 'Obtiene un listado paginado de registros de abastecimiento de combustible con sus relaciones.',
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
    description: 'Listado paginado de mantenimientos de combustible obtenido exitosamente',
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
    return this.mantenimientoCombustibleService.findAll(page, limit, Number(idCliente), Number(rol));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un mantenimiento de combustible por ID',
    description: 'Obtiene los detalles completos de un registro de abastecimiento de combustible específico por su ID, incluyendo todas sus relaciones.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del mantenimiento de combustible',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Mantenimiento de combustible encontrado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento de combustible no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req): Promise<ApiResponseCommon> {
    const idCliente = req.user.cliente;
    const rol = req.user.rol;
    return this.mantenimientoCombustibleService.findOne(id, Number(idCliente), Number(rol));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar un mantenimiento de combustible',
    description: 'Actualiza los datos de un registro de abastecimiento de combustible existente. Solo se actualizan los campos proporcionados.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del mantenimiento de combustible a actualizar',
    example: 1,
  })
  @ApiBody({
    type: UpdateMantenimientoCombustibleDto,
    description: 'Datos del mantenimiento de combustible a actualizar',
  })
  @ApiResponse({
    status: 200,
    description: 'Mantenimiento de combustible actualizado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación',
  })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento de combustible no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMantenimientoCombustibleDto: UpdateMantenimientoCombustibleDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.mantenimientoCombustibleService.update(
      id,
      updateMantenimientoCombustibleDto,
      idUser,
    );
  }

  @Patch(':id/desactivar')
  @ApiOperation({
    summary: 'Desactivar un mantenimiento de combustible',
    description: 'Desactiva un registro de abastecimiento de combustible cambiando su estatus a 0.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del mantenimiento de combustible a desactivar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Mantenimiento de combustible desactivado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento de combustible no encontrado',
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
    return await this.mantenimientoCombustibleService.desactivar(id, idUser);
  }

  @Patch(':id/activar')
  @ApiOperation({
    summary: 'Activar un mantenimiento de combustible',
    description: 'Activa un registro de abastecimiento de combustible cambiando su estatus a 1 si estaba previamente en 0.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del mantenimiento de combustible a activar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Mantenimiento de combustible activado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'El mantenimiento de combustible ya está activo',
  })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento de combustible no encontrado',
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
    return await this.mantenimientoCombustibleService.activar(id, idUser);
  }
}
