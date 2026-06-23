import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import { VariantesService } from './variantes.service';
import { CreateVarianteDto } from './dto/create-variante.dto';
import { UpdateVarianteDto } from './dto/update-variante.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { UpdateVariantesEstatusDto } from './dto/update-variante-estatus.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Variantes')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('variantes')
export class VariantesController {
  constructor(private readonly variantesService: VariantesService) {}

  @Post()
  create(@Body() createVarianteDto: CreateVarianteDto, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.variantesService.create(
      +idUser,
      +cliente,
      +rol,
      createVarianteDto,
    );
  }

  @Get('tipos-variante')
  @ApiOperation({
    summary: 'Obtener tipos de variante',
    description: 'Obtiene todos los tipos de variante activos disponibles.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tipos de variante obtenidos exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  findAllTiposVariante() {
    return this.variantesService.findAllTiposVariante();
  }

  @Get('list')
  findAllList(@Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.variantesService.findAllList(+idUser, +cliente, +rol);
  }

  @Get('by-ruta/:idRuta')
  @ApiOperation({
    summary: 'Listar variantes por ID de ruta',
    description:
      'Obtiene todos los variantes activos pertenecientes únicamente a la ruta especificada.',
  })
  @ApiParam({
    name: 'idRuta',
    type: Number,
    description: 'ID de la ruta de la cual se desean obtener los variantes',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Variantes obtenidos exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  async findByRuta(
    @Param('idRuta', ParseIntPipe) idRuta: number,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.variantesService.findByRuta(+idRuta, +idUser, +rol);
  }

  @Get(':page/:limit')
  findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.variantesService.findAll(+idUser, +cliente, +rol, page, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.variantesService.findOne(+id, +idUser, +cliente, +rol);
  }

  @Patch('estatus/:id')
  updateEstatus(
    @Param('id') id: string,
    @Body() updateVariantesEstatusDto: UpdateVariantesEstatusDto,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.variantesService.updateEstatus(
      +id,
      +idUser,
      +cliente,
      +rol,
      updateVariantesEstatusDto,
    );
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateVarianteDto: UpdateVarianteDto,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.variantesService.update(
      +id,
      +idUser,
      +cliente,
      +rol,
      updateVarianteDto,
    );
  }

  @Delete('eliminado/total/:id')
  removeTotal(@Param('id') id: string, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.variantesService.removeTotal(+id, +idUser, +cliente, +rol);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.variantesService.remove(+id, +idUser, +cliente, +rol);
  }
}
