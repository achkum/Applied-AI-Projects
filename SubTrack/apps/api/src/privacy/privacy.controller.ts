import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { PrivacyService } from './privacy.service';
import { SetOpenBookSchema } from './privacy.dto';

@Controller('v1/privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  // ─── GET /v1/privacy/settings ─────────────────────────────────────────────

  @Get('settings')
  async getSettings(@Headers('x-caller-id') callerId: string) {
    if (!callerId) throw new BadRequestException('X-Caller-Id header required.');
    return this.privacy.getSettings(callerId);
  }

  // ─── PATCH /v1/privacy/open-book (AC1, AC4) ───────────────────────────────

  @Patch('open-book')
  @HttpCode(200)
  async setOpenBook(
    @Headers('x-caller-id') callerId: string,
    @Body() body: unknown,
  ) {
    if (!callerId) throw new BadRequestException('X-Caller-Id header required.');
    const parsed = SetOpenBookSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Validation failed.');
    }
    return this.privacy.setOpenBook(callerId, parsed.data);
  }

  // ─── GET /v1/privacy/preview-as/:householdId (AC3) ────────────────────────

  @Get('preview-as/:householdId')
  async previewAsHousehold(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Headers('x-caller-id') callerId: string,
  ) {
    if (!callerId) throw new BadRequestException('X-Caller-Id header required.');
    return this.privacy.previewAsHousehold(callerId, householdId);
  }
}
