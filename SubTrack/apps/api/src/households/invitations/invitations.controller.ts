import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import {
  CreateInvitationBodySchema,
  RespondInvitationBodySchema,
} from './invitations.dto';

@Controller()
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  // ─── POST /v1/households/:id/invitations (201) ────────────────────────────

  @Post('v1/households/:id/invitations')
  @HttpCode(201)
  async create(
    @Param('id', ParseUUIDPipe) householdId: string,
    @Headers('x-caller-id') callerId: string,
    @Body() body: unknown,
  ) {
    if (!callerId) throw new BadRequestException('X-Caller-Id header required.');
    const parsed = CreateInvitationBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Validation failed.');
    }
    return this.invitations.createInvitation(callerId, householdId, parsed.data);
  }

  // ─── GET /v1/households/:id/invitations (200) ─────────────────────────────

  @Get('v1/households/:id/invitations')
  async list(
    @Param('id', ParseUUIDPipe) householdId: string,
    @Headers('x-caller-id') callerId: string,
  ) {
    if (!callerId) throw new BadRequestException('X-Caller-Id header required.');
    return this.invitations.listInvitations(callerId, householdId);
  }

  // ─── GET /v1/invitations/preview?token=... (200, unauthenticated) ─────────

  @Get('v1/invitations/preview')
  async preview(@Query('token') rawToken: string) {
    if (!rawToken) throw new BadRequestException('token query parameter required.');
    return this.invitations.getPreview(rawToken);
  }

  // ─── POST /v1/invitations/accept (200) ───────────────────────────────────

  @Post('v1/invitations/accept')
  @HttpCode(200)
  async accept(
    @Headers('x-caller-id') callerId: string,
    @Body() body: unknown,
  ) {
    if (!callerId) throw new BadRequestException('X-Caller-Id header required.');
    const parsed = RespondInvitationBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid body.');
    }
    await this.invitations.acceptInvitation(parsed.data.token, callerId);
    return { accepted: true };
  }

  // ─── POST /v1/invitations/decline (200) ──────────────────────────────────

  @Post('v1/invitations/decline')
  @HttpCode(200)
  async decline(
    @Headers('x-caller-id') callerId: string,
    @Body() body: unknown,
  ) {
    if (!callerId) throw new BadRequestException('X-Caller-Id header required.');
    const parsed = RespondInvitationBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid body.');
    }
    await this.invitations.declineInvitation(parsed.data.token, callerId);
    return { declined: true };
  }

  // ─── DELETE /v1/households/:id/invitations/:invitationId (204) ───────────

  @Delete('v1/households/:id/invitations/:invitationId')
  @HttpCode(204)
  async revoke(
    @Param('id', ParseUUIDPipe) householdId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @Headers('x-caller-id') callerId: string,
  ) {
    if (!callerId) throw new BadRequestException('X-Caller-Id header required.');
    await this.invitations.revokeInvitation(callerId, householdId, invitationId);
  }
}
