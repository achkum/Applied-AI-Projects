import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import { HouseholdsService } from './households.service';
import {
  CreateHouseholdSchema,
  UpdateMemberRoleSchema,
  AddDependantSchema,
} from './households.dto';

/**
 * Caller identity is extracted from the X-Caller-Id header for M1.
 * Sessions/JWT are ST-044 scope; this header is the M1 placeholder.
 */
function extractCallerId(callerId: string | undefined): string {
  if (!callerId) throw new BadRequestException('X-Caller-Id header is required.');
  return callerId;
}

@Controller('v1/households')
export class HouseholdsController {
  constructor(private readonly service: HouseholdsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createHousehold(
    @Body() body: unknown,
    @Headers('x-caller-id') callerId: string | undefined,
  ) {
    const parsed = CreateHouseholdSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Validation failed');
    }
    return this.service.createHousehold(parsed.data.name, extractCallerId(callerId));
  }

  @Get(':id/members')
  async listMembers(
    @Param('id') householdId: string,
    @Headers('x-caller-id') callerId: string | undefined,
  ) {
    return this.service.listMembers(householdId, extractCallerId(callerId));
  }

  @Patch(':id/members/:memberId')
  async updateMemberRole(
    @Param('id') householdId: string,
    @Param('memberId') memberId: string,
    @Body() body: unknown,
    @Headers('x-caller-id') callerId: string | undefined,
  ) {
    const parsed = UpdateMemberRoleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Validation failed');
    }
    return this.service.updateMemberRole(
      householdId,
      memberId,
      parsed.data.role,
      extractCallerId(callerId),
    );
  }

  @Delete(':id/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id') householdId: string,
    @Param('memberId') memberId: string,
    @Headers('x-caller-id') callerId: string | undefined,
  ) {
    await this.service.removeMember(householdId, memberId, extractCallerId(callerId));
  }

  @Post(':id/dependants')
  @HttpCode(HttpStatus.CREATED)
  async addDependant(
    @Param('id') householdId: string,
    @Body() body: unknown,
    @Headers('x-caller-id') callerId: string | undefined,
  ) {
    const parsed = AddDependantSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Validation failed');
    }
    return this.service.addDependant(
      householdId,
      parsed.data.name,
      extractCallerId(callerId),
    );
  }
}
