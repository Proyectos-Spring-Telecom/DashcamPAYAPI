import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import { TransaccionesService } from './transacciones.service';
import { CreateTransaccioneDto } from './dto/create-transaccione.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';

@UseGuards(JwtAuthGuard)
@Controller('transacciones')
export class TransaccionesController {
  constructor(private readonly transaccionesService: TransaccionesService) {}

  @Post()
  createTransaccion(
    @Body() createTransaccioneDto: CreateTransaccioneDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.transaccionesService.createTransaccion(
      createTransaccioneDto,
      +idUser,
    );
  }

  @Get(':page/:limit')
  async findAllTransacciones(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const email = req.user.email;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return await this.transaccionesService.findAllTransacciones(+idUser, email, +cliente, +rol, page, limit);
  }

  @Get('list')
  async findAllListTransacciones(): Promise<ApiResponseCommon> {
    return await this.transaccionesService.findAllListTransacciones();
  }

  @Get(':id')
  findOneTransaccione(@Param('id') id: string) {
    return this.transaccionesService.findOneTransaccion(+id);
  }
}
