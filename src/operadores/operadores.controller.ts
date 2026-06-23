import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Put,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { OperadoresService } from './operadores.service';
import { CreateOperadoreDto } from './dto/create-operadore.dto';
import { UpdateOperadoreDto } from './dto/update-operadore.dto';
import { UpdateOperadorStatusDto } from './dto/update-operadores-estatus.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('Operadores')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('operadores')
export class OperadoresController {
  constructor(private readonly operadoresService: OperadoresService) {}

  @Post()
  createOperador(
    @Body() createOperadoreDto: CreateOperadoreDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return this.operadoresService.createOperador(createOperadoreDto, +idUser);
  }

  @Get('list')
  findAllListOperador(@Request() req,): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.operadoresService.findAllListOperadores(+cliente, +rol,);
  }

  @Get('by-cliente/:idCliente')
  @ApiOperation({
    summary: 'Listar operadores por ID de cliente',
    description: 'Obtiene todos los operadores activos pertenecientes únicamente al cliente especificado (a través de la relación Operadores -> Usuarios -> Clientes).',
  })
  @ApiParam({
    name: 'idCliente',
    type: Number,
    description: 'ID del cliente del cual se desean obtener los operadores',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Operadores obtenidos exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  async findByCliente(
    @Param('idCliente', ParseIntPipe) idCliente: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.operadoresService.findByCliente(+idCliente, +idUser, +rol);
  }

  @Get(':page/:limit')
  findAllOperador(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.operadoresService.findAllOperadores(+cliente, +rol, page, limit);
  }

  @Get(':id')
  findOneOperador(@Param('id') id: string,@Request() req) {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.operadoresService.findOneOperador(+id, +cliente, + rol);
  }

  @Patch('estatus/:id')
  updateOperadorEstatus(
    @Param('id') id: string,
    @Request() req,
    @Body() updateOperadorStatusDto: UpdateOperadorStatusDto,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return this.operadoresService.updateOperadorEstatus(
      +id,
      +idUser,
      updateOperadorStatusDto,
    );
  }

  @Put(':id')
  updateOperador(
    @Param('id') id: string,
    @Request() req,
    @Body() updateOperadoreDto: UpdateOperadoreDto,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return this.operadoresService.updateOperador(
      +id,
      +idUser,
      updateOperadoreDto,
    );
  }

  @Delete(':id')
  removeOperador(@Param('id') id: string, @Request() req) {
    const idUser = req.user.userId;
    return this.operadoresService.removeOperador(+id, +idUser);
  }
}
