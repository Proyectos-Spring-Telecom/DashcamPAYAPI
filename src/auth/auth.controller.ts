import { Controller, Post, Body, HttpCode, Get, Query, UseGuards, Patch } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginAuthDto } from './dto/login-auth.dto';
import {  LoginAuthCodigoDto } from './dto/login-codigo.dto';
import { LoginAuthConfirmacionDto } from './dto/login-confirmacion.dto';
import { LoginAuthResetDto } from './dto/login-recuperacion.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { CreateAltaPasajaroDto } from './dto/create-pasajero.dto';
import { CodigoPasajeroAutenticacion } from './dto/login-autenticacion.dto';

@Controller('login')
export class AuthController {
  constructor(private readonly authService: AuthService) {}


  // ========================================
  // 🔹 POST ROUTES - Rutas específicas primero
  // ========================================

  @Post('usuario/recuperar/acceso')
  async email(@Body() loginAuthConfirmacionDto: LoginAuthConfirmacionDto) {
    return await this.authService.recuperarContrasena(loginAuthConfirmacionDto);
  }

  @Post('recuperar/confirmacion')
  async recuperacionConfirmacion(
    @Body() loginAuthConfirmacionDto: LoginAuthConfirmacionDto,
  ) {
    return await this.authService.recuperarConfirmacion(
      loginAuthConfirmacionDto,
    );
  }

  @Post('pasajero/registro')
  async createPasajero(@Body() createAltaPasajaroDto: CreateAltaPasajaroDto) {
    return this.authService.createPasajero(createAltaPasajaroDto);
  }

  @Post('operador/login')
  @HttpCode(200)
  async loginCodigo(@Body() loginAuthCodigoDto: LoginAuthCodigoDto) {
    return this.authService.singInCodigo(loginAuthCodigoDto);
  }

  @Post()
  @HttpCode(200)
  async login(@Body() loginAuthDto: LoginAuthDto) {
    return this.authService.signIn(loginAuthDto);
  }

  // ========================================
  // 🔹 PATCH ROUTES - Rutas específicas primero
  // ========================================

  @Post('cambiar/accesso')
  @UseGuards(JwtAuthGuard)
  async resetPassword(@Body() loginAuthResetDto: LoginAuthResetDto) {
    return await this.authService.resetPassword(loginAuthResetDto);
  }

  @Patch('verify')
  @HttpCode(200)
  async verifyUser(
    @Body() codigoPasajeroAutenticacion: CodigoPasajeroAutenticacion,
  ) {
    return await this.authService.verifyUser(codigoPasajeroAutenticacion);
  }
}
