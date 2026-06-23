import {
  Controller,
  Get,
  Body,
  UseGuards,
  Param,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import { BitacoraLoggerService } from './bitacora.service';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Bitácora')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('bitacora')
export class BitacoraController {
  constructor(private readonly bitacoraService: BitacoraLoggerService) {}

  @Get('list') //Obseleto
  async findAllListBitacora(@Request() req): Promise<ApiResponseCommon> {
    const _idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return await this.bitacoraService.findAllListBitacora(+cliente, +rol);
  }

  @Get(':page/:limit')
  findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const _idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.bitacoraService.findAll(+cliente, +rol, page, limit);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const _idUser = req.user.userId;
    const _cliente = req.user.cliente;
    const _rol = req.user.rol;
    return await this.bitacoraService.findOne(id);
  }
}
