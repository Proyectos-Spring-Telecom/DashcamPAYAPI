import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ViajesconteosService } from './viajesconteos.service';
import { CreateViajesconteoDto } from './dto/create-viajesconteo.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('viajesconteos')
export class ViajesconteosController {
  constructor(private readonly viajesconteosService: ViajesconteosService) {}

  // ========================================
  // 🔹 POST ROUTES
  // ========================================

  @Post()
  create(@Body() createViajesconteoDto: CreateViajesconteoDto, @Request() req) {
    const idUser = req.user.userId;
    return this.viajesconteosService.create(+idUser, createViajesconteoDto);
  }

  // ========================================
  // 🔹 GET ROUTES - Rutas específicas primero
  // ========================================

  @Get('list')
  findAllList() {
    return this.viajesconteosService.findAllList();
  }

  @Get('conteos/:id')
  findOneConteos(@Param('id', ParseIntPipe) id: number) {
    return this.viajesconteosService.findOneConteos(id);
  }

  @Get('viajes/:id')
  findOneViajes(@Param('id', ParseIntPipe) id: number) {
    return this.viajesconteosService.findOneViajes(id);
  }

  @Get(':page/:limit')
  findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ) {
    return this.viajesconteosService.findAll(page, limit);
  }
}
