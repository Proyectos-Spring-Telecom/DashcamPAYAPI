import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ViajestransaccionesService } from './viajestransacciones.service';
import { CreateViajestransaccioneDto } from './dto/create-viajestransaccione.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';

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
  findAllList() {
    return this.viajestransaccionesService.findAllList();
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
    return this.viajestransaccionesService.findAll(page, limit);
  }
}
