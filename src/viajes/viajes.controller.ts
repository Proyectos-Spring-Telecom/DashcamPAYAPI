import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ViajesService } from './viajes.service';
import { CreateViajeDto } from './dto/create-viaje.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('viajes')
export class ViajesController {
  constructor(private readonly viajesService: ViajesService) {}

  @Post()
  create(@Body() createViajeDto: CreateViajeDto, @Request() req) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.viajesService.create(+idUser,  createViajeDto);
  }

  @Get('list')
  findAllList(@Request() req) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.viajesService.findAllList(+cliente, +cliente,);
  }

  @Get(':page/:limit')
  findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req
  ) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.viajesService.findAll(+cliente, +rol, page,limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.viajesService.findOne(+id, +cliente, +rol,);
  }

}
