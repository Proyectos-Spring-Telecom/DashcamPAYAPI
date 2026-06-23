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
  UseInterceptors,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { PasajerosService } from './pasajeros.service';
import { CreatePasajeroDto } from './dto/create-pasajero.dto';
import { UpdatePasajeroDto } from './dto/update-pasajero.dto';
import { UpdatePasajeroEstatusDto } from './dto/update-pasajeros-estatus.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import { UpdatePasajeroEstadoSolicitudDto } from './dto/update-pasajeros-estado-solicitud.dto';
import { UpdatePasajeroCustomerIdDto } from './dto/update-pasajero-customer-id.dto';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';

@ApiTags('Pasajeros')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('pasajeros')
export class PasajerosController {
  constructor(private readonly pasajerosService: PasajerosService) {}

  // ========================================
  // 🔹 POST ROUTES
  // ========================================

  @Post()
  @UseInterceptors(
    FileInterceptor('documentacion', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // máximo 10 MB
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
        if (file && !allowedTypes.includes(file.mimetype)) {
          return cb(
            new Error('Solo se permiten PNG, JPG, JPEG o PDF'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    type: CreatePasajeroDto,
    description: 'Datos del pasajero a crear (FormData). El campo documentacion debe ser un archivo.',
  })
  createPasajero(
    @Body() createPasajeroDto: CreatePasajeroDto,
    @UploadedFile() documentacionFile: Express.Multer.File,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    return this.pasajerosService.createPasajeros(createPasajeroDto, idUser, +cliente, documentacionFile);
  }

  // ========================================
  // 🔹 GET ROUTES - Rutas específicas primero
  // ========================================

  @Get('list')
  findAllListPasajero(@Request() req): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.pasajerosService.findAllListPasajeros(+cliente, +rol);
  }

  @Get('wallet')
  @ApiOperation({
    summary: 'Obtener información principal del wallet del pasajero',
    description: 'Retorna la información principal del wallet incluyendo saldos, transacciones y estadísticas mensuales de gastos y recargas. El parámetro anio es opcional, si no se proporciona se usa el año actual.',
  })
  @ApiQuery({
    name: 'anio',
    required: false,
    type: Number,
    description: 'Año para filtrar los arrays de gastosYRecargasPorMes y gastosPorMes. Si no se proporciona, se usa el año actual.',
    example: 2025,
  })
  findMainPasajero(
    @Request() req,
    @Query('anio') anio?: string,
  ) {
    const idUsuario = req.user.userId;
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    const anioFiltro = anio ? parseInt(anio, 10) : undefined;
    return this.pasajerosService.obtenerMainPasajero(idUsuario, idUser, cliente, rol, anioFiltro);
  }

  @Get(':page/:limit')
  findAllPasajero(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.pasajerosService.findAllPasajeros(+cliente, +rol, page, limit);
  }

  @Get(':id')
  findOnePasajero(@Param('id', ParseIntPipe) id: number) {
    return this.pasajerosService.findOnePasajero(id);
  }

  // ========================================
  // 🔹 PUT ROUTES - Rutas específicas primero
  // ========================================

  @Put(':id')
  updatePasajero(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePasajeroDto: UpdatePasajeroDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.pasajerosService.updatePasajero(id, idUser, updatePasajeroDto);
  }

  // ========================================
  // 🔹 PATCH ROUTES - Rutas específicas primero
  // ========================================
  @Patch('estado/solicitud/:id')
  updatePasajeroEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePasajeroEstadoSolicitudDto: UpdatePasajeroEstadoSolicitudDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.pasajerosService.updatePasajeroEstadoSolicitud(
      id,
      updatePasajeroEstadoSolicitudDto,
      idUser,
    );
  }

  @Patch('estatus/:id')
  updatePasajeroEstatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePasajeroEstatusDto: UpdatePasajeroEstatusDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.pasajerosService.updatePasajeroEstatus(
      id,
      updatePasajeroEstatusDto,
      idUser,
    );
  }

  @Patch('customer-netpay/:id')
  @ApiOperation({ 
    summary: 'Actualiza el CustomerIdNetPay de un pasajero',
    description: 'Actualiza el CustomerIdNetPay de Netpay asociado a un pasajero específico.',
  })
  @ApiResponse({ status: 200, description: 'CustomerIdNetPay actualizado exitosamente' })
  @ApiResponse({ status: 404, description: 'Pasajero no encontrado' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  updatePasajeroCustomerId(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePasajeroCustomerIdDto: UpdatePasajeroCustomerIdDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.pasajerosService.updatePasajeroCustomerId(
      id,
      updatePasajeroCustomerIdDto,
      idUser,
    );
  }

  // ========================================
  // 🔹 DELETE ROUTES
  // ========================================

  @Delete(':id')
  removePasajero(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const idUser = req.user.userId;
    return this.pasajerosService.removePasajero(id, idUser);
  }
}
