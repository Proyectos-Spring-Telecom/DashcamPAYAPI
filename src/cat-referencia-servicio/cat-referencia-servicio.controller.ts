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
import { CatReferenciaServicioService } from './cat-referencia-servicio.service';
import { CreateCatReferenciaServicioDto } from './dto/create-cat-referencia-servicio.dto';
import { UpdateCatReferenciaServicioDto } from './dto/update-cat-referencia-servicio.dto';
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

@ApiTags('Catálogo referencia servicio')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('cat-referencia-servicio')
export class CatReferenciaServicioController {
  constructor(
    private readonly catReferenciaServicioService: CatReferenciaServicioService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Crear una nueva referencia de servicio',
    description:
      'Crea un nuevo registro de referencia de servicio en el catálogo.',
  })
  @ApiBody({
    type: CreateCatReferenciaServicioDto,
    description: 'Datos de la referencia de servicio a crear',
  })
  @ApiResponse({
    status: 201,
    description: 'Referencia de servicio creada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación o la referencia ya existe',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async create(
    @Body() createCatReferenciaServicioDto: CreateCatReferenciaServicioDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.catReferenciaServicioService.create(
      createCatReferenciaServicioDto,
      idUser,
    );
  }

  @Get('list')
  @ApiOperation({
    summary: 'Obtener listado de referencias de servicio',
    description:
      'Obtiene un listado completo de todas las referencias de servicio activas sin paginación.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de referencias de servicio obtenido exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findAllList(): Promise<ApiResponseCommon> {
    return this.catReferenciaServicioService.findAllList();
  }

  @Get(':page/:limit')
  @ApiOperation({
    summary: 'Obtener referencias de servicio paginadas',
    description: 'Obtiene un listado paginado de referencias de servicio.',
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
      'Listado paginado de referencias de servicio obtenido exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
  ): Promise<ApiResponseCommon> {
    return this.catReferenciaServicioService.findAll(page, limit);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener una referencia de servicio por ID',
    description:
      'Obtiene los detalles de una referencia de servicio específica por su ID.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID de la referencia de servicio',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Referencia de servicio encontrada exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Referencia de servicio no encontrada',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ApiResponseCommon> {
    return this.catReferenciaServicioService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar una referencia de servicio',
    description: 'Actualiza los datos de una referencia de servicio existente.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID de la referencia de servicio a actualizar',
    example: 1,
  })
  @ApiBody({
    type: UpdateCatReferenciaServicioDto,
    description: 'Datos de la referencia de servicio a actualizar',
  })
  @ApiResponse({
    status: 200,
    description: 'Referencia de servicio actualizada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación o el nombre ya existe',
  })
  @ApiResponse({
    status: 404,
    description: 'Referencia de servicio no encontrada',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCatReferenciaServicioDto: UpdateCatReferenciaServicioDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.catReferenciaServicioService.update(
      id,
      updateCatReferenciaServicioDto,
      idUser,
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar una referencia de servicio',
    description:
      'Elimina permanentemente una referencia de servicio del catálogo.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID de la referencia de servicio a eliminar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Referencia de servicio eliminada exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Referencia de servicio no encontrada',
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
    return await this.catReferenciaServicioService.remove(id, idUser);
  }
}
