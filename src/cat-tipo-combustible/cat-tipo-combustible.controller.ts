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
import { CatTipoCombustibleService } from './cat-tipo-combustible.service';
import { CreateCatTipoCombustibleDto } from './dto/create-cat-tipo-combustible.dto';
import { UpdateCatTipoCombustibleDto } from './dto/update-cat-tipo-combustible.dto';
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

@ApiTags('Catálogo tipo combustible')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('cat-tipo-combustible')
export class CatTipoCombustibleController {
  constructor(
    private readonly catTipoCombustibleService: CatTipoCombustibleService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un nuevo tipo de combustible',
    description: 'Crea un nuevo registro de tipo de combustible en el catálogo.',
  })
  @ApiBody({
    type: CreateCatTipoCombustibleDto,
    description: 'Datos del tipo de combustible a crear',
  })
  @ApiResponse({
    status: 201,
    description: 'Tipo de combustible creado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación o el tipo de combustible ya existe',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async create(
    @Body() createCatTipoCombustibleDto: CreateCatTipoCombustibleDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.catTipoCombustibleService.create(
      createCatTipoCombustibleDto,
      idUser,
    );
  }

  @Get('list')
  @ApiOperation({
    summary: 'Obtener listado de tipos de combustible',
    description: 'Obtiene un listado completo de todos los tipos de combustible sin paginación.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de tipos de combustible obtenido exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findAllList(): Promise<ApiResponseCommon> {
    return this.catTipoCombustibleService.findAllList();
  }

  @Get(':page/:limit')
  @ApiOperation({
    summary: 'Obtener tipos de combustible paginados',
    description: 'Obtiene un listado paginado de tipos de combustible.',
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
    description: 'Listado paginado de tipos de combustible obtenido exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
  ): Promise<ApiResponseCommon> {
    return this.catTipoCombustibleService.findAll(page, limit);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un tipo de combustible por ID',
    description: 'Obtiene los detalles de un tipo de combustible específico por su ID.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del tipo de combustible',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Tipo de combustible encontrado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Tipo de combustible no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ApiResponseCommon> {
    return this.catTipoCombustibleService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar un tipo de combustible',
    description: 'Actualiza los datos de un tipo de combustible existente.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del tipo de combustible a actualizar',
    example: 1,
  })
  @ApiBody({
    type: UpdateCatTipoCombustibleDto,
    description: 'Datos del tipo de combustible a actualizar',
  })
  @ApiResponse({
    status: 200,
    description: 'Tipo de combustible actualizado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación o el nombre ya existe',
  })
  @ApiResponse({
    status: 404,
    description: 'Tipo de combustible no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCatTipoCombustibleDto: UpdateCatTipoCombustibleDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.catTipoCombustibleService.update(
      id,
      updateCatTipoCombustibleDto,
      idUser,
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar un tipo de combustible',
    description: 'Elimina permanentemente un tipo de combustible del catálogo.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del tipo de combustible a eliminar',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Tipo de combustible eliminado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Tipo de combustible no encontrado',
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
    return await this.catTipoCombustibleService.remove(id, idUser);
  }
}
