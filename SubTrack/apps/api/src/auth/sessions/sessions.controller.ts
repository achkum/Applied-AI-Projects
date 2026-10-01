import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { CreateSessionBody, RefreshBody } from './sessions.dto';

@Controller('v1/auth')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /**
   * POST /v1/auth/session
   * Create a session after successful OTP or BankID authentication.
   * X-Caller-Id header is a placeholder until ST-044 JWT middleware is wired (M1).
   */
  @Post('session')
  @HttpCode(201)
  async createSession(@Body() body: unknown, @Headers('x-caller-id') callerId: string) {
    if (!callerId) throw new UnauthorizedException();
    const dto = CreateSessionBody.parse(body);
    return this.sessions.createSession(dto.identityId, dto.deviceName);
  }

  /**
   * POST /v1/auth/refresh
   * Rotate the refresh token.  Old token is immediately revoked.
   * Presenting a revoked token triggers family-wide revocation (AC2).
   */
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: unknown) {
    const dto = RefreshBody.parse(body);
    return this.sessions.refresh(dto.refreshToken);
  }

  /**
   * GET /v1/auth/devices
   * List active sessions for the caller.  Only own devices are returned (AC4).
   */
  @Get('devices')
  async listDevices(@Headers('x-caller-id') callerId: string) {
    if (!callerId) throw new UnauthorizedException();
    return this.sessions.listDevices(callerId);
  }

  /**
   * DELETE /v1/auth/devices/:id
   * Revoke one device without affecting other active sessions (AC3).
   */
  @Delete('devices/:id')
  @HttpCode(204)
  async revokeDevice(
    @Param('id') id: string,
    @Headers('x-caller-id') callerId: string,
  ) {
    if (!callerId) throw new UnauthorizedException();
    await this.sessions.revokeDevice(id, callerId);
  }
}
