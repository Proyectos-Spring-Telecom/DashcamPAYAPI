import { Controller, Get, Post, Body, Patch, Param, Delete, Put, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { PasajerosService } from './pasajeros.service';
import { CreatePasajeroDto } from './dto/create-pasajero.dto';
import { UpdatePasajeroDto } from './dto/update-pasajero.dto';
import { UpdatePasajeroEstatusDto } from './dto/update-pasajeros-estatus.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiResponseCommon } from 'src/common/ApiResponse';

@UseGuards(JwtAuthGuard)
@Controller('pasajeros')
export class PasajerosController {
  constructor(private readonly pasajerosService: PasajerosService) {}
  // ========================================
  // 🔹 POST ROUTES
  // ========================================

  @Post()
  createPasajero(@Body() createPasajeroDto: CreatePasajeroDto, @Request() req) {
    const idUser = req.user.userId;
    return this.pasajerosService.createPasajeros(createPasajeroDto, idUser);
  }

  // ========================================
  // 🔹 GET ROUTES - Rutas específicas primero
  // ========================================

  @Get('list')
  findAllListPasajero(@Request() req,): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.pasajerosService.findAllListPasajeros(+cliente, +rol);
  }

  @Get('main/:idUsuario')
  findMainPasajero(
    @Param('idUsuario', ParseIntPipe) id: number,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.pasajerosService.obtenerMainPasajero(id, idUser, cliente, rol);
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

  // ========================================
  // 🔹 DELETE ROUTES
  // ========================================

  @Delete(':id')
  removePasajero(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const idUser = req.user.userId;
    return this.pasajerosService.removePasajero(id, idUser);
  }

}
