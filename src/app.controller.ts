import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';
import { Public } from './guard/public.decorator';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

@Controller()
// H-57: los health checks no deben consumir la cuota del throttler global.
@SkipThrottle()
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
