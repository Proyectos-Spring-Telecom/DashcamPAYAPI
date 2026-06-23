import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { CatcombustibleService } from './catcombustible.service';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Catálogo combustible')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('catcombustible')
export class CatcombustibleController {
  constructor(private readonly catcombustibleService: CatcombustibleService) {}

  @Get('list')
  findAllList(@Request() req) {
    return this.catcombustibleService.findAllList();
  }
}
