import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const titles = new Map<number, string>([
  [400, 'Bad Request'],
  [401, 'Unauthorized'],
  [403, 'Forbidden'],
  [404, 'Not Found'],
  [409, 'Conflict'],
  [422, 'Unprocessable Content'],
  [429, 'Too Many Requests'],
  [500, 'Internal Server Error'],
  [503, 'Service Unavailable'],
]);

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body: Record<string, unknown> = {
      type: 'about:blank',
      title:
        titles.get(status) ??
        (status >= 500 ? 'Internal Server Error' : 'Request Failed'),
      status,
      instance: request.path,
    };
    response.status(status).type('application/problem+json').send(body);
  }
}
