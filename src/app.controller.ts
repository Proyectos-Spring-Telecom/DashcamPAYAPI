import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './guard/public.decorator';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health/live')
  @ApiExcludeEndpoint()
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get('health/ready')
  @ApiExcludeEndpoint()
  ready() {
    return this.appService.ready();
  }
}
