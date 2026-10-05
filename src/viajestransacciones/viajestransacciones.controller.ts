import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ViajestransaccionesService } from './viajestransacciones.service';
import { CreateViajestransaccioneDto } from './dto/create-viajestransaccione.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { Roles } from 'src/guard/roles.decorator';
import { TenantOwnershipGuard } from 'src/common/tenant/tenant-ownership.guard';
import { TenantResource } from 'src/common/tenant/tenant-resource.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Viajes transacciones')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard, TenantOwnershipGuard)
@Roles(1, 2, 3, 11)
@Controller('viajestransacciones')
export class ViajestransaccionesController {
  constructor(
    private readonly viajestransaccionesService: ViajestransaccionesService,
  ) {}

  @Post()
  create(
    @Body() createViajestransaccioneDto: CreateViajestransaccioneDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.viajestransaccionesService.create(
      +idUser,
      createViajestransaccioneDto,
      +req.user.cliente,
      +req.user.rol,
    );
  }

  @Get('list')
  findAllList(@Request() req) {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    const idUser = req.user.userId;
    return this.viajestransaccionesService.findAllList(+idUser, +cliente, +rol);
  }

  @Get('viajes/:id')
  @TenantResource('viaje')
  findOneViajes(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.viajestransaccionesService.findOneViajes(
      +id,
      Number(req.user.cliente),
      Number(req.user.rol),
    );
  }

  @Get('transacciones/:id')
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.viajestransaccionesService.findOneTransacciones(
      +id,
      Number(req.user.cliente),
      Number(req.user.rol),
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
    return this.viajestransaccionesService.findAll(
      +idUser,
      +cliente,
      +rol,
      page,
      limit,
    );
  }
}
