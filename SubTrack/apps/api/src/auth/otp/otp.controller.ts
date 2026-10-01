import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { OtpService } from './otp.service';
import { RequestOtpSchema, VerifyOtpSchema } from './otp.dto';

@Controller('v1/auth/otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestOtp(@Body() body: unknown): Promise<{ status: 'accepted' }> {
    const parsed = RequestOtpSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Validation failed');
    }
    const nodeEnv = process.env['NODE_ENV'] ?? 'development';
    await this.otpService.requestOtp(parsed.data.identifier, nodeEnv);
    return { status: 'accepted' };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() body: unknown): Promise<{ verified: true }> {
    const parsed = VerifyOtpSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Validation failed');
    }
    return this.otpService.verifyOtp(parsed.data.identifier, parsed.data.code);
  }
}
