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
import { CatTipoVerificacionesService } from './cat-tipo-verificaciones.service';
import { CreateCatTipoVerificacionesDto } from './dto/create-cat-tipo-verificaciones.dto';
import { UpdateCatTipoVerificacionesDto } from './dto/update-cat-tipo-verificaciones.dto';
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

@ApiTags('Catálogo tipo verificaciones')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('cat-tipo-verificaciones')
export class CatTipoVerificacionesController {
  constructor(
    private readonly catTipoVerificacionesService: CatTipoVerificacionesService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un nuevo tipo de verificación',
    description:
      'Crea un nuevo registro de tipo de verificación en el catálogo.',
  })
  @ApiBody({
    type: CreateCatTipoVerificacionesDto,
    description: 'Datos del tipo de verificación a crear',
  })
  @ApiResponse({
    status: 201,
    description: 'Tipo de verificación creado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación o el tipo de verificación ya existe',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async create(
    @Body() createCatTipoVerificacionesDto: CreateCatTipoVerificacionesDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.catTipoVerificacionesService.create(
      createCatTipoVerificacionesDto,
      idUser,
    );
  }

  @Get('list')
  @ApiOperation({
    summary: 'Obtener listado de tipos de verificación',
    description:
      'Obtiene un listado completo de todos los tipos de verificación sin paginación.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de tipos de verificación obtenido exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findAllList(): Promise<ApiResponseCommon> {
    return this.catTipoVerificacionesService.findAllList();
  }

  @Get(':page/:limit')
  @ApiOperation({
    summary: 'Obtener tipos de verificación paginados',
    description: 'Obtiene un listado paginado de tipos de verificación.',
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
      'Listado paginado de tipos de verificación obtenido exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
  ): Promise<ApiResponseCommon> {
    return this.catTipoVerificacionesService.findAll(page, limit);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un tipo de verificación por ID',
    description:
      'Obtiene los detalles de un tipo de verificación específico por su ID.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del tipo de verificación',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Tipo de verificación encontrado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Tipo de verificación no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ApiResponseCommon> {
    return this.catTipoVerificacionesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar un tipo de verificación',
    description: 'Actualiza los datos de un tipo de verificación existente.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del tipo de verificación a actualizar',
    example: 1,
  })
  @ApiBody({
    type: UpdateCatTipoVerificacionesDto,
    description: 'Datos del tipo de verificación a actualizar',
  })
  @ApiResponse({
    status: 200,
    description: 'Tipo de verificación actualizado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación o el nombre ya existe',
  })
  @ApiResponse({
    status: 404,
    description: 'Tipo de verificación no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCatTipoVerificacionesDto: UpdateCatTipoVerificacionesDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.catTipoVerificacionesService.update(
      id,
      updateCatTipoVerificacionesDto,
      idUser,
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar un tipo de verificación',
    description:
      'Elimina permanentemente un tipo de verificación del catálogo.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del tipo de verificación a eliminar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Tipo de verificación eliminado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Tipo de verificación no encontrado',
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
    return await this.catTipoVerificacionesService.remove(id, idUser);
  }
}
