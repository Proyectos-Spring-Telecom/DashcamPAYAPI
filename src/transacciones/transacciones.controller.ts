import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import { TransaccionesService } from './transacciones.service';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { TenantOwnershipGuard } from 'src/common/tenant/tenant-ownership.guard';
import { TenantResource } from 'src/common/tenant/tenant-resource.decorator';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';
import { CreateTransaccioneDebitoDto } from './dto/create-transaccione-debito.dto';
import { CreateTransaccioneRecargaDto } from './dto/create-transaccione-recarga.dto';
import { CreateReservaRecargaDto } from './dto/create-reserva-recarga.dto';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { GetTransaccioneDto } from './dto/get-transacciones.dto';
import { GetHistoricoRecargasDto } from './dto/get-historico-recargas.dto';
import { Roles } from 'src/guard/roles.decorator';

@ApiTags('Transacciones')
@Controller('transacciones')
@ApiBearerAuth('bearer-token')
@Roles(1, 2, 3, 9, 11)
export class TransaccionesController {
  constructor(private readonly transaccionesService: TransaccionesService) {}

  // ========================================
  // 🔹 POST ROUTES - Rutas específicas primero
  // ========================================

  @Post('debito')
  @Roles(1, 2, 3)
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  createTransaccionDebito(
    @Body() createTransaccioneDebitoDto: CreateTransaccioneDebitoDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return this.transaccionesService.createTransaccionDebitoPrueba(
      createTransaccioneDebitoDto,
      idUser,
      req.user.cliente,
    );
  }

  @Post('recarga/reserva')
  @Roles(1, 2, 3, 11)
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @ApiOperation({
    summary: 'Reserva una recarga antes del cobro presencial en TPV',
    description:
      'Valida monedero/tope/validador y crea ReservasRecarga EN_PROCESO con folio para SaleRequest. No cobra ni abona.',
  })
  @ApiResponse({ status: 200, description: 'Reserva creada o reutilizada' })
  @ApiBody({ type: CreateReservaRecargaDto })
  crearReservaRecarga(
    @Body() dto: CreateReservaRecargaDto,
    @Request() req,
  ) {
    return this.transaccionesService.crearReservaRecargaTerminal(
      dto,
      Number(req.user.userId),
      Number(req.user.rol),
      Number(req.user.cliente),
    );
  }

  @Post('recarga/reserva/:claveIdempotencia/cancelar')
  @Roles(1, 2, 3, 11)
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @ApiOperation({
    summary: 'Cancela una reserva de recarga TPV',
    description:
      'Usar si NetPay rechaza o el usuario cancela el cobro. Idempotente. 409 si ya COMPLETADA.',
  })
  @ApiParam({ name: 'claveIdempotencia' })
  cancelarReservaRecarga(
    @Param('claveIdempotencia') claveIdempotencia: string,
    @Request() req,
  ) {
    return this.transaccionesService.cancelarReservaRecarga(
      claveIdempotencia,
      Number(req.user.userId),
      Number(req.user.cliente),
    );
  }

  @Post('recarga')
  @Roles(1, 2, 3, 9, 11)
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @ApiOperation({
    summary: 'Crea una transacción de recarga',
    description:
      'Efectivo/transferencia, tarjeta e-commerce (3/4, cobra NetPay) o tarjeta presencial TPV (5 + pagoTerminal, no cobra).',
  })
  @ApiResponse({ status: 201, description: 'Recarga creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o pago rechazado' })
  @ApiBody({
    type: CreateTransaccioneRecargaDto,
    examples: {
      efectivo: {
        summary: 'Recarga con Efectivo (idMetodoPago: 1)',
        description: 'Recarga simple con efectivo, no requiere datos de Netpay',
        value: {
          idTipoTransaccion: 1,
          monto: 150.75,
          latitudInicial: 19.432608,
          longitudInicial: -99.133209,
          numeroSerieMonedero: 'MON-0001',
          numeroSerieValidador: 'DISP-0001',
          idMetodoPago: 1,
          claveIdempotencia: 'a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c',
        },
      },
      tarjetaTerminal: {
        summary: 'Recarga con tarjeta presencial TPV (idMetodoPago: 5)',
        description:
          'Tras SaleRequest aprobado. Requiere reserva previa y pagoTerminal. El API no cobra.',
        value: {
          idTipoTransaccion: 1,
          monto: 100.0,
          latitudInicial: 18.953314,
          longitudInicial: -99.235904,
          numeroSerieMonedero: 'MON-670484-5477',
          numeroSerieValidador: 'a22108bc025bea7f',
          idMetodoPago: 5,
          claveIdempotencia: '550e8400-e29b-41d4-a716-446655440000',
          pagoTerminal: {
            folio: 'R-000123456',
            orderId: 'order-xyz',
            transactionId: 'txn-xyz',
            authCode: '123456',
            rrn: 'rrn-1',
            montoCobrado: '100.00',
            naturalezaTarjeta: 'CREDITO',
            marca: 'VISA',
            bin: '411111',
            ultimos4: '1234',
          },
        },
      },
      tarjetaCredito: {
        summary: 'Recarga con Tarjeta de Crédito e-commerce (idMetodoPago: 3)',
        description:
          'Recarga con tarjeta de crédito. Primero procesa el pago en Netpay, luego hace la recarga.',
        value: {
          idTipoTransaccion: 1,
          monto: 150.75,
          latitudInicial: 19.432608,
          longitudInicial: -99.133209,
          numeroSerieMonedero: 'MON-0001',
          numeroSerieValidador: 'DISP-0001',
          idMetodoPago: 3,
          tokenCardNetPay: 'token_vzhdS4W-6IAE6KlfGLUXmDH8VIDMFs',
          referenceIdNetPay: '1222337263222',
          sessionId: '1721779181755',
          deviceFingerPrint: '1721779181755',
          idDireccion: 1,
          deviceInformation: {
            deviceChannel: 'Browser',
            httpBrowserColorDepth: '24',
            httpBrowserJavaEnabled: 'FALSE',
            httpBrowserJavaScriptEnabled: 'TRUE',
            httpBrowserLanguage: 'es',
            httpBrowserScreenHeight: '687',
            httpBrowserScreenWidth: '1718',
            httpBrowserTimeDifference: '360',
          },
        },
      },
    },
  })
  createTransaccionRecarga(
    @Body() createTransaccioneRecargaDto: CreateTransaccioneRecargaDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return this.transaccionesService.createTransaccionRecarga(
      createTransaccioneRecargaDto,
      idUser,
      Number(req.user.rol),
      Number(req.user.cliente),
    );
  }

