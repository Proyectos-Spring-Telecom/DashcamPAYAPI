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
  Query,
} from '@nestjs/common';
import { MonederosService } from './monederos.service';
import { CreateMonederoDto } from './dto/create-monedero.dto';
import { UpdateMonederoDto } from './dto/update-monedero.dto';
import { UpdateMonederoEstatusDto } from './dto/update-monedero-estatus.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import { UpdateMonederoCatPasajeroDto } from './dto/update-monedero-catpasajero.dto';
import { UpdateMonederoExtravioDto } from './dto/update-monedero-extravio.dto';
import { GenerarQRDto } from './dto/generar-qr.dto';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Monederos')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('monederos')
export class MonederosController {
  constructor(private readonly monederosService: MonederosService) {}

  // ========================================
  // 🔹 POST ROUTES
  // ========================================

  @Post('reporte/extravio')
  reportarExtravio(
    @Body() updateMonederoExtravioDto: UpdateMonederoExtravioDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.monederosService.reportarExtravio(
      +idUser,
      updateMonederoExtravioDto,
    );
  }

  @Post()
  createMonedero(@Body() createMonederoDto: CreateMonederoDto, @Request() req) {
    const idUser = req.user.userId;
    return this.monederosService.createMonedero(createMonederoDto, idUser);
  }

  // ========================================
  // 🔹 GET ROUTES - Rutas específicas primero
  // ========================================

  @Post('qr/saldo')
  @ApiOperation({
    summary: 'Generar QR con saldo del monedero',
    description:
      'Genera un código QR que contiene el saldo del monedero y el número de pasajes especificado',
  })
  @ApiResponse({
    status: 201,
    description: 'QR generado correctamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Pasajero o monedero no encontrado',
  })
  generarQRConSaldo(@Body() generarQRDto: GenerarQRDto, @Request() req) {
    const idUsuario = req.user.userId;
    return this.monederosService.generarQRConSaldo(
      idUsuario,
      generarQRDto.numeroPasajes,
    );
  }

  @Get('list')
  findAllListMonederos(@Request() req): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const email = req.user.email;
    const cliente = req.user.cliente;
    const rol = Number(req.user.rol);
    return this.monederosService.findAllListMonederos(
      idUser,
      email,
      cliente,
      rol,
    );
  }

  @Get('numero/serie/:numeroSerie')
  findOneMonederoBySerie(
    @Param('numeroSerie') numeroSerie: string,
    @Request() _req,
  ) {
    return this.monederosService.findOneMonederoBySerie(numeroSerie);
  }

  @Get('paginados/activos')
  @ApiOperation({
    summary: 'Obtener monederos activos paginados',
    description:
      'Obtiene una lista paginada de monederos con estatus activo (estatus = 1). El resultado se filtra según el rol del usuario.',
  })
  @ApiQuery({
    name: 'page',
    type: Number,
    description: 'Número de página',
    example: 1,
    required: true,
  })
  @ApiQuery({
    name: 'limit',
    type: Number,
    description: 'Cantidad de registros por página',
    example: 20,
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de monederos activos obtenida exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findAllMonederosActivos(
    @Query('page', ParseIntPipe) page: number,
    @Query('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const email = req.user.email;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.monederosService.findAllPagMonederosActivos(
      +idUser,
      email,
      +cliente,
      +rol,
      page,
      limit,
    );
  }

  @Get(':page/:limit')
  findAllMonederos(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const email = req.user.email;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.monederosService.findAllPagMonederos(
      +idUser,
      email,
      +cliente,
      +rol,
      page,
      limit,
    );
  }

  @Get(':id')
  findOneMonedero(@Param('id', ParseIntPipe) id: number, @Request() _req) {
    return this.monederosService.findOneMonedero(id);
  }

  // ========================================
  // 🔹 PUT ROUTES - Rutas específicas primero
  // ========================================

  @Put(':id')
  updateMonedero(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMonederoDto: UpdateMonederoDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.monederosService.updateMonedero(id, idUser, updateMonederoDto);
  }

  // ========================================
  // 🔹 PATCH ROUTES - Rutas específicas primero
  // ========================================

  @Patch('tipo/pasajero/:id')
  updateMonederoTipoPasajero(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMonederoCatPasajeroDto: UpdateMonederoCatPasajeroDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.monederosService.updateMonederoTipoPasajero(
      id,
      idUser,
      updateMonederoCatPasajeroDto,
    );
  }

  @Patch('estatus/:id')
  updateMonederoEstatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMonederoEstatusDto: UpdateMonederoEstatusDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.monederosService.updateMonederoEstatus(
      id,
      idUser,
      updateMonederoEstatusDto,
    );
  }

  // ========================================
  // 🔹 DELETE ROUTES
  // ========================================

  @Delete(':id')
  removeMonedero(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const idUser = req.user.userId;
    return this.monederosService.removeMonedero(id, idUser);
  }
}
