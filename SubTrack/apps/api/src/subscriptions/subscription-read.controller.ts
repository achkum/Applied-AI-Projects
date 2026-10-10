import { ArgumentsHost, Catch, Controller, ExceptionFilter, Get, HttpException, Inject, Param, Query, Req, UseFilters } from '@nestjs/common';
import type { Response } from 'express';
import { getVerifiedRequestContext } from '../auth/sessions/authenticated-principal.guard';
import { SubscriptionReadService } from './subscription-read.service';

@Catch()
export class SubscriptionReadProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const code = status === 400 ? 'INVALID_SUBSCRIPTION_QUERY' : status === 401 ? 'UNAUTHORIZED' :
      status === 404 ? 'SUBSCRIPTION_NOT_FOUND' : 'SUBSCRIPTION_READ_FAILED';
    response.status(status).type('application/problem+json').json({ type: 'about:blank',
      title: status === 400 ? 'Bad Request' : status === 401 ? 'Unauthorized' : status === 404 ? 'Not Found' : 'Internal Server Error',
      status, code });
  }
}

/** Explicit test-only composition; this controller is absent from AppModule. */
@Controller()
@UseFilters(SubscriptionReadProblemFilter)
export class SubscriptionReadController {
  constructor(@Inject(SubscriptionReadService) private readonly service: SubscriptionReadService) {}

  @Get('v1/subscriptions')
  list(@Req() request: object, @Query() query: unknown) {
    return this.service.list(getVerifiedRequestContext(request), query);
  }

  @Get('v1/subscriptions/:id')
  detail(@Req() request: object, @Param('id') id: unknown, @Query() query: unknown) {
    if (query && typeof query === 'object' && Object.keys(query).length) {
      throw new HttpException('INVALID_SUBSCRIPTION_QUERY', 400);
    }
    return this.service.detail(getVerifiedRequestContext(request), id);
  }

  @Get('v1/review-inbox')
  inbox(@Req() request: object, @Query() query: unknown) {
    return this.service.list(getVerifiedRequestContext(request), query, true);
  }
}
