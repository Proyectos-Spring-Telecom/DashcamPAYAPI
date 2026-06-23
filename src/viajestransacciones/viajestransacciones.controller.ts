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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Viajes transacciones')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
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
  findOneViajes(@Param('id', ParseIntPipe) id: number) {
    return this.viajestransaccionesService.findOneViajes(+id);
  }

  @Get('transacciones/:id')
  findOne(@Param('id') id: string) {
    return this.viajestransaccionesService.findOneTransacciones(+id);
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
