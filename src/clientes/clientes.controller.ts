import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { UpdateClienteEstatusDto } from './dto/update-clientes-estatus.dto';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('Clientes')
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  // ========================================
  // 🔹 ENDPOINT PÚBLICO - SIN AUTENTICACIÓN
  // ========================================
  @Get('public')
  @ApiOperation({
    summary: 'Obtener todos los clientes activos (público)',
    description:
      'Lista todos los clientes con estatus activo (1). No requiere autenticación.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de clientes obtenida exitosamente',
  })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async getClientesPublicos(): Promise<ApiResponseCommon> {
    return this.clientesService.getClientesPublicos();
  }

  // ========================================
  // 🔹 ENDPOINTS PRIVADOS - CON AUTENTICACIÓN
  // ========================================
  @ApiBearerAuth('bearer-token')
  @UseGuards(JwtAuthGuard)
  //Crear cliente
  @Post()
  async createCliente(
    @Body() createClienteDto: CreateClienteDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.clientesService.createCliente(createClienteDto, idUser);
  }
  //Obtener todos los clientes
  @Get('list')
  @UseGuards(JwtAuthGuard)
  async getAllListClientes(@Request() req): Promise<ApiResponseCommon> {
    console.log(req.user, 'REQ');
    if (!req.user) {
      throw new Error('Usuario no autenticado');
    }
    const cliente = req.user?.cliente ?? null;
    const idUser = req.user?.userId;
    const rol = req.user?.rol;
    if (!idUser || !rol) {
      throw new Error('Datos de usuario incompletos');
    }
    return this.clientesService.getAllListClientes(
      +idUser,
      cliente ? +cliente : null,
      +rol,
    );
  }

  //Obtener todos los clientes
  @Get('list/:cliente')
  @UseGuards(JwtAuthGuard)
  async getAllListClientesId(
    @Param('cliente', ParseIntPipe) cliente: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.clientesService.getAllListClientesId(+idUser, +cliente, +rol);
  }

  //Obtener todos los clientes con paginado
  @Get(':page/:limit')
  @UseGuards(JwtAuthGuard)
  getAllClientes(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.clientesService.getAllClientes(
      +idUser,
      +cliente,
      +rol,
      page,
      limit,
    );
  }

  //Obtener solo un cliente
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  getOneCliente(@Param('id') id: string, @Request() req) {
    const _cliente = req.user.cliente;
    const _idUser = req.user.userId;
    const _rol = req.user.rol;
    return this.clientesService.getOneCliente(+id);
  }

  //Actualizar el estatus del cliente
  @Patch('estatus/:id')
  @UseGuards(JwtAuthGuard)
  updateEstatusClientes(
    @Param('id') id: string,
    @Request() req,
    @Body() updateClienteEstatusDto: UpdateClienteEstatusDto,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    return this.clientesService.updateClienteStatus(
      +id,
      idUser,
      +cliente,
      updateClienteEstatusDto,
    );
  }

  //Actualizar un cliente
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateCliente(
    @Param('id') id: string,
    @Request() req,
    @Body() updateClienteDto: UpdateClienteDto,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.clientesService.updateCliente(
      +id,
      idUser,
      updateClienteDto,
    );
  }

  //Eliminar Cliente
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async removeClientes(
    @Param('id') id: string,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    return await this.clientesService.removeCliente(+id, idUser, +cliente);
  }
}
