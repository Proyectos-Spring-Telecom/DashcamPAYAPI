import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { CatEstatusMantenimientoService } from './cat-estatus-mantenimiento.service';
import { CreateCatEstatusMantenimientoDto } from './dto/create-cat-estatus-mantenimiento.dto';
import { UpdateCatEstatusMantenimientoDto } from './dto/update-cat-estatus-mantenimiento.dto';
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

@ApiTags('Catálogo estatus mantenimiento')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('cat-estatus-mantenimiento')
export class CatEstatusMantenimientoController {
  constructor(
    private readonly catEstatusMantenimientoService: CatEstatusMantenimientoService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un nuevo estatus de mantenimiento',
    description:
      'Crea un nuevo registro de estatus de mantenimiento en el catálogo.',
  })
  @ApiBody({
    type: CreateCatEstatusMantenimientoDto,
    description: 'Datos del estatus de mantenimiento a crear',
  })
  @ApiResponse({
    status: 201,
    description: 'Estatus de mantenimiento creado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación o el estatus ya existe',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async create(
    @Body() createCatEstatusMantenimientoDto: CreateCatEstatusMantenimientoDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.catEstatusMantenimientoService.create(
      createCatEstatusMantenimientoDto,
      idUser,
    );
  }

  @Get('list')
  @ApiOperation({
    summary: 'Obtener listado de estatus de mantenimiento',
    description:
      'Obtiene un listado completo de todos los estatus de mantenimiento sin paginación.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de estatus de mantenimiento obtenido exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findAllList(): Promise<ApiResponseCommon> {
    return this.catEstatusMantenimientoService.findAllList();
  }

  @Get(':page/:limit')
  @ApiOperation({
    summary: 'Obtener estatus de mantenimiento paginados',
    description: 'Obtiene un listado paginado de estatus de mantenimiento.',
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
    description:
      'Listado paginado de estatus de mantenimiento obtenido exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
  ): Promise<ApiResponseCommon> {
    return this.catEstatusMantenimientoService.findAll(page, limit);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un estatus de mantenimiento por ID',
    description:
      'Obtiene los detalles de un estatus de mantenimiento específico por su ID.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del estatus de mantenimiento',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Estatus de mantenimiento encontrado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Estatus de mantenimiento no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ApiResponseCommon> {
    return this.catEstatusMantenimientoService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar un estatus de mantenimiento',
    description:
      'Actualiza los datos de un estatus de mantenimiento existente.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del estatus de mantenimiento a actualizar',
    example: 1,
  })
  @ApiBody({
    type: UpdateCatEstatusMantenimientoDto,
    description: 'Datos del estatus de mantenimiento a actualizar',
  })
  @ApiResponse({
    status: 200,
    description: 'Estatus de mantenimiento actualizado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación o el nombre ya existe',
  })
  @ApiResponse({
    status: 404,
    description: 'Estatus de mantenimiento no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCatEstatusMantenimientoDto: UpdateCatEstatusMantenimientoDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.catEstatusMantenimientoService.update(
      id,
      updateCatEstatusMantenimientoDto,
      idUser,
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar un estatus de mantenimiento',
    description:
      'Elimina permanentemente un estatus de mantenimiento del catálogo.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del estatus de mantenimiento a eliminar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Estatus de mantenimiento eliminado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Estatus de mantenimiento no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.catEstatusMantenimientoService.remove(id, idUser);
  }
}
