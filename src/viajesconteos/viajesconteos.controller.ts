import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ViajesconteosService } from './viajesconteos.service';
import { CreateViajesconteoDto } from './dto/create-viajesconteo.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { Roles } from 'src/guard/roles.decorator';
import { TenantOwnershipGuard } from 'src/common/tenant/tenant-ownership.guard';
import { TenantResource } from 'src/common/tenant/tenant-resource.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Viajes conteos')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard, TenantOwnershipGuard)
@Roles(1, 2, 3, 11)
@Controller('viajesconteos')
@TenantResource('viaje')
export class ViajesconteosController {
  constructor(private readonly viajesconteosService: ViajesconteosService) {}

  // ========================================
  // 🔹 POST ROUTES
  // ========================================

  @Post()
  create(@Body() createViajesconteoDto: CreateViajesconteoDto, @Request() req) {
    const idUser = req.user.userId;
    return this.viajesconteosService.create(
      +idUser,
      createViajesconteoDto,
      +req.user.cliente,
      +req.user.rol,
    );
  }

  // ========================================
  // 🔹 GET ROUTES - Rutas específicas primero
  // ========================================

  @Get('list')
  findAllList(@Request() req) {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    const idUser = req.user.userId;
    return this.viajesconteosService.findAllList(+idUser, +cliente, +rol);
  }

  @Get('viajes/:id')
  findOneViajes(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.viajesconteosService.findOneViajes(
      id,
      +req.user.cliente,
      +req.user.rol,
    );
  }

  @Get(':page/:limit')
  findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    const idUser = req.user.userId;
    return this.viajesconteosService.findAll(
      +idUser,
      +cliente,
      +rol,
      page,
      limit,
    );
  }
}
