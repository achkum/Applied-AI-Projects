import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { z } from 'zod';
import { IdentityProviderService } from './identity-provider.service';

const VerifyBankIdSchema = z.object({
  token: z.string().min(1, 'token is required'),
});

@Controller('v1/auth/bankid')
export class IdentityProviderController {
  constructor(private readonly service: IdentityProviderService) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() body: unknown) {
    const parsed = VerifyBankIdSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Validation failed');
    }
    return this.service.verifyAndRegister(parsed.data.token);
  }
}
