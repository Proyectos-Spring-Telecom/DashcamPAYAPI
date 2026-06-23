import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import { TransaccionesService } from './transacciones.service';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';
import { CreateTransaccioneDebitoDto } from './dto/create-transaccione-debito.dto';
import { CreateTransaccioneRecargaDto } from './dto/create-transaccione-recarga.dto';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { GetTransaccioneDto } from './dto/get-transacciones.dto';
import { GetHistoricoRecargasDto } from './dto/get-historico-recargas.dto';

@ApiTags('Transacciones')
@Controller('transacciones')
@ApiBearerAuth('bearer-token')
export class TransaccionesController {
  constructor(private readonly transaccionesService: TransaccionesService) { }

  // ========================================
  // 🔹 POST ROUTES - Rutas específicas primero
  // ========================================

  @Post('debito')
  @UseGuards(JwtAuthGuard)
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

  @Post('recarga')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Crea una transacción de recarga',
    description: 'Crea una recarga de monedero. Si el método de pago es Tarjeta (3 o 4), primero procesa el pago con Netpay antes de hacer la recarga.',
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
        },
      },
      transferencia: {
        summary: 'Recarga con Transferencia (idMetodoPago: 2)',
        description: 'Recarga con transferencia bancaria, no requiere datos de Netpay',
        value: {
          idTipoTransaccion: 1,
          monto: 200.00,
          latitudInicial: 19.432608,
          longitudInicial: -99.133209,
          numeroSerieMonedero: 'MON-0001',
          numeroSerieValidador: 'DISP-0001',
          idMetodoPago: 2,
        },
      },
      tarjetaCredito: {
        summary: 'Recarga con Tarjeta de Crédito (idMetodoPago: 3)',
        description: 'Recarga con tarjeta de crédito. Primero procesa el pago en Netpay, luego hace la recarga.',
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
      tarjetaDebito: {
        summary: 'Recarga con Tarjeta de Débito (idMetodoPago: 4)',
        description: 'Recarga con tarjeta de débito. Primero procesa el pago en Netpay, luego hace la recarga.',
        value: {
          idTipoTransaccion: 1,
          monto: 300.50,
          latitudInicial: 19.432608,
          longitudInicial: -99.133209,
          numeroSerieMonedero: 'MON-0001',
          numeroSerieValidador: 'DISP-0001',
          idMetodoPago: 4,
          tokenCardNetPay: 'token_DxWw2P-7mFNUQKS2BjQoyyKuJ0eXm',
          referenceIdNetPay: '1234567890123',
          sessionId: '1721779181755',
          deviceFingerPrint: '1721779181755',
          idDireccion: 2,
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
    );
  }


  @Post('paginado')
  @UseGuards(JwtAuthGuard)
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
      getTransaccioneDto.fechaFin
    );
  }

  @Post('paginado/debito-qr')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Obtiene el listado de transacciones débito con QR paginado',
    description:
      'Obtiene el listado de transacciones débito que tienen esQR = true con paginación. Los filtros se aplican según el rol del usuario:\n' +
      '- SA (rol 1): Todas las transacciones débito QR\n' +
      '- ADMIN (rol 2): Sus transacciones y las de clientes hijos\n' +
      '- Operador (rol 3): Solo sus transacciones\n' +
      '- Pasajero (rol 9): Solo las transacciones de sus monederos',
  })
  @ApiResponse({ status: 200, description: 'Listado de transacciones débito QR obtenido exitosamente' })
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
      getTransaccioneDto.fechaFin
    );
  }

  @Post('paginado/recargas')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Obtiene el listado de recargas paginado',
    description:
      'Obtiene el listado de recargas con paginación. Los filtros se aplican según el rol del usuario:\n' +
      '- SA (rol 1): Todas las recargas\n' +
      '- ADMIN (rol 2): Sus recargas y las de clientes hijos\n' +
      '- Cajero (rol 3): Solo sus recargas\n' +
      '- Pasajero (rol 9): Solo las recargas de sus monederos',
  })
  @ApiResponse({ status: 200, description: 'Listado de recargas obtenido exitosamente' })
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
  @UseGuards(JwtAuthGuard)
  async findAllListTransacciones(@Request() req): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return await this.transaccionesService.findAllListTransacciones(cliente, rol);
  }

  @Get('RECARGA/:id')
  @UseGuards(JwtAuthGuard)
  findOneTransaccioneRecarga(@Param('id', ParseIntPipe) id: number) {
    return this.transaccionesService.findOneTransaccionRecarga(id);
  }

  @Get('DEBITO/:id')
  @UseGuards(JwtAuthGuard)
  findOneTransaccioneDebito(@Param('id', ParseIntPipe) id: number) {
    return this.transaccionesService.findOneTransaccionDebito(id);
  }

/*   @Get(':page/:limit')
  @UseGuards(JwtAuthGuard)
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
