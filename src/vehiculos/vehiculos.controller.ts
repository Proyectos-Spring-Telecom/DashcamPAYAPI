import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  Request,
  Put,
} from '@nestjs/common';
import { VehiculosService } from './vehiculos.service';
import { CreateVehiculoDto } from './dto/create-vehiculo.dto';
import { UpdateVehiculoDto } from './dto/update-vehiculo.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import { UpdateVehiculoEstatusDto } from './dto/update-vehiculos-estatus.dto';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Vehiculos')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('vehiculos')
export class VehiculosController {
  constructor(private readonly vehiculosService: VehiculosService) {}

  @Post()
  create(@Body() createVehiculoDto: CreateVehiculoDto, @Request() req) {
    const idUser = req.user.userId;
    return this.vehiculosService.create(createVehiculoDto, +idUser);
  }

  @Get('list')
  async findAllList(@Request() req): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return await this.vehiculosService.findAllList(+cliente, +rol);
  }

  @Get('by-cliente/:idCliente')
  @ApiOperation({
    summary: 'Listar vehículos por ID de cliente',
    description:
      'Obtiene todos los vehículos activos pertenecientes únicamente al cliente especificado.',
  })
  @ApiParam({
    name: 'idCliente',
    type: Number,
    description: 'ID del cliente del cual se desean obtener los vehículos',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Vehículos obtenidos exitosamente',
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
    return await this.vehiculosService.findByCliente(+idCliente, +idUser, +rol);
  }

  @Get('clientes/:id')
  async findAllValidadoresClientes(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const _rol = req.user.rol;
    return await this.vehiculosService.findAllListClientes(id, +cliente);
  }

  @Get(':page/:limit')
  async findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return await this.vehiculosService.findAll(page, limit, +cliente, +rol);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.vehiculosService.findOne(+id, +cliente, +rol);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Request() req,
    @Body() updateVehiculoDto: UpdateVehiculoDto,
  ) {
    const idUser = req.user.userId;
    return this.vehiculosService.update(+id, +idUser, updateVehiculoDto);
  }

  @Patch('estatus/:id')
  updateEstatus(
    @Param('id') id: string,
    @Body() UpdateVehiculoEstatusDto: UpdateVehiculoEstatusDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.vehiculosService.updateEstatus(
      +id,
      idUser,
      UpdateVehiculoEstatusDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const idUser = req.user.userId;
    return this.vehiculosService.remove(+id, +idUser);
  }
}