  @Post('paginado')
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  async paginadoTransaccion(
    @Body() getTransaccioneDto: GetTransaccioneDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    const email = req.user.email;
    const cliente = req.user.cliente;
    const rol = req.user.rol;

    return await this.transaccionesService.paginado(
      +idUser,
      email,
      +cliente,
      +rol,
      getTransaccioneDto.page,
      getTransaccioneDto.limit,
      getTransaccioneDto.fechaInicio,
      getTransaccioneDto.fechaFin,
    );
  }

  @Post('paginado/debito-qr')
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @ApiOperation({
    summary: 'Obtiene el listado de transacciones débito con QR paginado',
    description:
      'Obtiene el listado de transacciones débito que tienen esQR = true con paginación. Los filtros se aplican según el rol del usuario:\n' +
      '- SA (rol 1): Todas las transacciones débito QR\n' +
      '- ADMIN (rol 2): Sus transacciones y las de clientes hijos\n' +
      '- Operador (rol 3): Solo sus transacciones\n' +
      '- Pasajero (rol 9): Solo las transacciones de sus monederos',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de transacciones débito QR obtenido exitosamente',
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async paginadoDebitoQR(
    @Body() getTransaccioneDto: GetTransaccioneDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    const email = req.user.email;
    const cliente = req.user.cliente;
    const rol = req.user.rol;

    return await this.transaccionesService.paginadoDebitoQR(
      +idUser,
      email,
      +cliente,
      +rol,
      getTransaccioneDto.page,
      getTransaccioneDto.limit,
      getTransaccioneDto.fechaInicio,
      getTransaccioneDto.fechaFin,
    );
  }

  @Post('paginado/recargas')
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @ApiOperation({
    summary: 'Obtiene el listado de recargas paginado',
    description:
      'Obtiene el listado de recargas con paginación. Los filtros se aplican según el rol del usuario:\n' +
      '- SA (rol 1): Todas las recargas\n' +
      '- ADMIN (rol 2): Sus recargas y las de clientes hijos\n' +
      '- Cajero (rol 3): Solo sus recargas\n' +
      '- Pasajero (rol 9): Solo las recargas de sus monederos',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de recargas obtenido exitosamente',
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async getRecargas(
    @Body() getHistoricoRecargasDto: GetHistoricoRecargasDto,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const email = req.user.email;
    const cliente = req.user.cliente;
    const rol = req.user.rol;

    return await this.transaccionesService.getHistoricoRecargasPaginado(
      +idUser,
      email,
      +cliente,
      +rol,
      getHistoricoRecargasDto,
    );
  }

  // ========================================
  // 🔹 GET ROUTES - Rutas específicas primero
  // ========================================

  @Get('list')
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  async findAllListTransacciones(@Request() req): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return await this.transaccionesService.findAllListTransacciones(
      cliente,
      rol,
    );
  }

  @Get('RECARGA/:id')
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @TenantResource('transaccionRecarga')
  findOneTransaccioneRecarga(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ) {
    return this.transaccionesService.findOneTransaccionRecarga(
      id,
      +req.user.cliente,
      +req.user.rol,
    );
  }

  @Get('DEBITO/:id')
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @TenantResource('transaccionDebito')
  // H-66: acepta Id numérico o PublicId (ULID); por eso no usa ParseIntPipe.
  findOneTransaccioneDebito(@Param('id') id: string, @Request() req) {
    return this.transaccionesService.findOneTransaccionDebito(
      id,
      +req.user.cliente,
      +req.user.rol,
    );
  }

  /*   @Get(':page/:limit')
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  async findAllTransacciones(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const email = req.user.email;
    const cliente = req.user.cliente;
    const rol = req.user.rol;

    return await this.transaccionesService.findAllTransacciones(
      +idUser,
      email,
      +cliente,
      +rol,
      page,
      limit
    );
  } */
}
