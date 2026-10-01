import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  Headers,
  Body,
} from '@nestjs/common';
import type { Response } from 'express';
import { DataRightsService } from './data-rights.service';
import { DeleteAccountSchema } from './data-rights.dto';

@Controller('v1/data-rights')
export class DataRightsController {
  constructor(private readonly service: DataRightsService) {}

  // ─── POST /v1/data-rights/export (AC1) ───────────────────────────────────

  @Post('export')
  @HttpCode(202)
  async requestExport(@Headers('x-caller-id') callerId: string) {
    if (!callerId) throw new BadRequestException('X-Caller-Id header required.');
    return this.service.requestExport(callerId);
  }

  // ─── GET /v1/data-rights/export/:token (AC1, AC3) ────────────────────────

  @Get('export/:token')
  getExport(
    @Param('token') token: string,
    @Res() res: Response,
  ) {
    const zip = this.service.getExportZip(token);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="subtrack-export.zip"');
    res.setHeader('Content-Length', zip.length);
    res.end(zip);
  }

  // ─── DELETE /v1/data-rights/account (AC2) ────────────────────────────────

  @Delete('account')
  @HttpCode(204)
  async deleteAccount(
    @Headers('x-caller-id') callerId: string,
    @Body() body: unknown,
  ) {
    if (!callerId) throw new BadRequestException('X-Caller-Id header required.');
    const parsed = DeleteAccountSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Validation failed.');
    }
    await this.service.deleteAccount(callerId, parsed.data);
  }
}
