import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { CatcombustibleService } from './catcombustible.service';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { Roles } from 'src/guard/roles.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Catálogo combustible')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Roles(1, 2, 3, 11)
@Controller('catcombustible')
export class CatcombustibleController {
  constructor(private readonly catcombustibleService: CatcombustibleService) {}

  @Get('list')
  findAllList(@Request() _req) {
    return this.catcombustibleService.findAllList();
  }
}
