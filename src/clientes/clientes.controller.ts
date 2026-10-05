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
import { TenantOwnershipGuard } from 'src/common/tenant/tenant-ownership.guard';
import { TenantResource } from 'src/common/tenant/tenant-resource.decorator';
import { UpdateClienteEstatusDto } from './dto/update-clientes-estatus.dto';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from 'src/guard/public.decorator';
import { Roles } from 'src/guard/roles.decorator';

@ApiTags('Clientes')
@Roles(1, 2, 3, 11)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  // ========================================
  // 🔹 ENDPOINT PÚBLICO - SIN AUTENTICACIÓN
  // ========================================
  @Public()
  @Get('public')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
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
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  //Crear cliente
  @Post()
  @Roles(1, 2)
  async createCliente(
    @Body() createClienteDto: CreateClienteDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.clientesService.createCliente(
      createClienteDto,
      idUser,
      +req.user.cliente,
      +req.user.rol,
    );
  }
  //Obtener todos los clientes
  @Get('list')
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  async getAllListClientes(@Request() req): Promise<ApiResponseCommon> {
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
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @TenantResource({ resolver: 'cliente', idParam: 'cliente' })
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
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
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
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @TenantResource('cliente')
  getOneCliente(@Param('id') id: string, @Request() req) {
    return this.clientesService.getOneCliente(
      +id,
      +req.user.cliente,
      +req.user.rol,
    );
  }

  //Actualizar el estatus del cliente
  @Patch('estatus/:id')
  @Roles(1, 2)
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @TenantResource('cliente')
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
      +req.user.rol,
    );
  }

  //Actualizar un cliente
  @Put(':id')
  @Roles(1, 2)
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @TenantResource('cliente')
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
      +req.user.cliente,
      +req.user.rol,
    );
  }

  //Eliminar Cliente
  @Delete(':id')
  @Roles(1, 2)
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @TenantResource('cliente')
  async removeClientes(
    @Param('id') id: string,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    return await this.clientesService.removeCliente(
      +id,
      idUser,
      +cliente,
      +req.user.rol,
    );
  }
}
