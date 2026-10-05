import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  UseGuards,
  Patch,
  Request,
  Headers,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginAuthDto } from './dto/login-auth.dto';
import { LoginAuthPinDto } from './dto/login-pin.dto';
import { LoginAuthConfirmacionDto } from './dto/login-confirmacion.dto';
import { LoginAuthResetDto } from './dto/login-recuperacion.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { CodigoPasajeroAutenticacion } from './dto/login-autenticacion.dto';
import { CreateAltaPasajaroDto } from './dto/create-pasajero.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  AuthTokenPairResponseDto,
  LogoutResponseDto,
} from './dto/auth-token-response.dto';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from 'src/guard/public.decorator';
import { Roles, ROLES_CONOCIDOS } from 'src/guard/roles.decorator';

@ApiTags('Autenticación')
@ApiBearerAuth('bearer-token')
@Controller('login')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ========================================
  // 🔹 POST ROUTES - Rutas específicas primero
  // ========================================

  @Public()
  @Post('usuario/recuperar/acceso')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async email(@Body() loginAuthConfirmacionDto: LoginAuthConfirmacionDto) {
    return await this.authService.recuperarContrasena(loginAuthConfirmacionDto);
  }

  @Public()
  @Post('recuperar/confirmacion')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async recuperacionConfirmacion(
    @Body() loginAuthConfirmacionDto: LoginAuthConfirmacionDto,
  ) {
    return await this.authService.recuperarConfirmacion(
      loginAuthConfirmacionDto,
    );
  }

  @Public()
  @Post('pasajero/registro')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async createPasajero(@Body() createAltaPasajaroDto: CreateAltaPasajaroDto) {
    return this.authService.createPasajero(createAltaPasajaroDto);
  }

  @Public()
  @Post('operador/login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Login operador por PIN (validador)',
    description:
      'Devuelve solo token y refreshToken. Perfil completo en GET /login/me.',
  })
  @ApiOkResponse({ type: AuthTokenPairResponseDto })
  async loginPin(@Body() loginAuthPinDto: LoginAuthPinDto) {
    return this.authService.singInPin(loginAuthPinDto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @Roles(...ROLES_CONOCIDOS)
  @ApiOperation({
    summary: 'Perfil del usuario autenticado',
    description:
      'Devuelve la información de sesión (permisos, cliente, operador, etc.). Requiere Bearer token.',
  })
  async me(@Request() req: { user: { userId: number } }) {
    return this.authService.getMe(req.user.userId);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Renovar access token (rotación de refresh token)',
    description:
      'Intercambia un refresh token válido por un nuevo par access + refresh. ' +
      'El refresh token anterior queda revocado.',
  })
  @ApiOkResponse({ type: AuthTokenPairResponseDto })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cerrar sesión (revocar refresh token)',
    description: 'Revoca el refresh token enviado en el body.',
  })
  @ApiOkResponse({ type: LogoutResponseDto })
  async logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Public()
  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Login web (correo y contraseña)',
    description:
      'Devuelve solo token y refreshToken. Perfil completo en GET /login/me.',
  })
  @ApiOkResponse({ type: AuthTokenPairResponseDto })
  async login(@Body() loginAuthDto: LoginAuthDto) {
    return this.authService.signIn(loginAuthDto);
  }

  // ========================================
  // 🔹 PATCH ROUTES - Rutas específicas primero
  // ========================================

  @Public()
  @Post('cambiar/accesso')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPassword(
    @Body() loginAuthResetDto: LoginAuthResetDto,
    @Headers('authorization') authorization?: string,
  ) {
    return await this.authService.resetPassword(
      loginAuthResetDto,
      authorization,
    );
  }

  @Public()
  @Patch('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verifyUser(
    @Body() codigoPasajeroAutenticacion: CodigoPasajeroAutenticacion,
  ) {
    return await this.authService.verifyUser(codigoPasajeroAutenticacion);
  }
}
