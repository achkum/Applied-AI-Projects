import { Controller, Get } from '@nestjs/common';

@Controller()
export class OpsController {
  @Get('healthz')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('readyz')
  ready(): { status: 'ready' } {
    return { status: 'ready' };
  }

  @Get('v1/version')
  version(): { version: string } {
    return {
      version:
        process.env.npm_package_version ??
        process.env.npm_package_version ??
        '0.0.0',
    };
  }
}
