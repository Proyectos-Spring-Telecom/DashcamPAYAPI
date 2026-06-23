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
  Put,
  ParseIntPipe,
} from '@nestjs/common';
import { CatMetodoPagoService } from './cat-metodo-pago.service';
import { CreateCatMetodoPagoDto } from './dto/create-cat-metodo-pago.dto';
import { UpdateCatMetodoPagoDto } from './dto/update-cat-metodo-pago.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ApiResponseCommon, ApiCrudResponse } from 'src/common/ApiResponse';

@ApiTags('Catálogo métodos de pago')
@ApiBearerAuth('bearer-token')
@Controller('cat-metodo-pago')
export class CatMetodoPagoController {
  constructor(private readonly catMetodoPagoService: CatMetodoPagoService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiOperation({
    summary: 'Crear un nuevo método de pago',
    description: 'Crea un nuevo método de pago en el catálogo.',
  })
  @ApiResponse({
    status: 201,
    description: 'Método de pago creado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación o método de pago ya existe',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  create(
    @Body() createCatMetodoPagoDto: CreateCatMetodoPagoDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.catMetodoPagoService.create(+idUser, createCatMetodoPagoDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('list')
  @ApiOperation({
    summary: 'Obtener listado de métodos de pago',
    description:
      'Obtiene un listado completo de todos los métodos de pago sin paginación.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de métodos de pago obtenido exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findAllList() {
    return this.catMetodoPagoService.findAllList();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un método de pago por ID',
    description:
      'Obtiene los detalles de un método de pago específico por su ID.',
  })
  @ApiResponse({
    status: 200,
    description: 'Método de pago obtenido exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Método de pago no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.catMetodoPagoService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @ApiOperation({
    summary: 'Actualizar un método de pago',
    description: 'Actualiza los datos de un método de pago existente.',
  })
  @ApiResponse({
    status: 200,
    description: 'Método de pago actualizado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Método de pago no encontrado',
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCatMetodoPagoDto: UpdateCatMetodoPagoDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.catMetodoPagoService.update(
      id,
      +idUser,
      updateCatMetodoPagoDto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar parcialmente un método de pago',
    description:
      'Actualiza parcialmente los datos de un método de pago existente.',
  })
  @ApiResponse({
    status: 200,
    description: 'Método de pago actualizado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Método de pago no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  patch(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCatMetodoPagoDto: UpdateCatMetodoPagoDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.catMetodoPagoService.update(
      id,
      +idUser,
      updateCatMetodoPagoDto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar un método de pago',
    description: 'Elimina un método de pago del catálogo.',
  })
  @ApiResponse({
    status: 200,
    description: 'Método de pago eliminado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Método de pago no encontrado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const idUser = req.user.userId;
    return this.catMetodoPagoService.remove(id, +idUser);
  }
}
