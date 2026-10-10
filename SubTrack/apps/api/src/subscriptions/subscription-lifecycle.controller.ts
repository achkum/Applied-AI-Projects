import { ArgumentsHost, BadRequestException, Body, Catch, Controller, ExceptionFilter, HttpException, Inject, Param, Patch, Req } from '@nestjs/common';
import type { Request, Response } from 'express';
import { getVerifiedRequestContext } from '../auth/sessions/authenticated-principal.guard';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

const STRING = '"(?:[^"\\\\\u0000-\u001f]|\\\\(?:["\\\\/bfnrt]|u[0-9a-fA-F]{4}))*"';
const EXACT_PATCH = new RegExp(`^\\s*\\{\\s*(${STRING})\\s*:\\s*(${STRING})\\s*\\}\\s*$`);

@Catch()
export class SubscriptionLifecycleProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    // Express JSON parsing happens before Nest route dispatch. Admit only its
    // known body-parser error type/status pairs as client errors.
    const parserError = error && typeof error === 'object' &&
      'type' in error && 'status' in error && (
        (error.type === 'entity.parse.failed' && error.status === 400) ||
        (error.type === 'entity.too.large' && error.status === 413) ||
        (error.type === 'charset.unsupported' && error.status === 415) ||
        (error.type === 'encoding.unsupported' && error.status === 415)
      );
    const raw = error instanceof HttpException ? error.getStatus() : parserError ? 400 : 500;
    const status = raw === 400 || raw === 401 || raw === 404 || raw === 409 ? raw : 500;
    const title = status === 400 ? 'Bad Request' : status === 401 ? 'Unauthorized' :
      status === 404 ? 'Not Found' : status === 409 ? 'Conflict' : 'Internal Server Error';
    const code = status === 400 ? 'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST' : status === 401 ? 'AUTHENTICATION_REQUIRED' :
      status === 404 ? 'SUBSCRIPTION_NOT_FOUND' : status === 409 ? 'LIFECYCLE_CONFLICT' : 'INTERNAL_ERROR';
    response.status(status).type('application/problem+json').json({ type: 'about:blank', title, status, code });
  }
}

@Controller()
export class SubscriptionLifecycleController {
  constructor(@Inject(SubscriptionLifecycleService) private readonly service: SubscriptionLifecycleService) {}

  @Patch('v1/subscriptions/:id')
  update(@Req() request: Request, @Param('id') id: unknown, @Body() body: unknown) {
    // Inspect the raw URL; Express query parsing may discard prototype-shaped keys.
    if (typeof request.originalUrl !== 'string' || request.originalUrl.includes('?') ||
        !/^application\/json(?:\s*;|\s*$)/i.test(request.headers['content-type'] ?? ''))
      throw new BadRequestException('INVALID_SUBSCRIPTION_LIFECYCLE');
    const raw = (request as Request & { rawBody?: Buffer }).rawBody;
    const match = raw && raw.length <= 1024 ? EXACT_PATCH.exec(raw.toString('utf8')) : null;
    if (!match || JSON.parse(match[1]!) !== 'status' ||
        JSON.parse(match[2]!) !== (body as Record<string, unknown> | null)?.['status'])
      throw new BadRequestException('INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST');
    return this.service.update(getVerifiedRequestContext(request), id, body);
  }
}
