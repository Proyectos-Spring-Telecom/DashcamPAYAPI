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
} from '@nestjs/common';
import { TransbordosService } from './transbordos.service';
import { CreateTransbordoDto } from './dto/create-transbordo.dto';
import { UpdateTransbordoDto } from './dto/update-transbordo.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

@ApiTags('Transbordos')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('transbordos')
export class TransbordosController {
  constructor(private readonly transbordosService: TransbordosService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un nuevo transbordo con sus detalles',
    description:
      'Crea un transbordo permitido con sus detalles de costos. ' +
      'Valida que el número de detalles no exceda el número de transbordos permitidos configurado.',
  })
  @ApiBody({ type: CreateTransbordoDto })
  @ApiResponse({
    status: 201,
    description: 'Transbordo creado exitosamente',
    schema: {
      example: {
        status: 'success',
        message: 'Transbordo creado correctamente',
        data: {
          id: 1,
          nombre: 'TRANSBORDO ZONA CENTRO',
          numeroDetalles: 3,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación - El número de detalles excede el límite',
    schema: {
      example: {
        statusCode: 400,
        message: 'El número de detalles (5) no puede exceder el número de transbordos permitidos (3)',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Cliente no encontrado',
  })
  create(@Body() createTransbordoDto: CreateTransbordoDto, @Request() req) {
    const idUser = req.user.userId;
    return this.transbordosService.create(idUser, createTransbordoDto);
  }

  @Get('tipos-descuento')
  @ApiOperation({
    summary: 'Obtener listado de tipos de descuento',
    description: 'Retorna todos los tipos de descuento disponibles para transbordos.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de tipos de descuento obtenida exitosamente',
    schema: {
      example: {
        data: [
          { id: 1, nombre: 'Descuento por tiempo' },
          { id: 2, nombre: 'Descuento por cantidad' },
        ],
      },
    },
  })
  getTiposDescuento(@Request() req) {
    const idUser = req.user.userId;
    return this.transbordosService.getTiposDescuento(idUser);
  }

  @Get(':page/:limit')
  @ApiOperation({
    summary: 'Obtener listado de transbordos con paginación',
    description: 'Retorna todos los transbordos del cliente con sus detalles, paginados.',
  })
  @ApiParam({ name: 'page', type: 'number', description: 'Número de página', example: 1 })
  @ApiParam({ name: 'limit', type: 'number', description: 'Cantidad de registros por página', example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Lista de transbordos obtenida exitosamente',
    schema: {
      example: {
        data: [
          {
            id: 1,
            idCliente: 5,
            nombreCliente: 'TRANSPORTES SA',
            nombre: 'TRANSBORDO ZONA CENTRO',
            tiempo: 30,
            numeroTransbordos: 3,
            cantidadDetalles: 3,
            detalles: [
              { nroTransbordo: 1, costo: 5.50 },
              { nroTransbordo: 2, costo: 3.00 },
              { nroTransbordo: 3, costo: 2.00 },
            ],
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
      },
    },
  })
  findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    return this.transbordosService.findAll(cliente, idUser, page, limit);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un transbordo por ID',
    description: 'Retorna los detalles completos de un transbordo específico con todos sus detalles.',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID del transbordo', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Transbordo encontrado',
    schema: {
      example: {
        data: {
          id: 1,
          nombre: 'TRANSBORDO ZONA CENTRO',
          tiempo: 30,
          numeroTransbordos: 3,
          idCliente: 5,
          nombreCliente: 'TRANSPORTES SA',
          detalles: [
            { id: 1, costo: 5.50, nroTransbordo: 1 },
            { id: 2, costo: 3.00, nroTransbordo: 2 },
            { id: 3, costo: 2.00, nroTransbordo: 3 },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Transbordo no encontrado',
  })
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const idUser = req.user.userId;
    return this.transbordosService.findOne(id, idUser);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar un transbordo',
    description:
      'Actualiza un transbordo y sus detalles. ' +
      'Si se proporcionan nuevos detalles, se reemplazan todos los existentes. ' +
      'Valida que el número de detalles no exceda el número de transbordos permitidos.',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID del transbordo', example: 1 })
  @ApiBody({ type: UpdateTransbordoDto })
  @ApiResponse({
    status: 200,
    description: 'Transbordo actualizado exitosamente',
    schema: {
      example: {
        status: 'success',
        message: 'Transbordo actualizado correctamente',
        data: {
          id: 1,
          nombre: 'TRANSBORDO ZONA CENTRO ACTUALIZADO',
          numeroDetalles: 3,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación',
  })
  @ApiResponse({
    status: 404,
    description: 'Transbordo no encontrado',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTransbordoDto: UpdateTransbordoDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.transbordosService.update(id, idUser, updateTransbordoDto);
  }

  @Patch('activar/:id')
  @ApiOperation({
    summary: 'Activar un transbordo',
    description:
      'Activa un transbordo que estaba inactivo, cambiando su estatus a 1. ' +
      'Solo se pueden activar transbordos que estén inactivos (estatus = 0).',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID del transbordo', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Transbordo activado exitosamente',
    schema: {
      example: {
        status: 'success',
        message: 'Transbordo activado correctamente',
        data: {
          id: 1,
          nombre: 'TRANSBORDO ZONA CENTRO',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'El transbordo ya está activo',
  })
  @ApiResponse({
    status: 404,
    description: 'Transbordo no encontrado',
  })
  activar(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const idUser = req.user.userId;
    return this.transbordosService.activar(id, idUser);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Dar de baja un transbordo',
    description:
      'Da de baja un transbordo cambiando su estatus a 0 (eliminación lógica). ' +
      'El transbordo no se elimina físicamente, solo se marca como inactivo.',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID del transbordo', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Transbordo dado de baja exitosamente',
    schema: {
      example: {
        status: 'success',
        message: 'Transbordo dado de baja correctamente',
        data: {
          id: 1,
          nombre: 'TRANSBORDO ZONA CENTRO',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'El transbordo ya está inactivo',
  })
  @ApiResponse({
    status: 404,
    description: 'Transbordo no encontrado',
  })
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const idUser = req.user.userId;
    return this.transbordosService.remove(id, idUser);
  }
}
